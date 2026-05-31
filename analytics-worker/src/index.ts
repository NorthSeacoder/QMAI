/**
 * 青幕AI写作 - 用户统计 Cloudflare Worker
 *
 * 功能：
 * - POST /open   : 用户启动软件时调用（注册 + 标记在线）
 * - POST /close  : 用户关闭软件时调用（标记离线）
 * - GET  /stats  : 查看统计数据（需要密钥）
 * - Cron trigger : 每小时清理超时会话
 */

export interface Env {
  DB: D1Database
  STATS_SECRET: string // 在 Cloudflare Dashboard 设置的密钥，用于查看统计
}

// 将 IP 地址哈希化（隐私保护）
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(ip + "qmai-salt-2026")
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// CORS 响应头
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  })
}

// POST /open - 用户启动软件
async function handleOpen(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ uuid: string }>()
  const uuid = body?.uuid
  if (!uuid) return jsonResponse({ error: "missing uuid" }, 400)

  const ip = request.headers.get("CF-Connecting-IP") || "unknown"
  const ipHash = await hashIP(ip)
  const now = new Date().toISOString()

  // 注册/更新用户（下载人数统计）
  await env.DB.prepare(
    `INSERT INTO users (uuid, ip_hash, first_seen, last_seen)
     VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT(uuid) DO UPDATE SET last_seen = ?3`
  ).bind(uuid, ipHash, now).run()

  // 关闭该 uuid 所有旧的在线会话（防止累积）
  await env.DB.prepare(
    `UPDATE sessions SET is_online = 0, close_time = ?1 WHERE uuid = ?2 AND is_online = 1`
  ).bind(now, uuid).run()

  // 创建新会话
  await env.DB.prepare(
    `INSERT INTO sessions (uuid, open_time, last_active, is_online) VALUES (?1, ?2, ?2, 1)`
  ).bind(uuid, now).run()

  return jsonResponse({ ok: true })
}

// POST /close - 用户关闭软件
async function handleClose(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ uuid: string }>()
  const uuid = body?.uuid
  if (!uuid) return jsonResponse({ error: "missing uuid" }, 400)

  const now = new Date().toISOString()

  await env.DB.prepare(
    `UPDATE sessions SET is_online = 0, close_time = ?1, last_active = ?1
     WHERE uuid = ?2 AND is_online = 1`
  ).bind(now, uuid).run()

  return jsonResponse({ ok: true })
}

// GET /stats - 查看统计（需要密钥）
async function handleStats(request: Request, env: Env): Promise<Response> {
  // 验证密钥
  const auth = request.headers.get("Authorization")
  if (auth !== `Bearer ${env.STATS_SECRET}`) {
    return jsonResponse({ error: "unauthorized" }, 401)
  }

  // 总下载用户数（按 uuid 去重）
  const totalUsers = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users`
  ).first<{ count: number }>()

  // 独立 IP 数
  const uniqueIPs = await env.DB.prepare(
    `SELECT COUNT(DISTINCT ip_hash) as count FROM users`
  ).first<{ count: number }>()

  // 当前在线人数
  const onlineCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM sessions WHERE is_online = 1`
  ).first<{ count: number }>()

  // 今日新增用户
  const today = new Date().toISOString().split("T")[0]
  const todayNew = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users WHERE first_seen >= ?1`
  ).bind(today).first<{ count: number }>()

  // 最近7天每日统计
  const dailyStats = await env.DB.prepare(
    `SELECT date, new_users, total_users, peak_online FROM daily_stats
     ORDER BY date DESC LIMIT 7`
  ).all()

  // 最近在线的用户列表（最近 20 个）
  const recentOnline = await env.DB.prepare(
    `SELECT uuid, last_active FROM sessions WHERE is_online = 1
     ORDER BY last_active DESC LIMIT 20`
  ).all()

  return jsonResponse({
    total_users: totalUsers?.count ?? 0,
    unique_ips: uniqueIPs?.count ?? 0,
    online_now: onlineCount?.count ?? 0,
    today_new_users: todayNew?.count ?? 0,
    daily_stats: dailyStats.results,
    recent_online: recentOnline.results,
    server_time: new Date().toISOString(),
  })
}

// GET /dashboard - 简易 HTML 仪表盘
async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const auth = new URL(request.url).searchParams.get("key")
  if (auth !== env.STATS_SECRET) {
    return new Response("需要密钥: ?key=你的密钥", { status: 401 })
  }

  const totalUsers = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users`
  ).first<{ count: number }>()

  const uniqueIPs = await env.DB.prepare(
    `SELECT COUNT(DISTINCT ip_hash) as count FROM users`
  ).first<{ count: number }>()

  const onlineCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM sessions WHERE is_online = 1`
  ).first<{ count: number }>()

  const today = new Date().toISOString().split("T")[0]
  const todayNew = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users WHERE first_seen >= ?1`
  ).bind(today).first<{ count: number }>()

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>青幕AI写作 - 用户统计</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; min-height: 100vh; }
    h1 { text-align: center; margin-bottom: 2rem; color: #38bdf8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; max-width: 800px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; text-align: center; border: 1px solid #334155; }
    .card .number { font-size: 2.5rem; font-weight: 700; color: #38bdf8; }
    .card .label { margin-top: 0.5rem; color: #94a3b8; font-size: 0.9rem; }
    .online .number { color: #4ade80; }
    .footer { text-align: center; margin-top: 2rem; color: #64748b; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>📊 青幕AI写作 用户统计</h1>
  <div class="grid">
    <div class="card">
      <div class="number">${totalUsers?.count ?? 0}</div>
      <div class="label">总下载用户数</div>
    </div>
    <div class="card">
      <div class="number">${uniqueIPs?.count ?? 0}</div>
      <div class="label">独立 IP 数</div>
    </div>
    <div class="card online">
      <div class="number">${onlineCount?.count ?? 0}</div>
      <div class="label">当前在线人数</div>
    </div>
    <div class="card">
      <div class="number">${todayNew?.count ?? 0}</div>
      <div class="label">今日新增用户</div>
    </div>
  </div>
  <div class="footer">
    <p>数据更新时间：${new Date().toISOString()}</p>
    <p>每小时自动清理超过24小时未活动的在线状态</p>
  </div>
</body>
</html>`

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  })
}

// 定时任务：清理超时会话 + 更新每日统计
async function handleScheduled(env: Env): Promise<void> {
  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // 超过24小时没有活动的会话标记为离线
  await env.DB.prepare(
    `UPDATE sessions SET is_online = 0, close_time = ?1
     WHERE is_online = 1 AND last_active < ?2`
  ).bind(now.toISOString(), cutoff).run()

  // 更新今日统计快照
  const today = now.toISOString().split("T")[0]
  const totalUsers = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users`
  ).first<{ count: number }>()
  const todayNew = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users WHERE first_seen >= ?1`
  ).bind(today).first<{ count: number }>()
  const onlineNow = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM sessions WHERE is_online = 1`
  ).first<{ count: number }>()

  // 更新 peak_online（取最大值）
  const existingPeak = await env.DB.prepare(
    `SELECT peak_online FROM daily_stats WHERE date = ?1`
  ).bind(today).first<{ peak_online: number }>()

  const currentOnline = onlineNow?.count ?? 0
  const peak = Math.max(existingPeak?.peak_online ?? 0, currentOnline)

  await env.DB.prepare(
    `INSERT INTO daily_stats (date, new_users, total_users, peak_online)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(date) DO UPDATE SET
       new_users = ?2, total_users = ?3, peak_online = MAX(daily_stats.peak_online, ?4)`
  ).bind(today, todayNew?.count ?? 0, totalUsers?.count ?? 0, peak).run()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 处理 CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (request.method === "POST" && path === "/open") {
        return await handleOpen(request, env)
      }
      if (request.method === "POST" && path === "/close") {
        return await handleClose(request, env)
      }
      if (request.method === "GET" && path === "/stats") {
        return await handleStats(request, env)
      }
      if (request.method === "GET" && path === "/dashboard") {
        return await handleDashboard(request, env)
      }

      return jsonResponse({ error: "not found" }, 404)
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500)
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await handleScheduled(env)
  },
}

# 青幕AI写作 - 用户统计服务端

基于 Cloudflare Workers + D1 的零成本用户统计方案。

## 部署步骤

### 前置条件

- Cloudflare 账号（已注册）
- Node.js 18+

### 第一步：安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 第二步：登录 Cloudflare

```bash
wrangler login
```

浏览器会打开授权页面，点击允许即可。

### 第三步：创建 D1 数据库

```bash
cd analytics-worker
wrangler d1 create qmai-analytics-db
```

执行后会输出类似：

```
✅ Successfully created DB 'qmai-analytics-db'
database_id = "xxxx-xxxx-xxxx-xxxx"
```

**将输出的 `database_id` 复制到 `wrangler.toml` 中替换 `placeholder-你部署后会自动生成`**。

### 第四步：初始化数据库表

```bash
wrangler d1 execute qmai-analytics-db --remote --file=./schema.sql
```

### 第五步：设置查看密钥

```bash
wrangler secret put STATS_SECRET
```

系统会提示你输入密钥值。输入一个你自己记得住的密码（比如 `my-secret-key-123`），用于访问统计页面。

### 第六步：部署 Worker

```bash
npm install
wrangler deploy
```

部署成功后会显示 Worker 的 URL，类似：
```
https://qmai-analytics.你的子域名.workers.dev
```

### 第七步：更新客户端配置

打开 `src/lib/analytics.ts`，将 `ANALYTICS_URL` 替换为你的实际 Worker URL：

```typescript
const ANALYTICS_URL = "https://qmai-analytics.你的子域名.workers.dev"
```

## 查看统计数据

### 方式一：浏览器仪表盘

直接访问：
```
https://qmai-analytics.你的子域名.workers.dev/dashboard?key=你设置的密钥
```

手机/电脑浏览器均可。

### 方式二：API 获取 JSON 数据

```bash
curl -H "Authorization: Bearer 你设置的密钥" \
  https://qmai-analytics.你的子域名.workers.dev/stats
```

返回内容：
```json
{
  "total_users": 1234,
  "unique_ips": 1100,
  "online_now": 56,
  "today_new_users": 12,
  "daily_stats": [...],
  "server_time": "2026-06-01T10:00:00.000Z"
}
```

## API 说明

| 端点 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| /open | POST | 软件启动上报 | 无 |
| /close | POST | 软件关闭上报 | 无 |
| /stats | GET | 获取统计JSON | Bearer Token |
| /dashboard | GET | HTML仪表盘 | URL参数 key |

## 免费额度

| 资源 | 免费限额 | 实际消耗(1万用户) |
|------|----------|------------------|
| Worker 请求 | 10万次/天 | ~2万次/天 |
| D1 读取 | 500万次/天 | ~2万次/天 |
| D1 写入 | 10万次/天 | ~2万次/天 |
| D1 存储 | 5GB | ~10MB |

**结论：1万用户完全在免费额度内。**

## 自动清理

Cron 每小时运行一次，自动：
1. 将超过 24 小时无活动的会话标记为离线
2. 更新每日统计快照（新增用户数、总用户数、在线峰值）

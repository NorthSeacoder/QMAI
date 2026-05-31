-- 用户表：记录每个独立设备（下载用户统计）
CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 会话表：记录 open/close 事件（在线人数统计）
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  open_time TEXT NOT NULL DEFAULT (datetime('now')),
  close_time TEXT,
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  is_online INTEGER NOT NULL DEFAULT 1
);

-- 每日统计快照
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  new_users INTEGER NOT NULL DEFAULT 0,
  total_users INTEGER NOT NULL DEFAULT 0,
  peak_online INTEGER NOT NULL DEFAULT 0
);

-- 索引：加速在线人数查询
CREATE INDEX IF NOT EXISTS idx_sessions_online ON sessions(is_online) WHERE is_online = 1;
CREATE INDEX IF NOT EXISTS idx_sessions_uuid ON sessions(uuid);
CREATE INDEX IF NOT EXISTS idx_users_ip_hash ON users(ip_hash);

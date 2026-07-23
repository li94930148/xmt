-- XMT v2.9.0 Creator Data Center
-- Platform-neutral creator data model. `user_id` is an XMT tenant boundary.

CREATE TABLE IF NOT EXISTS creator_platform_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  platform_uid TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  account_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, platform, platform_uid),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_content_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  platform_item_id TEXT NOT NULL,
  title TEXT,
  cover_url TEXT,
  publish_time DATETIME,
  duration REAL,
  status TEXT,
  raw_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, platform, platform_item_id),
  FOREIGN KEY (account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_content_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  snapshot_time DATETIME NOT NULL,
  play_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,
  play_duration REAL,
  completion_rate REAL,
  cover_click_rate REAL,
  raw_json TEXT NOT NULL,
  UNIQUE(content_id, snapshot_time),
  FOREIGN KEY (content_id) REFERENCES creator_content_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_content_trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  record_time DATETIME NOT NULL,
  UNIQUE(content_id, metric_name, record_time),
  FOREIGN KEY (content_id) REFERENCES creator_content_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_account_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  snapshot_time DATETIME NOT NULL,
  fans_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  interaction_count INTEGER DEFAULT 0,
  profile_visit_count INTEGER DEFAULT 0,
  growth_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  UNIQUE(account_id, snapshot_time),
  FOREIGN KEY (account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_fans_portraits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  snapshot_time DATETIME NOT NULL,
  gender_json TEXT NOT NULL,
  age_json TEXT NOT NULL,
  city_json TEXT NOT NULL,
  province_json TEXT NOT NULL,
  interest_json TEXT NOT NULL,
  active_time_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  UNIQUE(account_id, snapshot_time),
  FOREIGN KEY (account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_api_raw_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_id INTEGER,
  platform TEXT NOT NULL,
  page_type TEXT NOT NULL,
  api_url TEXT NOT NULL,
  method TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, platform, page_type, api_url, method, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES creator_agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_creator_accounts_owner ON creator_platform_accounts(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_creator_items_account_publish ON creator_content_items(account_id, publish_time DESC);
CREATE INDEX IF NOT EXISTS idx_creator_metrics_content_time ON creator_content_metrics(content_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_creator_trends_content_metric_time ON creator_content_trends(content_id, metric_name, record_time);
CREATE INDEX IF NOT EXISTS idx_creator_account_metrics_time ON creator_account_metrics(account_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_creator_fans_portraits_time ON creator_fans_portraits(account_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_creator_raw_records_api ON creator_api_raw_records(platform, api_url, created_at DESC);

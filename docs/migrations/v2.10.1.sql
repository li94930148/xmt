-- XMT v2.10.1 - 标准抖音数据中心
-- 旧 douyin_accounts / douyin_sync_logs 由早期 OpenAPI 模块创建，以下列仅执行一次；
-- 应用启动时 api/database/db.ts 会通过 PRAGMA + 忽略重复列实现幂等兼容。

ALTER TABLE douyin_accounts ADD COLUMN douyin_uid TEXT;
ALTER TABLE douyin_accounts ADD COLUMN fans_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE douyin_accounts ADD COLUMN following_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE douyin_accounts ADD COLUMN works_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE douyin_accounts ADD COLUMN total_likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE douyin_accounts ADD COLUMN last_sync_time DATETIME;
ALTER TABLE douyin_accounts ADD COLUMN creator_account_id INTEGER;

ALTER TABLE douyin_sync_logs ADD COLUMN sync_time DATETIME;
ALTER TABLE douyin_sync_logs ADD COLUMN api_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE douyin_sync_logs ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE douyin_sync_logs ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE douyin_sync_logs ADD COLUMN error_message TEXT;
ALTER TABLE douyin_sync_logs ADD COLUMN task_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_douyin_accounts_uid ON douyin_accounts(douyin_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_douyin_accounts_creator_scope ON douyin_accounts(creator_account_id);

CREATE TABLE IF NOT EXISTS douyin_works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  aweme_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover_url TEXT,
  publish_time DATETIME,
  play_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  collect_count INTEGER NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  completion_rate REAL NOT NULL DEFAULT 0,
  interaction_rate REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, aweme_id),
  FOREIGN KEY(account_id) REFERENCES douyin_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS douyin_daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  fans_count INTEGER NOT NULL DEFAULT 0,
  works_count INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, snapshot_date),
  FOREIGN KEY(account_id) REFERENCES douyin_accounts(id) ON DELETE CASCADE
);

-- 作品曲线必须保留逐次真实采集快照，不能由当前值反推。
CREATE TABLE IF NOT EXISTS douyin_work_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  snapshot_time DATETIME NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  collect_count INTEGER NOT NULL DEFAULT 0,
  completion_rate REAL NOT NULL DEFAULT 0,
  interaction_rate REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_id, snapshot_time),
  FOREIGN KEY(work_id) REFERENCES douyin_works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS douyin_analysis_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  work_id INTEGER,
  analysis_type TEXT NOT NULL DEFAULT 'work_review',
  viral_tag TEXT,
  content_category TEXT,
  content_json TEXT NOT NULL DEFAULT '{}',
  ai_analysis_json TEXT NOT NULL DEFAULT '{}',
  snapshot_time DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_id, analysis_type, snapshot_time),
  FOREIGN KEY(account_id) REFERENCES douyin_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(work_id) REFERENCES douyin_works(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_douyin_works_account_publish ON douyin_works(account_id, publish_time DESC);
CREATE INDEX IF NOT EXISTS idx_douyin_works_account_play ON douyin_works(account_id, play_count DESC);
CREATE INDEX IF NOT EXISTS idx_douyin_daily_account_date ON douyin_daily_snapshots(account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_douyin_work_snapshots_time ON douyin_work_snapshots(work_id, snapshot_time ASC);
CREATE INDEX IF NOT EXISTS idx_douyin_analysis_work_time ON douyin_analysis_records(work_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_douyin_sync_logs_account_time ON douyin_sync_logs(account_id, sync_time DESC);

DELETE FROM creator_content_items
WHERE lower(trim(title)) IN ('react', 'flash_mod_modal', 'start_flash_mod');

-- XMT v2.9.1 Creator Data Center stability migration

CREATE TABLE IF NOT EXISTS creator_sync_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER,
  task_id TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  platform TEXT NOT NULL,
  account TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','success','partial_success','failed')),
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  error_message TEXT,
  module_status_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(agent_id, task_id),
  FOREIGN KEY(agent_id) REFERENCES creator_agents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS creator_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  analysis_type TEXT NOT NULL CHECK(analysis_type IN ('daily','weekly','monthly','content')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_page_schema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  tab TEXT NOT NULL,
  api TEXT NOT NULL,
  fields TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page, tab, api)
);

CREATE TABLE IF NOT EXISTS creator_account_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'view' CHECK(access_level IN ('view','manage')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, user_id),
  FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE creator_api_raw_records ADD COLUMN hash TEXT;
ALTER TABLE creator_api_raw_records ADD COLUMN compression TEXT NOT NULL DEFAULT 'none';

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_raw_hash ON creator_api_raw_records(user_id, platform, hash) WHERE hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_sync_tasks_status_time ON creator_sync_tasks(status, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_creator_insights_account_type_time ON creator_insights(account_id, analysis_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_access_user ON creator_account_access(user_id, access_level);

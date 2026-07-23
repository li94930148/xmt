-- XMT v2.10.0 Creator Data Center analytics migration
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS creator_work_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  level TEXT NOT NULL CHECK(level IN ('viral','excellent','normal','low')),
  analysis_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(work_id) REFERENCES creator_content_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_trend_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('7d','30d','90d')),
  metric TEXT NOT NULL CHECK(metric IN ('plays','fans','interactions','publishes')),
  value REAL NOT NULL DEFAULT 0,
  snapshot_time DATETIME NOT NULL,
  FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, period, metric, snapshot_time)
);

CREATE TABLE IF NOT EXISTS creator_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('daily','weekly','monthly')),
  content_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creator_work_analysis_latest
  ON creator_work_analysis(work_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_trend_period_time
  ON creator_trend_snapshots(account_id, period, metric, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_creator_reports_account_type_time
  ON creator_reports(account_id, type, created_at DESC);

INSERT OR IGNORE INTO permissions(code, name, module)
VALUES ('creator:report:view', '查看创作者分析报告', 'creator');
INSERT OR IGNORE INTO permissions(code, name, module)
VALUES ('creator:report:manage', '生成创作者分析报告', 'creator');

INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin','director')
  AND p.code IN ('creator:report:view','creator:report:manage');

INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('member','editor','copywriter','post_production','camera')
  AND p.code = 'creator:report:view';

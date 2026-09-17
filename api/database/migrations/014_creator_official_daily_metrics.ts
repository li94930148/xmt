import type { DatabaseMigration } from './types';

/** Preserve each Creator Center range as an independently auditable daily fact set. */
export const creatorOfficialDailyMetricsMigration: DatabaseMigration = {
  version: '014',
  name: 'creator_official_daily_metrics',
  checksum: '014-creator-official-daily-metrics-v1',
  async up(executor) {
    await executor.execute('ALTER TABLE creator_ingest_files ADD COLUMN dataset_type TEXT');
    await executor.execute('ALTER TABLE creator_ingest_files ADD COLUMN source_period TEXT');
    await executor.execute(`CREATE TABLE IF NOT EXISTS creator_official_daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      metric_date DATE NOT NULL,
      source_period TEXT NOT NULL CHECK(source_period IN ('yesterday','7d','30d')),
      metric_code TEXT NOT NULL,
      value_text TEXT NOT NULL,
      value_number REAL,
      unit TEXT NOT NULL,
      source_file_sha256 TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      collected_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id,metric_date,source_period,metric_code),
      FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
    )`);
    await executor.execute('CREATE INDEX IF NOT EXISTS idx_creator_official_daily_account_period_date ON creator_official_daily_metrics(account_id,source_period,metric_date DESC)');
    await executor.execute('CREATE INDEX IF NOT EXISTS idx_creator_official_daily_source_file ON creator_official_daily_metrics(source_file_sha256)');
  },
};

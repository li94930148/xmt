import type { DatabaseMigration } from './types';

/** Additive only: older application binaries safely ignore these audit tables. */
export const creatorOfficialExportV2203Migration: DatabaseMigration = {
  version: '009',
  name: 'creator_official_export_v2203',
  checksum: '009-creator-official-export-v2203-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS creator_ingest_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id INTEGER NOT NULL, batch_id TEXT NOT NULL,
      account_id INTEGER NOT NULL, parser_version TEXT NOT NULL, result_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_id,batch_id), FOREIGN KEY(agent_id) REFERENCES creator_agents(id) ON DELETE CASCADE,
      FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
    )`);
    await executor.execute(`CREATE TABLE IF NOT EXISTS creator_ingest_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL, sha256 TEXT NOT NULL, file_type TEXT NOT NULL,
      file_name TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id,sha256), FOREIGN KEY(batch_id) REFERENCES creator_ingest_batches(id) ON DELETE CASCADE
    )`);
    await executor.execute(`CREATE TABLE IF NOT EXISTS creator_official_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, source_item_key TEXT, metric_date DATE NOT NULL,
      metric_code TEXT NOT NULL, value_text TEXT NOT NULL, value_number REAL, unit TEXT, source_type TEXT NOT NULL,
      source_file_sha256 TEXT NOT NULL, parser_version TEXT NOT NULL, collected_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id,source_item_key,metric_date,metric_code),
      FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
    )`);
    await executor.execute('CREATE INDEX IF NOT EXISTS idx_creator_official_metrics_account_date ON creator_official_metrics(account_id,metric_date DESC)');
  },
};

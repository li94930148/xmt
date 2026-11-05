import type { Client } from '@libsql/client';

export const LEGACY_SCHEMA_COLUMN_DEFINITIONS = {
  resources: [{ name: 'content', definition: 'TEXT' }],
  users: [{ name: 'force_change_password', definition: 'BOOLEAN DEFAULT 0' }],
  messages: [{ name: 'link', definition: 'TEXT' }],
  douyin_accounts: [
    { name: 'user_id', definition: 'INTEGER' },
    { name: 'open_id', definition: 'TEXT' },
    { name: 'union_id', definition: 'TEXT' },
    { name: 'nickname', definition: 'TEXT' },
    { name: 'avatar', definition: 'TEXT' },
    { name: 'access_token_encrypt', definition: 'TEXT' },
    { name: 'refresh_token_encrypt', definition: 'TEXT' },
    { name: 'expires_at', definition: 'DATETIME' },
    { name: 'status', definition: "TEXT DEFAULT 'pending_authorization'" },
    { name: 'updated_at', definition: 'DATETIME' },
    { name: 'douyin_data_source', definition: "TEXT NOT NULL DEFAULT 'oauth'" },
    { name: 'auth_type', definition: "TEXT NOT NULL DEFAULT 'oauth'" },
    { name: 'business_token', definition: 'TEXT' },
    { name: 'business_scope', definition: 'TEXT' },
    { name: 'douyin_uid', definition: 'TEXT' },
    { name: 'fans_count', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'fans_count_available', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'following_count', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'works_count', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'total_likes', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'last_sync_time', definition: 'DATETIME' },
    { name: 'creator_account_id', definition: 'INTEGER' },
  ],
  douyin_sync_logs: [
    { name: 'sync_time', definition: 'DATETIME' },
    { name: 'api_count', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'success_count', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'failed_count', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'error_message', definition: 'TEXT' },
    { name: 'task_id', definition: 'TEXT' },
    { name: 'contract_version', definition: 'TEXT' },
    { name: 'collection_mode', definition: 'TEXT' },
    { name: 'snapshot_id', definition: 'TEXT' },
    { name: 'summary_json', definition: "TEXT NOT NULL DEFAULT '{}'" },
  ],
  douyin_works: [{ name: 'content_id', definition: 'INTEGER' }],
  douyin_daily_snapshots: [{ name: 'fans_count_available', definition: 'INTEGER NOT NULL DEFAULT 0' }],
  creator_api_raw_records: [
    { name: 'hash', definition: 'TEXT' },
    { name: 'compression', definition: "TEXT NOT NULL DEFAULT 'none'" },
  ],
  video_performance_scores: [{ name: 'growth_score', definition: 'REAL NOT NULL DEFAULT 0' }],
  video_metric_snapshots: [{ name: 'interaction_rate', definition: 'REAL NOT NULL DEFAULT 0' }],
  social_review_reports: [
    { name: 'period_type', definition: "TEXT NOT NULL DEFAULT '30d'" },
    { name: 'report_json', definition: 'TEXT' },
  ],
  daily_reports: [
    { name: 'content', definition: 'TEXT' },
    { name: 'summary', definition: 'TEXT' },
    { name: 'tomorrow_plan', definition: 'TEXT' },
    { name: 'receiver_ids', definition: 'TEXT' },
    { name: 'cc_user_ids', definition: 'TEXT' },
  ],
} as const;

export type LegacySchemaTable = keyof typeof LEGACY_SCHEMA_COLUMN_DEFINITIONS;

export async function ensureLegacySchemaColumns(
  client: Pick<Client, 'execute'>,
  table: LegacySchemaTable,
): Promise<void> {
  const schema = await client.execute(`PRAGMA table_info(${table})`);
  const existingColumns = new Set(schema.rows.map((row) => String(row.name).toLowerCase()));

  for (const column of LEGACY_SCHEMA_COLUMN_DEFINITIONS[table]) {
    const normalizedName = column.name.toLowerCase();
    if (existingColumns.has(normalizedName)) continue;

    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.definition}`);
    existingColumns.add(normalizedName);
  }
}

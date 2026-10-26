import type { DatabaseMigration } from './types';

/** Store actor-, kind-, and period-scoped receipts for monthly and yearly summary updates. */
export const reportSummaryUpdateIdempotencyMigration: DatabaseMigration = {
  version: '065',
  name: 'report_summary_update_idempotency',
  checksum: '065-report-summary-update-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS report_summary_update_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        summary_kind TEXT NOT NULL CHECK (summary_kind IN ('monthly','yearly')),
        summary_year INTEGER NOT NULL,
        summary_month INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        base_fingerprint TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
          (summary_kind = 'monthly' AND summary_month BETWEEN 1 AND 12)
          OR (summary_kind = 'yearly' AND summary_month = 0)
        )
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_report_summary_update_actor_period
      ON report_summary_update_request_keys(actor_id, summary_kind, summary_year, summary_month, created_at)
    `);

    const columns = await executor.execute('PRAGMA table_info(report_summary_update_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (![
      'client_request_id', 'actor_id', 'summary_kind', 'summary_year', 'summary_month',
      'request_fingerprint', 'base_fingerprint', 'result_json', 'created_at',
    ].every((name) => columnNames.has(name))) {
      throw new Error('REPORT_SUMMARY_UPDATE_REQUEST_KEY_SCHEMA_INVALID');
    }
    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('REPORT_SUMMARY_UPDATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }

    const schema = await executor.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='report_summary_update_request_keys'",
    );
    const schemaSql = String(schema.rows[0]?.sql || '').replace(/\s+/g, ' ').toLowerCase();
    if (!schemaSql.includes("check (summary_kind in ('monthly','yearly'))")
      || !schemaSql.includes("summary_kind = 'monthly' and summary_month between 1 and 12")
      || !schemaSql.includes("summary_kind = 'yearly' and summary_month = 0")) {
      throw new Error('REPORT_SUMMARY_UPDATE_REQUEST_KEY_PERIOD_CHECK_INVALID');
    }
  },
};

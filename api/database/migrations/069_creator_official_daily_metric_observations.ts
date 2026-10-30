import type { DatabaseMigration } from './types';

/** Keep accepted Creator daily observations by import batch for auditable 90-day reconstruction. */
export const creatorOfficialDailyMetricObservationsMigration: DatabaseMigration = {
  version: '069',
  name: 'creator_official_daily_metric_observations',
  checksum: '069-creator-official-daily-metric-observations-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS creator_official_daily_metric_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      batch_id INTEGER,
      source_kind TEXT NOT NULL CHECK(source_kind IN ('official_batch','projection_backfill')),
      metric_date DATE NOT NULL,
      source_period TEXT NOT NULL CHECK(source_period IN ('yesterday','7d','30d')),
      metric_code TEXT NOT NULL,
      value_text TEXT NOT NULL,
      value_number REAL,
      unit TEXT NOT NULL,
      source_file_sha256 TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      collected_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK((source_kind='official_batch' AND batch_id IS NOT NULL) OR (source_kind='projection_backfill' AND batch_id IS NULL)),
      FOREIGN KEY(account_id) REFERENCES creator_platform_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY(batch_id) REFERENCES creator_ingest_batches(id) ON DELETE CASCADE
    )`);
    await executor.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_daily_observations_batch_fact
      ON creator_official_daily_metric_observations(batch_id,metric_date,source_period,metric_code)
      WHERE batch_id IS NOT NULL`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_creator_daily_observations_trend
      ON creator_official_daily_metric_observations(account_id,source_period,metric_date,metric_code,collected_at DESC,id DESC)`);
    await executor.execute('CREATE INDEX IF NOT EXISTS idx_creator_daily_observations_source_file ON creator_official_daily_metric_observations(source_file_sha256)');

    // The pre-migration projection contains only the latest accepted value for
    // each date/metric. Preserve that baseline without inventing a batch link.
    await executor.execute(`INSERT INTO creator_official_daily_metric_observations(
        account_id,batch_id,source_kind,metric_date,source_period,metric_code,value_text,value_number,unit,
        source_file_sha256,parser_version,collected_at
      )
      SELECT current.account_id,NULL,'projection_backfill',current.metric_date,current.source_period,current.metric_code,
        current.value_text,current.value_number,current.unit,current.source_file_sha256,current.parser_version,current.collected_at
      FROM creator_official_daily_metrics current
      WHERE NOT EXISTS (
        SELECT 1 FROM creator_official_daily_metric_observations baseline
        WHERE baseline.source_kind='projection_backfill'
          AND baseline.account_id=current.account_id
          AND baseline.metric_date=current.metric_date
          AND baseline.source_period=current.source_period
          AND baseline.metric_code=current.metric_code
      )`);

    const columns = await executor.execute('PRAGMA table_info(creator_official_daily_metric_observations)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['account_id','batch_id','source_kind','metric_date','source_period','metric_code','value_text','value_number','unit','source_file_sha256','parser_version','collected_at'].every(name => columnNames.has(name))) {
      throw new Error('CREATOR_DAILY_OBSERVATION_SCHEMA_INVALID');
    }
    const foreignKeys = await executor.execute('PRAGMA foreign_key_list(creator_official_daily_metric_observations)');
    const hasCascade = (table: string, from: string) => foreignKeys.rows.some(row => String(row.table) === table
      && String(row.from) === from
      && String(row.to) === 'id'
      && String(row.on_delete).toUpperCase() === 'CASCADE');
    if (!hasCascade('creator_ingest_batches', 'batch_id')) {
      throw new Error('CREATOR_DAILY_OBSERVATION_BATCH_CASCADE_INVALID');
    }
    if (!hasCascade('creator_platform_accounts', 'account_id')) {
      throw new Error('CREATOR_DAILY_OBSERVATION_ACCOUNT_CASCADE_INVALID');
    }
  },
};

import type { DatabaseMigration } from './types';

const TABLE_NAME = 'production_origin_snapshots';

export const productionOutlineSourceVersionMigration: DatabaseMigration = {
  version: '030',
  name: 'production_outline_source_version',
  checksum: '030-production-outline-source-version-v1',
  async up(executor) {
    const existing = await executor.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [TABLE_NAME],
    });
    if (existing.rows.length === 0) throw new Error('PRODUCTION_ORIGIN_SNAPSHOT_TABLE_MISSING');

    const columns = await executor.execute(`PRAGMA table_info(${TABLE_NAME})`);
    const columnNames = new Set(columns.rows.map((row) => String(row.name)));
    if (!columnNames.has('source_outline_version')) {
      await executor.execute(`ALTER TABLE ${TABLE_NAME} ADD COLUMN source_outline_version TEXT`);
    }

    const verified = await executor.execute(`PRAGMA table_info(${TABLE_NAME})`);
    if (!verified.rows.some((row) => String(row.name) === 'source_outline_version')) {
      throw new Error('PRODUCTION_ORIGIN_SNAPSHOT_VERSION_COLUMN_MISSING');
    }
  },
};

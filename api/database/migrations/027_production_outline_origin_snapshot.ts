import type { DatabaseMigration } from './types';

const TABLE_NAME = 'production_origin_snapshots';
const REQUIRED_COLUMNS = ['production_id', 'source_type', 'source_content_snapshot', 'captured_at'];

export const productionOutlineOriginSnapshotMigration: DatabaseMigration = {
  version: '027',
  name: 'production_outline_origin_snapshot',
  checksum: '027-production-outline-origin-snapshot-v1',
  async up(executor) {
    const existing = await executor.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [TABLE_NAME],
    });

    if (existing.rows.length === 0) {
      await executor.execute(`
        CREATE TABLE ${TABLE_NAME} (
          production_id INTEGER PRIMARY KEY NOT NULL REFERENCES production(id) ON DELETE CASCADE,
          source_type TEXT NOT NULL CHECK (source_type = 'topic_outline'),
          source_content_snapshot TEXT NOT NULL,
          captured_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours'))
        )
      `);
    }

    const columns = await executor.execute(`PRAGMA table_info(${TABLE_NAME})`);
    const columnNames = new Set(columns.rows.map((row) => String(row.name)));
    if (REQUIRED_COLUMNS.some((column) => !columnNames.has(column))) {
      throw new Error('PRODUCTION_ORIGIN_SNAPSHOT_SCHEMA_MISMATCH');
    }

    const foreignKeys = await executor.execute(`PRAGMA foreign_key_list(${TABLE_NAME})`);
    if (!foreignKeys.rows.some((row) => (
      String(row.table) === 'production'
      && String(row.from) === 'production_id'
      && String(row.to) === 'id'
    ))) {
      throw new Error('PRODUCTION_ORIGIN_SNAPSHOT_FOREIGN_KEY_MISSING');
    }
  },
};

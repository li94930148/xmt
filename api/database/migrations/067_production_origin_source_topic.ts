import type { DatabaseMigration } from './types';

const TABLE_NAME = 'production_origin_snapshots';
const COLUMN_NAME = 'source_topic_id';

export const productionOriginSourceTopicMigration: DatabaseMigration = {
  version: '067',
  name: 'production_origin_source_topic',
  checksum: '067-production-origin-source-topic-v1',
  async up(executor) {
    const existing = await executor.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [TABLE_NAME],
    });
    if (existing.rows.length === 0) throw new Error('PRODUCTION_ORIGIN_SNAPSHOT_TABLE_MISSING');

    const columns = await executor.execute(`PRAGMA table_info(${TABLE_NAME})`);
    const sourceTopicColumn = columns.rows.find((column) => String(column.name) === COLUMN_NAME);
    if (!sourceTopicColumn) {
      await executor.execute(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${COLUMN_NAME} INTEGER`);
    } else if (String(sourceTopicColumn.type).toUpperCase() !== 'INTEGER' || Number(sourceTopicColumn.notnull) !== 0) {
      throw new Error('PRODUCTION_ORIGIN_SOURCE_TOPIC_SCHEMA_INVALID');
    }

    const verified = await executor.execute(`PRAGMA table_info(${TABLE_NAME})`);
    if (!verified.rows.some((column) => (
      String(column.name) === COLUMN_NAME
      && String(column.type).toUpperCase() === 'INTEGER'
      && Number(column.notnull) === 0
    ))) {
      throw new Error('PRODUCTION_ORIGIN_SOURCE_TOPIC_COLUMN_MISSING');
    }
  },
};

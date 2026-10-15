import type { DatabaseMigration } from './types';

const TABLE_NAME = 'production_history';
const COLUMN_NAME = 'material_draft_snapshot_html';

export const productionMaterialHistorySnapshotMigration: DatabaseMigration = {
  version: '028',
  name: 'production_material_history_snapshot',
  checksum: '028-production-material-history-snapshot-v1',
  async up(executor) {
    const columns = await executor.execute(`PRAGMA table_info(${TABLE_NAME})`);
    if (!columns.rows.some((row) => String(row.name) === COLUMN_NAME)) {
      await executor.execute(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${COLUMN_NAME} TEXT`);
    }

    const verified = await executor.execute(`PRAGMA table_info(${TABLE_NAME})`);
    if (!verified.rows.some((row) => String(row.name) === COLUMN_NAME)) {
      throw new Error('PRODUCTION_MATERIAL_HISTORY_SNAPSHOT_COLUMN_MISSING');
    }
  },
};

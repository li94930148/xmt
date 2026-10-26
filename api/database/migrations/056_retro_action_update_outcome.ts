import type { DatabaseMigration } from './types';

/** Persist whether an idempotent retrospective action update was processed or conflicted. */
export const retroActionUpdateOutcomeMigration: DatabaseMigration = {
  version: '056',
  name: 'retro_action_update_outcome',
  checksum: '056-retro-action-update-outcome-v1',
  async up(executor) {
    const columns = await executor.execute('PRAGMA table_info(retro_action_update_request_keys)');
    const outcomeColumn = columns.rows.find((column) => String(column.name) === 'outcome');
    if (!outcomeColumn) {
      await executor.execute(`
        ALTER TABLE retro_action_update_request_keys
        ADD COLUMN outcome TEXT NOT NULL DEFAULT 'processed'
        CHECK (outcome IN ('processed', 'conflict'))
      `);
    }

    const updatedColumns = await executor.execute('PRAGMA table_info(retro_action_update_request_keys)');
    const updatedOutcomeColumn = updatedColumns.rows.find((column) => String(column.name) === 'outcome');
    if (!updatedOutcomeColumn
      || Number(updatedOutcomeColumn.notnull) !== 1
      || String(updatedOutcomeColumn.dflt_value).replace(/'/g, '') !== 'processed') {
      throw new Error('RETRO_ACTION_UPDATE_OUTCOME_SCHEMA_INVALID');
    }

    const schema = await executor.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='retro_action_update_request_keys'",
    );
    const schemaSql = String(schema.rows[0]?.sql || '').replace(/\s+/g, ' ').toLowerCase();
    if (!schemaSql.includes("check (outcome in ('processed', 'conflict'))")) {
      throw new Error('RETRO_ACTION_UPDATE_OUTCOME_CHECK_INVALID');
    }
  },
};

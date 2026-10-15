import type { DatabaseMigration } from './types';

export const workflowScriptSourceMigration: DatabaseMigration = {
  version: '026',
  name: 'workflow_script_source',
  checksum: '026-workflow-script-source-v1',
  async up(executor) {
    for (const [table, column, definition] of [
      ['shooting', 'script_source_production_id', 'INTEGER'],
      ['shooting', 'script_source_version', 'TEXT'],
      ['publishing', 'script_source_production_id', 'INTEGER'],
      ['publishing', 'script_source_version', 'TEXT'],
    ] as const) {
      const result = await executor.execute(`PRAGMA table_info(${table})`);
      if (!result.rows.some((row) => String(row.name) === column)) {
        await executor.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
  },
};

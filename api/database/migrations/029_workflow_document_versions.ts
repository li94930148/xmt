import type { DatabaseMigration } from './types';

export const workflowDocumentVersionsMigration: DatabaseMigration = {
  version: '029',
  name: 'workflow_document_versions',
  checksum: '029-workflow-document-versions-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS workflow_document_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_type TEXT NOT NULL CHECK(document_type IN ('topic_outline', 'shooting_script', 'publishing_script')),
        document_id TEXT NOT NULL,
        version TEXT NOT NULL,
        content TEXT NOT NULL,
        change_type TEXT NOT NULL CHECK(change_type IN ('baseline', 'minor', 'major')),
        is_baseline INTEGER NOT NULL DEFAULT 0 CHECK(is_baseline IN (0, 1)),
        operator_id INTEGER,
        source_production_id INTEGER,
        source_production_version TEXT,
        created_at DATETIME,
        UNIQUE(document_type, document_id, version)
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_workflow_document_versions_document
      ON workflow_document_versions(document_type, document_id, is_baseline, id DESC)
    `);
    const table = await executor.execute(`PRAGMA table_info(workflow_document_versions)`);
    const columns = new Set(table.rows.map((row) => String(row.name)));
    for (const column of ['document_type', 'document_id', 'version', 'content', 'change_type', 'is_baseline', 'operator_id', 'source_production_id', 'source_production_version', 'created_at']) {
      if (!columns.has(column)) throw new Error(`WORKFLOW_DOCUMENT_VERSIONS_COLUMN_MISSING:${column}`);
    }
  },
};

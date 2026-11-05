import type { Client } from '@libsql/client';

const WORKFLOW_CONTENT_COLUMN_GROUPS = [
  {
    table: 'topics',
    columns: [
      { name: 'workflow_template_id', definition: 'INTEGER' },
      { name: 'submitted_at', definition: 'DATETIME' },
      { name: 'outline', definition: 'TEXT' },
      { name: 'outline_json', definition: 'TEXT' },
      { name: 'outline_markdown', definition: 'TEXT' },
    ],
  },
  {
    table: 'production',
    columns: [
      { name: 'content_json', definition: 'TEXT' },
      { name: 'content_markdown', definition: 'TEXT' },
      { name: 'toc_json', definition: 'TEXT' },
      { name: 'comments_json', definition: 'TEXT' },
      { name: 'editor_version', definition: "TEXT DEFAULT 'tiptap-1'" },
      { name: 'last_saved_at', definition: 'DATETIME' },
    ],
  },
  {
    table: 'production_history',
    columns: [
      { name: 'content_json', definition: 'TEXT' },
      { name: 'content_markdown', definition: 'TEXT' },
      { name: 'version_state', definition: "TEXT DEFAULT 'historical'" },
      { name: 'superseded_by_version', definition: 'TEXT' },
      { name: 'superseded_at', definition: 'DATETIME' },
    ],
  },
  {
    table: 'publishing',
    columns: [{ name: 'script_content', definition: 'TEXT' }],
  },
  {
    table: 'shooting',
    columns: [{ name: 'script_content', definition: 'TEXT' }],
  },
] as const;

export async function ensureWorkflowContentSchemaColumns(client: Pick<Client, 'execute'>): Promise<void> {
  for (const group of WORKFLOW_CONTENT_COLUMN_GROUPS) {
    const schema = await client.execute(`PRAGMA table_info(${group.table})`);
    const existingColumns = new Set(schema.rows.map((row) => String(row.name).toLowerCase()));

    for (const column of group.columns) {
      const normalizedName = column.name.toLowerCase();
      if (existingColumns.has(normalizedName)) continue;

      await client.execute(
        `ALTER TABLE ${group.table} ADD COLUMN ${column.name} ${column.definition}`,
      );
      existingColumns.add(normalizedName);
    }
  }
}

export async function backfillMissingTopicSubmissionTimes(client: Pick<Client, 'execute'>): Promise<void> {
  await client.execute('UPDATE topics SET submitted_at = created_at WHERE submitted_at IS NULL');
}

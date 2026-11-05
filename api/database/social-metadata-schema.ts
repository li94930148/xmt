import type { Client } from '@libsql/client';

const SOCIAL_METADATA_COLUMN_GROUPS = [
  {
    table: 'social_accounts',
    columns: [{ name: 'credential_ref', definition: 'TEXT' }],
  },
  {
    table: 'social_ingestion_jobs',
    columns: [
      { name: 'trigger_source', definition: "TEXT NOT NULL DEFAULT 'manual'" },
      { name: 'failure_type', definition: 'TEXT' },
    ],
  },
  {
    table: 'social_credentials',
    columns: [
      { name: 'expired_reason', definition: 'TEXT' },
      { name: 'last_check_time', definition: 'DATETIME' },
      { name: 'last_success_time', definition: 'DATETIME' },
      { name: 'last_failure_time', definition: 'DATETIME' },
      { name: 'failure_reason', definition: 'TEXT' },
      { name: 'expire_detected_at', definition: 'DATETIME' },
    ],
  },
] as const;

export async function ensureSocialMetadataSchemaColumns(client: Pick<Client, 'execute'>): Promise<void> {
  for (const group of SOCIAL_METADATA_COLUMN_GROUPS) {
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

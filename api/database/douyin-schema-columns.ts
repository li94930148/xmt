import type { Client } from '@libsql/client';

const DOUYIN_SCHEMA_COLUMN_GROUPS = [
  {
    table: 'douyin_account_statistics',
    columns: [
      { name: 'play_count', definition: 'INTEGER DEFAULT 0' },
      { name: 'new_fans', definition: 'INTEGER DEFAULT 0' },
      { name: 'new_like_count', definition: 'INTEGER DEFAULT 0' },
      { name: 'new_comment_count', definition: 'INTEGER DEFAULT 0' },
      { name: 'profile_view_count', definition: 'INTEGER DEFAULT 0' },
      { name: 'raw_data_json', definition: 'TEXT' },
      { name: 'douyin_data_source', definition: "TEXT NOT NULL DEFAULT 'oauth'" },
    ],
  },
  {
    table: 'douyin_videos',
    columns: [
      { name: 'status', definition: "TEXT NOT NULL DEFAULT 'deprecated_pending_business_auth'" },
      { name: 'douyin_data_source', definition: "TEXT NOT NULL DEFAULT 'oauth'" },
    ],
  },
  {
    table: 'douyin_video_statistics',
    columns: [
      { name: 'douyin_data_source', definition: "TEXT NOT NULL DEFAULT 'oauth'" },
    ],
  },
] as const;

export async function ensureDouyinSchemaColumns(client: Pick<Client, 'execute'>): Promise<void> {
  for (const group of DOUYIN_SCHEMA_COLUMN_GROUPS) {
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

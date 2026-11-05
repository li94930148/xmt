import type { Client } from '@libsql/client';

const SOCIAL_VIDEO_COLUMN_DEFINITIONS = [
  { name: 'internal_video_key', definition: 'TEXT' },
  { name: 'source_type', definition: 'TEXT' },
  { name: 'duration', definition: 'INTEGER' },
  { name: 'status', definition: 'TEXT' },
  { name: 'visibility', definition: 'TEXT' },
  { name: 'avg_play_duration', definition: 'REAL' },
  { name: 'completion_rate_5s', definition: 'REAL' },
  { name: 'bounce_rate_2s', definition: 'REAL' },
] as const;

export async function ensureSocialVideoSchemaColumns(client: Pick<Client, 'execute'>): Promise<void> {
  const schema = await client.execute('PRAGMA table_info(social_videos)');
  const existingColumns = new Set(schema.rows.map((row) => String(row.name).toLowerCase()));

  for (const column of SOCIAL_VIDEO_COLUMN_DEFINITIONS) {
    const normalizedName = column.name.toLowerCase();
    if (existingColumns.has(normalizedName)) continue;

    await client.execute(`ALTER TABLE social_videos ADD COLUMN ${column.name} ${column.definition}`);
    existingColumns.add(normalizedName);
  }
}

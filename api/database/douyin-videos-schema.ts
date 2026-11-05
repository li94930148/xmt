import type { Client } from '@libsql/client';

export async function renameLegacyDouyinVideosTable(client: Pick<Client, 'execute'>): Promise<void> {
  const schema = await client.execute('PRAGMA table_info(douyin_videos)');
  const hasLegacySnapshotColumn = schema.rows.some(
    (row) => String(row.name).toLowerCase() === 'snapshot_id',
  );

  if (!hasLegacySnapshotColumn) return;

  await client.execute('ALTER TABLE douyin_videos RENAME TO douyin_videos_legacy_deprecated');
}

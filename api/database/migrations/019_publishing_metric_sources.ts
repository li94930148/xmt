import type { DatabaseMigration } from './types';

/** Store manual metrics at publication grain and retain provenance for new Douyin snapshots. */
export const publishingMetricSourcesMigration: DatabaseMigration = {
  version: '019',
  name: 'publishing_metric_sources',
  checksum: '019-publishing-metric-sources-v1',
  async up(executor) {
    for (const column of ['manual_views', 'manual_likes', 'manual_shares', 'manual_comments']) {
      await executor.execute(`ALTER TABLE publishing ADD COLUMN ${column} INTEGER`);
    }
    await executor.execute('ALTER TABLE publishing ADD COLUMN manual_metrics_updated_at DATETIME');
    await executor.execute('ALTER TABLE publishing ADD COLUMN manual_metrics_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL');

    await executor.execute("ALTER TABLE douyin_work_snapshots ADD COLUMN source_type TEXT NOT NULL DEFAULT 'legacy_unknown'");
    await executor.execute('ALTER TABLE douyin_work_snapshots ADD COLUMN source_file_sha256 TEXT');
    for (const column of ['has_play_count', 'has_like_count', 'has_comment_count', 'has_share_count']) {
      await executor.execute(`ALTER TABLE douyin_work_snapshots ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    }
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_douyin_work_snapshots_source
      ON douyin_work_snapshots(work_id,source_type,snapshot_time DESC,id DESC)`);
  },
};

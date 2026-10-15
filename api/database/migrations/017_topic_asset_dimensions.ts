import type { DatabaseMigration } from './types';

export const topicAssetDimensionsMigration: DatabaseMigration = {
  version: '017',
  name: 'topic_asset_dimensions',
  checksum: '017-topic-asset-dimensions-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS topic_asset_dimensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      dimension_type TEXT NOT NULL CHECK(dimension_type IN ('city', 'person', 'project')),
      value TEXT NOT NULL CHECK(length(trim(value)) BETWEEN 1 AND 80),
      normalized_value TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
      UNIQUE(topic_id, dimension_type, normalized_value)
    )`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_topic_asset_dimensions_lookup
      ON topic_asset_dimensions(dimension_type, normalized_value, topic_id)`);
  },
};

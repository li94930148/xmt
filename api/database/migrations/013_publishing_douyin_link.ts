import type { DatabaseMigration } from './types';

export const publishingDouyinLinkMigration: DatabaseMigration = {
  version: '013',
  name: 'publishing_douyin_link',
  checksum: '013-publishing-douyin-link-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS publishing_douyin_links (
        publishing_id INTEGER PRIMARY KEY,
        douyin_work_id INTEGER NOT NULL UNIQUE,
        match_method TEXT NOT NULL CHECK (match_method IN ('exact', 'containment', 'fuzzy', 'manual')),
        match_score REAL NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (publishing_id) REFERENCES publishing(id) ON DELETE CASCADE,
        FOREIGN KEY (douyin_work_id) REFERENCES douyin_works(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_publishing_douyin_links_work
      ON publishing_douyin_links(douyin_work_id)
    `);
  },
};

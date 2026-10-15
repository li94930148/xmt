import type { DatabaseMigration } from './types';

export const productionReviewThreadsMigration: DatabaseMigration = {
  version: '018',
  name: 'production_review_threads',
  checksum: '018-production-review-threads-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS production_review_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_id INTEGER NOT NULL REFERENCES production(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('comment', 'suggestion')),
      anchor_quote TEXT NOT NULL CHECK(length(trim(anchor_quote)) BETWEEN 1 AND 2000),
      anchor_context TEXT NOT NULL DEFAULT '',
      anchor_from INTEGER NOT NULL CHECK(anchor_from >= 0),
      anchor_to INTEGER NOT NULL CHECK(anchor_to > anchor_from),
      summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 4000),
      proposed_text TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'accepted', 'rejected')),
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
      CHECK((kind = 'comment' AND proposed_text IS NULL) OR (kind = 'suggestion' AND proposed_text IS NOT NULL))
    )`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_production_review_threads_scope
      ON production_review_threads(production_id, version, status, created_at DESC)`);

    await executor.execute(`CREATE TABLE IF NOT EXISTS production_review_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES production_review_threads(id) ON DELETE CASCADE,
      content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 4000),
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours'))
    )`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_production_review_replies_thread
      ON production_review_replies(thread_id, created_at, id)`);
  },
};

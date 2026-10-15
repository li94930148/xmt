import type { DatabaseMigration } from './types';

/** Keep explicit, account-scoped feedback about data-backed topic suggestions. */
export const creatorTopicSuggestionFeedbackMigration: DatabaseMigration = {
  version: '021',
  name: 'creator_topic_suggestion_feedback',
  checksum: '021-creator-topic-suggestion-feedback-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS creator_topic_suggestion_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_account_id INTEGER NOT NULL REFERENCES creator_platform_accounts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      suggestion_id TEXT NOT NULL CHECK(length(suggestion_id) = 20),
      evidence_id TEXT NOT NULL CHECK(length(evidence_id) = 32),
      outcome TEXT NOT NULL CHECK(outcome IN ('adopted', 'not_adopted')),
      sample_count INTEGER NOT NULL CHECK(sample_count >= 0),
      baseline_count INTEGER NOT NULL CHECK(baseline_count >= 0),
      median_plays REAL NOT NULL CHECK(median_plays >= 0),
      baseline_median_plays REAL NOT NULL CHECK(baseline_median_plays >= 0),
      play_ratio REAL NOT NULL CHECK(play_ratio >= 0),
      created_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
      UNIQUE(creator_account_id, user_id, suggestion_id, evidence_id)
    )`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_creator_topic_suggestion_feedback_summary
      ON creator_topic_suggestion_feedback(creator_account_id, suggestion_id, evidence_id, outcome)`);
  },
};

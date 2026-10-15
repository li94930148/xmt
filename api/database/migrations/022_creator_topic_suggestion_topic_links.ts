import type { DatabaseMigration } from './types';

/** Tie an explicitly submitted creator suggestion to its topic for later outcome joins by topic_id. */
export const creatorTopicSuggestionTopicLinksMigration: DatabaseMigration = {
  version: '022',
  name: 'creator_topic_suggestion_topic_links',
  checksum: '022-creator-topic-suggestion-topic-links-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS creator_topic_suggestion_topic_links (
      topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
      creator_account_id INTEGER NOT NULL REFERENCES creator_platform_accounts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      suggestion_id TEXT NOT NULL CHECK(length(suggestion_id) = 20),
      evidence_id TEXT NOT NULL CHECK(length(evidence_id) = 32),
      created_at DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
      FOREIGN KEY (creator_account_id, user_id, suggestion_id, evidence_id)
        REFERENCES creator_topic_suggestion_feedback(creator_account_id, user_id, suggestion_id, evidence_id)
        ON DELETE CASCADE
    )`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_creator_topic_suggestion_topic_links_evidence
      ON creator_topic_suggestion_topic_links(creator_account_id, suggestion_id, evidence_id, topic_id)`);
  },
};

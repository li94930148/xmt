import type { DatabaseMigration } from './types';

export const inspirationTopicLinkMigration: DatabaseMigration = {
  version: '016',
  name: 'inspiration_topic_link',
  checksum: '016-inspiration-topic-link-v1',
  async up(executor) {
    const columns = await executor.execute('PRAGMA table_info(inspirations)');
    if (!columns.rows.some((row) => String(row.name) === 'topic_id')) {
      await executor.execute(`ALTER TABLE inspirations ADD COLUMN topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL`);
    }

    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_inspirations_topic ON inspirations(topic_id)`);
  },
};

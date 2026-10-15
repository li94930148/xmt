import type { DatabaseMigration } from './types';

export const topicStageEnteredAtMigration: DatabaseMigration = {
  version: '025',
  name: 'topic_stage_entered_at',
  checksum: '025-topic-stage-entered-at-v1',
  async up(executor) {
    const columns = await executor.execute('PRAGMA table_info(topics)');
    const hasStageEnteredAt = columns.rows.some((column) => String(column.name) === 'stage_entered_at');
    if (!hasStageEnteredAt) {
      await executor.execute('ALTER TABLE topics ADD COLUMN stage_entered_at DATETIME');
    }
  },
};

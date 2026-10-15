import { beijingNow } from '../../database/utils';

export type PublishingCompletionOutcome = 'published' | 'all_failed';

export type PublishingCompletionTransaction = {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
};

/**
 * Topic completes immediately when any platform publishes. With no published
 * rows, every platform must have failed before the result counts as handled.
 */
export function getPublishingCompletionOutcome(statuses: readonly unknown[]): PublishingCompletionOutcome | null {
  if (statuses.some((status) => status === 'published')) return 'published';
  if (statuses.length > 0 && statuses.every((status) => status === 'failed' || status === 'published')) {
    return 'all_failed';
  }
  return null;
}

export function getPublishingCompletionReason(outcome: PublishingCompletionOutcome): string {
  return outcome === 'published'
    ? '至少一个发布平台已发布'
    : '所有发布任务均已处理（发布异常计作已处理）';
}

export async function advancePublishingTopicIfResolved(
  tx: PublishingCompletionTransaction,
  topicId: number | string,
  operatorId?: number,
): Promise<PublishingCompletionOutcome | null> {
  const topic = await tx.queryOne<{ status: string; title: string }>(
    'SELECT status,title FROM topics WHERE id=?',
    [topicId],
  );
  if (!topic || topic.status !== 'publishing') return null;

  const publishingRows = await tx.queryAll<{ status: string | null }>(
    `SELECT CASE WHEN dw.id IS NOT NULL THEN 'published' ELSE p.status END AS status
     FROM publishing p
     LEFT JOIN publishing_douyin_links link ON link.publishing_id=p.id
     LEFT JOIN douyin_works dw ON dw.id=link.douyin_work_id
     WHERE p.topic_id=?`,
    [topicId],
  );
  const outcome = getPublishingCompletionOutcome(publishingRows.map((row) => row.status));
  if (!outcome) return null;

  const recordedAt = beijingNow();
  const advanced = await tx.execute(
    `UPDATE topics SET status='completed', stage_entered_at=?, updated_at=? WHERE id=? AND status='publishing'`,
    [recordedAt, recordedAt, topicId],
  );
  if (advanced === 0) return null;

  const reason = getPublishingCompletionReason(outcome);
  await tx.execute(
    `INSERT INTO topic_history(topic_id,action,comment,operator_id,created_at) VALUES(?,?,?,?,?)`,
    [topicId, 'status_completed', reason, operatorId ?? null, recordedAt],
  );
  await tx.execute(
    `INSERT INTO activity_log(user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)`,
    [operatorId ?? null, 'status_change', 'topic', `选题「${topic.title}」状态由「发布中」变更为「已完成」（${reason}）`, recordedAt],
  );
  await tx.execute(
    `INSERT INTO messages(user_id,title,content,type,created_at) VALUES(?,?,?,?,?)`,
    [
      operatorId ?? null,
      outcome === 'published' ? '发布完成' : '发布任务已处理',
      `选题「${topic.title}」${reason}`,
      outcome === 'published' ? 'success' : 'info',
      recordedAt,
    ],
  );
  return outcome;
}

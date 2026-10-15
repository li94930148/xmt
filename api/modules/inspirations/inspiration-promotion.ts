export type InspirationPromotionTransaction = {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<number>;
  executeInsert(sql: string, params?: unknown[]): Promise<number>;
};

type InspirationPromotionRecord = {
  id: number;
  title: string;
  description: string | null;
  creator_id: number | null;
  status: string | null;
  topic_id: number | null;
};

export class InspirationPromotionError extends Error {
  constructor(public readonly statusCode: 404 | 409, message: string) {
    super(message);
    this.name = 'InspirationPromotionError';
  }
}

export async function promoteInspirationInTransaction(
  tx: InspirationPromotionTransaction,
  inspirationId: number,
  userId: number,
): Promise<{ topicId: number; created: boolean; inspiration: InspirationPromotionRecord }> {
  const inspiration = await tx.queryOne<InspirationPromotionRecord>(
    'SELECT id, title, description, creator_id, status, topic_id FROM inspirations WHERE id = ?',
    [inspirationId],
  );
  if (!inspiration) {
    throw new InspirationPromotionError(404, '灵感不存在');
  }

  if (inspiration.topic_id !== null && inspiration.topic_id !== undefined) {
    return { topicId: Number(inspiration.topic_id), created: false, inspiration };
  }

  // Historical promoted rows have no trustworthy link; never guess which topic they created.
  if (inspiration.status === 'promoted') {
    throw new InspirationPromotionError(409, '这条灵感已转为选题，但关联记录尚未建立，请联系管理员核对后处理。');
  }

  const topicId = await tx.executeInsert(
    `INSERT INTO topics (title, description, status, creator_id, stage_entered_at) VALUES (?, ?, 'pending', ?, datetime('now', '+8 hours'))`,
    [inspiration.title, inspiration.description, userId],
  );

  await tx.execute(
    'INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)',
    [topicId, 'created', `从灵感「${inspiration.title}」转为正式选题`, userId],
  );

  const updated = await tx.execute(
    `UPDATE inspirations
     SET status = 'promoted', topic_id = ?, updated_at = datetime('now', '+8 hours')
     WHERE id = ? AND topic_id IS NULL AND COALESCE(status, '') <> 'promoted'`,
    [topicId, inspirationId],
  );
  if (updated !== 1) {
    throw new InspirationPromotionError(409, '灵感状态已变化，请刷新后确认是否已转为选题。');
  }

  return { topicId, created: true, inspiration };
}

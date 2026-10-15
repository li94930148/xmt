import { execute, executeInsert, queryAll, queryOne } from '../database/utils';

export type ProductionReviewKind = 'comment' | 'suggestion';
export type ProductionReviewStatus = 'open' | 'resolved' | 'accepted' | 'rejected';

export type ProductionReviewAnchor = {
  quote: string;
  context: string;
  from: number;
  to: number;
};

export type ProductionReviewInput = {
  productionId: number;
  version: string;
  kind: ProductionReviewKind;
  anchor: ProductionReviewAnchor;
  summary: string;
  proposedText: string | null;
  authorId: number;
};

type ThreadRow = {
  id: number;
  production_id: number;
  version: string;
  kind: ProductionReviewKind;
  anchor_quote: string;
  anchor_context: string;
  anchor_from: number;
  anchor_to: number;
  summary: string;
  proposed_text: string | null;
  status: ProductionReviewStatus;
  author_id: number;
  author_name: string | null;
  reviewed_by: number | null;
  reviewer_name: string | null;
  created_at: string;
  updated_at: string;
};

type ReplyRow = {
  id: number;
  thread_id: number;
  content: string;
  author_id: number;
  author_name: string | null;
  created_at: string;
};

export type ProductionReviewThread = ThreadRow & { replies: ReplyRow[] };

export async function listProductionReviewThreads(productionId: number, version: string): Promise<ProductionReviewThread[]> {
  const threads = await queryAll<ThreadRow>(`
    SELECT t.*, author.name AS author_name, reviewer.name AS reviewer_name
    FROM production_review_threads t
    LEFT JOIN users author ON author.id=t.author_id
    LEFT JOIN users reviewer ON reviewer.id=t.reviewed_by
    WHERE t.production_id=? AND t.version=?
    ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.created_at DESC, t.id DESC
    LIMIT 200
  `, [productionId, version]);
  if (threads.length === 0) return [];

  const replies = await queryAll<ReplyRow>(`
    SELECT r.*, u.name AS author_name
    FROM production_review_replies r
    JOIN production_review_threads t ON t.id=r.thread_id
    LEFT JOIN users u ON u.id=r.author_id
    WHERE t.production_id=? AND t.version=?
    ORDER BY r.created_at ASC, r.id ASC
  `, [productionId, version]);
  const repliesByThread = new Map<number, ReplyRow[]>();
  for (const reply of replies) {
    const group = repliesByThread.get(reply.thread_id) ?? [];
    group.push(reply);
    repliesByThread.set(reply.thread_id, group);
  }
  return threads.map((thread) => ({ ...thread, replies: repliesByThread.get(thread.id) ?? [] }));
}

export async function getProductionReviewThread(threadId: number, productionId: number) {
  return queryOne<ThreadRow>(`
    SELECT t.*, author.name AS author_name, reviewer.name AS reviewer_name
    FROM production_review_threads t
    LEFT JOIN users author ON author.id=t.author_id
    LEFT JOIN users reviewer ON reviewer.id=t.reviewed_by
    WHERE t.id=? AND t.production_id=?
  `, [threadId, productionId]);
}

export async function createProductionReviewThread(input: ProductionReviewInput) {
  return executeInsert(`
    INSERT INTO production_review_threads(
      production_id, version, kind, anchor_quote, anchor_context, anchor_from, anchor_to,
      summary, proposed_text, author_id
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `, [
    input.productionId,
    input.version,
    input.kind,
    input.anchor.quote,
    input.anchor.context,
    input.anchor.from,
    input.anchor.to,
    input.summary,
    input.proposedText,
    input.authorId,
  ]);
}

export async function createProductionReviewReply(threadId: number, authorId: number, content: string) {
  return executeInsert(
    'INSERT INTO production_review_replies(thread_id, content, author_id) VALUES(?,?,?)',
    [threadId, content, authorId],
  );
}

export async function updateProductionReviewStatus(
  threadId: number,
  status: ProductionReviewStatus,
  reviewerId: number,
) {
  return execute(`
    UPDATE production_review_threads
    SET status=?, reviewed_by=?, updated_at=datetime('now', '+8 hours')
    WHERE id=? AND status='open'
  `, [status, reviewerId, threadId]);
}

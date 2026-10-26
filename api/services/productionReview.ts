import { createHash } from 'node:crypto';
import { execute, executeInsert, queryAll, queryOne, runInTransaction } from '../database/utils';

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

export type ProductionReviewThreadRequestResult =
  | { kind: 'created' | 'replayed'; threadId: number }
  | { kind: 'request-conflict' | 'production-missing' | 'historical' };

function productionReviewThreadFingerprint(input: ProductionReviewInput) {
  return createHash('sha256').update(JSON.stringify({
    version: input.version,
    kind: input.kind,
    anchor: {
      quote: input.anchor.quote,
      context: input.anchor.context,
      from: input.anchor.from,
      to: input.anchor.to,
    },
    summary: input.summary,
    proposed_text: input.proposedText,
  })).digest('hex');
}

export async function createProductionReviewThreadWithRequest(input: ProductionReviewInput & {
  clientRequestId: string;
}): Promise<ProductionReviewThreadRequestResult> {
  const fingerprint = productionReviewThreadFingerprint(input);
  return runInTransaction(async (tx) => {
    const previous = await tx.queryOne<{
      actor_id: number;
      production_id: number;
      thread_id: number;
      request_fingerprint: string;
    }>(`SELECT actor_id,production_id,thread_id,request_fingerprint
        FROM production_review_thread_request_keys WHERE client_request_id=?`, [input.clientRequestId]);
    if (previous) {
      if (Number(previous.actor_id) !== input.authorId
        || Number(previous.production_id) !== input.productionId
        || previous.request_fingerprint !== fingerprint) {
        return { kind: 'request-conflict' };
      }
      return { kind: 'replayed', threadId: Number(previous.thread_id) };
    }

    const production = await tx.queryOne<{ version: string | null }>(
      'SELECT version FROM production WHERE id=?', [input.productionId],
    );
    if (!production) return { kind: 'production-missing' };
    if (input.version !== String(production.version || 'v1.0')) return { kind: 'historical' };

    const threadId = await tx.executeInsert(`
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
    await tx.execute(
      `INSERT INTO production_review_thread_request_keys(
         client_request_id,actor_id,production_id,thread_id,request_fingerprint
       ) VALUES(?,?,?,?,?)`,
      [input.clientRequestId, input.authorId, input.productionId, threadId, fingerprint],
    );
    return { kind: 'created', threadId };
  });
}

export async function getProductionReviewThreadRequestStatus(input: {
  clientRequestId: string;
  actorId: number;
  productionId: number;
  fingerprint: string;
}) {
  const request = await queryOne<{
    actor_id: number;
    production_id: number;
    thread_id: number;
    request_fingerprint: string;
  }>(`SELECT actor_id,production_id,thread_id,request_fingerprint
      FROM production_review_thread_request_keys WHERE client_request_id=?`, [input.clientRequestId]);
  if (!request || Number(request.actor_id) !== input.actorId || Number(request.production_id) !== input.productionId) {
    return { status: 'not_found' as const };
  }
  if (request.request_fingerprint !== input.fingerprint) return { status: 'conflict' as const };
  return { status: 'applied' as const, threadId: Number(request.thread_id) };
}

export async function createProductionReviewReply(threadId: number, authorId: number, content: string) {
  return executeInsert(
    'INSERT INTO production_review_replies(thread_id, content, author_id) VALUES(?,?,?)',
    [threadId, content, authorId],
  );
}

export type ProductionReviewReplyRequestResult =
  | { kind: 'created' | 'replayed'; replyId: number }
  | { kind: 'request-conflict' | 'production-missing' | 'thread-missing' | 'historical' | 'closed' };

export async function createProductionReviewReplyWithRequest(input: {
  clientRequestId: string;
  productionId: number;
  threadId: number;
  authorId: number;
  content: string;
}): Promise<ProductionReviewReplyRequestResult> {
  const fingerprint = createHash('sha256').update(input.content).digest('hex');
  return runInTransaction(async (tx) => {
    const previous = await tx.queryOne<{
      actor_id: number;
      production_id: number;
      thread_id: number;
      reply_id: number;
      request_fingerprint: string;
    }>(`SELECT actor_id,production_id,thread_id,reply_id,request_fingerprint
        FROM production_review_reply_request_keys WHERE client_request_id=?`, [input.clientRequestId]);
    if (previous) {
      if (Number(previous.actor_id) !== input.authorId
        || Number(previous.production_id) !== input.productionId
        || Number(previous.thread_id) !== input.threadId
        || previous.request_fingerprint !== fingerprint) {
        return { kind: 'request-conflict' };
      }
      return { kind: 'replayed', replyId: Number(previous.reply_id) };
    }

    const production = await tx.queryOne<{ version: string | null }>(
      'SELECT version FROM production WHERE id=?', [input.productionId],
    );
    if (!production) return { kind: 'production-missing' };
    const thread = await tx.queryOne<{ production_id: number; version: string; status: string }>(
      'SELECT production_id,version,status FROM production_review_threads WHERE id=?', [input.threadId],
    );
    if (!thread || Number(thread.production_id) !== input.productionId) return { kind: 'thread-missing' };
    if (thread.version !== String(production.version || 'v1.0')) return { kind: 'historical' };
    if (thread.status !== 'open') return { kind: 'closed' };

    const replyId = await tx.executeInsert(
      'INSERT INTO production_review_replies(thread_id, content, author_id) VALUES(?,?,?)',
      [input.threadId, input.content, input.authorId],
    );
    await tx.execute(
      `INSERT INTO production_review_reply_request_keys(
         client_request_id,actor_id,production_id,thread_id,reply_id,request_fingerprint
       ) VALUES(?,?,?,?,?,?)`,
      [input.clientRequestId, input.authorId, input.productionId, input.threadId, replyId, fingerprint],
    );
    return { kind: 'created', replyId };
  });
}

export async function getProductionReviewReplyRequestStatus(input: {
  clientRequestId: string;
  actorId: number;
  productionId: number;
  threadId: number;
  fingerprint: string;
}) {
  const request = await queryOne<{
    actor_id: number;
    production_id: number;
    thread_id: number;
    reply_id: number;
    request_fingerprint: string;
  }>(`SELECT actor_id,production_id,thread_id,reply_id,request_fingerprint
      FROM production_review_reply_request_keys WHERE client_request_id=?`, [input.clientRequestId]);
  if (!request || Number(request.actor_id) !== input.actorId
    || Number(request.production_id) !== input.productionId
    || Number(request.thread_id) !== input.threadId) {
    return { status: 'not_found' as const };
  }
  if (request.request_fingerprint !== input.fingerprint) return { status: 'conflict' as const };
  return { status: 'applied' as const, replyId: Number(request.reply_id) };
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

export type ProductionReviewStatusRequestResult =
  | { kind: 'updated' | 'replayed'; status: ProductionReviewStatus }
  | { kind: 'request-conflict' | 'production-missing' | 'thread-missing' | 'historical' | 'closed' };

export async function updateProductionReviewStatusWithRequest(input: {
  clientRequestId: string;
  productionId: number;
  threadId: number;
  status: Exclude<ProductionReviewStatus, 'open'>;
  reviewerId: number;
}): Promise<ProductionReviewStatusRequestResult> {
  return runInTransaction(async (tx) => {
    const previous = await tx.queryOne<{
      actor_id: number;
      production_id: number;
      thread_id: number;
      target_status: Exclude<ProductionReviewStatus, 'open'>;
    }>(`SELECT actor_id,production_id,thread_id,target_status
        FROM production_review_status_request_keys WHERE client_request_id=?`, [input.clientRequestId]);
    if (previous) {
      if (Number(previous.actor_id) !== input.reviewerId
        || Number(previous.production_id) !== input.productionId
        || Number(previous.thread_id) !== input.threadId
        || previous.target_status !== input.status) {
        return { kind: 'request-conflict' };
      }
      return { kind: 'replayed', status: previous.target_status };
    }

    const production = await tx.queryOne<{ version: string | null }>(
      'SELECT version FROM production WHERE id=?', [input.productionId],
    );
    if (!production) return { kind: 'production-missing' };
    const thread = await tx.queryOne<{ production_id: number; version: string; status: ProductionReviewStatus }>(
      'SELECT production_id,version,status FROM production_review_threads WHERE id=?', [input.threadId],
    );
    if (!thread || Number(thread.production_id) !== input.productionId) return { kind: 'thread-missing' };
    if (thread.version !== String(production.version || 'v1.0')) return { kind: 'historical' };
    if (thread.status !== 'open') return { kind: 'closed' };

    const changed = await tx.execute(`
      UPDATE production_review_threads
      SET status=?, reviewed_by=?, updated_at=datetime('now', '+8 hours')
      WHERE id=? AND production_id=? AND status='open'
    `, [input.status, input.reviewerId, input.threadId, input.productionId]);
    if (!changed) return { kind: 'closed' };
    await tx.execute(`
      INSERT INTO production_review_status_request_keys(
        client_request_id,actor_id,production_id,thread_id,target_status
      ) VALUES(?,?,?,?,?)
    `, [input.clientRequestId, input.reviewerId, input.productionId, input.threadId, input.status]);
    return { kind: 'updated', status: input.status };
  });
}

export async function getProductionReviewStatusRequestStatus(input: {
  clientRequestId: string;
  actorId: number;
  productionId: number;
  threadId: number;
  status: Exclude<ProductionReviewStatus, 'open'>;
}) {
  const request = await queryOne<{
    actor_id: number;
    production_id: number;
    thread_id: number;
    target_status: Exclude<ProductionReviewStatus, 'open'>;
  }>(`SELECT actor_id,production_id,thread_id,target_status
      FROM production_review_status_request_keys WHERE client_request_id=?`, [input.clientRequestId]);
  if (!request || Number(request.actor_id) !== input.actorId
    || Number(request.production_id) !== input.productionId
    || Number(request.thread_id) !== input.threadId) {
    return { status: 'not_found' as const };
  }
  if (request.target_status !== input.status) return { status: 'conflict' as const };
  return { status: 'applied' as const, appliedStatus: request.target_status };
}

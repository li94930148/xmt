import express from 'express';
import { createHash } from 'node:crypto';
import { authenticate, requireRole } from '../middleware/auth';
import { beijingNow, execute, executeInsert, queryAll, queryOne, runInTransaction } from '../database/utils';

const router = express.Router();
export const anonymousFeedbackAdminRouter = express.Router();
const feedbackTypes = new Set(['feature', 'usage', 'process', 'team', 'other']);
const feedbackStatuses = new Set(['pending', 'processing', 'completed']);
const DELETE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPDATE_REQUEST_ID_PATTERN = DELETE_REQUEST_ID_PATTERN;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

type AnonymousFeedbackMutationRow = {
  id: number | string;
  type: string;
  content: string;
  need_reply: number | string | boolean;
  reply_content: string | null;
  status: string;
  is_public: number | string | boolean;
  created_at: string;
  updated_at: string;
};

type AnonymousFeedbackUpdatePayload = {
  status?: string;
  reply_content?: string | null;
  is_public?: boolean;
};

type AnonymousFeedbackSubmissionPayload = {
  type: string;
  content: string;
  needReply: boolean;
};

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function anonymousFeedbackSubmissionFingerprint(payload: AnonymousFeedbackSubmissionPayload) {
  return sha256(JSON.stringify([payload.type, payload.content, payload.needReply]));
}

/** Stable mutable-row baseline exposed to the admin list for keyed PATCH compare-and-swap. */
export function anonymousFeedbackBaseFingerprint(row: AnonymousFeedbackMutationRow) {
  return sha256(JSON.stringify([
    Number(row.id),
    row.type,
    row.content,
    Number(row.need_reply),
    row.reply_content,
    row.status,
    Number(row.is_public),
    row.created_at,
    row.updated_at,
  ]));
}

/** Must stay in sync with the browser's canonical request fingerprint. */
export function anonymousFeedbackUpdateRequestFingerprint(
  targetId: number,
  baseFingerprint: string,
  payload: AnonymousFeedbackUpdatePayload,
) {
  return sha256(JSON.stringify([
    targetId,
    baseFingerprint,
    payload.status ?? null,
    payload.reply_content === undefined ? null : payload.reply_content?.trim() || null,
    payload.is_public ?? null,
  ]));
}

function normalizeAnonymousFeedbackUpdatePayload(body: Record<string, unknown>): AnonymousFeedbackUpdatePayload | null {
  const payload: AnonymousFeedbackUpdatePayload = {};
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !feedbackStatuses.has(body.status)) return null;
    payload.status = body.status;
  }
  if (body.reply_content !== undefined) {
    if (typeof body.reply_content !== 'string' || body.reply_content.trim().length > 2000) return null;
    payload.reply_content = body.reply_content.trim() || null;
  }
  if (body.is_public !== undefined) {
    if (typeof body.is_public !== 'boolean') return null;
    payload.is_public = body.is_public;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}

router.use('/submission-requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/submission-requests/:requestId', authenticate, async (req, res) => {
  const requestId = String(req.params.requestId || '').trim().toLowerCase();
  const requestFingerprint = typeof req.query.request_fingerprint === 'string'
    ? req.query.request_fingerprint.trim().toLowerCase()
    : '';
  if (!DELETE_REQUEST_ID_PATTERN.test(requestId) || !SHA256_PATTERN.test(requestFingerprint)) {
    return res.status(400).json({ message: '意见提交请求编号无效' });
  }

  try {
    const receipt = await queryOne<{ request_fingerprint: string }>(
      `SELECT receipt.request_fingerprint
       FROM anonymous_feedback_submission_request_keys receipt
       INNER JOIN anonymous_feedback feedback ON feedback.id=receipt.target_feedback_id
       WHERE receipt.client_request_id=?`,
      [requestId],
    );
    const state = !receipt ? 'not_found'
      : receipt.request_fingerprint === requestFingerprint ? 'processed' : 'conflict';
    return res.json({ data: { state } });
  } catch {
    return res.status(500).json({ message: '核实意见提交结果失败' });
  }
});

router.get('/', authenticate, async (_req, res) => {
  try {
    const feedback = await queryAll(`
      SELECT id, type, content, need_reply, reply_content, status, created_at, updated_at
      FROM anonymous_feedback
      WHERE is_public = 1
      ORDER BY created_at DESC, id DESC
    `);
    return res.json({ data: feedback });
  } catch {
    return res.status(500).json({ message: '获取意见列表失败' });
  }
});

router.post('/', authenticate, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const type = typeof body.type === 'string' ? body.type : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const needReply = body.needReply;

  if (!feedbackTypes.has(type)) return res.status(400).json({ message: '请选择有效的意见类型' });
  if (!content) return res.status(400).json({ message: '意见内容不能为空' });
  if (content.length > 2000) return res.status(400).json({ message: '意见内容不能超过 2000 字' });
  if (typeof needReply !== 'boolean') return res.status(400).json({ message: '回复选项格式不正确' });

  const hasRequestId = body.client_request_id !== undefined;
  const requestId = typeof body.client_request_id === 'string' ? body.client_request_id.trim().toLowerCase() : '';
  if (hasRequestId && !DELETE_REQUEST_ID_PATTERN.test(requestId)) {
    return res.status(400).json({ message: '意见提交请求编号无效' });
  }

  try {
    if (hasRequestId) {
      const payload = { type, content, needReply };
      const requestFingerprint = anonymousFeedbackSubmissionFingerprint(payload);
      const outcome = await runInTransaction(async (tx) => {
        const existing = await tx.queryOne<{
          target_feedback_id: number | string;
          request_fingerprint: string;
        }>(
          `SELECT target_feedback_id,request_fingerprint
           FROM anonymous_feedback_submission_request_keys WHERE client_request_id=?`,
          [requestId],
        );
        if (existing) {
          if (existing.request_fingerprint !== requestFingerprint) return { state: 'conflict' as const };
          const feedback = await tx.queryOne<{ id: number }>(
            'SELECT id FROM anonymous_feedback WHERE id=?',
            [Number(existing.target_feedback_id)],
          );
          if (feedback) return { state: 'processed' as const, replayed: true };
          // Heal a legacy orphan without changing the user's opinion data.
          await tx.execute('DELETE FROM anonymous_feedback_submission_request_keys WHERE client_request_id=?', [requestId]);
        }

        const feedbackId = await tx.executeInsert(
          `INSERT INTO anonymous_feedback (type, content, need_reply, status, created_at, updated_at)
           VALUES (?, ?, ?, 'pending', ?, ?)`,
          [type, content, needReply ? 1 : 0, beijingNow(), beijingNow()],
        );
        await tx.execute(
          `INSERT INTO anonymous_feedback_submission_request_keys
             (client_request_id,target_feedback_id,request_fingerprint,created_at)
           VALUES(?,?,?,?)`,
          [requestId, feedbackId, requestFingerprint, beijingNow()],
        );
        return { state: 'processed' as const, replayed: false };
      });
      if (outcome.state === 'conflict') {
        return res.status(409).json({
          message: '意见提交请求编号已对应其他内容，已停止本次提交以避免重复。',
          code: 'ANONYMOUS_FEEDBACK_SUBMISSION_REQUEST_CONFLICT',
        });
      }
      return res.status(outcome.replayed ? 200 : 201).json({ success: true, idempotent_replay: outcome.replayed });
    }

    await executeInsert(
      `INSERT INTO anonymous_feedback (type, content, need_reply, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [type, content, needReply ? 1 : 0, beijingNow(), beijingNow()],
    );
    return res.status(201).json({ success: true });
  } catch {
    return res.status(500).json({ message: '提交意见失败' });
  }
});

anonymousFeedbackAdminRouter.use('/:targetId/delete-requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
anonymousFeedbackAdminRouter.use('/:targetId/update-requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
anonymousFeedbackAdminRouter.use(authenticate, requireRole(['admin']));

anonymousFeedbackAdminRouter.get('/', async (_req, res) => {
  try {
    const feedback = await queryAll(`SELECT * FROM anonymous_feedback ORDER BY created_at DESC, id DESC`);
    return res.json({ data: feedback.map((row) => ({
      ...row,
      base_fingerprint: anonymousFeedbackBaseFingerprint(row as AnonymousFeedbackMutationRow),
    })) });
  } catch {
    return res.status(500).json({ message: '获取意见列表失败' });
  }
});

anonymousFeedbackAdminRouter.get('/:targetId/update-requests/:requestId', async (req, res) => {
  const targetId = Number(req.params.targetId);
  const requestId = String(req.params.requestId || '').trim().toLowerCase();
  const requestFingerprint = typeof req.query.request_fingerprint === 'string'
    ? req.query.request_fingerprint.trim().toLowerCase()
    : '';
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || !UPDATE_REQUEST_ID_PATTERN.test(requestId)
    || !SHA256_PATTERN.test(requestFingerprint)) {
    return res.status(400).json({ message: '更新请求核实参数无效' });
  }

  try {
    const stored = await queryOne<{
      actor_id: number | string;
      target_feedback_id: number | string;
      request_fingerprint: string;
    }>(
      `SELECT actor_id,target_feedback_id,request_fingerprint
       FROM anonymous_feedback_update_request_keys WHERE client_request_id=?`,
      [requestId],
    );
    if (!stored) {
      const target = await queryOne<{ id: number }>(`SELECT id FROM anonymous_feedback WHERE id=?`, [targetId]);
      return res.json({ data: { state: target ? 'not_found' : 'target_missing' } });
    }
    if (Number(stored.actor_id) !== Number(req.user?.id)) {
      return res.json({ data: { state: 'not_found' } });
    }
    if (Number(stored.target_feedback_id) !== targetId || stored.request_fingerprint !== requestFingerprint) {
      return res.json({ data: { state: 'conflict' } });
    }
    return res.json({ data: { state: 'processed' } });
  } catch {
    return res.status(500).json({ message: '核实更新结果失败' });
  }
});

anonymousFeedbackAdminRouter.get('/:targetId/delete-requests/:requestId', async (req, res) => {
  const targetId = Number(req.params.targetId);
  const requestId = String(req.params.requestId || '').trim().toLowerCase();
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || !DELETE_REQUEST_ID_PATTERN.test(requestId)) {
    return res.status(400).json({ message: '删除请求编号无效' });
  }

  try {
    const stored = await queryOne<{ actor_id: number; target_feedback_id: number }>(
      `SELECT actor_id,target_feedback_id FROM anonymous_feedback_delete_request_keys WHERE client_request_id=?`,
      [requestId],
    );
    if (!stored) {
      const target = await queryOne<{ id: number }>(`SELECT id FROM anonymous_feedback WHERE id=?`, [targetId]);
      return res.json({ data: { state: target ? 'not_found' : 'target_missing' } });
    }
    if (Number(stored.actor_id) !== Number(req.user?.id)) {
      return res.json({ data: { state: 'not_found' } });
    }
    if (Number(stored.target_feedback_id) !== targetId) {
      return res.json({ data: { state: 'conflict' } });
    }
    return res.json({ data: { state: 'committed' } });
  } catch {
    return res.status(500).json({ message: '核实删除结果失败' });
  }
});

anonymousFeedbackAdminRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: '意见编号无效' });
  const normalizedPayload = normalizeAnonymousFeedbackUpdatePayload(req.body || {});
  if (!normalizedPayload) {
    if (req.body?.status !== undefined && (typeof req.body.status !== 'string' || !feedbackStatuses.has(req.body.status))) {
      return res.status(400).json({ message: '状态无效' });
    }
    if (req.body?.reply_content !== undefined && (typeof req.body.reply_content !== 'string' || req.body.reply_content.trim().length > 2000)) {
      return res.status(400).json({ message: '回复内容格式不正确' });
    }
    if (req.body?.is_public !== undefined && typeof req.body.is_public !== 'boolean') {
      return res.status(400).json({ message: '公开状态格式不正确' });
    }
    return res.status(400).json({ message: '没有需要更新的字段' });
  }

  const rawRequestId = req.body?.client_request_id;
  const hasRequestId = rawRequestId !== undefined;
  const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
  if (hasRequestId && !UPDATE_REQUEST_ID_PATTERN.test(requestId)) {
    return res.status(400).json({ message: '更新请求编号无效' });
  }

  if (!hasRequestId) {
    if (req.body?.request_fingerprint !== undefined || req.body?.base_fingerprint !== undefined) {
      return res.status(400).json({ message: '更新请求编号缺失' });
    }
    const existing = await queryOne(`SELECT id FROM anonymous_feedback WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ message: '意见不存在' });
    const updates: string[] = [];
    const params: unknown[] = [];
    if (normalizedPayload.status !== undefined) { updates.push('status = ?'); params.push(normalizedPayload.status); }
    if (normalizedPayload.reply_content !== undefined) { updates.push('reply_content = ?'); params.push(normalizedPayload.reply_content); }
    if (normalizedPayload.is_public !== undefined) { updates.push('is_public = ?'); params.push(normalizedPayload.is_public ? 1 : 0); }
    updates.push('updated_at = ?'); params.push(beijingNow(), id);
    await execute(`UPDATE anonymous_feedback SET ${updates.join(', ')} WHERE id = ?`, params);
    return res.json({ success: true });
  }

  const requestFingerprint = typeof req.body?.request_fingerprint === 'string'
    ? req.body.request_fingerprint.trim().toLowerCase()
    : '';
  const baseFingerprint = typeof req.body?.base_fingerprint === 'string'
    ? req.body.base_fingerprint.trim().toLowerCase()
    : '';
  if (!SHA256_PATTERN.test(requestFingerprint) || !SHA256_PATTERN.test(baseFingerprint)
    || anonymousFeedbackUpdateRequestFingerprint(id, baseFingerprint, normalizedPayload) !== requestFingerprint) {
    return res.status(400).json({ message: '更新请求指纹无效' });
  }

  try {
    const actorId = Number(req.user?.id);
    const outcome = await runInTransaction(async (tx) => {
      const stored = await tx.queryOne<{
        actor_id: number | string;
        target_feedback_id: number | string;
        request_fingerprint: string;
      }>(
        `SELECT actor_id,target_feedback_id,request_fingerprint
         FROM anonymous_feedback_update_request_keys WHERE client_request_id=?`,
        [requestId],
      );
      if (stored) {
        const matches = Number(stored.actor_id) === actorId
          && Number(stored.target_feedback_id) === id
          && stored.request_fingerprint === requestFingerprint;
        return { state: matches ? 'processed' as const : 'request_conflict' as const, replayed: matches };
      }

      const existing = await tx.queryOne<AnonymousFeedbackMutationRow>(
        `SELECT id,type,content,need_reply,reply_content,status,is_public,created_at,updated_at
         FROM anonymous_feedback WHERE id=?`,
        [id],
      );
      if (!existing) return { state: 'target_missing' as const, replayed: false };
      if (anonymousFeedbackBaseFingerprint(existing) !== baseFingerprint) {
        return { state: 'base_conflict' as const, replayed: false };
      }

      const updates: string[] = [];
      const params: unknown[] = [];
      if (normalizedPayload.status !== undefined) { updates.push('status = ?'); params.push(normalizedPayload.status); }
      if (normalizedPayload.reply_content !== undefined) { updates.push('reply_content = ?'); params.push(normalizedPayload.reply_content); }
      if (normalizedPayload.is_public !== undefined) { updates.push('is_public = ?'); params.push(normalizedPayload.is_public ? 1 : 0); }
      updates.push('updated_at = ?'); params.push(beijingNow(), id);
      const affected = await tx.execute(`UPDATE anonymous_feedback SET ${updates.join(', ')} WHERE id = ?`, params);
      if (affected !== 1) throw new Error('ANONYMOUS_FEEDBACK_UPDATE_TARGET_MISSING');
      await tx.execute(
        `INSERT INTO anonymous_feedback_update_request_keys(client_request_id,actor_id,target_feedback_id,request_fingerprint,base_fingerprint,created_at)
         VALUES(?,?,?,?,?,?)`,
        [requestId, actorId, id, requestFingerprint, baseFingerprint, beijingNow()],
      );
      return { state: 'processed' as const, replayed: false };
    });

    if (outcome.state === 'target_missing') return res.status(404).json({ message: '意见不存在', code: 'ANONYMOUS_FEEDBACK_UPDATE_TARGET_MISSING' });
    if (outcome.state === 'base_conflict') return res.status(409).json({ message: '意见已被其他操作更新，未应用本次修改。请刷新后核对。', code: 'ANONYMOUS_FEEDBACK_UPDATE_BASE_CONFLICT' });
    if (outcome.state === 'request_conflict') return res.status(409).json({ message: '更新请求编号已用于其他操作者、意见或载荷；结果需要人工核对。', code: 'ANONYMOUS_FEEDBACK_UPDATE_REQUEST_CONFLICT' });
    return res.json({ success: true, idempotent_replay: outcome.replayed });
  } catch {
    return res.status(500).json({ message: '更新意见失败' });
  }
});

anonymousFeedbackAdminRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: '意见编号无效' });
  const rawRequestId = req.body?.client_request_id;
  const hasRequestId = rawRequestId !== undefined;
  const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
  if (hasRequestId && !DELETE_REQUEST_ID_PATTERN.test(requestId)) {
    return res.status(400).json({ message: '删除请求编号无效' });
  }

  try {
    const actorId = Number(req.user?.id);
    const outcome = await runInTransaction(async (tx) => {
      if (hasRequestId) {
        const existingRequest = await tx.queryOne<{ actor_id: number; target_feedback_id: number }>(
          `SELECT actor_id,target_feedback_id FROM anonymous_feedback_delete_request_keys WHERE client_request_id=?`,
          [requestId],
        );
        if (existingRequest) {
          const matches = Number(existingRequest.actor_id) === actorId
            && Number(existingRequest.target_feedback_id) === id;
          return { deleted: matches, replayed: matches, conflict: !matches };
        }
      }

      const existingFeedback = await tx.queryOne<{ id: number }>(`SELECT id FROM anonymous_feedback WHERE id=?`, [id]);
      if (!existingFeedback) return { deleted: false, replayed: false, conflict: false };
      await tx.execute(`DELETE FROM anonymous_feedback_submission_request_keys WHERE target_feedback_id=?`, [id]);
      const affected = await tx.execute(`DELETE FROM anonymous_feedback WHERE id=?`, [id]);
      if (affected !== 1) throw new Error('ANONYMOUS_FEEDBACK_DELETE_TARGET_MISSING');
      if (hasRequestId) {
        await tx.execute(
          `INSERT INTO anonymous_feedback_delete_request_keys(client_request_id,actor_id,target_feedback_id,created_at)
           VALUES(?,?,?,?)`,
          [requestId, actorId, id, beijingNow()],
        );
      }
      return { deleted: true, replayed: false, conflict: false };
    });

    if (outcome.conflict) return res.status(409).json({ message: '删除请求编号已用于其他操作者或意见，请勿更改请求后重复提交。', code: 'ANONYMOUS_FEEDBACK_DELETE_REQUEST_CONFLICT' });
    if (!outcome.deleted) {
      return res.status(404).json({
        message: '意见不存在',
        ...(hasRequestId ? { code: 'ANONYMOUS_FEEDBACK_DELETE_TARGET_MISSING' } : {}),
      });
    }
    return res.json({ success: true, ...(hasRequestId ? { idempotent_replay: outcome.replayed } : {}) });
  } catch {
    return res.status(500).json({ message: '删除意见失败' });
  }
});

export default router;

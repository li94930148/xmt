import express from 'express';
import { createHash } from 'node:crypto';
import { beijingNow, queryOne, queryAll, execute, executeInsert, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { sendSafeServerError } from '../utils/response';

const router = express.Router();
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const mutationOperations = new Set(['create', 'update', 'delete']);

type TopicTemplateRecord = {
  id: number | string;
  name: string;
  platform: string | null;
  description: string | null;
  template_data: string | null;
  creator_id: number | string | null;
  is_default: number | string | boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type TopicTemplateCreatePayload = {
  name: string;
  platform: string;
  description: string;
  template_data: string | null;
  is_default: boolean;
};

type TopicTemplateUpdatePayload = Partial<TopicTemplateCreatePayload>;

const textField = (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

function serializeTemplateData(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return null;
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Stable server baseline shared by list reads and keyed update/delete compare-and-swap. */
export function topicTemplateBaseFingerprint(row: TopicTemplateRecord) {
  return sha256(JSON.stringify([
    Number(row.id),
    row.name,
    row.platform ?? null,
    row.description ?? null,
    row.template_data ?? null,
    row.creator_id === null ? null : Number(row.creator_id),
    Number(row.is_default ?? 0),
    row.created_at ?? null,
    row.updated_at ?? null,
  ]));
}

/** The payload object is normalized before hashing and has a fixed field order. */
export function topicTemplateMutationFingerprint(
  operation: 'create' | 'update' | 'delete',
  targetId: number | null,
  baseFingerprint: string | null,
  payload: TopicTemplateCreatePayload | TopicTemplateUpdatePayload | null,
) {
  if (operation === 'create') return sha256(JSON.stringify(['create', payload]));
  if (operation === 'update') return sha256(JSON.stringify(['update', targetId, baseFingerprint, payload]));
  return sha256(JSON.stringify(['delete', targetId, baseFingerprint]));
}

function normalizeCreatePayload(body: Record<string, unknown>): { payload?: TopicTemplateCreatePayload; error?: string } {
  const name = textField(body.name, 120);
  if (!name) return { error: '模板名称不能为空' };
  const templateData = serializeTemplateData(body.template_data);
  if (templateData === null || (typeof templateData === 'string' && templateData.length > 100_000)) {
    return { error: '模板内容格式不正确或过长' };
  }
  return {
    payload: {
      name,
      platform: textField(body.platform, 50),
      description: textField(body.description, 1000),
      template_data: templateData ?? null,
      is_default: Boolean(body.is_default),
    },
  };
}

function normalizeUpdatePayload(body: Record<string, unknown>): { payload?: TopicTemplateUpdatePayload; error?: string } {
  const payload: TopicTemplateUpdatePayload = {};
  if (body.name !== undefined) {
    const name = textField(body.name, 120);
    if (!name) return { error: '模板名称不能为空' };
    payload.name = name;
  }
  if (body.platform !== undefined) payload.platform = textField(body.platform, 50);
  if (body.description !== undefined) payload.description = textField(body.description, 1000);
  if (body.template_data !== undefined) {
    const templateData = serializeTemplateData(body.template_data);
    if (templateData === null || templateData === undefined || templateData.length > 100_000) {
      return { error: '模板内容格式不正确或过长' };
    }
    payload.template_data = templateData;
  }
  if (body.is_default !== undefined) payload.is_default = Boolean(body.is_default);
  if (Object.keys(payload).length === 0) return { error: '没有需要更新的字段' };
  return { payload };
}

function updateSql(payload: TopicTemplateUpdatePayload) {
  const updates: string[] = [];
  const params: unknown[] = [];
  if (payload.name !== undefined) { updates.push('name = ?'); params.push(payload.name); }
  if (payload.platform !== undefined) { updates.push('platform = ?'); params.push(payload.platform); }
  if (payload.description !== undefined) { updates.push('description = ?'); params.push(payload.description); }
  if (payload.template_data !== undefined) { updates.push('template_data = ?'); params.push(payload.template_data); }
  if (payload.is_default !== undefined) { updates.push('is_default = ?'); params.push(payload.is_default ? 1 : 0); }
  return { updates, params };
}

router.use('/requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/', authenticate, async (_req, res) => {
  try {
    const templates = await queryAll<TopicTemplateRecord & { creator_name: string | null }>(`
      SELECT t.*, u.name as creator_name
      FROM topic_templates t
      LEFT JOIN users u ON t.creator_id = u.id
      ORDER BY t.is_default DESC, t.created_at DESC
    `);

    res.json({ data: templates.map((template) => ({
      ...template,
      base_fingerprint: topicTemplateBaseFingerprint(template),
    })) });
  } catch (error) { sendSafeServerError(res, '获取模板列表失败', 'templates:list', error); }
});

router.get('/requests/:requestId', authenticate, requirePermission('system:template'), async (req, res) => {
  const requestId = String(req.params.requestId || '').trim().toLowerCase();
  const operation = typeof req.query.operation === 'string' ? req.query.operation : '';
  const requestFingerprint = typeof req.query.request_fingerprint === 'string'
    ? req.query.request_fingerprint.trim().toLowerCase()
    : '';
  const rawTargetId = req.query.target_id;
  const targetId = typeof rawTargetId === 'string' && /^\d+$/.test(rawTargetId) ? Number(rawTargetId) : null;
  if (!REQUEST_ID_PATTERN.test(requestId) || !mutationOperations.has(operation)
    || !SHA256_PATTERN.test(requestFingerprint)
    || (operation === 'create' && rawTargetId !== undefined)
    || (operation !== 'create' && (!Number.isSafeInteger(targetId) || Number(targetId) <= 0))) {
    return res.status(400).json({ message: '模板写入核实参数无效' });
  }

  try {
    const receipt = await queryOne<{
      actor_id: number | string;
      operation: string;
      target_template_id: number | string;
      request_fingerprint: string;
    }>(
      `SELECT actor_id,operation,target_template_id,request_fingerprint
       FROM topic_template_mutation_request_keys WHERE client_request_id=?`,
      [requestId],
    );
    if (!receipt) {
      if (operation === 'create') return res.json({ data: { state: 'not_found' } });
      const target = await queryOne<{ id: number }>('SELECT id FROM topic_templates WHERE id=?', [targetId]);
      return res.json({ data: { state: target ? 'not_found' : 'target_missing' } });
    }
    if (Number(receipt.actor_id) !== Number(req.user?.id)) {
      return res.json({ data: { state: 'not_found' } });
    }
    if (receipt.operation !== operation
      || (targetId !== null && Number(receipt.target_template_id) !== targetId)
      || receipt.request_fingerprint !== requestFingerprint) {
      return res.json({ data: { state: 'conflict' } });
    }
    return res.json({
      data: {
        state: 'processed',
        ...(operation === 'create' ? { target_id: Number(receipt.target_template_id) } : {}),
      },
    });
  } catch (error) { sendSafeServerError(res, '核实模板写入结果失败', 'templates:mutation-status', error); }
});

router.post('/', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const normalized = normalizeCreatePayload(req.body || {});
    if (!normalized.payload) return res.status(400).json({ message: normalized.error });
    const payload = normalized.payload;
    const rawRequestId = req.body?.client_request_id;
    const hasRequestId = rawRequestId !== undefined;
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
    if (hasRequestId && !REQUEST_ID_PATTERN.test(requestId)) return res.status(400).json({ message: '模板请求编号无效' });
    if (!hasRequestId) {
      if (req.body?.request_fingerprint !== undefined) return res.status(400).json({ message: '模板请求编号缺失' });
      const templateId = await executeInsert(
        `INSERT INTO topic_templates (name, platform, description, template_data, creator_id, is_default)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [payload.name, payload.platform, payload.description, payload.template_data, req.user?.id, payload.is_default ? 1 : 0],
      );
      return res.json({ message: '模板创建成功', id: templateId });
    }

    const requestFingerprint = typeof req.body?.request_fingerprint === 'string'
      ? req.body.request_fingerprint.trim().toLowerCase()
      : '';
    const expectedFingerprint = topicTemplateMutationFingerprint('create', null, null, payload);
    if (!SHA256_PATTERN.test(requestFingerprint) || requestFingerprint !== expectedFingerprint) {
      return res.status(400).json({ message: '模板请求指纹无效' });
    }

    const result = await runInTransaction(async (tx) => {
      const existing = await tx.queryOne<{
        actor_id: number | string; operation: string; target_template_id: number | string; request_fingerprint: string;
      }>(
        `SELECT actor_id,operation,target_template_id,request_fingerprint
         FROM topic_template_mutation_request_keys WHERE client_request_id=?`,
        [requestId],
      );
      if (existing) {
        const matches = Number(existing.actor_id) === Number(req.user?.id)
          && existing.operation === 'create'
          && existing.request_fingerprint === requestFingerprint;
        return matches
          ? { state: 'processed' as const, id: Number(existing.target_template_id), replayed: true }
          : { state: 'request_conflict' as const };
      }

      const id = await tx.executeInsert(
        `INSERT INTO topic_templates (name, platform, description, template_data, creator_id, is_default)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [payload.name, payload.platform, payload.description, payload.template_data, req.user?.id, payload.is_default ? 1 : 0],
      );
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('TOPIC_TEMPLATE_CREATE_ID_INVALID');
      await tx.execute(
        `INSERT INTO topic_template_mutation_request_keys
         (client_request_id,actor_id,operation,target_template_id,request_fingerprint,base_fingerprint,created_at)
         VALUES(?,?,'create',?,?,NULL,?)`,
        [requestId, Number(req.user?.id), id, requestFingerprint, beijingNow()],
      );
      return { state: 'processed' as const, id, replayed: false };
    });

    if (result.state === 'request_conflict') return res.status(409).json({ message: '模板请求编号已用于其他操作者、操作或载荷。', code: 'TOPIC_TEMPLATE_MUTATION_REQUEST_CONFLICT' });
    return res.json({ message: '模板创建成功', id: result.id, idempotent_replay: result.replayed });
  } catch (error) { sendSafeServerError(res, '创建模板失败', 'templates:create', error); }
});

router.put('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { id: rawId } = req.params;
    const normalized = normalizeUpdatePayload(req.body || {});
    if (!normalized.payload) return res.status(400).json({ message: normalized.error });
    const payload = normalized.payload;
    const rawRequestId = req.body?.client_request_id;
    const hasRequestId = rawRequestId !== undefined;
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
    if (hasRequestId && !REQUEST_ID_PATTERN.test(requestId)) return res.status(400).json({ message: '模板请求编号无效' });

    if (!hasRequestId) {
      if (req.body?.request_fingerprint !== undefined || req.body?.base_fingerprint !== undefined) {
        return res.status(400).json({ message: '模板请求编号缺失' });
      }
      const template = await queryOne(`SELECT * FROM topic_templates WHERE id = ?`, [rawId]);
      if (!template) return res.status(404).json({ message: '模板不存在' });
      const { updates, params } = updateSql(payload);
      updates.push("updated_at = datetime('now', '+8 hours')");
      params.push(rawId);
      await execute(`UPDATE topic_templates SET ${updates.join(', ')} WHERE id = ?`, params);
      return res.json({ message: '模板更新成功' });
    }

    const targetId = Number(rawId);
    const requestFingerprint = typeof req.body?.request_fingerprint === 'string'
      ? req.body.request_fingerprint.trim().toLowerCase()
      : '';
    const baseFingerprint = typeof req.body?.base_fingerprint === 'string'
      ? req.body.base_fingerprint.trim().toLowerCase()
      : '';
    if (!Number.isSafeInteger(targetId) || targetId <= 0 || !SHA256_PATTERN.test(baseFingerprint)
      || !SHA256_PATTERN.test(requestFingerprint)
      || topicTemplateMutationFingerprint('update', targetId, baseFingerprint, payload) !== requestFingerprint) {
      return res.status(400).json({ message: '模板请求指纹无效' });
    }

    const result = await runInTransaction(async (tx) => {
      const existingRequest = await tx.queryOne<{
        actor_id: number | string; operation: string; target_template_id: number | string; request_fingerprint: string;
      }>(
        `SELECT actor_id,operation,target_template_id,request_fingerprint
         FROM topic_template_mutation_request_keys WHERE client_request_id=?`,
        [requestId],
      );
      if (existingRequest) {
        const matches = Number(existingRequest.actor_id) === Number(req.user?.id)
          && existingRequest.operation === 'update'
          && Number(existingRequest.target_template_id) === targetId
          && existingRequest.request_fingerprint === requestFingerprint;
        return matches ? { state: 'processed' as const, replayed: true } : { state: 'request_conflict' as const };
      }

      const template = await tx.queryOne<TopicTemplateRecord>('SELECT * FROM topic_templates WHERE id=?', [targetId]);
      if (!template) return { state: 'target_missing' as const };
      if (topicTemplateBaseFingerprint(template) !== baseFingerprint) return { state: 'base_conflict' as const };

      const { updates, params } = updateSql(payload);
      updates.push('updated_at = ?');
      params.push(beijingNow(), targetId);
      const affected = await tx.execute(`UPDATE topic_templates SET ${updates.join(', ')} WHERE id=?`, params);
      if (affected !== 1) throw new Error('TOPIC_TEMPLATE_UPDATE_TARGET_MISSING');
      await tx.execute(
        `INSERT INTO topic_template_mutation_request_keys
         (client_request_id,actor_id,operation,target_template_id,request_fingerprint,base_fingerprint,created_at)
         VALUES(?,?,'update',?,?,?,?)`,
        [requestId, Number(req.user?.id), targetId, requestFingerprint, baseFingerprint, beijingNow()],
      );
      return { state: 'processed' as const, replayed: false };
    });

    if (result.state === 'target_missing') return res.status(404).json({ message: '模板不存在', code: 'TOPIC_TEMPLATE_MUTATION_TARGET_MISSING' });
    if (result.state === 'base_conflict') return res.status(409).json({ message: '模板已被其他操作更新，未应用本次修改。请刷新后核对。', code: 'TOPIC_TEMPLATE_UPDATE_BASE_CONFLICT' });
    if (result.state === 'request_conflict') return res.status(409).json({ message: '模板请求编号已用于其他操作者、操作、目标或载荷。', code: 'TOPIC_TEMPLATE_MUTATION_REQUEST_CONFLICT' });
    return res.json({ message: '模板更新成功', idempotent_replay: result.replayed });
  } catch (error) { sendSafeServerError(res, '更新模板失败', 'templates:update', error); }
});

router.delete('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { id: rawId } = req.params;
    const rawRequestId = req.body?.client_request_id;
    const hasRequestId = rawRequestId !== undefined;
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
    if (hasRequestId && !REQUEST_ID_PATTERN.test(requestId)) return res.status(400).json({ message: '模板请求编号无效' });

    if (!hasRequestId) {
      if (req.body?.request_fingerprint !== undefined || req.body?.base_fingerprint !== undefined) {
        return res.status(400).json({ message: '模板请求编号缺失' });
      }
      const template = await queryOne(`SELECT * FROM topic_templates WHERE id = ?`, [rawId]);
      if (!template) return res.status(404).json({ message: '模板不存在' });
      await execute(`DELETE FROM topic_templates WHERE id = ?`, [rawId]);
      return res.json({ message: '模板删除成功' });
    }

    const targetId = Number(rawId);
    const requestFingerprint = typeof req.body?.request_fingerprint === 'string'
      ? req.body.request_fingerprint.trim().toLowerCase()
      : '';
    const baseFingerprint = typeof req.body?.base_fingerprint === 'string'
      ? req.body.base_fingerprint.trim().toLowerCase()
      : '';
    if (!Number.isSafeInteger(targetId) || targetId <= 0 || !SHA256_PATTERN.test(baseFingerprint)
      || !SHA256_PATTERN.test(requestFingerprint)
      || topicTemplateMutationFingerprint('delete', targetId, baseFingerprint, null) !== requestFingerprint) {
      return res.status(400).json({ message: '模板请求指纹无效' });
    }

    const result = await runInTransaction(async (tx) => {
      const existingRequest = await tx.queryOne<{
        actor_id: number | string; operation: string; target_template_id: number | string; request_fingerprint: string;
      }>(
        `SELECT actor_id,operation,target_template_id,request_fingerprint
         FROM topic_template_mutation_request_keys WHERE client_request_id=?`,
        [requestId],
      );
      if (existingRequest) {
        const matches = Number(existingRequest.actor_id) === Number(req.user?.id)
          && existingRequest.operation === 'delete'
          && Number(existingRequest.target_template_id) === targetId
          && existingRequest.request_fingerprint === requestFingerprint;
        return matches ? { state: 'processed' as const, replayed: true } : { state: 'request_conflict' as const };
      }

      const template = await tx.queryOne<TopicTemplateRecord>('SELECT * FROM topic_templates WHERE id=?', [targetId]);
      if (!template) return { state: 'target_missing' as const };
      if (topicTemplateBaseFingerprint(template) !== baseFingerprint) return { state: 'base_conflict' as const };

      const affected = await tx.execute('DELETE FROM topic_templates WHERE id=?', [targetId]);
      if (affected !== 1) throw new Error('TOPIC_TEMPLATE_DELETE_TARGET_MISSING');
      await tx.execute(
        `INSERT INTO topic_template_mutation_request_keys
         (client_request_id,actor_id,operation,target_template_id,request_fingerprint,base_fingerprint,created_at)
         VALUES(?,?,'delete',?,?,?,?)`,
        [requestId, Number(req.user?.id), targetId, requestFingerprint, baseFingerprint, beijingNow()],
      );
      return { state: 'processed' as const, replayed: false };
    });

    if (result.state === 'target_missing') return res.status(404).json({ message: '模板不存在', code: 'TOPIC_TEMPLATE_MUTATION_TARGET_MISSING' });
    if (result.state === 'base_conflict') return res.status(409).json({ message: '模板已被其他操作更新，未删除。请刷新后核对。', code: 'TOPIC_TEMPLATE_DELETE_BASE_CONFLICT' });
    if (result.state === 'request_conflict') return res.status(409).json({ message: '模板请求编号已用于其他操作者、操作、目标或载荷。', code: 'TOPIC_TEMPLATE_MUTATION_REQUEST_CONFLICT' });
    return res.json({ message: '模板删除成功', idempotent_replay: result.replayed });
  } catch (error) { sendSafeServerError(res, '删除模板失败', 'templates:delete', error); }
});

export default router;

import express from 'express';
import { createHmac } from 'node:crypto';
import { beijingNow, queryOne, queryAll, execute, executeInsert, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = express.Router();
const CREATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createRequestFingerprint(payload: { content: string; type: string; pinned: boolean }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_MISSING');
  return createHmac('sha256', secret)
    .update(JSON.stringify([payload.content, payload.type, payload.pinned]))
    .digest('hex');
}

// GET / - 获取公告列表（pinned 排前面）
router.get('/', authenticate, async (req, res) => {
  try {
    const announcements = await queryAll(`
      SELECT a.*, u.name as creator_name
      FROM announcements a
      LEFT JOIN users u ON a.creator_id = u.id
      ORDER BY a.pinned DESC, a.created_at DESC
    `);

    res.json({ data: announcements });
  } catch {
    res.status(500).json({ message: '获取公告列表失败' });
  }
});

// Read-only recovery endpoint. Permission matches the create route so a revoked
// permission cannot be used to inspect a prior request result.
router.get('/create-request/:requestId', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, authenticate, requirePermission('system:announcement'), async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!CREATE_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '公告请求编号无效' });
    }

    const request = await queryOne<{ actor_id: number; announcement_id: number }>(
      `SELECT actor_id, announcement_id FROM announcement_create_request_keys WHERE client_request_id = ?`,
      [requestId],
    );
    if (!request) return res.json({ state: 'not_found' });
    if (Number(request.actor_id) !== Number(req.user?.id)) return res.json({ state: 'conflict' });

    const announcement = await queryOne<{ id: number }>(
      'SELECT id FROM announcements WHERE id = ?',
      [request.announcement_id],
    );
    if (!announcement) return res.json({ state: 'deleted' });
    return res.json({ state: 'committed', announcementId: Number(announcement.id) });
  } catch {
    return res.status(500).json({ message: '核实公告创建状态失败' });
  }
});

// POST / - 创建公告
router.post('/', authenticate, requirePermission('system:announcement'), async (req, res) => {
  try {
    const { content, type, pinned } = req.body;
    const userId = req.user?.id;
    const rawRequestId = req.body?.client_request_id;
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';

    if (rawRequestId !== undefined && rawRequestId !== null && !CREATE_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '公告请求编号无效' });
    }

    if (!content) {
      return res.status(400).json({ message: '公告内容不能为空' });
    }

    if (requestId) {
      if (typeof content !== 'string' || !content.trim() || (type !== undefined && typeof type !== 'string') || (pinned !== undefined && typeof pinned !== 'boolean')) {
        return res.status(400).json({ message: '公告内容格式无效' });
      }
      const normalizedPayload = {
        content,
        type: type || 'note',
        pinned: Boolean(pinned),
      };
      const requestFingerprint = createRequestFingerprint(normalizedPayload);
      const creation = await runInTransaction(async (tx) => {
        const existing = await tx.queryOne<{
          actor_id: number;
          announcement_id: number;
          request_fingerprint: string;
        }>(
          `SELECT actor_id, announcement_id, request_fingerprint
           FROM announcement_create_request_keys WHERE client_request_id = ?`,
          [requestId],
        );
        if (existing) {
          if (Number(existing.actor_id) !== Number(userId) || existing.request_fingerprint !== requestFingerprint) {
            return { conflict: true as const };
          }
          const announcement = await tx.queryOne<{ id: number }>(
            'SELECT id FROM announcements WHERE id = ?',
            [existing.announcement_id],
          );
          return announcement
            ? { ok: true as const, id: Number(announcement.id), replayed: true }
            : { deleted: true as const };
        }

        const now = beijingNow();
        const announcementId = await tx.executeInsert(
          `INSERT INTO announcements (content, type, pinned, creator_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [normalizedPayload.content, normalizedPayload.type, normalizedPayload.pinned ? 1 : 0, userId, now, now],
        );
        await tx.execute(
          `INSERT INTO announcement_create_request_keys
            (client_request_id, actor_id, announcement_id, request_fingerprint, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [requestId, Number(userId), announcementId, requestFingerprint, now],
        );
        return { ok: true as const, id: announcementId, replayed: false };
      });

      if ('conflict' in creation) {
        return res.status(409).json({ message: '公告请求编号已用于其他内容，请先核实原请求状态。', code: 'ANNOUNCEMENT_CREATE_REQUEST_CONFLICT' });
      }
      if ('deleted' in creation) {
        return res.status(410).json({ message: '该请求对应的公告已删除，不会因为重试而重新创建。', deleted: true });
      }
      return res.status(creation.replayed ? 200 : 201).json({
        message: '公告创建成功',
        id: creation.id,
        idempotent_replay: creation.replayed,
      });
    }

    const announcementId = await executeInsert(
      `INSERT INTO announcements (content, type, pinned, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [content, type || 'note', pinned ? 1 : 0, userId, beijingNow(), beijingNow()]
    );

    res.json({ message: '公告创建成功', id: announcementId });
  } catch {
    res.status(500).json({ message: '创建公告失败' });
  }
});

// PUT /:id - 更新公告
router.put('/:id', authenticate, requirePermission('system:announcement'), async (req, res) => {
  try {
    const { id } = req.params;
    const { content, type, pinned } = req.body;

    const announcement = await queryOne(`SELECT * FROM announcements WHERE id = ?`, [id]);
    if (!announcement) {
      return res.status(404).json({ message: '公告不存在' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (content) { updates.push('content = ?'); params.push(content); }
    if (type) { updates.push('type = ?'); params.push(type); }
    if (pinned !== undefined) { updates.push('pinned = ?'); params.push(pinned ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now', '+8 hours')");
    params.push(id);

    await execute(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: '公告更新成功' });
  } catch {
    res.status(500).json({ message: '更新公告失败' });
  }
});

// DELETE /:id - 删除公告
router.delete('/:id', authenticate, requirePermission('system:announcement'), async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await queryOne(`SELECT * FROM announcements WHERE id = ?`, [id]);
    if (!announcement) {
      return res.status(404).json({ message: '公告不存在' });
    }

    await execute(`DELETE FROM announcements WHERE id = ?`, [id]);

    res.json({ message: '公告删除成功' });
  } catch {
    res.status(500).json({ message: '删除公告失败' });
  }
});

export default router;

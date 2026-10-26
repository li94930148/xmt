﻿import express from 'express';
import bcrypt from 'bcrypt';
import { createHmac } from 'node:crypto';
import { queryOne, queryAll, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { clearPermissionCache, requirePermission } from '../middleware/permissions';
import { assertAssignableRole, getAssignableRoles } from '../services/role-assignment.service.js';
import { disconnectUserSockets } from '../utils/socket.js';
import { activityLogCutoffTimestamp, activityLogTimestamp, serializeActivityLog } from '../services/activity-log.js';

const router = express.Router();

const MAX_LIST_LIMIT = 200;
const USER_MUTATION_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userCreateRequestFingerprint(body: Record<string, unknown>) {
  const canonicalPayload = [
    body.username ?? null,
    body.password ?? null,
    body.email ?? null,
    body.role ?? 'member',
    body.name ?? null,
  ];
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_MISSING');
  return createHmac('sha256', secret)
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');
}

function userUpdateRequestFingerprint(targetUserId: number, body: Record<string, unknown>) {
  const fields = ['password', 'email', 'role', 'name', 'enabled'];
  const canonicalPayload = fields.map((field) => [
    field,
    Object.prototype.hasOwnProperty.call(body, field),
    body[field] ?? null,
  ]);
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_MISSING');
  return createHmac('sha256', secret)
    .update(JSON.stringify([targetUserId, canonicalPayload]))
    .digest('hex');
}

function userDeleteRequestFingerprint(targetUserId: number) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_MISSING');
  return createHmac('sha256', secret)
    .update(JSON.stringify(['delete-user', targetUserId]))
    .digest('hex');
}

export function parseUsersPagination(
  pageValue: unknown,
  limitValue: unknown,
  defaultLimit: number,
) {
  const parsedPage = Number(pageValue);
  const parsedLimit = Number(limitValue);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, MAX_LIST_LIMIT)
    : defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
}

async function getRoleByCode(roleCode: string) {
  return queryOne<{ id: number; code: string; name: string }>(`SELECT id, code, name FROM roles WHERE code = ?`, [roleCode]);
}

// 固定路由必须放在 /:id 之前，否则 Express 会把 assignable-roles 当成用户 id。
router.get('/assignable-roles', authenticate, requirePermission('user:create', 'user:update'), async (req, res) => {
  try {
    const roles = await getAssignableRoles({ id: req.user!.id, role: req.user!.role });
    res.json(roles);
  } catch {
    res.status(500).json({ message: '获取可分配角色失败' });
  }
});

router.get('/', authenticate, requirePermission('user:view'), async (req, res) => {
  try {
    const pagination = parseUsersPagination(req.query.page, req.query.limit, MAX_LIST_LIMIT);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const whereClause = search
      ? `WHERE INSTR(LOWER(username), LOWER(?)) > 0
          OR INSTR(LOWER(COALESCE(name, '')), LOWER(?)) > 0
          OR INSTR(LOWER(COALESCE(email, '')), LOWER(?)) > 0`
      : '';
    const searchParams = search ? [search, search, search] : [];

    const users = await queryAll(
      `SELECT id, username, name, email, role, enabled, created_at, updated_at
       FROM users ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...searchParams, pagination.limit, pagination.offset],
    );

    const countResult = await queryOne(`SELECT COUNT(*) as total FROM users ${whereClause}`, searchParams);
    
    res.json({
      data: users,
      total: countResult?.total || 0,
      page: pagination.page,
      limit: pagination.limit
    });
  } catch {
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

// 注意：这些固定路由必须放在?/:id 之前，否则?Express 会把 logs/activity-logs 当成 id
router.get('/logs', authenticate, requirePermission('user:logs'), async (req, res) => {
  try {
    const pagination = parseUsersPagination(req.query.page, req.query.limit, 20);
    const cutoff = activityLogCutoffTimestamp();
    
    const logs = await queryAll<{ created_at: unknown }>(`SELECT al.*, u.name as user_name FROM activity_log al
                        LEFT JOIN users u ON al.user_id = u.id 
                        WHERE al.created_at >= ?
                        ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [cutoff, pagination.limit, pagination.offset]);
    
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM activity_log WHERE created_at >= ?`, [cutoff]);
    
    res.json({
      data: logs.map(serializeActivityLog),
      total: countResult?.total || 0,
      page: pagination.page,
      limit: pagination.limit
    });
  } catch {
    res.status(500).json({ message: '获取操作日志失败' });
  }
});

router.get('/activity-logs', authenticate, requirePermission('user:logs'), async (req, res) => {
  try {
    const { user_id } = req.query;
    const pagination = parseUsersPagination(req.query.page, req.query.limit, 20);
    const cutoff = activityLogCutoffTimestamp();

    let whereClause = 'WHERE al.created_at >= ?';
    const params: unknown[] = [cutoff];

    if (user_id) {
      whereClause += ' AND al.user_id = ?';
      params.push(parseInt(user_id as string));
    }

    const logs = await queryAll<{ created_at: unknown }>(
      `SELECT al.*, u.name as user_name FROM activity_log al 
       LEFT JOIN users u ON al.user_id = u.id 
       ${whereClause}
       ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset]
    );

    const countResult = await queryOne(
      `SELECT COUNT(*) as total FROM activity_log al ${whereClause}`,
      params
    );

    res.json({
      data: logs.map(serializeActivityLog),
      total: countResult?.total || 0,
      page: pagination.page,
      limit: pagination.limit
    });
  } catch {
    res.status(500).json({ message: '获取活动日志失败' });
  }
});

router.get('/create-requests/:requestId', authenticate, async (req, res) => {
  try {
    const requestId = typeof req.params.requestId === 'string' ? req.params.requestId.trim().toLowerCase() : '';
    if (!USER_MUTATION_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '用户创建请求编号无效' });
    }

    const request = await queryOne<{ target_user_id: number }>(
      `SELECT target_user_id FROM user_create_request_keys WHERE client_request_id=? AND actor_id=?`,
      [requestId, Number(req.user?.id)],
    );
    if (!request) return res.json({ state: 'not_found' });
    return res.json({ state: 'created', userId: Number(request.target_user_id) });
  } catch {
    return res.status(500).json({ message: '核实用户创建结果失败' });
  }
});

router.get('/update-requests/:requestId/:targetUserId', authenticate, async (req, res) => {
  try {
    const requestId = typeof req.params.requestId === 'string' ? req.params.requestId.trim().toLowerCase() : '';
    const targetUserId = Number(req.params.targetUserId);
    if (!USER_MUTATION_REQUEST_ID_PATTERN.test(requestId)
      || !Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ message: '用户更新请求编号无效' });
    }

    const request = await queryOne<{ client_request_id: string }>(
      `SELECT client_request_id FROM user_update_request_keys
       WHERE client_request_id=? AND actor_id=? AND target_user_id=?`,
      [requestId, Number(req.user?.id), targetUserId],
    );
    return res.json({ state: request ? 'updated' : 'not_found' });
  } catch {
    return res.status(500).json({ message: '核实用户更新结果失败' });
  }
});

router.get('/delete-requests/:requestId/:targetUserId', authenticate, async (req, res) => {
  try {
    const requestId = typeof req.params.requestId === 'string' ? req.params.requestId.trim().toLowerCase() : '';
    const targetUserId = Number(req.params.targetUserId);
    if (!USER_MUTATION_REQUEST_ID_PATTERN.test(requestId)
      || !Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ message: '用户删除请求编号无效' });
    }

    const request = await queryOne<{ client_request_id: string }>(
      `SELECT client_request_id FROM user_delete_request_keys
       WHERE client_request_id=? AND actor_id=? AND target_user_id=?`,
      [requestId, Number(req.user?.id), targetUserId],
    );
    return res.json({ state: request ? 'deleted' : 'not_found' });
  } catch {
    return res.status(500).json({ message: '核实用户删除结果失败' });
  }
});

router.get('/:id', authenticate, requirePermission('user:view'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await queryOne(`SELECT id, username, name, email, role, enabled, created_at, updated_at 
                         FROM users WHERE id = ?`, [id]);
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    res.json(user);
  } catch {
    res.status(500).json({ message: '获取用户详情失败' });
  }
});

router.post('/', authenticate, requirePermission('user:create'), async (req, res) => {
  try {
    const { username, password, email, role = 'member', name } = req.body;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (rawClientRequestId !== undefined && rawClientRequestId !== null
      && !USER_MUTATION_REQUEST_ID_PATTERN.test(clientRequestId)) {
      return res.status(400).json({ message: '用户创建请求编号无效' });
    }
    
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    const actorId = Number(req.user?.id);
    const requestFingerprint = clientRequestId
      ? userCreateRequestFingerprint(req.body as Record<string, unknown>)
      : '';
    if (clientRequestId) {
      const existingRequest = await queryOne<{
        actor_id: number;
        target_user_id: number;
        request_fingerprint: string;
      }>(
        `SELECT actor_id,target_user_id,request_fingerprint FROM user_create_request_keys WHERE client_request_id=?`,
        [clientRequestId],
      );
      if (existingRequest) {
        if (Number(existingRequest.actor_id) !== actorId || existingRequest.request_fingerprint !== requestFingerprint) {
          return res.status(409).json({ message: '创建请求编号已用于其他内容，请勿更改请求后重复提交。', code: 'USER_CREATE_REQUEST_CONFLICT' });
        }
        return res.json({ message: '用户创建成功', userId: Number(existingRequest.target_user_id), idempotent_replay: true });
      }
    }
    
    const exists = await queryOne(`SELECT COUNT(*) as count FROM users WHERE username = ?`, [username]);
    if (Number(exists?.count) > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    const targetRole = await getRoleByCode(role);
    if (!targetRole) {
      return res.status(400).json({ message: '所选角色不存在' });
    }
    try {
      await assertAssignableRole({ id: req.user!.id, role: req.user!.role }, targetRole);
    } catch (error) {
      if ((error as Error).name === 'RoleAssignmentForbiddenError') return res.status(403).json({ message: '无权授予该角色' });
      throw error;
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const outcome = await runInTransaction(async (tx) => {
      if (clientRequestId) {
        const existingRequest = await tx.queryOne<{
          actor_id: number;
          target_user_id: number;
          request_fingerprint: string;
        }>(
          `SELECT actor_id,target_user_id,request_fingerprint FROM user_create_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existingRequest) {
          const matches = Number(existingRequest.actor_id) === actorId
            && existingRequest.request_fingerprint === requestFingerprint;
          return {
            userId: Number(existingRequest.target_user_id),
            replayed: matches,
            conflict: !matches,
          };
        }
      }

      const createdUserId = await tx.executeInsert(`INSERT INTO users (username, password, email, role, name, enabled) 
            VALUES (?, ?, ?, ?, ?, ?)`, [username, hashedPassword, email, role, name, 1]);

      await tx.execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [createdUserId, targetRole.id]);
      await tx.execute(`INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)`, [
        req.user?.id, 'create', 'user', `创建用户: ${username}`, activityLogTimestamp()
      ]);
      if (clientRequestId) {
        await tx.execute(
          `INSERT INTO user_create_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, actorId, createdUserId, requestFingerprint, activityLogTimestamp()],
        );
      }
      return { userId: createdUserId, replayed: false, conflict: false };
    });

    if (outcome.conflict) {
      return res.status(409).json({ message: '创建请求编号已用于其他内容，请勿更改请求后重复提交。', code: 'USER_CREATE_REQUEST_CONFLICT' });
    }
    
    res.json({ message: '用户创建成功', userId: outcome.userId, ...(clientRequestId ? { idempotent_replay: outcome.replayed } : {}) });
  } catch {
    res.status(500).json({ message: '创建用户失败' });
  }
});

router.put('/:id', authenticate, requirePermission('user:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password, email, role, name, enabled } = req.body;
    const enabledProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'enabled');
    if (enabledProvided && typeof enabled !== 'boolean') {
      return res.status(400).json({ message: '启用状态必须为布尔值' });
    }
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    const targetUserId = Number(id);
    if (rawClientRequestId !== undefined && rawClientRequestId !== null
      && (!USER_MUTATION_REQUEST_ID_PATTERN.test(clientRequestId) || !Number.isSafeInteger(targetUserId) || targetUserId <= 0)) {
      return res.status(400).json({ message: '用户更新请求编号无效' });
    }
    const requestFingerprint = clientRequestId ? userUpdateRequestFingerprint(targetUserId, req.body as Record<string, unknown>) : '';
    const actorId = Number(req.user?.id);
    const identityChanged = Boolean(password || role) || enabled === false;
    const invalidateReplayedIdentity = () => {
      if (!identityChanged) return;
      clearPermissionCache(targetUserId);
      disconnectUserSockets(targetUserId);
    };

    if (clientRequestId) {
      const existingRequest = await queryOne<{
        actor_id: number;
        target_user_id: number;
        request_fingerprint: string;
      }>(
        `SELECT actor_id,target_user_id,request_fingerprint FROM user_update_request_keys WHERE client_request_id=?`,
        [clientRequestId],
      );
      if (existingRequest) {
        if (Number(existingRequest.actor_id) !== actorId
          || Number(existingRequest.target_user_id) !== targetUserId
          || existingRequest.request_fingerprint !== requestFingerprint) {
          return res.status(409).json({ message: '更新请求编号已用于其他内容，请勿更改请求后重复提交。', code: 'USER_UPDATE_REQUEST_CONFLICT' });
        }
        invalidateReplayedIdentity();
        return res.json({ message: '用户更新成功', idempotent_replay: true });
      }
    }

    if (targetUserId === actorId && enabled === false) {
      return res.status(400).json({ message: '不能禁用当前登录账号' });
    }
    
    const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    let targetRole: Awaited<ReturnType<typeof getRoleByCode>> | null = null;
    if (role) {
      targetRole = await getRoleByCode(role);
      if (!targetRole) {
        return res.status(400).json({ message: '所选角色不存在' });
      }
      try {
        await assertAssignableRole({ id: req.user!.id, role: req.user!.role }, targetRole);
      } catch (error) {
        if ((error as Error).name === 'RoleAssignmentForbiddenError') return res.status(403).json({ message: '无权授予该角色' });
        throw error;
      }
    }
    
    const updates: string[] = [];
    const params: unknown[] = [];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    if (identityChanged) updates.push('auth_version = auth_version + 1');
    
    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }
    
    updates.push("updated_at = datetime('now', '+8 hours')");
    params.push(id);
    
    const outcome = await runInTransaction(async (tx) => {
      if (clientRequestId) {
        const existingRequest = await tx.queryOne<{
          actor_id: number;
          target_user_id: number;
          request_fingerprint: string;
        }>(
          `SELECT actor_id,target_user_id,request_fingerprint FROM user_update_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existingRequest) {
          return {
            replayed: Number(existingRequest.actor_id) === actorId
              && Number(existingRequest.target_user_id) === targetUserId
              && existingRequest.request_fingerprint === requestFingerprint,
            conflict: Number(existingRequest.actor_id) !== actorId
              || Number(existingRequest.target_user_id) !== targetUserId
              || existingRequest.request_fingerprint !== requestFingerprint,
          };
        }
      }

      const updated = await tx.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      if (!updated) throw new Error('USER_UPDATE_TARGET_MISSING');

      if (role && targetRole) {
        await tx.execute(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
        await tx.execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [id, targetRole.id]);
      }

      if (enabled !== undefined && !enabled) {
        await tx.execute(
          `UPDATE auth_sessions SET revoked_at = ?, revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL`,
          [activityLogTimestamp(), 'user_disabled', id],
        );
      }

      await tx.execute(`INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)`, [
        req.user?.id, 'update', 'user', `更新用户: ${user.username}`, activityLogTimestamp()
      ]);

      if (clientRequestId) {
        await tx.execute(
          `INSERT INTO user_update_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, actorId, targetUserId, requestFingerprint, activityLogTimestamp()],
        );
      }
      return { replayed: false, conflict: false };
    });

    if (outcome.conflict) {
      return res.status(409).json({ message: '更新请求编号已用于其他内容，请勿更改请求后重复提交。', code: 'USER_UPDATE_REQUEST_CONFLICT' });
    }
    if (outcome.replayed) {
      invalidateReplayedIdentity();
      return res.json({ message: '用户更新成功', idempotent_replay: true });
    }

    invalidateReplayedIdentity();
    
    res.json({ message: '用户更新成功', ...(clientRequestId ? { idempotent_replay: false } : {}) });
  } catch {
    res.status(500).json({ message: '更新用户失败' });
  }
});

router.delete('/:id', authenticate, requirePermission('user:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const targetUserId = Number(id);
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (rawClientRequestId !== undefined && rawClientRequestId !== null
      && (!USER_MUTATION_REQUEST_ID_PATTERN.test(clientRequestId)
        || !Number.isSafeInteger(targetUserId) || targetUserId <= 0)) {
      return res.status(400).json({ message: '用户删除请求编号无效' });
    }

    if (targetUserId === Number(req.user?.id)) {
      return res.status(400).json({ message: '不能删除自己的账号' });
    }

    const actorId = Number(req.user?.id);
    const requestFingerprint = clientRequestId ? userDeleteRequestFingerprint(targetUserId) : '';
    if (clientRequestId) {
      const existingRequest = await queryOne<{
        actor_id: number;
        target_user_id: number;
        request_fingerprint: string;
      }>(
        `SELECT actor_id,target_user_id,request_fingerprint FROM user_delete_request_keys WHERE client_request_id=?`,
        [clientRequestId],
      );
      if (existingRequest) {
        if (Number(existingRequest.actor_id) !== actorId
          || Number(existingRequest.target_user_id) !== targetUserId
          || existingRequest.request_fingerprint !== requestFingerprint) {
          return res.status(409).json({ message: '删除请求编号已用于其他内容，请勿更改请求后重复提交。', code: 'USER_DELETE_REQUEST_CONFLICT' });
        }
        clearPermissionCache(targetUserId);
        disconnectUserSockets(targetUserId);
        return res.json({ message: '用户删除成功', idempotent_replay: true });
      }
    }

    const outcome = await runInTransaction(async (tx) => {
      if (clientRequestId) {
        const existingRequest = await tx.queryOne<{
          actor_id: number;
          target_user_id: number;
          request_fingerprint: string;
        }>(
          `SELECT actor_id,target_user_id,request_fingerprint FROM user_delete_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existingRequest) {
          const matches = Number(existingRequest.actor_id) === actorId
            && Number(existingRequest.target_user_id) === targetUserId
            && existingRequest.request_fingerprint === requestFingerprint;
          return { deleted: matches, replayed: matches, conflict: !matches, username: '' };
        }
      }

      const user = await tx.queryOne<{ username: string }>('SELECT username FROM users WHERE id=?', [targetUserId]);
      if (!user) return { deleted: false, replayed: false, conflict: false, username: '' };

      await tx.execute(`DELETE FROM user_roles WHERE user_id = ?`, [targetUserId]);
      const deleted = await tx.execute(`DELETE FROM users WHERE id = ?`, [targetUserId]);
      if (!deleted) throw new Error('USER_DELETE_TARGET_MISSING');
      await tx.execute(`INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)`, [
        actorId, 'delete', 'user', `删除用户: ${user.username}`, activityLogTimestamp()
      ]);
      if (clientRequestId) {
        await tx.execute(
          `INSERT INTO user_delete_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, actorId, targetUserId, requestFingerprint, activityLogTimestamp()],
        );
      }
      return { deleted: true, replayed: false, conflict: false, username: user.username };
    });

    if (outcome.conflict) {
      return res.status(409).json({ message: '删除请求编号已用于其他内容，请勿更改请求后重复提交。', code: 'USER_DELETE_REQUEST_CONFLICT' });
    }
    if (!outcome.deleted) return res.status(404).json({ message: '用户不存在' });
    if (outcome.replayed) {
      clearPermissionCache(targetUserId);
      disconnectUserSockets(targetUserId);
      return res.json({ message: '用户删除成功', idempotent_replay: true });
    }

    clearPermissionCache(targetUserId);
    disconnectUserSockets(targetUserId);
    
    res.json({ message: '用户删除成功', ...(clientRequestId ? { idempotent_replay: false } : {}) });
  } catch {
    res.status(500).json({ message: '删除用户失败' });
  }
});

export default router;

﻿import express from 'express';
import bcrypt from 'bcrypt';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { User } from '../types';

const router = express.Router();

async function getRoleByCode(roleCode: string) {
  return queryOne(`SELECT id, code, name FROM roles WHERE code = ?`, [roleCode]);
}

async function syncUserPrimaryRole(userId: number, roleCode: string) {
  const role = await getRoleByCode(roleCode);
  if (!role) {
    return false;
  }

  await execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);
  await execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [userId, role.id]);
  await execute(`UPDATE users SET role = ? WHERE id = ?`, [roleCode, userId]);
  return true;
}

router.get('/', authenticate, requirePermission('user:view'), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const users = await queryAll(`SELECT id, username, name, email, role, enabled, created_at, updated_at 
                         FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string)]);
    
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM users`);
    
    res.json({
      data: users,
      total: countResult?.total || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });
  } catch (error) {
    res.status(500).json({ message: '获取用户列表失败', error });
  }
});

// 注意：这些固定路由必须放在?/:id 之前，否则?Express 会把 logs/activity-logs 当成 id
router.get('/logs', authenticate, requirePermission('user:logs'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const logs = await queryAll(`SELECT al.*, u.name as user_name FROM activity_log al 
                        LEFT JOIN users u ON al.user_id = u.id 
                        ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string)]);
    
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM activity_log`);
    
    res.json({
      data: logs,
      total: countResult?.total || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });
  } catch (error) {
    res.status(500).json({ message: '获取操作日志失败', error });
  }
});

router.get('/activity-logs', authenticate, requirePermission('user:logs'), async (req, res) => {
  try {
    const { page = 1, limit = 20, user_id } = req.query;
    const limitNum = parseInt(limit as string);
    const pageNum = parseInt(page as string);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = '';
    const params: any[] = [];

    if (user_id) {
      whereClause = 'WHERE al.user_id = ';
      params.push(parseInt(user_id as string));
    }

    const logs = await queryAll(
      `SELECT al.*, u.name as user_name FROM activity_log al 
       LEFT JOIN users u ON al.user_id = u.id 
       ${whereClause}
       ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const countResult = await queryOne(
      `SELECT COUNT(*) as total FROM activity_log al ${whereClause}`,
      params
    );

    res.json({
      data: logs,
      total: countResult?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: '获取活动日志失败', error });
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
  } catch (error) {
    res.status(500).json({ message: '获取用户详情失败', error });
  }
});

router.post('/', authenticate, requirePermission('user:create'), async (req, res) => {
  try {
    const { username, password, email, role = 'member', name } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    
    const exists = await queryOne(`SELECT COUNT(*) as count FROM users WHERE username = ?`, [username]);
    if (Number(exists?.count) > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    const targetRole = await getRoleByCode(role);
    if (!targetRole) {
      return res.status(400).json({ message: '所选角色不存在' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userId = await executeInsert(`INSERT INTO users (username, password, email, role, name, enabled) 
            VALUES (?, ?, ?, ?, ?, ?)`, [username, hashedPassword, email, role, name, 1]);

    await execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [userId, targetRole.id]);
    
    await execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
      req.user?.id, 'create', 'user', `创建用户: ${username}`
    ]);
    
    res.json({ message: '用户创建成功', userId });
  } catch (error) {
    res.status(500).json({ message: '创建用户失败', error });
  }
});

router.put('/:id', authenticate, requirePermission('user:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password, email, role, name, enabled } = req.body;
    
    const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    if (role) {
      const targetRole = await getRoleByCode(role);
      if (!targetRole) {
        return res.status(400).json({ message: '所选角色不存在' });
      }
    }
    
    const updates: string[] = [];
    const params: any[] = [];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    
    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }
    
    updates.push("updated_at = datetime('now', '+8 hours')");
    params.push(id);
    
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    if (role) {
      await syncUserPrimaryRole(Number(id), role);
    }
    
    await execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
      req.user?.id, 'update', 'user', `更新用户: ${user.username}`
    ]);
    
    res.json({ message: '用户更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新用户失败', error });
  }
});

router.delete('/:id', authenticate, requirePermission('user:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (parseInt(id) === req.user?.id) {
      return res.status(400).json({ message: '不能删除自己的账号' });
    }
    
    const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    await execute(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
    
    await execute(`DELETE FROM users WHERE id = ?`, [id]);
    
    await execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
      req.user?.id, 'delete', 'user', `删除用户: ${user.username}`
    ]);
    
    res.json({ message: '用户删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除用户失败', error });
  }
});

export default router;

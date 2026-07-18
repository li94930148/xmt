﻿import express from 'express';
import bcrypt from 'bcrypt';
import { queryOne, execute } from '../database/utils';
import { User } from '../types';
import { signToken } from '../utils/jwt';
import { authenticate } from '../middleware/auth';
import { loginAccountLimiter, loginIpLimiter, logFailedLogin, passwordChangeLimiter } from '../middleware/rateLimit';

const router = express.Router();

router.post('/login', loginIpLimiter, loginAccountLimiter, logFailedLogin, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    
    const result = await queryOne(`SELECT * FROM users WHERE username = ?`, [username]);
    
    if (!result) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    
    const resultRecord = result as Record<string, unknown>;
    const user: User = {
      id: Number(resultRecord.id),
      username: String(resultRecord.username),
      password: String(resultRecord.password),
      email: String(resultRecord.email),
      role: String(resultRecord.role) as User['role'],
      name: String(resultRecord.name),
      enabled: Number(resultRecord.enabled) === 1,
      created_at: String(resultRecord.created_at),
      updated_at: String(resultRecord.updated_at)
    };
    
    if (!user.enabled) {
      return res.status(401).json({ message: '账号已被禁用' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    
    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });
    
    await execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
      user.id,
      'login',
      'auth',
      `用户 ${user.name} 登录系统`
    ]);
    
    // 检查是否需要强制修改密码
    const forceChange = Number((resultRecord as Record<string, unknown>).force_change_password) === 1;
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        force_change_password: forceChange,
      },
      token,
      forceChangePassword: forceChange
    });
  } catch {
    res.status(500).json({ message: '登录失败' });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  res.json({ message: '登出成功' });
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }
    
    const result = await queryOne(`SELECT id, username, name, email, role, enabled, force_change_password, created_at, updated_at FROM users WHERE id = ?`, [userId]);
    
    if (!result) {
      return res.status(401).json({ message: '用户不存在' });
    }
    
    const resultRecord = result as Record<string, unknown>;
    if (Number(resultRecord.enabled) !== 1) {
      return res.status(401).json({ message: '账号已被禁用' });
    }
    
    res.json({
      id: resultRecord.id,
      username: resultRecord.username,
      name: resultRecord.name,
      email: resultRecord.email,
      role: resultRecord.role,
      enabled: true,
      force_change_password: Number(resultRecord.force_change_password ?? 0) === 1,
      created_at: resultRecord.created_at,
      updated_at: resultRecord.updated_at
    });
  } catch {
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

router.post('/change-password', passwordChangeLimiter, authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: '未登录' });
    
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: '旧密码和新密码不能为空' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: '新密码至少6位' });
    }
    
    const result = await queryOne(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!result) return res.status(404).json({ message: '用户不存在' });
    
    const resultRecord = result as Record<string, unknown>;
    const isValid = await bcrypt.compare(oldPassword, String(resultRecord.password));
    if (!isValid) return res.status(401).json({ message: '旧密码错误' });
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await execute(`UPDATE users SET password = ?, force_change_password = 0, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [hashedPassword, userId]);
    
    await execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
      userId, 'change_password', 'auth', '用户修改了密码'
    ]);
    
    res.json({ message: '密码修改成功' });
  } catch {
    res.status(500).json({ message: '修改密码失败' });
  }
});

export default router;

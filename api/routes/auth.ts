﻿import express from 'express';
import bcrypt from 'bcrypt';
import { queryOne, execute } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { passwordChangeLimiter } from '../middleware/rateLimit';
import { createAuthModule } from '../modules/auth/index.js';

const router = express.Router();
const authModule = createAuthModule();

router.use(authModule.legacyRouter);

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

﻿import express from 'express';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { createMessage } from '../utils/messageHelper';

const router = express.Router();

// POST /start - 开始番茄钟
router.post('/start', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { duration, topic_id } = req.body;

    const activeSession = await queryOne(
      `SELECT * FROM pomodoro_sessions WHERE user_id = ? AND completed = 0`,
      [userId]
    );

    if (activeSession) {
      return res.status(400).json({ message: '您有正在进行的番茄钟，请先完成或放弃' });
    }

    const sessionId = await executeInsert(
      `INSERT INTO pomodoro_sessions (user_id, duration, topic_id) VALUES (?, ?, ?)`,
      [userId, duration || 25, topic_id]
    );

    res.json({ message: '番茄钟已开始, sessionId' });
  } catch (error) {
    res.status(500).json({ message: '开始番茄钟失败', error });
  }
});

// POST /:id/complete - 完成番茄钟
router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const session = await queryOne(
      `SELECT * FROM pomodoro_sessions WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (!session) {
      return res.status(404).json({ message: '番茄钟记录不存在' });
    }

    if (session.completed) {
      return res.status(400).json({ message: '该番茄钟已完成' });
    }

    await execute(
      `UPDATE pomodoro_sessions SET completed = 1, ended_at = datetime('now', '+8 hours') WHERE id = ?`,
      [id]
    );

    res.json({ message: '番茄钟完成！' });
  } catch (error) {
    res.status(500).json({ message: '完成番茄钟失败', error });
  }
});

// GET /stats - 获取当前用户的番茄钟统计
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    const todayResult = await queryOne(`
      SELECT COUNT(*) as count FROM pomodoro_sessions 
      WHERE user_id = ? AND completed = 1 AND DATE(ended_at) = DATE('now')
    `, [userId]);

    const weekResult = await queryOne(`
      SELECT COUNT(*) as count FROM pomodoro_sessions 
      WHERE user_id = ? AND completed = 1 
      AND ended_at >= datetime('now', 'weekday 0', '-7 days')
    `, [userId]);

    const totalResult = await queryOne(`
      SELECT COALESCE(SUM(duration), 0) as total FROM pomodoro_sessions 
      WHERE user_id = ? AND completed = 1
    `, [userId]);

    res.json({
      today: todayResult?.count || 0,
      week: weekResult?.count || 0,
      totalMinutes: totalResult?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: '获取统计失败', error });
  }
});

// GET /ranking - 获取团队番茄钟排行榜（本周）
router.get('/ranking', authenticate, async (req, res) => {
  try {
    const ranking = await queryAll(`
      SELECT 
        u.id as user_id,
        u.name,
        u.avatar,
        COUNT(ps.id) as count,
        COALESCE(SUM(ps.duration), 0) as total_minutes
      FROM users u
      LEFT JOIN pomodoro_sessions ps ON ps.user_id = u.id 
        AND ps.completed = 1 
        AND ps.ended_at >= datetime('now', 'weekday 0', '-7 days')
      WHERE u.enabled = 1
      GROUP BY u.id
      HAVING count > 0
      ORDER BY count DESC
      LIMIT 20
    `);

    res.json({ data: ranking });
  } catch (error) {
    res.status(500).json({ message: '获取排行榜失败, error' });
  }
});

export default router;

﻿import express from 'express';
import { queryOne, queryAll, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';

const router = express.Router();

type PomodoroSessionState = {
  id: number;
  user_id: number;
  duration: number;
  topic_id: number | null;
  completed: number | boolean;
  started_at: string;
};

function sessionRemainingSeconds(session: PomodoroSessionState) {
  const durationSeconds = Math.max(0, Number(session.duration) * 60);
  const rawStartedAt = String(session.started_at ?? '');
  const normalizedStartedAt = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawStartedAt)
    ? rawStartedAt
    : `${rawStartedAt.replace(' ', 'T')}Z`;
  const startedAtMs = Date.parse(normalizedStartedAt);
  if (!Number.isFinite(startedAtMs)) return durationSeconds;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  return Math.max(0, durationSeconds - elapsedSeconds);
}

// POST /start - 开始番茄钟
router.post('/start', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { duration = 25, topic_id } = req.body ?? {};
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > 180) {
      return res.status(400).json({ message: '专注时长无效' });
    }

    const result = await runInTransaction(async (tx) => {
      const activeSession = await tx.queryOne<PomodoroSessionState>(
        `SELECT id, user_id, duration, topic_id, completed, started_at
         FROM pomodoro_sessions
         WHERE user_id = ? AND completed = 0
         ORDER BY id DESC
         LIMIT 1`,
        [userId]
      );

      if (activeSession) return { session: activeSession, resumed: true };

      const sessionId = await tx.executeInsert(
        `INSERT INTO pomodoro_sessions (user_id, duration, topic_id) VALUES (?, ?, ?)`,
        [userId, duration, topic_id ?? null]
      );
      const session = await tx.queryOne<PomodoroSessionState>(
        `SELECT id, user_id, duration, topic_id, completed, started_at
         FROM pomodoro_sessions WHERE id = ? AND user_id = ?`,
        [sessionId, userId]
      );
      if (!session) throw new Error('POMODORO_START_SESSION_MISSING_AFTER_INSERT');
      return { session, resumed: false };
    });

    return res.json({
      message: result.resumed ? '已恢复正在进行的番茄钟' : '番茄钟已开始',
      sessionId: Number(result.session.id),
      duration: Number(result.session.duration),
      startedAt: `${String(result.session.started_at).replace(' ', 'T')}Z`,
      remainingSeconds: sessionRemainingSeconds(result.session),
      resumed: result.resumed,
    });
  } catch {
    return res.status(500).json({ message: '开始番茄钟失败' });
  }
});

router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const outcome = await runInTransaction(async (tx) => {
      const session = await tx.queryOne<{ completed: number | boolean }>(
        'SELECT completed FROM pomodoro_sessions WHERE id = ? AND user_id = ?',
        [req.params.id, req.user?.id]
      );
      if (session?.completed) return 'completed' as const;

      if (session) {
        const priorCancellation = await tx.queryOne(
          'SELECT 1 AS found FROM pomodoro_cancellation_ledger WHERE user_id = ? AND session_id = ?',
          [req.user?.id, req.params.id]
        );
        if (priorCancellation) return 'conflict' as const;

        await tx.execute(
          `INSERT INTO pomodoro_cancellation_ledger (user_id, session_id, cancelled_at)
           VALUES (?, ?, datetime('now', '+8 hours'))
           ON CONFLICT(user_id, session_id) DO NOTHING`,
          [req.user?.id, req.params.id]
        );
        const deleted = await tx.execute(
          'DELETE FROM pomodoro_sessions WHERE id = ? AND user_id = ? AND completed = 0',
          [req.params.id, req.user?.id]
        );
        if (deleted !== 1) throw new Error('POMODORO_CANCEL_SESSION_DELETE_CONFLICT');
        return 'cancelled' as const;
      }

      const priorCancellation = await tx.queryOne(
        'SELECT 1 AS found FROM pomodoro_cancellation_ledger WHERE user_id = ? AND session_id = ?',
        [req.user?.id, req.params.id]
      );
      return priorCancellation ? 'already-cancelled' as const : 'not-found' as const;
    });

    if (outcome === 'not-found') return res.status(404).json({ message: '进行中的番茄钟不存在' });
    if (outcome === 'completed') return res.status(409).json({ message: '已完成的番茄钟不能重置' });
    if (outcome === 'conflict') return res.status(409).json({ message: '番茄钟状态已变化，请刷新后重试' });
    return res.json({ message: '番茄钟已放弃', alreadyCancelled: outcome === 'already-cancelled' });
  } catch {
    return res.status(500).json({ message: '放弃番茄钟失败' });
  }
});

// POST /:id/complete - 完成番茄钟
router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const outcome = await runInTransaction(async (tx) => {
      const changed = await tx.execute(
        `UPDATE pomodoro_sessions
         SET completed = 1, ended_at = datetime('now', '+8 hours')
         WHERE id = ? AND user_id = ? AND completed = 0`,
        [req.params.id, req.user?.id]
      );
      if (changed === 1) return 'completed' as const;

      const existing = await tx.queryOne<{ completed: number | boolean }>(
        'SELECT completed FROM pomodoro_sessions WHERE id = ? AND user_id = ?',
        [req.params.id, req.user?.id]
      );
      if (existing?.completed) return 'already-completed' as const;
      if (existing) return 'conflict' as const;

      const priorCancellation = await tx.queryOne(
        'SELECT 1 AS found FROM pomodoro_cancellation_ledger WHERE user_id = ? AND session_id = ?',
        [req.user?.id, req.params.id]
      );
      return priorCancellation ? 'cancelled' as const : 'not-found' as const;
    });

    if (outcome === 'not-found') return res.status(404).json({ message: '番茄钟记录不存在' });
    if (outcome === 'already-completed') return res.status(400).json({ message: '该番茄钟已完成' });
    if (outcome === 'cancelled') return res.status(409).json({ message: '已重置的番茄钟不能完成' });
    if (outcome === 'conflict') return res.status(409).json({ message: '番茄钟状态已变化，请刷新后重试' });
    return res.json({ message: '番茄钟完成！' });
  } catch {
    return res.status(500).json({ message: '完成番茄钟失败' });
  }
});

// GET /stats - 获取当前用户的番茄钟统计
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    const todayResult = await queryOne(`
      SELECT COUNT(*) as count FROM pomodoro_sessions 
      WHERE user_id = ? AND completed = 1 AND DATE(ended_at) = DATE('now', '+8 hours')
    `, [userId]);

    const weekResult = await queryOne(`
      SELECT COUNT(*) as count FROM pomodoro_sessions 
      WHERE user_id = ? AND completed = 1 
      AND ended_at >= datetime('now', '+8 hours', 'weekday 0', '-7 days')
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
  } catch {
    res.status(500).json({ message: '获取统计失败' });
  }
});

// GET /ranking - 获取团队番茄钟排行榜（本周）
router.get('/ranking', authenticate, async (req, res) => {
  try {
    const ranking = await queryAll(`
      SELECT 
        u.id as user_id,
        u.name as user_name,
        COUNT(ps.id) as total_sessions,
        COALESCE(SUM(ps.duration), 0) as total_minutes
      FROM users u
      LEFT JOIN pomodoro_sessions ps ON ps.user_id = u.id 
        AND ps.completed = 1 
        AND ps.ended_at >= datetime('now', '+8 hours', 'weekday 0', '-7 days')
      WHERE u.enabled = 1
      GROUP BY u.id
      HAVING total_sessions > 0
      ORDER BY total_sessions DESC
      LIMIT 20
    `);
    const canSeeNames = req.user?.role === 'admin' || req.user?.role === 'director';
    res.json({ data: ranking.map((row, index) => ({
      user_id: canSeeNames || Number(row.user_id) === req.user?.id ? row.user_id : -(index + 1),
      user_name: canSeeNames || Number(row.user_id) === req.user?.id ? row.user_name : `第 ${index + 1} 名同事`,
      total_sessions: row.total_sessions,
      total_minutes: row.total_minutes,
    })) });
  } catch {
    res.status(500).json({ message: '获取排行榜失败' });
  }
});

export default router;

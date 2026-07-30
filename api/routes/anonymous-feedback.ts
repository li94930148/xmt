import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { beijingNow, execute, executeInsert, queryAll, queryOne } from '../database/utils';

const router = express.Router();
const feedbackTypes = new Set(['feature', 'usage', 'process', 'team', 'other']);
const feedbackStatuses = new Set(['pending', 'read', 'done']);

router.get('/', authenticate, async (_req, res) => {
  try {
    const feedback = await queryAll(`
      SELECT id, type, content, need_reply, reply_content, created_at, updated_at
      FROM anonymous_feedback
      ORDER BY created_at DESC, id DESC
    `);
    return res.json({ data: feedback });
  } catch {
    return res.status(500).json({ message: '获取意见列表失败' });
  }
});

router.post('/', authenticate, async (req, res) => {
  const type = typeof req.body.type === 'string' ? req.body.type : '';
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const needReply = req.body.needReply;

  if (!feedbackTypes.has(type)) return res.status(400).json({ message: '请选择有效的意见类型' });
  if (!content) return res.status(400).json({ message: '意见内容不能为空' });
  if (content.length > 2000) return res.status(400).json({ message: '意见内容不能超过 2000 字' });
  if (typeof needReply !== 'boolean') return res.status(400).json({ message: '回复选项格式不正确' });

  try {
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

router.get('/admin', authenticate, requireRole(['admin']), async (_req, res) => {
  try {
    const feedback = await queryAll(`SELECT * FROM anonymous_feedback ORDER BY created_at DESC, id DESC`);
    return res.json({ data: feedback });
  } catch {
    return res.status(500).json({ message: '获取意见列表失败' });
  }
});

router.patch('/admin/:id', authenticate, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: '意见编号无效' });
  const existing = await queryOne(`SELECT id FROM anonymous_feedback WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ message: '意见不存在' });

  const updates: string[] = [];
  const params: unknown[] = [];
  if (req.body.status !== undefined) {
    if (!feedbackStatuses.has(req.body.status)) return res.status(400).json({ message: '状态无效' });
    updates.push('status = ?'); params.push(req.body.status);
  }
  if (req.body.reply_content !== undefined) {
    if (typeof req.body.reply_content !== 'string' || req.body.reply_content.trim().length > 2000) {
      return res.status(400).json({ message: '回复内容格式不正确' });
    }
    updates.push('reply_content = ?'); params.push(req.body.reply_content.trim() || null);
  }
  if (updates.length === 0) return res.status(400).json({ message: '没有需要更新的字段' });

  updates.push('updated_at = ?'); params.push(beijingNow(), id);
  await execute(`UPDATE anonymous_feedback SET ${updates.join(', ')} WHERE id = ?`, params);
  return res.json({ success: true });
});

router.delete('/admin/:id', authenticate, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: '意见编号无效' });
  const affected = await execute(`DELETE FROM anonymous_feedback WHERE id = ?`, [id]);
  if (!affected) return res.status(404).json({ message: '意见不存在' });
  return res.json({ success: true });
});

export default router;

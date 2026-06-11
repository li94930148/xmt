﻿﻿﻿﻿﻿﻿﻿﻿import express from 'express';
import { beijingNow, beijingToday, queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate, requireRole } from '../middleware/auth';
import { broadcastToRoom } from '../utils/socket';

const router = express.Router();

type VersionAction = 'minor' | 'major' | 'none';

function getNextVersion(currentVersion: string | undefined, versionAction: VersionAction): string {
  const normalized = String(currentVersion || 'v1.0');
  const match = normalized.match(/^v?(\d+)\.(\d+)$/);

  if (!match) {
    return versionAction === 'major' ? 'v2.0' : 'v1.1';
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);

  if (versionAction === 'major') {
    return `v${major + 1}.0`;
  }

  if (versionAction === 'minor') {
    return `v${major}.${minor + 1}`;
  }

  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

router.get('/production', authenticate, async (req, res) => {
  try {
    const { topic_id } = req.query;
    let query = `SELECT p.*, p.content as contentMarkdown, p.content as contentJson, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM production p 
                 LEFT JOIN users u ON p.operator_id = u.id 
                 LEFT JOIN topics t ON p.topic_id = t.id WHERE 1=1`;
    const params: any[] = [];
    if (topic_id) { query += ` AND p.topic_id = ?`; params.push(topic_id); }
    if (req.user?.role === 'member') { query += ` AND (t.creator_id = ? OR t.assignee_id = ?)`; params.push(req.user.id, req.user.id); }
    query += ` ORDER BY p.created_at DESC`;
    const productions = await queryAll(query, params);
    res.json(productions);
  } catch (error) {
    res.status(500).json({ message: '获取创作列表失败', error });
  }
});

router.post('/production', authenticate, async (req, res) => {
  try {
    const { topic_id, version, content, status = 'draft' } = req.body;
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    const contentMarkdown = req.body.contentMarkdown || content;
    const contentJson = req.body.contentJson || content;
    const productionId = await executeInsert(`INSERT INTO production (topic_id, version, content, content_markdown, content_json, status, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [topic_id, version, content, contentMarkdown, contentJson, status, req.user?.id]);
    if (status === 'approved') await execute(`UPDATE topics SET status = 'production' WHERE id = ?`, [topic_id]);
    broadcastToRoom('production', 'production:created', { id: productionId, topic_id: req.body.topic_id });
    res.json({ message: '创作记录添加成功', productionId });
  } catch (error) {
    res.status(500).json({ message: '添加创作记录失败', error });
  }
});

router.get('/production/:id', authenticate, async (req, res) => {
  try {
    const production = await queryOne(`SELECT p.*, COALESCE(p.content_markdown, p.content) as contentMarkdown, COALESCE(p.content_json, p.content) as contentJson, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM production p LEFT JOIN users u ON p.operator_id = u.id LEFT JOIN topics t ON p.topic_id = t.id WHERE p.id = ?`, [req.params.id]);
    if (!production) return res.status(404).json({ message: '创作记录不存在' });
    res.json(production);
  } catch (error) {
    res.status(500).json({ message: '获取创作详情失败', error });
  }
});

router.put('/production/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      topic_id,
      version,
      content,
      status,
      change_type = 'minor',
      version_action,
    } = req.body;
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    const existingProduction = await queryOne(`SELECT * FROM production WHERE id = ?`, [id]);
    if (!existingProduction) return res.status(404).json({ message: '创作记录不存在' });

    const currentVersion = String(existingProduction.version || version || 'v1.0');
    const resolvedVersionAction: VersionAction =
      version_action === 'major' || version_action === 'minor' || version_action === 'none'
        ? version_action
        : status === existingProduction.status &&
            content === existingProduction.content &&
            Number(topic_id) === Number(existingProduction.topic_id)
          ? 'none'
          : change_type === 'major'
            ? 'major'
            : 'minor';

    const shouldCreateHistory =
      resolvedVersionAction !== 'none' &&
      (
        content !== existingProduction.content ||
        status !== existingProduction.status ||
        Number(topic_id) !== Number(existingProduction.topic_id)
      );

    if (shouldCreateHistory) {
      await execute(
        `INSERT INTO production_history (production_id, version, content, content_markdown, content_json, status, change_type, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          currentVersion,
          existingProduction.content,
          existingProduction.content_markdown || existingProduction.content,
          existingProduction.content_json || existingProduction.content,
          existingProduction.status,
          resolvedVersionAction === 'major' ? 'major' : 'minor',
          req.user?.id,
        ],
      );
    }

    const newVersion =
      resolvedVersionAction === 'none'
        ? currentVersion
        : getNextVersion(currentVersion, resolvedVersionAction);

    const contentMarkdown = req.body.contentMarkdown || content;
    const contentJson = req.body.contentJson || content;
    await execute(`UPDATE production SET topic_id = ?, version = ?, content = ?, content_markdown = ?, content_json = ?, status = ?, operator_id = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [topic_id, newVersion, content, contentMarkdown, contentJson, status, req.user?.id, id]);
    
    if (status === 'approved') {
      await execute(`UPDATE topics SET status = 'shooting' WHERE id = ?`, [topic_id]);
      const existingShooting = await queryOne(`SELECT * FROM shooting WHERE topic_id = ?`, [topic_id]);
      if (!existingShooting) {
        await execute(`INSERT INTO shooting (topic_id, status, operator_id) VALUES (?, ?, ?)`, [topic_id, 'planned', req.user?.id]);
      } else {
        await execute(`UPDATE shooting SET status = 'planned', updated_at = datetime('now', '+8 hours') WHERE topic_id = ?`, [topic_id]);
      }
      const topic = await queryOne(`SELECT title FROM topics WHERE id = ?`, [topic_id]);
      if (topic) {
        await execute(`INSERT INTO messages (user_id, title, content, type, created_at) VALUES (?, ?, ?, ?, ?)`, [req.user?.id, '创作审核通过', `选题?{topic.title}」创作已通过审核，进入成片制作环节`, 'success', beijingNow()]);
      }
    }
    broadcastToRoom('production', 'production:updated', { id: Number(req.params.id) });
    res.json({ message: '创作记录更新成功', version: newVersion });
  } catch (error) {
    res.status(500).json({ message: '更新创作记录失败', error });
  }
});

router.delete('/production/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    await execute(`DELETE FROM production WHERE id = ?`, [req.params.id]);
    await execute(`DELETE FROM production_history WHERE production_id = ?`, [req.params.id]);
    broadcastToRoom('production', 'production:deleted', { id: Number(req.params.id) });
    res.json({ message: '创作记录删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除创作记录失败', error });
  }
});

router.get('/production/:id/history', authenticate, async (req, res) => {
  try {
    const history = await queryAll(`SELECT ph.*, u.name as operator_name FROM production_history ph LEFT JOIN users u ON ph.operator_id = u.id WHERE ph.production_id = ? ORDER BY ph.created_at DESC`, [req.params.id]);
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: '获取版本历史失败', error });
  }
});

router.get('/shooting', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { topic_id } = req.query;
    let query = `SELECT s.*, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM shooting s LEFT JOIN users u ON s.operator_id = u.id LEFT JOIN topics t ON s.topic_id = t.id WHERE 1=1`;
    const params: any[] = [];
    if (topic_id) { query += ` AND s.topic_id = ?`; params.push(topic_id); }
    query += ` ORDER BY s.created_at DESC`;
    res.json(await queryAll(query, params));
  } catch (error) {
    res.status(500).json({ message: '获取拍摄列表失败', error });
  }
});

router.get('/shooting/:id', authenticate, async (req, res) => {
  try {
    const shooting = await queryOne(`SELECT s.*, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM shooting s LEFT JOIN users u ON s.operator_id = u.id LEFT JOIN topics t ON s.topic_id = t.id WHERE s.id = ?`, [req.params.id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });

    // 获取关联的已通过审核的创作记录
    const production = await queryOne(`SELECT p.id, p.version, p.content, p.content_markdown, p.status, u.name as operator_name FROM production p LEFT JOIN users u ON p.operator_id = u.id WHERE p.topic_id = ? AND p.status = 'approved' ORDER BY p.updated_at DESC LIMIT 1`, [(shooting as any).topic_id]);

    res.json({
      ...shooting,
      production: production || null
    });
  } catch (error) {
    res.status(500).json({ message: '获取成片制作记录失败', error });
  }
});

router.put('/shooting/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { id } = req.params;
    const { topic_id, plan_date, location, equipment, status, script_content } = req.body;
    const updateFields: string[] = [];
    const params: any[] = [];
    if (topic_id !== undefined) { updateFields.push('topic_id = ?'); params.push(topic_id); }
    if (plan_date !== undefined) { updateFields.push('plan_date = ?'); params.push(plan_date); }
    if (location !== undefined) { updateFields.push('location = ?'); params.push(location); }
    if (equipment !== undefined) { updateFields.push('equipment = ?'); params.push(equipment); }
    if (status !== undefined) { updateFields.push('status = ?'); params.push(status); }
    if (script_content !== undefined) { updateFields.push('script_content = ?'); params.push(script_content); }
    if (updateFields.length === 0) return res.status(400).json({ message: '没有需要更新的字段' });

    const shooting = await queryOne(`SELECT topic_id FROM shooting WHERE id = ?`, [id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    const targetTopicId = topic_id !== undefined ? topic_id : shooting.topic_id;
    params.push(id);
    await execute(`UPDATE shooting SET ${updateFields.join(', ')}, updated_at = datetime('now', '+8 hours') WHERE id = ?`, params);
    
    if (status === 'completed') {
      await execute(`UPDATE topics SET status = 'publishing' WHERE id = ?`, [targetTopicId]);
      // 获取成片制作阶段的本地剧本内容，传递到发布管理
      const shootingRecord = await queryOne(`SELECT script_content FROM shooting WHERE id = ?`, [id]);
      const localScriptContent = (shootingRecord as any)?.script_content || null;
      const existingPublishing = await queryOne(`SELECT * FROM publishing WHERE topic_id = ?`, [targetTopicId]);
      if (!existingPublishing) {
        await execute(`INSERT INTO publishing (topic_id, status, operator_id, script_content) VALUES (?, ?, ?, ?)`, [targetTopicId, 'pending', req.user?.id, localScriptContent]);
      } else {
        await execute(`UPDATE publishing SET status = 'pending', script_content = COALESCE(?, script_content), updated_at = datetime('now', '+8 hours') WHERE topic_id = ?`, [localScriptContent, targetTopicId]);
      }
      const topic = await queryOne(`SELECT title FROM topics WHERE id = ?`, [targetTopicId]);
      if (topic) {
        await execute(`INSERT INTO messages (user_id, title, content, type, created_at) VALUES (?, ?, ?, ?, ?)`, [req.user?.id, '成片制作完成', `选题?{topic.title}」成片制作已完成，进入发布管理环节`, 'success', beijingNow()]);
      }
    }
    broadcastToRoom('shooting', 'shooting:updated', { id: Number(req.params.id) });
    res.json({ message: '成片制作记录更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新成片制作记录失败', error });
  }
});

router.delete('/shooting/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const shooting = await queryOne(`SELECT * FROM shooting WHERE id = ?`, [req.params.id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    await execute(`DELETE FROM shooting WHERE id = ?`, [req.params.id]);
    res.json({ message: '成片制作记录删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除成片制作记录失败', error });
  }
});

router.post('/shooting', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { topic_id, plan_date, location, equipment, status = 'planned' } = req.body;
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    const shootingId = await executeInsert(`INSERT INTO shooting (topic_id, plan_date, location, equipment, status, operator_id) VALUES (?, ?, ?, ?, ?, ?)`, [topic_id, plan_date, location, equipment, status, req.user?.id]);
    if (status === 'completed') await execute(`UPDATE topics SET status = 'publishing' WHERE id = ?`, [topic_id]);
    broadcastToRoom('shooting', 'shooting:created', { id: shootingId, topic_id: req.body.topic_id });
    res.json({ message: '成片制作计划添加成功', shootingId });
  } catch (error) {
    res.status(500).json({ message: '添加成片制作计划失败', error });
  }
});

router.get('/publishing/:id', authenticate, async (req, res) => {
  try {
    const publishing = await queryOne(`SELECT p.*, u.name as operator_name, t.title as topic_title, t.description as topic_description, t.platform as topic_platform, t.deadline as topic_deadline, t.status as topic_status FROM publishing p LEFT JOIN users u ON p.operator_id = u.id LEFT JOIN topics t ON p.topic_id = t.id WHERE p.id = ?`, [req.params.id]);
    if (!publishing) return res.status(404).json({ message: '发布记录不存在' });

    // 获取关联的创作记录（已通过审核的）
    const production = await queryOne(`SELECT p.id, p.version, p.content, p.content_markdown, p.status, p.created_at, u.name as operator_name FROM production p LEFT JOIN users u ON p.operator_id = u.id WHERE p.topic_id = ? AND p.status = 'approved' ORDER BY p.updated_at DESC LIMIT 1`, [(publishing as any).topic_id]);

    // 获取关联的成片制作记录
    const shooting = await queryOne(`SELECT s.*, u.name as operator_name FROM shooting s LEFT JOIN users u ON s.operator_id = u.id WHERE s.topic_id = ?`, [(publishing as any).topic_id]);

    // 获取选题流转历史
    const topicHistory = await queryAll(`SELECT th.*, u.name as operator_name FROM topic_history th LEFT JOIN users u ON th.operator_id = u.id WHERE th.topic_id = ? ORDER BY th.created_at DESC`, [(publishing as any).topic_id]);

    res.json({
      ...publishing,
      production: production || null,
      shooting: shooting || null,
      topicHistory: topicHistory || []
    });
  } catch (error) {
    res.status(500).json({ message: '获取发布详情失败', error });
  }
});

router.get('/publishing', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { topic_id } = req.query;
    let query = `SELECT p.*, u.name as operator_name, t.title as topic_title, COALESCE(a.views, 0) as views, COALESCE(a.likes, 0) as likes, COALESCE(a.shares, 0) as shares, COALESCE(a.comments, 0) as comments FROM publishing p LEFT JOIN users u ON p.operator_id = u.id LEFT JOIN topics t ON p.topic_id = t.id LEFT JOIN analytics a ON t.id = a.topic_id WHERE 1=1`;
    const params: any[] = [];
    if (topic_id) { query += ` AND p.topic_id = ?`; params.push(topic_id); }
    query += ` ORDER BY p.created_at DESC`;
    res.json(await queryAll(query, params));
  } catch (error) {
    res.status(500).json({ message: '获取发布列表失败', error });
  }
});

router.post('/publishing', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { topic_id, platform, url, status = 'pending', publish_time, views = 0, likes = 0, shares = 0, comments = 0 } = req.body;
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    const publishingId = await executeInsert(`INSERT INTO publishing (topic_id, platform, url, status, publish_time, operator_id) VALUES (?, ?, ?, ?, ?, ?)`, [topic_id, platform, url, status, publish_time, req.user?.id]);
    
    const existingAnalytics = await queryOne(`SELECT id FROM analytics WHERE topic_id = ?`, [topic_id]);
    if (existingAnalytics) {
      await execute(`UPDATE analytics SET views = views + ?, likes = likes + ?, shares = shares + ?, comments = comments + ?, data_date = COALESCE(data_date, ?) WHERE topic_id = ?`, [views, likes, shares, comments, publish_time || beijingToday(), topic_id]);
    } else {
      await execute(`INSERT INTO analytics (topic_id, views, likes, shares, comments, data_date) VALUES (?, ?, ?, ?, ?, ?)`, [topic_id, views, likes, shares, comments, publish_time || beijingToday()]);
    }
    
    if (status === 'published') {
      const existingTopic = await queryOne(`SELECT * FROM topics WHERE id = ?`, [topic_id]);
      if (existingTopic && existingTopic.status !== 'completed') {
        await execute(`UPDATE topics SET status = 'completed' WHERE id = ?`, [topic_id]);
        await execute(`INSERT INTO messages (user_id, title, content, type, created_at) VALUES (?, ?, ?, ?, ?)`, [req.user?.id, '发布完成', `选题?{existingTopic.title}」已发布完成`, 'success', beijingNow()]);
      }
    }
    broadcastToRoom('publishing', 'publishing:created', { id: publishingId, topic_id: req.body.topic_id });
    res.json({ message: '发布记录添加成功', publishingId });
  } catch (error) {
    res.status(500).json({ message: '添加发布记录失败', error });
  }
});

router.put('/publishing/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, url, status, publish_time, script_content } = req.body;

    const updateFields: string[] = [];
    const params: any[] = [];

    if (platform !== undefined) { updateFields.push('platform = ?'); params.push(platform); }
    if (url !== undefined) { updateFields.push('url = ?'); params.push(url); }
    if (status !== undefined) { updateFields.push('status = ?'); params.push(status); }
    if (publish_time !== undefined) { updateFields.push('publish_time = ?'); params.push(publish_time); }
    if (script_content !== undefined) { updateFields.push('script_content = ?'); params.push(script_content); }

    if (updateFields.length === 0) return res.status(400).json({ message: '没有需要更新的字段' });

    params.push(id);
    await execute(`UPDATE publishing SET ${updateFields.join(', ')}, updated_at = datetime('now', '+8 hours') WHERE id = ?`, params);
    broadcastToRoom('publishing', 'publishing:updated', { id: Number(req.params.id) });
    res.json({ message: '发布记录更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新发布记录失败', error });
  }
});

router.delete('/publishing/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const publishing = await queryOne(`SELECT topic_id FROM publishing WHERE id = ?`, [req.params.id]);
    if (publishing) await execute(`DELETE FROM publishing WHERE id = ?`, [req.params.id]);
    res.json({ message: '发布记录删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除发布记录失败', error });
  }
});

router.get('/comments', authenticate, async (req, res) => {
  try {
    const { target_type, target_id } = req.query;
    if (!target_type || !target_id) return res.status(400).json({ message: '缺少必要参数' });
    const comments = await queryAll(`SELECT c.*, u.name as operator_name FROM comments c LEFT JOIN users u ON c.operator_id = u.id WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.created_at DESC`, [target_type, target_id]);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: '获取评论失败', error });
  }
});

router.post('/comments', authenticate, async (req, res) => {
  try {
    const { target_type, target_id, content } = req.body;
    if (!target_type || !target_id || !content) return res.status(400).json({ message: '缺少必要参数' });
    const commentId = await executeInsert(`INSERT INTO comments (target_type, target_id, content, operator_id) VALUES (?, ?, ?, ?)`, [target_type, target_id, content, req.user?.id]);
    res.json({ message: '评论添加成功', commentId });
  } catch (error) {
    res.status(500).json({ message: '添加评论失败', error });
  }
});

router.delete('/comments/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    await execute(`DELETE FROM comments WHERE id = ?`, [req.params.id]);
    res.json({ message: '评论删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除评论失败', error });
  }
});

export default router;

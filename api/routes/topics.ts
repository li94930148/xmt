﻿﻿﻿import express from 'express';
import { queryOne, queryAll, execute, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { TopicStatus } from '../types';
import { isValidTransition, isValidAuditAction, STATUS_TEXT, getTransitionText } from '../utils/workflow';
import { canAccessTopic, isPrivilegedUser } from '../utils/access';
import { createMessage } from '../utils/messageHelper';
import { broadcastToRoom } from '../utils/socket';
import { sendSuccess, sendSuccessWithPagination, sendError, sendNotFound, sendServerError } from '../utils/response';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;

    let query = `SELECT t.*, u1.name as creator_name, u2.name as assignee_name FROM topics t
                 LEFT JOIN users u1 ON t.creator_id = u1.id
                 LEFT JOIN users u2 ON t.assignee_id = u2.id WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (!isPrivilegedUser(req.user)) {
      const userId = req.user!.id;
      query += ` AND (t.creator_id = ? OR t.assignee_id = ?)`;
      params.push(userId, userId);
    }

    query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string));

    const topics = await queryAll(query, params);

    const countQuery = query.replace(/ORDER BY.*$/, '');
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM (${countQuery}) as temp`, params.slice(0, -2));

    sendSuccessWithPagination(res, topics, Number(countResult?.total) || 0, parseInt(page as string), parseInt(limit as string));
  } catch (error) {
    sendServerError(res, '获取选题列表失败');
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const topic = await queryOne(`SELECT t.*, u1.name as creator_name, u2.name as assignee_name FROM topics t
                         LEFT JOIN users u1 ON t.creator_id = u1.id
                         LEFT JOIN users u2 ON t.assignee_id = u2.id WHERE t.id = ?`, [id]);

    if (!topic) {
      return sendNotFound(res, '选题不存在');
    }

    if (!canAccessTopic(req.user, topic as { creator_id: number | null; assignee_id: number | null })) {
      return sendError(res, '无权限查看此选题', 403);
    }

    const history = await queryAll(`SELECT th.*, u.name as operator_name FROM topic_history th
                           LEFT JOIN users u ON th.operator_id = u.id
                           WHERE th.topic_id = ? ORDER BY th.created_at DESC`, [id]);

    sendSuccess(res, { ...topic, history });
  } catch (error) {
    sendServerError(res, '获取选题详情失败');
  }
});

router.post('/', authenticate, requirePermission('topic:create'), async (req, res) => {
  try {
    const { title, description, outline, platform, deadline, assignee_id } = req.body;

    if (!title) {
      return sendError(res, '选题标题不能为空');
    }

    const topicId = await runInTransaction(async (tx) => {
      const createdTopicId = await tx.executeInsert(`INSERT INTO topics (title, description, outline, outline_markdown, outline_json, platform, deadline, creator_id, assignee_id, status, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`, [title, description, outline || null, req.body.outlineMarkdown || outline || null, req.body.outlineJson || outline || null, platform, deadline, req.user?.id, assignee_id || null, 'pending']);

      await tx.execute(`INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)`, [
        createdTopicId, 'created', '创建选题', req.user?.id
      ]);

      await tx.execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
        req.user?.id, 'create', 'topic', `创建选题: ${title}`
      ]);

      return createdTopicId;
    });

    createMessage(
      req.user!.id,
      '选题提交通知',
      `您提交的选题「${title}」已成功提交，请等待审核`,
      'info',
      `/topics/${topicId}`
    );

    const directors = await queryAll(`SELECT id FROM users WHERE role = 'director' OR role = 'admin'`);
    for (const dir of directors) {
      createMessage(
        Number(dir.id),
        '新选题待审核',
        `有新的选题「${title}」需要审核`,
        'warning',
        `/topics/${topicId}`
      );
    }

    const topicData = await queryOne(`SELECT t.*, u1.name as creator_name, u2.name as assignee_name FROM topics t
      LEFT JOIN users u1 ON t.creator_id = u1.id
      LEFT JOIN users u2 ON t.assignee_id = u2.id WHERE t.id = ?`, [topicId]);
    broadcastToRoom('topics', 'topic:created', topicData);

    sendSuccess(res, { topicId }, '选题提交成功');
  } catch (error) {
    sendServerError(res, '创建选题失败');
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, outline, platform, deadline, assignee_id } = req.body;

    const topic = await queryOne(`SELECT * FROM topics WHERE id = ?`, [id]);
    if (!topic) {
      return sendNotFound(res, '选题不存在');
    }

    if (!canAccessTopic(req.user, topic as { creator_id: number | null; assignee_id: number | null })) {
      return sendError(res, '无权限修改此选题', 403);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (title) { updates.push('title = ?'); params.push(title); }
    if (description) { updates.push('description = ?'); params.push(description); }
    if (outline !== undefined) { updates.push('outline = ?'); params.push(outline); updates.push('outline_markdown = ?'); params.push(req.body.outlineMarkdown || outline); updates.push('outline_json = ?'); params.push(req.body.outlineJson || outline); }
    if (platform) { updates.push('platform = ?'); params.push(platform); }
    if (deadline) { updates.push('deadline = ?'); params.push(deadline); }
    if (assignee_id !== undefined && assignee_id !== null) { updates.push('assignee_id = ?'); params.push(assignee_id); }

    if (updates.length === 0) {
      return sendError(res, '没有需要更新的字段');
    }

    updates.push("updated_at = datetime('now', '+8 hours')");
    params.push(id);

    await execute(`UPDATE topics SET ${updates.join(', ')} WHERE id = ?`, params);
    const updatedTopic = await queryOne(`SELECT t.*, u1.name as creator_name, u2.name as assignee_name FROM topics t
      LEFT JOIN users u1 ON t.creator_id = u1.id
      LEFT JOIN users u2 ON t.assignee_id = u2.id WHERE t.id = ?`, [id]);
    broadcastToRoom('topics', 'topic:updated', updatedTopic);

    sendSuccess(res, null, '选题更新成功');
  } catch (error) {
    sendServerError(res, '更新选题失败');
  }
});

router.delete('/:id', authenticate, requirePermission('topic:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const topic = await queryOne(`SELECT * FROM topics WHERE id = ?`, [id]);
    if (!topic) {
      return sendNotFound(res, '选题不存在');
    }

    try { await execute(`DELETE FROM comments WHERE target_type = 'topic' AND target_id = ?`, [id]); } catch (e) {}
    try { await execute(`DELETE FROM shooting WHERE topic_id = ?`, [id]); } catch (e) {}
    try { await execute(`DELETE FROM production_history WHERE production_id IN (SELECT id FROM production WHERE topic_id = ?)`, [id]); } catch (e) {}
    try { await execute(`DELETE FROM production WHERE topic_id = ?`, [id]); } catch (e) {}
    try { await execute(`DELETE FROM topic_history WHERE topic_id = ?`, [id]); } catch (e) {}

    await execute(`DELETE FROM topics WHERE id = ?`, [id]);
    broadcastToRoom('topics', 'topic:deleted', { id });

    sendSuccess(res, null, '选题删除成功');
  } catch (error) {
    sendServerError(res, '删除选题失败');
  }
});

router.post('/:id/audit', authenticate, requirePermission('topic:audit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment, assignee_id } = req.body;
    
    const topic = await queryOne(`SELECT * FROM topics WHERE id = ?`, [id]);
    if (!topic) {
      return sendNotFound(res, '选题不存在');
    }

    const oldStatus = topic.status as TopicStatus;

    if (!isValidAuditAction(oldStatus, status)) {
      return sendError(res, `当前状态「${STATUS_TEXT[oldStatus]}」不允许执行审核操作`);
    }

    const statusText = status === 'approved' ? '审核通过' : '审核驳回';

    await runInTransaction(async (tx) => {
      const topicUpdateFields = [`status = ?`, `updated_at = datetime('now', '+8 hours')`];
      const topicUpdateParams: unknown[] = [status];

      if (assignee_id) {
        topicUpdateFields.push(`assignee_id = ?`);
        topicUpdateParams.push(assignee_id);
      }

      topicUpdateParams.push(id);
      await tx.execute(`UPDATE topics SET ${topicUpdateFields.join(', ')} WHERE id = ?`, topicUpdateParams);

      await tx.execute(`INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)`, [
        id, status === 'approved' ? 'approved' : 'rejected', comment, req.user?.id
      ]);

      await tx.execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
        req.user?.id, 'audit', 'topic', `审核选题 ${id}: ${status === 'approved' ? '通过' : '驳回'}`
      ]);

      if (status === 'approved') {
        const existingProduction = await tx.queryOne(`SELECT id FROM production WHERE topic_id = ?`, [id]);
        if (!existingProduction) {
          const creatorId = assignee_id || topic.creator_id;
          const initialContent = String(topic.outline || '');
          const initialContentMarkdown = String(topic.outline_markdown || topic.outline || '');
          const initialContentJson = String(topic.outline_json || topic.outline || '');
          await tx.execute(`INSERT INTO production (topic_id, version, content, content_markdown, content_json, status, operator_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, 'v1.0', initialContent, initialContentMarkdown, initialContentJson, 'draft', creatorId]);
        }
      }
    });

    createMessage(
      Number(topic.creator_id),
      `选题${statusText}`,
      `您的选题「${topic.title}」已${statusText}${comment ? '，备注：' + comment : ''}`,
      status === 'approved' ? 'success' : 'error',
      `/topics/${id}`
    );

    if (assignee_id) {
      createMessage(assignee_id, '新任务指派', `您被指派负责选题「${topic.title}」`, 'info', `/topics/${id}`);
    }

    const auditedTopic = await queryOne('SELECT * FROM topics WHERE id = ?', [id]);
    broadcastToRoom('topics', 'topic:audited', { id, status, assignee_id, topic: auditedTopic });

    sendSuccess(res, null, `选题${statusText}`);
  } catch (error) {
    sendServerError(res, '审核选题失败');
  }
});

router.post('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: TopicStatus };
    
    const topic = await queryOne(`SELECT * FROM topics WHERE id = ?`, [id]);
    if (!topic) {
      return sendNotFound(res, '选题不存在');
    }

    if (!canAccessTopic(req.user, topic as { creator_id: number | null; assignee_id: number | null })) {
      return sendError(res, '无权限修改此选题状态', 403);
    }

    if (!isValidTransition(topic.status as TopicStatus, status)) {
      return sendError(res, `不允许从「${STATUS_TEXT[topic.status as TopicStatus]}」变更为「${STATUS_TEXT[status]}」`);
    }

    const operatorId = req.user?.id;
    await runInTransaction(async (tx) => {
      await tx.execute(`UPDATE topics SET status = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [status, id]);

      await tx.execute(`INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)`, [
        id, `status_${status}`, getTransitionText(topic.status as TopicStatus, status), req.user?.id
      ]);

      await tx.execute(`INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)`, [
        req.user?.id, 'status_change', 'topic', `选题 ${id} 状态变更为 ${status}`
      ]);

      if (status === 'production') {
        const existingProduction = await tx.queryOne(`SELECT id FROM production WHERE topic_id = ?`, [id]);
        if (!existingProduction) {
          const initialContent = String(topic.outline || '');
          const initialContentMarkdown = String(topic.outline_markdown || topic.outline || '');
          const initialContentJson = String(topic.outline_json || topic.outline || '');
          await tx.execute(`INSERT INTO production (topic_id, version, content, content_markdown, content_json, status, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            id, 'v1.0', initialContent, initialContentMarkdown, initialContentJson, 'draft', operatorId
          ]);
        }
      }

      if (status === 'shooting') {
        const existingShooting = await tx.queryOne(`SELECT id FROM shooting WHERE topic_id = ?`, [id]);
        if (!existingShooting) {
          await tx.execute(`INSERT INTO shooting (topic_id, plan_date, location, equipment, status, operator_id) VALUES (?, ?, ?, ?, ?, ?)`, [
            id, null, null, null, 'planned', operatorId
          ]);
        }
      }

      if (status === 'publishing') {
        const existingPublishing = await tx.queryOne(`SELECT id FROM publishing WHERE topic_id = ?`, [id]);
        if (!existingPublishing) {
          await tx.execute(`INSERT INTO publishing (topic_id, platform, url, status, publish_time, operator_id) VALUES (?, ?, ?, ?, ?, ?)`, [
            id, '', '', 'pending', null, operatorId
          ]);
        }
      }
    });

    const assignees = await queryAll(`SELECT id FROM users WHERE id = ? OR id = ?`, [topic.creator_id, topic.assignee_id]);
    for (const user of assignees) {
      createMessage(
        Number(user.id),
        '状态变更通知',
        `选题「${topic.title}」的状态已变更为${STATUS_TEXT[status]}`,
        'info',
        `/topics/${id}`
      );
    }

    sendSuccess(res, null, '状态更新成功');
  } catch (error) {
    sendServerError(res, '更新状态失败');
  }
});

export default router;

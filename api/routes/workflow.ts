﻿﻿﻿﻿﻿﻿﻿﻿import express from 'express';
import { beijingNow, beijingToday, queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { canAccessTopic, getTopicScopeById, getTopicScopeByProductionId, getTopicScopeByPublishingId, getTopicScopeByShootingId, isPrivilegedUser, resolveCommentTopicScope } from '../utils/access';
import { syncPublishedArchive } from '../services/publishedArchive';
import { buildWorkflowRuntimeContext } from '@shared/workflow/workflow_runtime';
import { broadcastToRoom } from '../utils/socket';

const router = express.Router();

type VersionAction = 'minor' | 'major' | 'none';

type VersionParts = {
  major: number;
  minor: number;
};

type VersionRow = {
  id?: number | string | null;
  version?: string | null;
  created_at?: string | null;
};

function parseVersionParts(version: string | undefined): VersionParts | null {
  const normalized = String(version || 'v1.0');
  const match = normalized.match(/^v?(\d+)\.(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
  };
}

function formatVersion(parts: VersionParts): string {
  return `v${parts.major}.${parts.minor}`;
}

function isNewerVersionRow<T extends VersionRow>(
  candidate: T,
  candidateParts: VersionParts,
  existing: T,
  existingParts: VersionParts,
): boolean {
  if (candidateParts.minor !== existingParts.minor) {
    return candidateParts.minor > existingParts.minor;
  }

  const candidateTime = candidate.created_at ? new Date(candidate.created_at).getTime() : 0;
  const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;

  if (candidateTime !== existingTime) {
    return candidateTime > existingTime;
  }

  return Number(candidate.id || 0) > Number(existing.id || 0);
}

function getLatestHistoryRowsByMajor<T extends VersionRow>(
  historyRows: T[],
  currentVersion?: string,
): T[] {
  const latestByMajor = new Map<number, { row: T; parts: VersionParts }>();
  const currentParts = parseVersionParts(currentVersion);

  for (const row of historyRows) {
    const parts = parseVersionParts(row.version || undefined);

    if (!parts) {
      continue;
    }

    if (currentParts?.major === parts.major && currentParts.minor >= parts.minor) {
      continue;
    }

    const existing = latestByMajor.get(parts.major);

    if (!existing || isNewerVersionRow(row, parts, existing.row, existing.parts)) {
      latestByMajor.set(parts.major, { row, parts });
    }
  }

  return Array.from(latestByMajor.values())
    .sort((a, b) => {
      if (a.parts.major !== b.parts.major) {
        return b.parts.major - a.parts.major;
      }

      return b.parts.minor - a.parts.minor;
    })
    .map(({ row }) => row);
}

function getNextVersion(
  currentVersion: string | undefined,
  versionAction: VersionAction,
  versions: Array<{ version?: string | null }>,
): string {
  const parsedVersions = versions
    .map((row) => parseVersionParts(row.version || undefined))
    .filter((parts): parts is VersionParts => Boolean(parts));
  const currentParts = parseVersionParts(currentVersion) || { major: 1, minor: 0 };

  if (versionAction === 'none') {
    return formatVersion(currentParts);
  }

  if (versionAction === 'major') {
    const maxMajor = parsedVersions.reduce(
      (max, parts) => Math.max(max, parts.major),
      currentParts.major,
    );
    return formatVersion({ major: maxMajor + 1, minor: 0 });
  }

  if (versionAction === 'minor') {
    const maxMinorInCurrentMajor = parsedVersions.reduce(
      (max, parts) => (parts.major === currentParts.major ? Math.max(max, parts.minor) : max),
      currentParts.minor,
    );
    return formatVersion({ major: currentParts.major, minor: maxMinorInCurrentMajor + 1 });
  }

  return formatVersion(currentParts);
}

async function cleanupProductionHistoryToLatestMinor(productionId: string | number, currentVersion: string) {
  const historyRows = await queryAll<VersionRow>(
    `SELECT id, version, created_at FROM production_history WHERE production_id = ?`,
    [productionId],
  );
  const latestByMajor = new Map<number, { source: 'current' | 'history'; row?: VersionRow; parts: VersionParts }>();
  const currentParts = parseVersionParts(currentVersion);

  if (currentParts) {
    latestByMajor.set(currentParts.major, { source: 'current', parts: currentParts });
  }

  for (const row of historyRows) {
    const parts = parseVersionParts(row.version || undefined);

    if (!parts) {
      continue;
    }

    const existing = latestByMajor.get(parts.major);

    if (!existing) {
      latestByMajor.set(parts.major, { source: 'history', row, parts });
      continue;
    }

    const currentRow = existing.row || {};
    const shouldReplace =
      parts.minor > existing.parts.minor ||
      (parts.minor === existing.parts.minor &&
        existing.source !== 'current' &&
        isNewerVersionRow(row, parts, currentRow, existing.parts));

    if (shouldReplace) {
      latestByMajor.set(parts.major, { source: 'history', row, parts });
    }
  }

  const deleteIds = historyRows
    .filter((row) => {
      const parts = parseVersionParts(row.version || undefined);
      const latest = parts ? latestByMajor.get(parts.major) : null;

      if (!parts || !latest) {
        return false;
      }

      if (latest.source === 'current') {
        return parts.minor <= latest.parts.minor;
      }

      return parts.minor < latest.parts.minor || row.id !== latest.row?.id;
    })
    .map((row) => row.id)
    .filter((id): id is number | string => id !== null && id !== undefined);

  for (const historyId of deleteIds) {
    await execute(`DELETE FROM production_history WHERE id = ? AND production_id = ?`, [historyId, productionId]);
  }
}

router.get('/shadow-logs', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { topic_id, user_id, node_id } = req.query;
    let sql = `SELECT * FROM workflow_shadow_logs WHERE 1=1`;
    const params: unknown[] = [];

    if (topic_id) {
      sql += ` AND topic_id = ?`;
      params.push(topic_id);
    }

    if (user_id) {
      sql += ` AND user_id = ?`;
      params.push(user_id);
    }

    if (node_id) {
      sql += ` AND node_id = ?`;
      params.push(node_id);
    }

    sql += ` ORDER BY created_at DESC LIMIT 100`;

    res.json(await queryAll(sql, params));
  } catch (error) {
    res.status(500).json({ message: '获取 Workflow Shadow 日志失败', error });
  }
});

router.get('/shadow-analytics', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const transitions = await queryAll<{
      from_state: string | null;
      to_state: string | null;
      count: number;
    }>(
      `SELECT from_state, to_state, COUNT(*) as count
       FROM workflow_shadow_logs
       GROUP BY from_state, to_state
       ORDER BY count DESC`,
    );

    const nodeActivity = await queryAll<{
      node_id: number | null;
      count: number;
    }>(
      `SELECT node_id, COUNT(*) as count
       FROM workflow_shadow_logs
       WHERE node_id IS NOT NULL
       GROUP BY node_id
       ORDER BY count DESC`,
    );

    const approverDistribution = await queryAll<{
      user_id: number | null;
      count: number;
    }>(
      `SELECT user_id, COUNT(*) as count
       FROM workflow_shadow_logs
       WHERE user_id IS NOT NULL
       GROUP BY user_id
       ORDER BY count DESC`,
    );

    const nodeRiskRows = await queryAll<{
      node_id: number | null;
      transition_count: number;
      rejection_count: number;
      abnormal_pattern_count: number;
    }>(
      `SELECT
         node_id,
         COUNT(*) as transition_count,
         SUM(CASE WHEN action LIKE '%rejected%' THEN 1 ELSE 0 END) as rejection_count,
         SUM(CASE WHEN reason IS NOT NULL AND reason != '' AND reason NOT LIKE '%shadow mode - no enforcement%' THEN 1 ELSE 0 END) as abnormal_pattern_count
       FROM workflow_shadow_logs
       WHERE node_id IS NOT NULL
       GROUP BY node_id
       ORDER BY abnormal_pattern_count DESC, rejection_count DESC, transition_count DESC`,
    );

    const invalidPatterns = await queryAll<{
      reason: string | null;
      count: number;
    }>(
      `SELECT reason, COUNT(*) as count
       FROM workflow_shadow_logs
       WHERE reason IS NOT NULL
         AND reason != ''
         AND reason NOT LIKE '%shadow mode - no enforcement%'
       GROUP BY reason
       ORDER BY count DESC`,
    );

    res.json({
      transitionFrequency: transitions,
      heatmap: transitions.map((row) => ({
        from: row.from_state || 'unknown',
        to: row.to_state || 'unknown',
        count: Number(row.count || 0),
      })),
      nodeActivityRanking: nodeActivity,
      approverDistribution,
      mostFrequentTransitions: transitions.slice(0, 10),
      mostInvalidPatterns: invalidPatterns,
      nodeRiskScore: nodeRiskRows.map((row) => ({
        node_id: row.node_id,
        transition_count: Number(row.transition_count || 0),
        rejection_count: Number(row.rejection_count || 0),
        abnormal_pattern_count: Number(row.abnormal_pattern_count || 0),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: '获取 Workflow Shadow 分析失败', error });
  }
});

router.get('/shadow-decisions', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const logs = await queryAll<{
      node_id: number | null;
      from_state: string | null;
      to_state: string | null;
      action: string | null;
      reason: string | null;
    }>(
      `SELECT node_id, from_state, to_state, action, reason
       FROM workflow_shadow_logs
       ORDER BY created_at DESC
       LIMIT 500`,
    );

    res.json({
      decisions: logs.map((log) => {
        const runtimeContext = buildWorkflowRuntimeContext({
          from: log.from_state,
          to: log.to_state,
          node: { id: log.node_id || undefined, status_from: log.from_state, status_to: log.to_state },
          logs,
          source: 'runtime',
        });

        return {
          node_id: log.node_id,
          from_state: log.from_state || 'unknown',
          to_state: log.to_state || 'unknown',
          allowed: runtimeContext.allowed,
          shouldBlock: runtimeContext.strictBlocked,
          shouldWarn: runtimeContext.risk !== 'low',
          suggestedTransition: runtimeContext.suggestedTransition,
          confidence: runtimeContext.confidence,
          reason: runtimeContext.reason,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ message: '获取 Workflow Shadow 决策建议失败', error });
  }
});

router.get('/production', authenticate, async (req, res) => {
  try {
    const { topic_id } = req.query;
    let query = `SELECT p.*, p.content as contentMarkdown, p.content as contentJson, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM production p 
                 LEFT JOIN users u ON p.operator_id = u.id 
                 LEFT JOIN topics t ON p.topic_id = t.id WHERE 1=1`;
    const params: any[] = [];
    if (topic_id) { query += ` AND p.topic_id = ?`; params.push(topic_id); }
    if (!isPrivilegedUser(req.user)) {
      const userId = req.user!.id;
      query += ` AND (t.creator_id = ? OR t.assignee_id = ?)`;
      params.push(userId, userId);
    }
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
    const topic = await getTopicScopeById(topic_id);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限操作该选题的创作记录' });
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
    const topic = await getTopicScopeByProductionId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该创作记录' });
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
    const originalTopic = await getTopicScopeByProductionId(id);
    if (!canAccessTopic(req.user, originalTopic)) return res.status(403).json({ message: '无权限修改该创作记录' });
    const nextTopic = await getTopicScopeById(topic_id);
    if (!nextTopic) return res.status(404).json({ message: '选题不存在' });
    if (!canAccessTopic(req.user, nextTopic)) return res.status(403).json({ message: '无权限关联到目标选题' });

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
      resolvedVersionAction !== 'none' && (
        version_action === 'major' ||
        version_action === 'minor' ||
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

    const existingVersions = await queryAll<{ version: string | null }>(
      `SELECT version FROM production_history WHERE production_id = ?`,
      [id],
    );
    const newVersion =
      resolvedVersionAction === 'none'
        ? currentVersion
        : getNextVersion(currentVersion, resolvedVersionAction, [
            { version: currentVersion },
            ...existingVersions,
          ]);

    const contentMarkdown = req.body.contentMarkdown || content;
    const contentJson = req.body.contentJson || content;
    await execute(`UPDATE production SET topic_id = ?, version = ?, content = ?, content_markdown = ?, content_json = ?, status = ?, operator_id = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [topic_id, newVersion, content, contentMarkdown, contentJson, status, req.user?.id, id]);

    if (resolvedVersionAction !== 'none') {
      await cleanupProductionHistoryToLatestMinor(id, newVersion);
    }
    
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

router.delete('/production/:id', authenticate, requirePermission('production:delete'), async (req, res) => {
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
    const topic = await getTopicScopeByProductionId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该创作记录历史' });
    const production = await queryOne<{ version: string | null }>(
      `SELECT version FROM production WHERE id = ?`,
      [req.params.id],
    );
    const history = await queryAll(`SELECT ph.*, u.name as operator_name FROM production_history ph LEFT JOIN users u ON ph.operator_id = u.id WHERE ph.production_id = ? ORDER BY ph.created_at DESC`, [req.params.id]);
    res.json(getLatestHistoryRowsByMajor(history, production?.version || undefined));
  } catch (error) {
    res.status(500).json({ message: '获取版本历史失败', error });
  }
});

router.get('/shooting', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
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
    const topic = await getTopicScopeByShootingId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该成片制作记录' });

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

router.put('/shooting/:id', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
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

router.delete('/shooting/:id', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
  try {
    const shooting = await queryOne(`SELECT * FROM shooting WHERE id = ?`, [req.params.id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    await execute(`DELETE FROM shooting WHERE id = ?`, [req.params.id]);
    res.json({ message: '成片制作记录删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除成片制作记录失败', error });
  }
});

router.post('/shooting', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
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
    const topic = await getTopicScopeByPublishingId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该发布记录' });

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

router.get('/publishing', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
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

router.post('/publishing', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
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
      await syncPublishedArchive(Number(topic_id), req.user?.id);
    }
    broadcastToRoom('publishing', 'publishing:created', { id: publishingId, topic_id: req.body.topic_id });
    res.json({ message: '发布记录添加成功', publishingId });
  } catch (error) {
    res.status(500).json({ message: '添加发布记录失败', error });
  }
});

router.put('/publishing/:id', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, url, status, publish_time, script_content, views, likes, shares, comments } = req.body;
    const existingPublishing = await queryOne<Record<string, unknown>>(`SELECT * FROM publishing WHERE id = ?`, [id]);
    if (!existingPublishing) {
      return res.status(404).json({ message: '发布记录不存在' });
    }

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

    const topicId = Number(existingPublishing.topic_id);

    if (views !== undefined || likes !== undefined || shares !== undefined || comments !== undefined || publish_time !== undefined) {
      const existingAnalytics = await queryOne<Record<string, unknown>>(`SELECT id FROM analytics WHERE topic_id = ?`, [topicId]);
      const resolvedDate = publish_time || beijingToday();
      const nextViews = Number(views || 0);
      const nextLikes = Number(likes || 0);
      const nextShares = Number(shares || 0);
      const nextComments = Number(comments || 0);

      if (existingAnalytics) {
        await execute(
          `UPDATE analytics SET views = ?, likes = ?, shares = ?, comments = ?, data_date = ? WHERE topic_id = ?`,
          [nextViews, nextLikes, nextShares, nextComments, resolvedDate, topicId],
        );
      } else {
        await execute(
          `INSERT INTO analytics (topic_id, views, likes, shares, comments, data_date) VALUES (?, ?, ?, ?, ?, ?)`,
          [topicId, nextViews, nextLikes, nextShares, nextComments, resolvedDate],
        );
      }
    }

    if (status === 'published') {
      const existingTopic = await queryOne<Record<string, unknown>>(`SELECT * FROM topics WHERE id = ?`, [topicId]);
      if (existingTopic && existingTopic.status !== 'completed') {
        await execute(`UPDATE topics SET status = 'completed' WHERE id = ?`, [topicId]);
        await execute(
          `INSERT INTO messages (user_id, title, content, type, created_at) VALUES (?, ?, ?, ?, ?)`,
          [req.user?.id, '发布完成', `选题?{existingTopic.title}」已发布完成`, 'success', beijingNow()],
        );
      }
      await syncPublishedArchive(topicId, req.user?.id);
    }

    broadcastToRoom('publishing', 'publishing:updated', { id: Number(req.params.id) });
    res.json({ message: '发布记录更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新发布记录失败', error });
  }
});

router.delete('/publishing/:id', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
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
    const topic = await resolveCommentTopicScope(target_type, target_id);
    if (!topic) return res.status(404).json({ message: '评论目标不存在或暂不支持' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该评论' });
    const comments = await queryAll(`SELECT c.*, u.name as operator_name FROM comments c LEFT JOIN users u ON c.operator_id = u.id WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.created_at DESC`, [target_type, target_id]);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: '获取评论失败', error });
  }
});

router.post('/comments', authenticate, requirePermission('workflow:comment'), async (req, res) => {
  try {
    const { target_type, target_id, content } = req.body;
    if (!target_type || !target_id || !content) return res.status(400).json({ message: '缺少必要参数' });
    const topic = await resolveCommentTopicScope(target_type, target_id);
    if (!topic) return res.status(404).json({ message: '评论目标不存在或暂不支持' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限评论该对象' });
    const commentId = await executeInsert(`INSERT INTO comments (target_type, target_id, content, operator_id) VALUES (?, ?, ?, ?)`, [target_type, target_id, content, req.user?.id]);
    res.json({ message: '评论添加成功', commentId });
  } catch (error) {
    res.status(500).json({ message: '添加评论失败', error });
  }
});

router.delete('/comments/:id', authenticate, requirePermission('comment:delete'), async (req, res) => {
  try {
    await execute(`DELETE FROM comments WHERE id = ?`, [req.params.id]);
    res.json({ message: '评论删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除评论失败', error });
  }
});

export default router;

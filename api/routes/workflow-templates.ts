import { Router } from 'express';
import { createHash } from 'node:crypto';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { beijingNow, execute, queryOne, queryAll, runInTransaction } from '../database/utils';
import { canAccessTopic, canApproveWorkflowNode, getTopicScopeById, getWorkflowNodeById, isPrivilegedUser } from '../utils/access';
import { WORKFLOW_ENGINE_MODE, getExplainability, runApprovalCheck } from '@shared/workflow/workflow_runtime';
import type { TopicStatus } from '@shared/types';
import { getTransitionText, STATUS_TEXT } from '../utils/workflow';
import { apiLogger } from '../observability/logger.js';
import { advancePublishingTopicIfResolved } from '../modules/topics/publishing-completion';
import { insertTopicOutlineOriginSnapshot } from '../modules/topics/production-origin-snapshot';
import { canTransitionTopicStatus } from '@shared/workflow/topic-state-machine';
import {
  createWorkflowTemplateBaseFingerprint,
  getWorkflowTemplateUpdateRequestStatus,
  WorkflowTemplateUpdateBaseConflictError,
  WorkflowTemplateUpdateRequestConflictError,
  WorkflowTemplateUpdateTargetMissingError,
  type WorkflowTemplateUpdatePayload,
  updateWorkflowTemplateWithRequest,
} from '../services/workflowTemplateUpdate';

const router = Router();
const APPROVAL_OUTCOMES = new Set(['approved', 'rejected']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/i;

function createTemplateRequestFingerprint(payload: { name: unknown; description: unknown; nodes: unknown }) {
  const nodes = Array.isArray(payload.nodes)
    ? payload.nodes.map((node) => {
      const value = node as Record<string, unknown>;
      return [
        value.name,
        value.status_from,
        value.status_to,
        value.approver_type || 'role',
        value.approver_value || '',
        value.is_required !== false,
      ];
    })
    : [];
  return createHash('sha256').update(JSON.stringify([
    payload.name,
    payload.description || '',
    nodes,
  ])).digest('hex');
}

function workflowNodesHaveValidTransitions(nodes: unknown[]): boolean {
  return nodes.every((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    const value = node as Record<string, unknown>;
    return canTransitionTopicStatus(value.status_from, value.status_to);
  });
}

type ApprovalTransaction = {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
  executeInsert(sql: string, params?: unknown[]): Promise<number>;
};

type ApprovalTopic = {
  id: number;
  status: string;
  title: string;
  outline?: string | null;
  outline_markdown?: string | null;
  outline_json?: string | null;
};

async function ensureApprovalStageRecord(
  tx: ApprovalTransaction,
  topic: ApprovalTopic,
  status: string,
  operatorId: number | undefined,
) {
  if (status === 'approved' || status === 'production') {
    const production = await tx.queryOne<{ id: number }>('SELECT id FROM production WHERE topic_id=? LIMIT 1', [topic.id]);
    if (!production) {
      const content = String(topic.outline || '');
      const productionId = await tx.executeInsert(
        `INSERT INTO production(topic_id,version,content,content_markdown,content_json,status,operator_id)
         VALUES(?,?,?,?,?,?,?)`,
        [topic.id, 'v1.0', content, String(topic.outline_markdown || content), String(topic.outline_json || content), 'draft', operatorId],
      );
      await insertTopicOutlineOriginSnapshot(tx, productionId, topic.id, content);
    }
  }

  if (status === 'shooting') {
    const shooting = await tx.queryOne<{ id: number }>('SELECT id FROM shooting WHERE topic_id=? LIMIT 1', [topic.id]);
    if (!shooting) {
      await tx.executeInsert(
        'INSERT INTO shooting(topic_id,status,operator_id) VALUES(?,?,?)',
        [topic.id, 'planned', operatorId],
      );
    }
  }

  if (status === 'publishing') {
    const publishing = await tx.queryOne<{ id: number }>('SELECT id FROM publishing WHERE topic_id=? LIMIT 1', [topic.id]);
    if (!publishing) {
      await tx.executeInsert(
        'INSERT INTO publishing(topic_id,platform,url,status,publish_time,operator_id) VALUES(?,?,?,?,?,?)',
        [topic.id, '', '', 'pending', null, operatorId],
      );
    }
  }
}

async function recordApprovalStageTransition(
  tx: ApprovalTransaction,
  topic: ApprovalTopic,
  toStatus: string,
  nodeName: string,
  operatorId: number | undefined,
  recordedAt = beijingNow(),
) {
  const fromLabel = STATUS_TEXT[topic.status as TopicStatus] || topic.status;
  const toLabel = STATUS_TEXT[toStatus as TopicStatus] || toStatus;
  const reason = getTransitionText(topic.status as TopicStatus, toStatus as TopicStatus);
  const comment = `审批流节点「${nodeName}」通过：${reason}，选题由「${fromLabel}」流转为「${toLabel}」`;
  const action = toStatus === 'approved' || toStatus === 'rejected' ? toStatus : `status_${toStatus}`;
  await tx.execute(
    'INSERT INTO topic_history(topic_id,action,comment,operator_id,created_at) VALUES(?,?,?,?,?)',
    [topic.id, action, comment, operatorId ?? null, recordedAt],
  );
  await tx.execute(
    'INSERT INTO activity_log(user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)',
    [operatorId ?? null, 'status_change', 'topic', `选题「${topic.title}」${comment}`, recordedAt],
  );
}

router.get('/', authenticate, async (req, res) => {
  try {
    const templates = await queryAll(`
      SELECT wt.*,
        (SELECT COUNT(*) FROM workflow_nodes WHERE template_id = wt.id) as node_count,
        (SELECT COUNT(*) FROM topics WHERE workflow_template_id = wt.id) as topic_count,
        u.name as creator_name
      FROM workflow_templates wt
      LEFT JOIN users u ON wt.creator_id = u.id
      ORDER BY wt.is_default DESC, wt.created_at DESC
    `);

    res.json(templates);
  } catch {
    res.status(500).json({ message: '获取审批流模板失败' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const template = await queryOne(`
      SELECT wt.*, u.name as creator_name
      FROM workflow_templates wt
      LEFT JOIN users u ON wt.creator_id = u.id
      WHERE wt.id = ?
    `, [req.params.id]);

    if (!template) {
      return res.status(404).json({ message: '审批流模板不存在' });
    }

    const nodes = await queryAll(`
      SELECT * FROM workflow_nodes
      WHERE template_id = ?
      ORDER BY node_order,id
    `, [req.params.id]);

    const snapshot = {
      name: String((template as { name?: unknown }).name || ''),
      description: (template as { description?: string | null }).description || '',
      nodes: nodes.map((node) => {
        const storedNode = node as {
          name: string;
          status_from: string;
          status_to: string;
          approver_type?: string | null;
          approver_value?: string | null;
          is_required?: boolean | number | null;
        };
        return { ...storedNode, is_required: Boolean(storedNode.is_required) };
      }),
    };
    res.json({ ...template, nodes, base_fingerprint: createWorkflowTemplateBaseFingerprint(snapshot) });
  } catch {
    res.status(500).json({ message: '获取审批流模板失败' });
  }
});

router.get('/create-requests/:requestId', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authenticate, async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ message: '审批流模板请求编号无效' });
    const rawFingerprint = req.query.fingerprint;
    if (typeof rawFingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(rawFingerprint)) {
      return res.status(400).json({ message: '审批流模板载荷指纹无效' });
    }
    const fingerprint = rawFingerprint.toLowerCase();

    const request = await queryOne<{ template_id: number; actor_id: number; request_fingerprint: string }>(
      `SELECT template_id,actor_id,request_fingerprint FROM workflow_template_create_request_keys WHERE client_request_id=?`,
      [requestId],
    );
    if (!request || Number(request.actor_id) !== Number(req.user?.id)) {
      return res.status(404).json({ message: '尚未找到对应审批流模板' });
    }
    if (request.request_fingerprint !== fingerprint) {
      return res.status(409).json({
        message: '请求编号对应的模板内容与当前载荷不一致，请核实原请求状态。',
        code: 'WORKFLOW_TEMPLATE_CREATE_REQUEST_CONFLICT',
      });
    }

    const template = await queryOne<{ id: number }>(
      'SELECT id FROM workflow_templates WHERE id=?',
      [request.template_id],
    );
    if (!template) return res.status(410).json({ deleted: true, message: '对应审批流模板已删除' });
    return res.json({ templateId: Number(template.id) });
  } catch {
    return res.status(500).json({ message: '核实审批流模板创建状态失败' });
  }
});

router.get('/:id/update-requests/:requestId', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authenticate, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isSafeInteger(templateId) || templateId <= 0) return res.status(400).json({ message: '审批流模板 ID 无效' });
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ message: '审批流模板更新请求编号无效' });
    const rawFingerprint = req.query.fingerprint;
    if (typeof rawFingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(rawFingerprint)) {
      return res.status(400).json({ message: '审批流模板载荷指纹无效' });
    }
    const status = await getWorkflowTemplateUpdateRequestStatus(
      Number(req.user?.id), templateId, requestId, rawFingerprint,
    );
    return res.json(status);
  } catch (error) {
    if (error instanceof WorkflowTemplateUpdateRequestConflictError) {
      return res.status(409).json({
        message: '请求编号对应的模板更新内容与当前载荷不一致，请核实原请求状态。',
        code: 'WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT',
      });
    }
    return res.status(500).json({ message: '核实审批流模板更新状态失败' });
  }
});

router.post('/', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { name, description, nodes } = req.body;
    const userId = req.user?.id;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';

    if (rawClientRequestId !== undefined && (typeof rawClientRequestId !== 'string' || !UUID_PATTERN.test(clientRequestId))) {
      return res.status(400).json({ message: '审批流模板请求编号无效' });
    }

    if (!name) {
      return res.status(400).json({ message: '模板名称必填' });
    }
    if (Array.isArray(nodes) && !workflowNodesHaveValidTransitions(nodes)) {
      return res.status(400).json({ message: '审批节点必须使用有效的选题状态转换' });
    }

    const requestFingerprint = clientRequestId
      ? createTemplateRequestFingerprint({ name, description, nodes })
      : '';
    const creation = await runInTransaction(async (tx) => {
      if (clientRequestId) {
        const existing = await tx.queryOne<{
          template_id: number;
          actor_id: number;
          request_fingerprint: string;
        }>(
          `SELECT template_id,actor_id,request_fingerprint FROM workflow_template_create_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existing) {
          if (Number(existing.actor_id) !== Number(userId) || existing.request_fingerprint !== requestFingerprint) {
            return { conflict: true as const };
          }
          const existingTemplate = await tx.queryOne<{ id: number }>(
            'SELECT id FROM workflow_templates WHERE id=?',
            [existing.template_id],
          );
          return existingTemplate
            ? { ok: true as const, id: Number(existingTemplate.id), replayed: true }
            : { deleted: true as const };
        }
      }

      const createdTemplateId = await tx.executeInsert(
        `INSERT INTO workflow_templates (name, description, creator_id) VALUES (?, ?, ?)`,
        [name, description || '', userId]
      );

      if (nodes && Array.isArray(nodes)) {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          await tx.execute(
            `INSERT INTO workflow_nodes (template_id, name, node_order, status_from, status_to, approver_type, approver_value, is_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [createdTemplateId, node.name, i + 1, node.status_from, node.status_to, node.approver_type || 'role', node.approver_value || '', node.is_required !== false ? 1 : 0]
          );
        }
      }

      if (clientRequestId) {
        await tx.execute(
          `INSERT INTO workflow_template_create_request_keys(client_request_id,actor_id,template_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, Number(userId), createdTemplateId, requestFingerprint, beijingNow()],
        );
      }

      return { ok: true as const, id: createdTemplateId, replayed: false };
    });

    if ('conflict' in creation) {
      return res.status(409).json({ message: '审批流模板请求编号已用于其他账号或内容，请先核实原请求状态。', code: 'WORKFLOW_TEMPLATE_CREATE_REQUEST_CONFLICT' });
    }
    if ('deleted' in creation) {
      return res.status(410).json({ message: '该请求对应的审批流模板已删除，不会因为重试而重新创建。', deleted: true });
    }

    res.json({
      message: '审批流模板创建成功',
      id: creation.id,
      ...(clientRequestId ? { idempotent_replay: creation.replayed } : {}),
    });
  } catch {
    res.status(500).json({ message: '创建审批流模板失败' });
  }
});

router.put('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { name, description, nodes } = req.body;
    const templateId = req.params.id;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';

    if (rawClientRequestId !== undefined && (typeof rawClientRequestId !== 'string' || !UUID_PATTERN.test(clientRequestId))) {
      return res.status(400).json({ message: '审批流模板更新请求编号无效' });
    }

    if (clientRequestId) {
      const numericTemplateId = Number(templateId);
      if (!Number.isSafeInteger(numericTemplateId) || numericTemplateId <= 0) {
        return res.status(400).json({ message: '审批流模板 ID 无效' });
      }
      if (typeof name !== 'string' || !name.trim() || typeof description !== 'string' || !Array.isArray(nodes)) {
        return res.status(400).json({ message: '审批流模板更新需要完整的名称、说明和节点列表' });
      }
      if (!workflowNodesHaveValidTransitions(nodes)) {
        return res.status(400).json({ message: '审批节点必须使用有效的选题状态转换' });
      }
      const rawBaseFingerprint = req.body?.base_fingerprint;
      if (typeof rawBaseFingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(rawBaseFingerprint)) {
        return res.status(400).json({ message: '原审批流模板指纹无效' });
      }
      const payload: WorkflowTemplateUpdatePayload = { name, description, nodes: nodes as WorkflowTemplateUpdatePayload['nodes'] };
      try {
        const updated = await updateWorkflowTemplateWithRequest(
          numericTemplateId, Number(req.user!.id), payload, clientRequestId, rawBaseFingerprint,
        );
        return res.json({
          message: '审批流模板更新成功',
          idempotent_replay: updated.replayed,
        });
      } catch (error) {
        if (error instanceof WorkflowTemplateUpdateBaseConflictError) {
          return res.status(409).json({
            message: '审批流模板已被其他操作修改，请刷新模板后再保存。',
            code: 'WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT',
            base_fingerprint: error.currentFingerprint,
          });
        }
        if (error instanceof WorkflowTemplateUpdateRequestConflictError) {
          return res.status(409).json({
            message: '审批流模板更新请求编号已用于其他账号、模板或内容，请先核实原请求状态。',
            code: 'WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT',
          });
        }
        if (error instanceof WorkflowTemplateUpdateTargetMissingError) {
          return res.status(404).json({ message: '审批流模板不存在' });
        }
        throw error;
      }
    }

    const template = await queryOne(`SELECT * FROM workflow_templates WHERE id = ?`, [templateId]);
    if (!template) {
      return res.status(404).json({ message: '审批流模板不存在' });
    }
    if (Array.isArray(nodes) && !workflowNodesHaveValidTransitions(nodes)) {
      return res.status(400).json({ message: '审批节点必须使用有效的选题状态转换' });
    }

    await runInTransaction(async (tx) => {
      if (name) {
        await tx.execute(
          `UPDATE workflow_templates SET name = ?, description = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
          [name, description || '', templateId]
        );
      }

      if (nodes && Array.isArray(nodes)) {
        await tx.execute(`DELETE FROM workflow_nodes WHERE template_id = ?`, [templateId]);

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          await tx.execute(
            `INSERT INTO workflow_nodes (template_id, name, node_order, status_from, status_to, approver_type, approver_value, is_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [templateId, node.name, i + 1, node.status_from, node.status_to, node.approver_type || 'role', node.approver_value || '', node.is_required !== false ? 1 : 0]
          );
        }
      }
    });

    res.json({ message: '审批流模板更新成功' });
  } catch {
    res.status(500).json({ message: '更新审批流模板失败' });
  }
});

router.delete('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const templateId = req.params.id;

    const template = await queryOne(`SELECT * FROM workflow_templates WHERE id = ?`, [templateId]);
    if (!template) {
      return res.status(404).json({ message: '审批流模板不存在' });
    }

    if ((template as Record<string, unknown>).is_default) {
      return res.status(400).json({ message: '默认审批流模板不可删除' });
    }

    const topicCount = await queryOne(`SELECT COUNT(*) as count FROM topics WHERE workflow_template_id = ?`, [templateId]);
    if (topicCount && Number((topicCount as Record<string, unknown>).count) > 0) {
      return res.status(400).json({ message: `该模板被 ${(topicCount as Record<string, unknown>).count} 个选题使用，请先移除` });
    }

    await runInTransaction(async (tx) => {
      await tx.execute(`DELETE FROM workflow_nodes WHERE template_id = ?`, [templateId]);
      await tx.execute(`DELETE FROM workflow_templates WHERE id = ?`, [templateId]);
    });

    res.json({ message: '审批流模板删除成功' });
  } catch {
    res.status(500).json({ message: '删除审批流模板失败' });
  }
});

router.get('/topic/:topicId/records', authenticate, async (req, res) => {
  try {
    const topic = await getTopicScopeById(req.params.topicId);
    if (!topic) {
      return res.status(404).json({ message: '选题不存在' });
    }
    if (!canAccessTopic(req.user, topic)) {
      return res.status(403).json({ message: '无权限查看该审批记录' });
    }

    const records = await queryAll(`
      SELECT ar.*, wn.name as node_name, u.name as approver_name
      FROM approval_records ar
      JOIN workflow_nodes wn ON ar.node_id = wn.id
      LEFT JOIN users u ON ar.approver_id = u.id
      WHERE ar.topic_id = ?
      ORDER BY ar.created_at DESC
    `, [req.params.topicId]);

    res.json(records);
  } catch {
    res.status(500).json({ message: '获取审批记录失败' });
  }
});

router.post('/topic/:topicId/approve', authenticate, async (req, res) => {
  try {
    const { node_id, status, comment } = req.body;
    const topicId = req.params.topicId;
    const approverId = req.user?.id;

    if (!node_id || status === undefined || status === null || status === '') {
      return res.status(400).json({ message: '节点ID和状态必填' });
    }
    if (typeof status !== 'string' || !APPROVAL_OUTCOMES.has(status)) {
      return res.status(400).json({ message: '审批结果无效' });
    }

    const topic = await getTopicScopeById(topicId);
    if (!topic) {
      return res.status(404).json({ message: '选题不存在' });
    }

    const node = await getWorkflowNodeById(node_id);
    if (!node) {
      return res.status(404).json({ message: '审批节点不存在' });
    }

    if (!isPrivilegedUser(req.user) && !canAccessTopic(req.user, topic)) {
      return res.status(403).json({ message: '无权限审批该选题' });
    }

    const canApprove = await canApproveWorkflowNode(req.user, topicId, node_id);
    if (!canApprove) {
      return res.status(403).json({ message: '当前用户不是该节点的合法审批人' });
    }

    if (topic.workflow_template_id && node.template_id && Number(topic.workflow_template_id) !== Number(node.template_id)) {
      return res.status(400).json({ message: '审批节点不属于当前选题绑定的审批流模板' });
    }

    if (node.status_from && node.status_from !== String(topic.status || '')) {
      return res.status(400).json({ message: '当前选题状态与审批节点不匹配' });
    }

    const recentShadowLogs = await queryAll<{
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
    const initialRuntimeApproval = runApprovalCheck({
      from: String(topic.status || ''),
      to: String(node.status_to || ''),
      user: req.user,
      source: 'runtime',
      topic,
      node,
      logs: recentShadowLogs,
    });

    const shadowReason = initialRuntimeApproval.allowed ? null : [
      initialRuntimeApproval.transition.reason,
      initialRuntimeApproval.approve.reason,
    ].filter(Boolean).join(' | ');

    try {
      await execute(
        `INSERT INTO workflow_shadow_logs (topic_id, node_id, from_state, to_state, user_id, action, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          topicId,
          node_id,
          topic.status || null,
          node.status_to || null,
          approverId || null,
          `${WORKFLOW_ENGINE_MODE}:${status}`,
          shadowReason || null,
        ],
      );
    } catch (shadowError) {
      apiLogger.warn({
        module: 'workflow',
        operation: 'shadow_log.persist_failed',
        error: { code: 'SHADOW_LOG_FAILED', name: shadowError instanceof Error ? shadowError.name : 'UnknownError' },
      }, 'api.workflow.shadow_log_failed');
    }

    const runtimeApproval = initialRuntimeApproval;
    const explainability = getExplainability({
      from: String(topic.status || ''),
      to: String(node.status_to || ''),
      user: req.user,
      source: 'runtime',
      topic,
      node,
      logs: recentShadowLogs,
    });

    if (!runtimeApproval.decision.allowed) {
      apiLogger.warn({
        module: 'workflow',
        operation: 'decision.denied',
        mode: WORKFLOW_ENGINE_MODE,
        decision: { allowed: false },
      }, 'api.workflow.decision_denied');
    }

    if (WORKFLOW_ENGINE_MODE === 'v2_strict' && runtimeApproval.strictBlocked) {
      const strictReason = runtimeApproval.reason;

      try {
        await execute(
          `INSERT INTO workflow_shadow_logs (topic_id, node_id, from_state, to_state, user_id, action, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            topicId,
            node_id,
            topic.status || null,
            node.status_to || null,
            approverId || null,
            `${WORKFLOW_ENGINE_MODE}:blocked:${status}`,
            strictReason || 'strict mode - blocked by workflow policy',
          ],
        );
      } catch (shadowError) {
        apiLogger.warn({
          module: 'workflow',
          operation: 'strict_shadow_log.persist_failed',
          error: { code: 'SHADOW_LOG_FAILED', name: shadowError instanceof Error ? shadowError.name : 'UnknownError' },
        }, 'api.workflow.shadow_log_failed');
      }

      return res.status(400).json({
        message: 'Workflow policy rejected this approval action',
        workflowDecision: {
          mode: WORKFLOW_ENGINE_MODE,
          allowed: false,
          reason: strictReason || 'strict mode - blocked by workflow policy',
          transition: runtimeApproval.transition,
          approve: runtimeApproval.approve,
          decision: runtimeApproval.decision || null,
        },
        explainability,
      });
    }

    const transition = await runInTransaction(async (tx) => {
      const targetStatus = String(node.status_to || '');
      const currentTopic = await tx.queryOne<ApprovalTopic>(
        'SELECT id,status,title,outline,outline_markdown,outline_json FROM topics WHERE id=?',
        [topicId],
      );
      if (!currentTopic || currentTopic.status !== topic.status
        || (node.status_from && node.status_from !== currentTopic.status)) {
        return { ok: false as const, reason: 'stale-stage' as const };
      }

      if (status === 'approved' && targetStatus === 'completed') {
        const completed = await advancePublishingTopicIfResolved(tx, topicId, approverId);
        if (!completed) return { ok: false as const, reason: 'publishing-unresolved' as const };
      } else if (status === 'approved') {
        if (currentTopic.status !== targetStatus) {
          const recordedAt = beijingNow();
          const changed = await tx.execute(
            `UPDATE topics SET status = ?, stage_entered_at = ?, updated_at = ? WHERE id = ? AND status = ?`,
            [targetStatus, recordedAt, recordedAt, topicId, currentTopic.status],
          );
          if (changed === 0) return { ok: false as const, reason: 'stale-stage' as const };
          await recordApprovalStageTransition(tx, currentTopic, targetStatus, node.name || String(node_id), approverId, recordedAt);
        }
        await ensureApprovalStageRecord(tx, currentTopic, targetStatus, approverId);
        if (targetStatus === 'publishing') {
          await advancePublishingTopicIfResolved(tx, topicId, approverId);
        }
      }

      await tx.execute(
        `INSERT INTO approval_records (topic_id, node_id, approver_id, status, comment) VALUES (?, ?, ?, ?, ?)`,
        [topicId, node_id, approverId, status, comment || '']
      );
      return { ok: true as const };
    });

    if (!transition.ok) {
      return res.status(409).json({
        message: transition.reason === 'stale-stage'
          ? '选题阶段已发生变化，请刷新后重新审批'
          : '仍有发布任务待处理，暂不能完成选题',
      });
    }

    res.json({
      message: '审批操作成功',
      workflowDecision: runtimeApproval.decision.suggestedTransition && runtimeApproval.decision.confidence > 0.8
        ? {
            mode: WORKFLOW_ENGINE_MODE,
            suggestedTransition: runtimeApproval.decision.suggestedTransition,
            confidence: runtimeApproval.decision.confidence,
            reason: runtimeApproval.decision.reason,
          }
        : undefined,
      explainability,
    });
  } catch {
    res.status(500).json({ message: '审批操作失败' });
  }
});

export default router;

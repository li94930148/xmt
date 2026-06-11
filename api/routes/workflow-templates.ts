import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';

const router = Router();

// 获取所有审批流模板
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
  } catch (error) {
    res.status(500).json({ message: '获取审批流模板失败', error });
  }
});

// 获取单个审批流模板（含节点）
router.get('/:id', authenticate, async (req, res) => {
  try {
    const template = await queryOne(`
      SELECT wt.*, u.name as creator_name
      FROM workflow_templates wt
      LEFT JOIN users u ON wt.creator_id = u.id
      WHERE wt.id = ?
    `, [req.params.id]);

    if (!template) return res.status(404).json({ message: '审批流模板不存在' });

    const nodes = await queryAll(`
      SELECT * FROM workflow_nodes
      WHERE template_id = ?
      ORDER BY node_order
    `, [req.params.id]);

    res.json({ ...template, nodes });
  } catch (error) {
    res.status(500).json({ message: '获取审批流模板失败', error });
  }
});

// 创建审批流模板
router.post('/', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { name, description, nodes } = req.body;
    const userId = req.user?.id;

    if (!name) {
      return res.status(400).json({ message: '模板名称必填' });
    }

    const templateId = await executeInsert(
      `INSERT INTO workflow_templates (name, description, creator_id) VALUES (?, ?, ?)`,
      [name, description || '', userId]
    );

    // 创建审批节点
    if (nodes && Array.isArray(nodes)) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        await execute(
          `INSERT INTO workflow_nodes (template_id, name, node_order, status_from, status_to, approver_type, approver_value, is_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [templateId, node.name, i + 1, node.status_from, node.status_to, node.approver_type || 'role', node.approver_value || '', node.is_required !== false ? 1 : 0]
        );
      }
    }

    res.json({ message: '审批流模板创建成功', id: templateId });
  } catch (error) {
    res.status(500).json({ message: '创建审批流模板失败', error });
  }
});

// 更新审批流模板
router.put('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { name, description, nodes } = req.body;
    const templateId = req.params.id;

    const template = await queryOne(`SELECT * FROM workflow_templates WHERE id = ?`, [templateId]);
    if (!template) return res.status(404).json({ message: '审批流模板不存在' });

    if (name) {
      await execute(
        `UPDATE workflow_templates SET name = ?, description = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        [name, description || '', templateId]
      );
    }

    // 更新节点
    if (nodes && Array.isArray(nodes)) {
      // 删除旧节点
      await execute(`DELETE FROM workflow_nodes WHERE template_id = ?`, [templateId]);

      // 创建新节点
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        await execute(
          `INSERT INTO workflow_nodes (template_id, name, node_order, status_from, status_to, approver_type, approver_value, is_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [templateId, node.name, i + 1, node.status_from, node.status_to, node.approver_type || 'role', node.approver_value || '', node.is_required !== false ? 1 : 0]
        );
      }
    }

    res.json({ message: '审批流模板更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新审批流模板失败', error });
  }
});

// 删除审批流模板
router.delete('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const templateId = req.params.id;

    const template = await queryOne(`SELECT * FROM workflow_templates WHERE id = ?`, [templateId]);
    if (!template) return res.status(404).json({ message: '审批流模板不存在' });

    if (template.is_default) {
      return res.status(400).json({ message: '默认审批流模板不可删除' });
    }

    // 检查是否有选题使用此模板
    const topicCount = await queryOne(`SELECT COUNT(*) as count FROM topics WHERE workflow_template_id = ?`, [templateId]);
    if (topicCount && Number(topicCount.count) > 0) {
      return res.status(400).json({ message: `该模板被 ${topicCount.count} 个选题使用，请先移除` });
    }

    await execute(`DELETE FROM workflow_nodes WHERE template_id = ?`, [templateId]);
    await execute(`DELETE FROM workflow_templates WHERE id = ?`, [templateId]);

    res.json({ message: '审批流模板删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除审批流模板失败', error });
  }
});

// 获取选题的审批记录
router.get('/topic/:topicId/records', authenticate, async (req, res) => {
  try {
    const records = await queryAll(`
      SELECT ar.*, wn.name as node_name, u.name as approver_name
      FROM approval_records ar
      JOIN workflow_nodes wn ON ar.node_id = wn.id
      LEFT JOIN users u ON ar.approver_id = u.id
      WHERE ar.topic_id = ?
      ORDER BY ar.created_at DESC
    `, [req.params.topicId]);

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: '获取审批记录失败', error });
  }
});

// 提交审批
router.post('/topic/:topicId/approve', authenticate, async (req, res) => {
  try {
    const { node_id, status, comment } = req.body;
    const topicId = req.params.topicId;
    const approverId = req.user?.id;

    if (!node_id || !status) {
      return res.status(400).json({ message: '节点ID和状态必填' });
    }

    // 验证节点存在
    const node = await queryOne(`SELECT * FROM workflow_nodes WHERE id = ?`, [node_id]);
    if (!node) return res.status(404).json({ message: '审批节点不存在' });

    // 记录审批
    await execute(
      `INSERT INTO approval_records (topic_id, node_id, approver_id, status, comment) VALUES (?, ?, ?, ?, ?)`,
      [topicId, node_id, approverId, status, comment || '']
    );

    // 如果审批通过，更新选题状态
    if (status === 'approved') {
      await execute(
        `UPDATE topics SET status = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        [node.status_to, topicId]
      );
    }

    res.json({ message: '审批操作成功' });
  } catch (error) {
    res.status(500).json({ message: '审批操作失败', error });
  }
});

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { queryOne, queryAll, runInTransaction } from '../database/utils';

const router = Router();

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
      ORDER BY node_order
    `, [req.params.id]);

    res.json({ ...template, nodes });
  } catch (error) {
    res.status(500).json({ message: '获取审批流模板失败', error });
  }
});

router.post('/', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { name, description, nodes } = req.body;
    const userId = req.user?.id;

    if (!name) {
      return res.status(400).json({ message: '模板名称必填' });
    }

    const templateId = await runInTransaction(async (tx) => {
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

      return createdTemplateId;
    });

    res.json({ message: '审批流模板创建成功', id: templateId });
  } catch (error) {
    res.status(500).json({ message: '创建审批流模板失败', error });
  }
});

router.put('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { name, description, nodes } = req.body;
    const templateId = req.params.id;

    const template = await queryOne(`SELECT * FROM workflow_templates WHERE id = ?`, [templateId]);
    if (!template) {
      return res.status(404).json({ message: '审批流模板不存在' });
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
  } catch (error) {
    res.status(500).json({ message: '更新审批流模板失败', error });
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
  } catch (error) {
    res.status(500).json({ message: '删除审批流模板失败', error });
  }
});

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

router.post('/topic/:topicId/approve', authenticate, async (req, res) => {
  try {
    const { node_id, status, comment } = req.body;
    const topicId = req.params.topicId;
    const approverId = req.user?.id;

    if (!node_id || !status) {
      return res.status(400).json({ message: '节点ID和状态必填' });
    }

    const node = await queryOne(`SELECT * FROM workflow_nodes WHERE id = ?`, [node_id]);
    if (!node) {
      return res.status(404).json({ message: '审批节点不存在' });
    }

    await runInTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO approval_records (topic_id, node_id, approver_id, status, comment) VALUES (?, ?, ?, ?, ?)`,
        [topicId, node_id, approverId, status, comment || '']
      );

      if (status === 'approved') {
        const nodeRecord = node as Record<string, unknown>;
        await tx.execute(
          `UPDATE topics SET status = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
          [nodeRecord.status_to, topicId]
        );
      }
    });

    res.json({ message: '审批操作成功' });
  } catch (error) {
    res.status(500).json({ message: '审批操作失败', error });
  }
});

export default router;

import express from 'express';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate, requireRole } from '../middleware/auth';

const router = express.Router();

// GET / - 获取模板列表
router.get('/', authenticate, async (req, res) => {
  try {
    const templates = await queryAll(`
      SELECT t.*, u.name as creator_name
      FROM topic_templates t
      LEFT JOIN users u ON t.creator_id = u.id
      ORDER BY t.is_default DESC, t.created_at DESC
    `);

    res.json({ data: templates });
  } catch (error) {
    res.status(500).json({ message: '获取模板列表失败', error });
  }
});

// POST / - 创建模板
router.post('/', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { name, platform, description, template_data, is_default } = req.body;
    const userId = req.user?.id;

    if (!name) {
      return res.status(400).json({ message: '模板名称不能为空' });
    }

    const templateDataStr = typeof template_data === 'object' ? JSON.stringify(template_data) : template_data;

    const templateId = await executeInsert(
      `INSERT INTO topic_templates (name, platform, description, template_data, creator_id, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, platform, description, templateDataStr, userId, is_default ? 1 : 0]
    );

    res.json({ message: '模板创建成功', id: templateId });
  } catch (error) {
    res.status(500).json({ message: '创建模板失败', error });
  }
});

// PUT /:id - 更新模板
router.put('/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, platform, description, template_data, is_default } = req.body;

    const template = await queryOne(`SELECT * FROM topic_templates WHERE id = ?`, [id]);
    if (!template) {
      return res.status(404).json({ message: '模板不存在' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push('name = '); params.push(name); }
    if (platform !== undefined) { updates.push('platform = '); params.push(platform); }
    if (description !== undefined) { updates.push('description = '); params.push(description); }
    if (template_data !== undefined) {
      const templateDataStr = typeof template_data === 'object' ? JSON.stringify(template_data) : template_data;
      updates.push('template_data = ');
      params.push(templateDataStr);
    }
    if (is_default !== undefined) { updates.push('is_default = '); params.push(is_default ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now', '+8 hours')");
    params.push(id);

    await execute(`UPDATE topic_templates SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: '模板更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新模板失败', error });
  }
});

// DELETE /:id - 删除模板
router.delete('/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { id } = req.params;

    const template = await queryOne(`SELECT * FROM topic_templates WHERE id = ?`, [id]);
    if (!template) {
      return res.status(404).json({ message: '模板不存在' });
    }

    await execute(`DELETE FROM topic_templates WHERE id = ?`, [id]);

    res.json({ message: '模板删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除模板失败', error });
  }
});

export default router;

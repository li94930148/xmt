import express from 'express';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { sendSafeServerError } from '../utils/response';

const router = express.Router();

const textField = (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

function serializeTemplateData(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return null;
}

router.get('/', authenticate, async (req, res) => {
  try {
    const templates = await queryAll(`
      SELECT t.*, u.name as creator_name
      FROM topic_templates t
      LEFT JOIN users u ON t.creator_id = u.id
      ORDER BY t.is_default DESC, t.created_at DESC
    `);

    res.json({ data: templates });
  } catch (error) { sendSafeServerError(res, '获取模板列表失败', 'templates:list', error); }
});

router.post('/', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { template_data, is_default } = req.body;
    const name = textField(req.body?.name, 120);
    const platform = textField(req.body?.platform, 50);
    const description = textField(req.body?.description, 1000);
    const userId = req.user?.id;

    if (!name) {
      return res.status(400).json({ message: '模板名称不能为空' });
    }

    const templateDataStr = serializeTemplateData(template_data);
    if (templateDataStr === null || (typeof templateDataStr === 'string' && templateDataStr.length > 100_000)) {
      return res.status(400).json({ message: '模板内容格式不正确或过长' });
    }

    const templateId = await executeInsert(
      `INSERT INTO topic_templates (name, platform, description, template_data, creator_id, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, platform, description, templateDataStr, userId, is_default ? 1 : 0]
    );

    res.json({ message: '模板创建成功', id: templateId });
  } catch (error) { sendSafeServerError(res, '创建模板失败', 'templates:create', error); }
});

router.put('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { id } = req.params;
    const { template_data, is_default } = req.body;

    const template = await queryOne(`SELECT * FROM topic_templates WHERE id = ?`, [id]);
    if (!template) {
      return res.status(404).json({ message: '模板不存在' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (req.body?.name !== undefined) {
      const name = textField(req.body.name, 120);
      if (!name) return res.status(400).json({ message: '模板名称不能为空' });
      updates.push('name = ?');
      params.push(name);
    }
    if (req.body?.platform !== undefined) {
      updates.push('platform = ?');
      params.push(textField(req.body.platform, 50));
    }
    if (req.body?.description !== undefined) {
      updates.push('description = ?');
      params.push(textField(req.body.description, 1000));
    }
    if (template_data !== undefined) {
      const templateDataStr = serializeTemplateData(template_data);
      if (templateDataStr === null || templateDataStr === undefined || templateDataStr.length > 100_000) {
        return res.status(400).json({ message: '模板内容格式不正确或过长' });
      }
      updates.push('template_data = ?');
      params.push(templateDataStr);
    }
    if (is_default !== undefined) {
      updates.push('is_default = ?');
      params.push(is_default ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now', '+8 hours')");
    params.push(id);

    await execute(`UPDATE topic_templates SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: '模板更新成功' });
  } catch (error) { sendSafeServerError(res, '更新模板失败', 'templates:update', error); }
});

router.delete('/:id', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { id } = req.params;
    const template = await queryOne(`SELECT * FROM topic_templates WHERE id = ?`, [id]);

    if (!template) {
      return res.status(404).json({ message: '模板不存在' });
    }

    await execute(`DELETE FROM topic_templates WHERE id = ?`, [id]);
    res.json({ message: '模板删除成功' });
  } catch (error) { sendSafeServerError(res, '删除模板失败', 'templates:delete', error); }
});

export default router;

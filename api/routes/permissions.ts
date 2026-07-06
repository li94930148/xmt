import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { clearPermissionCache, requirePermission } from '../middleware/permissions';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';

const router = Router();

// 获取所有权限（按模块分组）
router.get('/', authenticate, requirePermission('system:permission'), async (req, res) => {
  try {
    const permissions = await queryAll(`SELECT * FROM permissions ORDER BY module, code`);

    // 按模块分组
    const grouped: Record<string, unknown[]> = {};
    for (const perm of permissions) {
      const module = String(perm.module || 'other');
      if (!grouped[module]) grouped[module] = [];
      grouped[module].push(perm);
    }

    res.json({ permissions, grouped });
  } catch (error) {
    res.status(500).json({ message: '获取权限列表失败', error });
  }
});

// 获取当前用户的权限列表
router.get('/my', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: '未登录' });

    const permissions = await queryAll(`
      SELECT DISTINCT p.code FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ?
    `, [userId]);

    res.json(permissions.map(p => p.code));
  } catch (error) {
    res.status(500).json({ message: '获取用户权限失败', error });
  }
});

// 创建权限
router.post('/', authenticate, requirePermission('system:permission'), async (req, res) => {
  try {
    const { code, name, module } = req.body;

    if (!code || !name || !module) {
      return res.status(400).json({ message: '权限编码、名称和模块必填' });
    }

    const existing = await queryOne(`SELECT id FROM permissions WHERE code = ?`, [code]);
    if (existing) {
      return res.status(400).json({ message: '权限编码已存在' });
    }

    const permId = await executeInsert(
      `INSERT INTO permissions (code, name, module) VALUES (?, ?, ?)`,
      [code, name, module]
    );

    clearPermissionCache();
    res.json({ message: '权限创建成功', id: permId });
  } catch (error) {
    res.status(500).json({ message: '创建权限失败', error });
  }
});

// 删除权限
router.delete('/:id', authenticate, requirePermission('system:permission'), async (req, res) => {
  try {
    const permId = req.params.id;

    // 检查是否有角色使用此权限
    const roleCount = await queryOne(`SELECT COUNT(*) as count FROM role_permissions WHERE permission_id = ?`, [permId]);
    if (roleCount && Number(roleCount.count) > 0) {
      return res.status(400).json({ message: `该权限被 ${roleCount.count} 个角色使用，请先移除` });
    }

    await execute(`DELETE FROM permissions WHERE id = ?`, [permId]);
    clearPermissionCache();
    res.json({ message: '权限删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除权限失败', error });
  }
});

export default router;

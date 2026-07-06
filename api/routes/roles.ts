import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { clearPermissionCache, requirePermission } from '../middleware/permissions';
import { queryOne, queryAll, execute, executeInsert, runInTransaction } from '../database/utils';

const router = Router();

router.get('/', authenticate, requirePermission('system:role'), async (_req, res) => {
  try {
    const roles = await queryAll(`
      SELECT r.*,
        (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id) as user_count,
        (SELECT COUNT(*) FROM role_permissions WHERE role_id = r.id) as permission_count
      FROM roles r ORDER BY r.id
    `);

    const rolesWithPermissions = [];
    for (const role of roles) {
      const permissions = await queryAll(`
        SELECT p.* FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = ?
        ORDER BY p.module, p.code
      `, [role.id]);
      rolesWithPermissions.push({ ...role, permissions });
    }

    res.json(rolesWithPermissions);
  } catch (error) {
    res.status(500).json({ message: '获取角色列表失败', error });
  }
});

router.get('/user/:userId', authenticate, requirePermission('system:role'), async (req, res) => {
  try {
    const roles = await queryAll(`
      SELECT r.* FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `, [req.params.userId]);

    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: '获取用户角色失败', error });
  }
});

router.post('/user/:userId', authenticate, requirePermission('system:role'), async (req, res) => {
  try {
    const { role_ids } = req.body;
    const userId = req.params.userId;

    if (!role_ids || !Array.isArray(role_ids)) {
      return res.status(400).json({ message: '请提供角色ID列表' });
    }

    await runInTransaction(async (tx) => {
      await tx.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);

      for (const roleId of role_ids) {
        await tx.execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [userId, roleId]);
      }

      const primaryRole = await tx.queryOne(`SELECT code FROM roles WHERE id = ?`, [role_ids[0]]);
      if (primaryRole) {
        await tx.execute(`UPDATE users SET role = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [primaryRole.code, userId]);
      }
    });

    clearPermissionCache(Number(userId));
    res.json({ message: '用户角色分配成功' });
  } catch (error) {
    res.status(500).json({ message: '分配用户角色失败', error });
  }
});

router.get('/:id', authenticate, requirePermission('system:role'), async (req, res) => {
  try {
    const role = await queryOne(`SELECT * FROM roles WHERE id = ?`, [req.params.id]);
    if (!role) return res.status(404).json({ message: '角色不存在' });

    const permissions = await queryAll(`
      SELECT p.* FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `, [req.params.id]);

    res.json({ ...role, permissions });
  } catch (error) {
    res.status(500).json({ message: '获取角色失败', error });
  }
});

router.post('/', authenticate, requirePermission('system:role'), async (req, res) => {
  try {
    const { code, name, description, permission_ids } = req.body;

    if (!code || !name) {
      return res.status(400).json({ message: '角色编码和名称必填' });
    }

    const existing = await queryOne(`SELECT id FROM roles WHERE code = ?`, [code]);
    if (existing) {
      return res.status(400).json({ message: '角色编码已存在' });
    }

    const roleId = await executeInsert(
      `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, 0)`,
      [code, name, description || '']
    );

    if (permission_ids && Array.isArray(permission_ids)) {
      for (const permId of permission_ids) {
        await execute(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, permId]);
      }
    }

    clearPermissionCache();
    res.json({ message: '角色创建成功', id: roleId });
  } catch (error) {
    res.status(500).json({ message: '创建角色失败', error });
  }
});

router.put('/:id', authenticate, requirePermission('system:role'), async (req, res) => {
  try {
    const { name, description, permission_ids } = req.body;
    const roleId = req.params.id;

    const role = await queryOne(`SELECT * FROM roles WHERE id = ?`, [roleId]);
    if (!role) return res.status(404).json({ message: '角色不存在' });

    if (name) {
      await execute(`UPDATE roles SET name = ?, description = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [name, description || '', roleId]);
    }

    if (permission_ids && Array.isArray(permission_ids)) {
      await execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
      for (const permId of permission_ids) {
        await execute(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, permId]);
      }
    }

    clearPermissionCache();
    res.json({ message: '角色更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新角色失败', error });
  }
});

router.delete('/:id', authenticate, requirePermission('system:role'), async (req, res) => {
  try {
    const roleId = req.params.id;

    const role = await queryOne(`SELECT * FROM roles WHERE id = ?`, [roleId]);
    if (!role) return res.status(404).json({ message: '角色不存在' });

    if (role.is_system) {
      return res.status(400).json({ message: '系统内置角色不可删除' });
    }

    const userCount = await queryOne(`SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?`, [roleId]);
    if (userCount && Number(userCount.count) > 0) {
      return res.status(400).json({ message: `该角色下还有 ${userCount.count} 个用户，请先移除` });
    }

    await execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
    await execute(`DELETE FROM roles WHERE id = ?`, [roleId]);

    clearPermissionCache();
    res.json({ message: '角色删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除角色失败', error });
  }
});

export default router;

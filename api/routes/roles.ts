import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { clearPermissionCache, requirePermission } from '../middleware/permissions';
import { queryOne, queryAll, execute, executeInsert, runInTransaction } from '../database/utils';

const router = Router();

function uniquePositiveIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map((item) => Number(item));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) return null;
    return ids;
}

function nonEmptyUniquePositiveIds(value: unknown): number[] | null {
  const ids = uniquePositiveIds(value);
  return ids && ids.length > 0 ? ids : null;
}

async function assertRolesExist(ids: number[]) {
  const found = await queryAll<{ id: number }>(`SELECT id FROM roles WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  return found.length === ids.length;
}

async function assertPermissionsExist(ids: number[]) {
  if (ids.length === 0) return true;
  const found = await queryAll<{ id: number }>(`SELECT id FROM permissions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  return found.length === ids.length;
}

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

    const roleIds = nonEmptyUniquePositiveIds(role_ids);
    if (!roleIds) {
      return res.status(400).json({ message: '角色ID列表必须为非空、非重复的正整数数组' });
    }
    const user = await queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    if (!await assertRolesExist(roleIds)) return res.status(400).json({ message: '角色ID不存在' });

    await runInTransaction(async (tx) => {
      const primaryRole = await tx.queryOne<{ code: string }>(`SELECT code FROM roles WHERE id = ?`, [roleIds[0]]);
      if (!primaryRole) throw new Error('主角色不存在');
      await tx.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);

      for (const roleId of roleIds) {
        await tx.execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [userId, roleId]);
      }

      await tx.execute(`UPDATE users SET role = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [primaryRole.code, userId]);
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

    const permissionIds = permission_ids === undefined ? [] : uniquePositiveIds(permission_ids);
    if (permission_ids !== undefined && !permissionIds) return res.status(400).json({ message: '权限ID列表必须为非空、非重复的正整数数组' });
    if (permissionIds && !await assertPermissionsExist(permissionIds)) return res.status(400).json({ message: '权限ID不存在' });

    const roleId = await runInTransaction(async (tx) => {
      const id = await tx.executeInsert(`INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, 0)`, [code, name, description || '']);
      for (const permId of permissionIds || []) await tx.execute(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [id, permId]);
      return id;
    });

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

    const permissionIds = permission_ids === undefined ? undefined : uniquePositiveIds(permission_ids);
    if (permission_ids !== undefined && !permissionIds) return res.status(400).json({ message: '权限ID列表必须为非空、非重复的正整数数组' });
    if (permissionIds && !await assertPermissionsExist(permissionIds)) return res.status(400).json({ message: '权限ID不存在' });

    await runInTransaction(async (tx) => {
      if (name) await tx.execute(`UPDATE roles SET name = ?, description = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [name, description || '', roleId]);
      if (permissionIds) {
        await tx.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
        for (const permId of permissionIds) await tx.execute(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, permId]);
      }
    });

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

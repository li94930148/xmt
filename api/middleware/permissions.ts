import { Request, Response, NextFunction } from 'express';
import { queryAll } from '../database/utils';

// 权限缓存（内存 Map，TTL 5 分钟）
const permissionCache = new Map<string, { permissions: string[]; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * 获取用户的权限列表（带缓存）
 */
async function getUserPermissions(userId: number): Promise<string[]> {
  const cacheKey = `user_${userId}`;
  const cached = permissionCache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    return cached.permissions;
  }

  const permissions = await queryAll(`
    SELECT DISTINCT p.code FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    JOIN user_roles ur ON rp.role_id = ur.role_id
    WHERE ur.user_id = ?
  `, [userId]);

  const permList = permissions.map(p => String(p.code));

  permissionCache.set(cacheKey, {
    permissions: permList,
    expires: Date.now() + CACHE_TTL
  });

  return permList;
}

/**
 * 清除用户权限缓存
 */
export function clearPermissionCache(userId?: number) {
  if (userId) {
    permissionCache.delete(`user_${userId}`);
  } else {
    permissionCache.clear();
  }
}

/**
 * 权限检查中间件
 * 用法：requirePermission('topic:create') 或 requirePermission('topic:create', 'topic:update')
 */
export function requirePermission(...permissionCodes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: '未登录' });
    }

    try {
      const userPermissions = await getUserPermissions(req.user.id);

      // admin 角色拥有所有权限
      if (req.user.role === 'admin') {
        return next();
      }

      // 检查是否拥有所需权限（任一权限即可）
      const hasPermission = permissionCodes.some(code => userPermissions.includes(code));

      if (!hasPermission) {
        return res.status(403).json({
          message: '权限不足',
          required: permissionCodes,
          current: userPermissions
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: '权限验证失败' });
    }
  };
}

/**
 * 多权限检查中间件（需要同时拥有所有权限）
 */
export function requireAllPermissions(...permissionCodes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: '未登录' });
    }

    try {
      const userPermissions = await getUserPermissions(req.user.id);

      // admin 角色拥有所有权限
      if (req.user.role === 'admin') {
        return next();
      }

      // 检查是否拥有所需的所有权限
      const hasAllPermissions = permissionCodes.every(code => userPermissions.includes(code));

      if (!hasAllPermissions) {
        return res.status(403).json({
          message: '权限不足',
          required: permissionCodes,
          current: userPermissions
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: '权限验证失败' });
    }
  };
}

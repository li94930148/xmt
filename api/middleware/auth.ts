import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../database/utils';
import { verifyToken } from '../utils/jwt';
import { User } from '../types';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function extractBearerToken(authorizationHeader?: string) {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  
  if (!token) {
    return res.status(401).json({ message: '未登录' });
  }
  
  try {
    const payload = verifyToken(token);
    
    if (!payload) {
      return res.status(401).json({ message: '登录已过期，请重新登录' });
    }
    
    const result = await queryOne(`SELECT * FROM users WHERE id = ?`, [payload.userId]);
    
    if (!result) {
      return res.status(401).json({ message: '用户不存在' });
    }
    
    const resultRecord = result as Record<string, unknown>;
    const user: User = {
      id: Number(resultRecord.id),
      username: String(resultRecord.username),
      password: '',
      email: String(resultRecord.email ?? ''),
      role: String(resultRecord.role) as User['role'],
      name: String(resultRecord.name ?? ''),
      enabled: Number(resultRecord.enabled) === 1,
      force_change_password: Number(resultRecord.force_change_password ?? 0) === 1,
      created_at: String(resultRecord.created_at),
      updated_at: String(resultRecord.updated_at)
    };
    
    if (!user.enabled) {
      return res.status(401).json({ message: '账号已被禁用' });
    }
    
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: '未登录' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }
    
    next();
  };
}

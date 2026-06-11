import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../database/utils';
import { verifyToken } from '../utils/jwt';
import { User } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  
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
      password: String(resultRecord.password),
      email: String(resultRecord.email),
      role: String(resultRecord.role) as User['role'],
      name: String(resultRecord.name),
      enabled: Number(resultRecord.enabled) === 1,
      created_at: String(resultRecord.created_at),
      updated_at: String(resultRecord.updated_at)
    };
    
    if (!user.enabled) {
      return res.status(401).json({ message: '账号已被禁用' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ message: '验证失败' });
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

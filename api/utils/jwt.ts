import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@shared/types';

export type { JwtPayload };

// 启动时强制检查 JWT_SECRET
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('[FATAL] JWT_SECRET 环境变量未设置！请在 .env 文件中配置。');
  process.exit(1);
}
const EXPIRES_IN = '7d';

// 类型断言：经过上面的检查，SECRET 一定有值
const JWT_SECRET: string = SECRET;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
  } catch {
    return null;
  }
}

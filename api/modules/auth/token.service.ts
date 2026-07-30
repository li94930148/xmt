import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@shared/types';

export type { JwtPayload };

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('[FATAL] JWT_SECRET 环境变量未设置！请在 .env 文件中配置。');
  process.exit(1);
}

const EXPIRES_IN = '7d';
const JWT_SECRET: string = SECRET;

export interface TokenService {
  sign(payload: JwtPayload): string;
  verify(token: string): JwtPayload | null;
}

export class LegacyJwtTokenService implements TokenService {
  sign(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });
  }

  verify(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
    } catch {
      return null;
    }
  }
}

const legacyJwtTokenService = new LegacyJwtTokenService();

export function signToken(payload: JwtPayload): string {
  return legacyJwtTokenService.sign(payload);
}

export function verifyToken(token: string): JwtPayload | null {
  return legacyJwtTokenService.verify(token);
}

import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '@shared/types';

export type { JwtPayload };

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('[FATAL] JWT_SECRET 环境变量未设置！请在 .env 文件中配置。');
  process.exit(1);
}

const EXPIRES_IN = '7d';
const JWT_SECRET: string = SECRET;
const V1_ACCESS_EXPIRES_IN_SECONDS = 15 * 60;
const V1_ACCESS_ISSUER = process.env.JWT_V1_ISSUER?.trim() || 'xmt-api';
const V1_ACCESS_AUDIENCE = process.env.JWT_V1_AUDIENCE?.trim() || 'xmt-clients';

export type AccessTokenV1Payload = {
  sub: string;
  sid: string;
  jti: string;
  type: 'access';
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
};

export type CreateAccessTokenV1Input = {
  userId: number;
  sessionId: string;
};

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

export function createAccessTokenV1(input: CreateAccessTokenV1Input): string {
  return jwt.sign(
    { sid: input.sessionId, type: 'access' },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: String(input.userId),
      jwtid: randomUUID(),
      issuer: V1_ACCESS_ISSUER,
      audience: V1_ACCESS_AUDIENCE,
      expiresIn: V1_ACCESS_EXPIRES_IN_SECONDS,
    },
  );
}

export function verifyAccessTokenV1(token: string): AccessTokenV1Payload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: V1_ACCESS_ISSUER,
      audience: V1_ACCESS_AUDIENCE,
    });
    if (
      typeof payload === 'string' ||
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.iss !== 'string' ||
      (typeof payload.aud !== 'string' && !Array.isArray(payload.aud)) ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    return payload as AccessTokenV1Payload;
  } catch {
    return null;
  }
}

import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { formatBjtDatabase } from '../../../../shared/time/index.js';
import type { RefreshTokenRepository } from './refresh-token.repository.js';
import type { AuthRefreshTokenRecord } from '../session/session.types.js';

export type RefreshTokenSecurityEvent = {
  type: 'REFRESH_TOKEN_REUSE';
  sessionId: string;
  tokenId: string;
};

export type ConsumeRefreshTokenResult =
  | { status: 'SUCCESS'; refreshToken: string; sessionId: string; generation: number }
  | { status: 'INVALID' }
  | { status: 'SESSION_INVALID' }
  | { status: 'SECURITY_EVENT'; event: RefreshTokenSecurityEvent };

type RefreshTokenServiceOptions = {
  repository: RefreshTokenRepository;
  peppers: Readonly<Record<number, string>>;
  currentPepperVersion: number;
  now?: () => Date;
  idGenerator?: () => string;
  idleLifetimeMs?: number;
};

const DEFAULT_IDLE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export class RefreshTokenService {
  private readonly repository: RefreshTokenRepository;
  private readonly peppers: Readonly<Record<number, string>>;
  private readonly currentPepperVersion: number;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly idleLifetimeMs: number;

  constructor(options: RefreshTokenServiceOptions) {
    if (!options.peppers[options.currentPepperVersion]) {
      throw new Error('Current refresh token pepper version is not configured');
    }
    this.repository = options.repository;
    this.peppers = options.peppers;
    this.currentPepperVersion = options.currentPepperVersion;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.idleLifetimeMs = options.idleLifetimeMs ?? DEFAULT_IDLE_LIFETIME_MS;
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(refreshToken: string, pepperVersion = this.currentPepperVersion): string {
    const pepper = this.peppers[pepperVersion];
    if (!pepper) throw new Error('Refresh token pepper version is not configured');
    return createHmac('sha256', pepper).update(refreshToken, 'utf8').digest('hex');
  }

  async createRefreshToken(input: {
    sessionId: string;
    generation: number;
    expiresAt: string;
  }): Promise<string> {
    const refreshToken = this.generateRefreshToken();
    await this.repository.createRefreshTokenRecord({
      id: this.idGenerator(),
      sessionId: input.sessionId,
      tokenHash: this.hashRefreshToken(refreshToken),
      pepperVersion: this.currentPepperVersion,
      generation: input.generation,
      createdAt: formatBjtDatabase(this.now()),
      expiresAt: input.expiresAt,
      usedAt: null,
      replacedById: null,
      revokedAt: null,
      revokeReason: null,
    });
    return refreshToken;
  }

  detectReuse(record: AuthRefreshTokenRecord): RefreshTokenSecurityEvent | null {
    if (!record.usedAt) return null;
    return { type: 'REFRESH_TOKEN_REUSE', sessionId: record.sessionId, tokenId: record.id };
  }

  async consumeRefreshToken(
    refreshToken: string,
    replacementExpiresAt?: string,
  ): Promise<ConsumeRefreshTokenResult> {
    const current = await this.findRecord(refreshToken);
    if (!current) return { status: 'INVALID' };

    const now = this.now();
    const usedAt = formatBjtDatabase(now);
    const replacementToken = this.generateRefreshToken();
    const replacementId = this.idGenerator();
    const rotation = await this.repository.rotateRefreshToken({
      currentTokenHash: current.tokenHash,
      usedAt,
      nextIdleExpiresAt: formatBjtDatabase(new Date(now.getTime() + this.idleLifetimeMs)),
      replacement: {
        id: replacementId,
        sessionId: current.sessionId,
        tokenHash: this.hashRefreshToken(replacementToken),
        pepperVersion: this.currentPepperVersion,
        generation: current.generation + 1,
        createdAt: usedAt,
        expiresAt: replacementExpiresAt ?? current.expiresAt,
        usedAt: null,
        replacedById: null,
        revokedAt: null,
        revokeReason: null,
      },
    });

    if (rotation.status === 'INVALID') return { status: 'INVALID' };
    if (rotation.status === 'SESSION_INVALID') return { status: 'SESSION_INVALID' };
    if (rotation.status === 'REUSE_DETECTED') {
      return {
        status: 'SECURITY_EVENT',
        event: {
          type: 'REFRESH_TOKEN_REUSE',
          sessionId: rotation.sessionId,
          tokenId: rotation.tokenId,
        },
      };
    }
    return {
      status: 'SUCCESS',
      refreshToken: replacementToken,
      sessionId: current.sessionId,
      generation: current.generation + 1,
    };
  }

  private async findRecord(refreshToken: string): Promise<AuthRefreshTokenRecord | null> {
    for (const version of Object.keys(this.peppers).map(Number).sort((a, b) => b - a)) {
      const record = await this.repository.findRefreshTokenByHash(this.hashRefreshToken(refreshToken, version));
      if (record) return record;
    }
    return null;
  }
}

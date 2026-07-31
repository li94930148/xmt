import { randomUUID } from 'node:crypto';
import { formatBjtDatabase, parseStoredBjt } from '../../../../shared/time/index.js';
import type { SessionRepository } from './session.repository.js';
import type {
  AuthSessionRecord,
  CreateSessionServiceInput,
  SessionLookupResult,
  SessionRevokeReason,
} from './session.types.js';

type SessionServiceOptions = {
  repository: SessionRepository;
  now?: () => Date;
  idGenerator?: () => string;
  idleLifetimeMs?: number;
  absoluteLifetimeMs?: number;
};

const DEFAULT_IDLE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function expiresAt(base: Date, lifetimeMs: number): string {
  return formatBjtDatabase(new Date(base.getTime() + lifetimeMs));
}

export class SessionService {
  private readonly repository: SessionRepository;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly idleLifetimeMs: number;
  private readonly absoluteLifetimeMs: number;

  constructor(options: SessionServiceOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.idleLifetimeMs = options.idleLifetimeMs ?? DEFAULT_IDLE_LIFETIME_MS;
    this.absoluteLifetimeMs = options.absoluteLifetimeMs ?? DEFAULT_ABSOLUTE_LIFETIME_MS;
  }

  async createSession(input: CreateSessionServiceInput): Promise<string> {
    const session = this.prepareSession(input);
    await this.repository.createSession(session);
    return session.id;
  }

  prepareSession(input: CreateSessionServiceInput): AuthSessionRecord {
    const now = this.now();
    const nowValue = formatBjtDatabase(now);
    const session: AuthSessionRecord = {
      id: this.idGenerator(),
      userId: input.userId,
      clientType: input.clientType,
      deviceName: input.deviceName ?? null,
      userAgentSummary: input.userAgentSummary ?? null,
      appVersion: input.appVersion ?? null,
      createdAt: nowValue,
      lastSeenAt: nowValue,
      idleExpiresAt: expiresAt(now, this.idleLifetimeMs),
      absoluteExpiresAt: expiresAt(now, this.absoluteLifetimeMs),
      revokedAt: null,
      revokeReason: null,
      lastIpPrefix: input.lastIpPrefix ?? null,
    };
    return session;
  }

  async getSession(sessionId: string): Promise<SessionLookupResult> {
    const session = await this.repository.findSessionById(sessionId);
    if (!session) return { state: 'NOT_FOUND', session: null };
    if (session.revokedAt) return { state: 'REVOKED', session };

    const now = this.now().getTime();
    const absoluteExpiresAt = parseStoredBjt(session.absoluteExpiresAt)?.getTime() ?? 0;
    if (absoluteExpiresAt <= now) return { state: 'ABSOLUTE_EXPIRED', session };

    const idleExpiresAt = parseStoredBjt(session.idleExpiresAt)?.getTime() ?? 0;
    if (idleExpiresAt <= now) return { state: 'IDLE_EXPIRED', session };
    return { state: 'ACTIVE', session };
  }

  revokeSession(sessionId: string, reason: SessionRevokeReason): Promise<number> {
    return this.repository.revokeSession(sessionId, formatBjtDatabase(this.now()), reason);
  }

  revokeUserSessions(userId: number, reason: SessionRevokeReason): Promise<number> {
    return this.repository.revokeUserSessions(userId, formatBjtDatabase(this.now()), reason);
  }

  findActiveSessionsByUserId(userId: number): Promise<AuthSessionRecord[]> {
    return this.repository.findActiveSessionsByUserId(userId, formatBjtDatabase(this.now()));
  }
}

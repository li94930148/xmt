import { randomUUID } from 'node:crypto';

export type SocketTransport = 'polling' | 'websocket' | 'unknown';
export type SessionIdUnknownCategory =
  | 'server_missing_sid'
  | 'client_repeated_polling_old_sid'
  | 'proxy_chain_problem'
  | 'transport_switch_problem'
  | 'other';

type ConnectionRecord = {
  connectionId: string;
  connectedAt: number;
  transport: SocketTransport;
  upgraded: boolean;
  reconnectAttempt: number;
};

type LifecycleEvent = {
  event: string;
  connectionId: string | null;
  transport: SocketTransport;
  occurredAt: string;
  reconnectAttempt?: number;
  disconnectReason?: string;
  lifecycleDurationMs?: number;
  upgraded?: boolean;
  category?: SessionIdUnknownCategory;
  httpStatus?: number | null;
  sourceChain?: 'proxy' | 'direct' | 'unknown';
};

type EngineErrorInput = {
  message?: string;
  code?: number;
  requestUrl?: string;
  httpStatus?: number | null;
  proxied?: boolean;
};

const MAX_EVENTS = 500;
const RECENT_DISCONNECT_TTL_MS = 15 * 60 * 1000;

function normalizeTransport(value: unknown): SocketTransport {
  return value === 'polling' || value === 'websocket' ? value : 'unknown';
}

function sidFromRequestUrl(requestUrl?: string): string | null {
  if (!requestUrl) return null;
  try {
    return new URL(requestUrl, 'http://socket.local').searchParams.get('sid');
  } catch {
    return null;
  }
}

function transportFromRequestUrl(requestUrl?: string): SocketTransport {
  if (!requestUrl) return 'unknown';
  try {
    return normalizeTransport(new URL(requestUrl, 'http://socket.local').searchParams.get('transport'));
  } catch {
    return 'unknown';
  }
}

/**
 * Keeps Engine.IO session identifiers in memory only. Structured events expose
 * a generated connection ID, never a sid, token, cookie, user, or room value.
 */
export class SocketLifecycleObserver {
  private readonly activeByEngineSid = new Map<string, ConnectionRecord>();
  private readonly recentlyDisconnectedByEngineSid = new Map<string, ConnectionRecord & { disconnectedAt: number }>();
  private readonly events: LifecycleEvent[] = [];
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly emit: (event: LifecycleEvent) => void = (event) => console.info('[Socket][lifecycle]', event),
  ) {}

  connected(input: { engineSid?: string; transport?: unknown }): string {
    this.prune();
    const record: ConnectionRecord = {
      connectionId: randomUUID(),
      connectedAt: this.now(),
      transport: normalizeTransport(input.transport),
      upgraded: false,
      reconnectAttempt: 0,
    };
    if (input.engineSid) this.activeByEngineSid.set(input.engineSid, record);
    this.record({ event: 'connection', connectionId: record.connectionId, transport: record.transport, occurredAt: this.timestamp() });
    return record.connectionId;
  }

  upgraded(engineSid: string | undefined, transport: unknown): void {
    const record = engineSid ? this.activeByEngineSid.get(engineSid) : undefined;
    if (!record) return;
    record.transport = normalizeTransport(transport);
    record.upgraded = record.transport === 'websocket';
    this.record({ event: 'upgrade', connectionId: record.connectionId, transport: record.transport, upgraded: record.upgraded, occurredAt: this.timestamp() });
  }

  reconnect(engineSid: string | undefined, attempt: unknown): void {
    const record = engineSid ? this.activeByEngineSid.get(engineSid) : undefined;
    if (!record) return;
    const normalizedAttempt = Number.isInteger(attempt) && Number(attempt) > 0 && Number(attempt) <= 100 ? Number(attempt) : 0;
    record.reconnectAttempt = normalizedAttempt;
    this.record({ event: 'reconnect', connectionId: record.connectionId, transport: record.transport, reconnectAttempt: normalizedAttempt, occurredAt: this.timestamp() });
  }

  disconnected(input: { engineSid?: string; reason?: unknown }): void {
    const record = input.engineSid ? this.activeByEngineSid.get(input.engineSid) : undefined;
    if (!record) return;
    if (input.engineSid) {
      this.activeByEngineSid.delete(input.engineSid);
      this.recentlyDisconnectedByEngineSid.set(input.engineSid, { ...record, disconnectedAt: this.now() });
    }
    this.record({
      event: 'disconnect',
      connectionId: record.connectionId,
      transport: record.transport,
      disconnectReason: typeof input.reason === 'string' ? input.reason.slice(0, 80) : 'unknown',
      reconnectAttempt: record.reconnectAttempt,
      upgraded: record.upgraded,
      lifecycleDurationMs: Math.max(0, this.now() - record.connectedAt),
      occurredAt: this.timestamp(),
    });
  }

  engineConnectionError(input: EngineErrorInput): SessionIdUnknownCategory | null {
    if (input.message !== 'Session ID unknown') return null;
    this.prune();
    const engineSid = sidFromRequestUrl(input.requestUrl);
    const transport = transportFromRequestUrl(input.requestUrl);
    const active = engineSid ? this.activeByEngineSid.get(engineSid) : undefined;
    const recentlyDisconnected = engineSid ? this.recentlyDisconnectedByEngineSid.get(engineSid) : undefined;
    const category = this.classify({ transport, active, recentlyDisconnected, httpStatus: input.httpStatus, proxied: input.proxied });
    const record = active ?? recentlyDisconnected;
    this.record({
      event: 'session_id_unknown',
      connectionId: record?.connectionId ?? null,
      transport,
      upgraded: record?.upgraded ?? false,
      reconnectAttempt: record?.reconnectAttempt ?? 0,
      category,
      httpStatus: input.httpStatus ?? null,
      sourceChain: input.proxied === true ? 'proxy' : input.proxied === false ? 'direct' : 'unknown',
      occurredAt: this.timestamp(),
    });
    return category;
  }

  getSummary() {
    return {
      activeConnections: this.activeByEngineSid.size,
      counters: Object.fromEntries(this.counters),
      recentEvents: this.events.slice(-50),
    };
  }

  private classify(input: {
    transport: SocketTransport;
    active?: ConnectionRecord;
    recentlyDisconnected?: ConnectionRecord & { disconnectedAt: number };
    httpStatus?: number | null;
    proxied?: boolean;
  }): SessionIdUnknownCategory {
    if (input.httpStatus != null && input.httpStatus >= 500 && input.proxied) return 'proxy_chain_problem';
    if (input.transport === 'websocket' || input.active?.upgraded) return 'transport_switch_problem';
    if (input.transport === 'polling' && input.recentlyDisconnected) return 'client_repeated_polling_old_sid';
    if (!input.active) return 'server_missing_sid';
    return 'other';
  }

  private record(event: LifecycleEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    const key = event.category ? `${event.event}.${event.category}` : event.event;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
    this.emit(event);
  }

  private prune(): void {
    const cutoff = this.now() - RECENT_DISCONNECT_TTL_MS;
    for (const [engineSid, record] of this.recentlyDisconnectedByEngineSid) {
      if (record.disconnectedAt < cutoff) this.recentlyDisconnectedByEngineSid.delete(engineSid);
    }
  }

  private timestamp(): string { return new Date(this.now()).toISOString(); }
}

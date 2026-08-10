export type SocketClientLifecycleEvent = {
  event: 'created' | 'connected' | 'disconnected' | 'reconnect_attempt' | 'destroyed';
  instanceId: string;
  createdAt: string;
  occurredAt: string;
  disconnectReason?: string;
  reconnectAttempt?: number;
};

let instanceSequence = 0;

/**
 * Development-only client lifecycle trace. It deliberately never accepts or
 * records Socket IDs, user data, tokens, cookies, rooms, or message payloads.
 */
export class SocketClientLifecycleDiagnostics {
  readonly instanceId = `socket-instance-${++instanceSequence}`;
  readonly createdAt = new Date().toISOString();
  private readonly events: SocketClientLifecycleEvent[] = [];

  constructor(private readonly enabled: boolean, private readonly now: () => Date = () => new Date()) {}

  created(): void { this.record('created'); }
  connected(): void { this.record('connected'); }
  disconnected(reason: unknown): void {
    this.record('disconnected', { disconnectReason: typeof reason === 'string' ? reason.slice(0, 80) : 'unknown' });
  }
  reconnectAttempt(attempt: unknown): void {
    const normalized = Number.isInteger(attempt) && Number(attempt) > 0 && Number(attempt) <= 100 ? Number(attempt) : 0;
    this.record('reconnect_attempt', { reconnectAttempt: normalized });
  }
  destroyed(reason: unknown): void {
    this.record('destroyed', { disconnectReason: typeof reason === 'string' ? reason.slice(0, 80) : 'unknown' });
  }
  snapshot(): SocketClientLifecycleEvent[] { return [...this.events]; }

  private record(event: SocketClientLifecycleEvent['event'], details: Pick<SocketClientLifecycleEvent, 'disconnectReason' | 'reconnectAttempt'> = {}): void {
    if (!this.enabled) return;
    const entry: SocketClientLifecycleEvent = {
      event,
      instanceId: this.instanceId,
      createdAt: this.createdAt,
      occurredAt: this.now().toISOString(),
      ...details,
    };
    this.events.push(entry);
    if (this.events.length > 50) this.events.shift();
    console.debug('[Socket][client lifecycle]', entry);
  }
}

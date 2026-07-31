import { randomUUID } from 'node:crypto';
import { classifyAuthEvent, mapAuthEventToMetrics } from './auth-event.mapper.js';
import type { AuthMetricsExporter } from './auth-metrics.exporter.js';
import type { AuthEvent, AuthEventInput } from './auth-event.types.js';

export type AuthEventSink = (event: AuthEvent & { eventClass: ReturnType<typeof classifyAuthEvent> }) => void;

export class AuthEventService {
  private events: AuthEvent[] = [];

  constructor(
    private readonly exporters: readonly AuthMetricsExporter[] = [],
    private readonly sink: AuthEventSink = (event) => console.info(event),
    private readonly eventIdGenerator: () => string = randomUUID,
  ) {}

  record(input: AuthEventInput): AuthEvent {
    const event: AuthEvent = {
      eventId: this.eventIdGenerator(),
      eventType: input.eventType,
      requestId: input.requestId?.slice(0, 128) || null,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      mode: input.mode,
      clientType: input.clientType ?? 'unknown',
      success: input.success,
      reason: input.reason?.slice(0, 160) || null,
      createdAt: (input.createdAt ?? new Date()).toISOString(),
    };
    this.events.push(event);
    if (this.events.length > 10_000) this.events = this.events.slice(-10_000);
    const at = new Date(event.createdAt);
    const labels = { mode: event.mode, clientType: event.clientType };
    for (const metric of mapAuthEventToMetrics(event)) {
      for (const exporter of this.exporters) exporter.increment(metric, 1, labels, at);
    }
    this.sink({ ...event, eventClass: classifyAuthEvent(event) });
    return event;
  }

  eventsSince(since: Date): AuthEvent[] {
    const threshold = since.getTime();
    return this.events.filter((event) => Date.parse(event.createdAt) >= threshold);
  }

  list(): AuthEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  reset(): void {
    this.events = [];
  }
}

import { AUTH_METRIC_NAMES, classifyAuthEvent, mapAuthEventToMetrics, type AuthMetricName } from './auth-event.mapper.js';
import type { AuthEventService } from './auth-event.service.js';
import type { AuthEventClientType, AuthEventInput, AuthEventMode } from './auth-event.types.js';

type EventContext = {
  requestId?: string | null;
  userId?: number | null;
  sessionId?: string | null;
  mode: AuthEventMode;
  clientType?: AuthEventClientType | null;
  reason?: string | null;
  createdAt?: Date;
  durationSeconds?: number;
};

export class AuthMetricsService {
  private activeSessionIds = new Set<string>();
  constructor(private readonly events: AuthEventService) {}

  countLoginSuccess(context: EventContext) { return this.record('auth.login.success', true, context); }
  countLoginFailed(context: EventContext) { return this.record('auth.login.failed', false, context); }
  countRefreshSuccess(context: EventContext) {
    const event = this.record('auth.refresh.success', true, context);
    if (context.durationSeconds !== undefined) {
      this.events.observe('refresh_duration_seconds', context.durationSeconds, { mode: context.mode });
    }
    return event;
  }
  countRefreshFailed(context: EventContext) { return this.record('auth.refresh.failed', false, context); }
  countCsrfFailed(context: EventContext) { return this.record('auth.csrf.failed', false, context); }
  countTokenReuse(context: EventContext) { return this.record('auth.token.reuse_detected', false, context); }
  countLogoutSuccess(context: EventContext) { return this.record('auth.logout.success', true, context); }
  countExpired(context: EventContext) {
    const event = this.record('auth.session.revoked', false, context);
    if (context.sessionId) this.activeSessionIds.delete(context.sessionId);
    this.exportActiveSessions(context.mode);
    return event;
  }
  recordSessionCreated(context: EventContext) {
    const event = this.record('auth.session.created', true, context);
    if (context.sessionId) this.activeSessionIds.add(context.sessionId);
    this.exportActiveSessions(context.mode);
    return event;
  }
  recordSessionRevoked(context: EventContext) {
    const event = this.record('auth.session.revoked', true, context);
    if (context.sessionId) this.activeSessionIds.delete(context.sessionId);
    this.exportActiveSessions(context.mode);
    return event;
  }
  recordRolloutDecision(context: EventContext & { success: boolean }) {
    return this.record('auth.rollout.decision', context.success, context);
  }

  aggregate(windowMinutes: number, now = new Date()) {
    const safeWindow = Math.min(7 * 24 * 60, Math.max(1, Math.round(windowMinutes)));
    const since = new Date(now.getTime() - safeWindow * 60_000);
    const events = this.events.eventsSince(since);
    const counters = Object.fromEntries(AUTH_METRIC_NAMES.map((name) => [name, 0])) as Record<AuthMetricName, number>;
    for (const event of events) for (const metric of mapAuthEventToMetrics(event)) counters[metric] += 1;
    const refreshAttempts = counters.refresh_success + counters.refresh_failed;
    return {
      windowMinutes: safeWindow,
      from: since.toISOString(),
      to: now.toISOString(),
      categories: {
        login: counters.legacy_login_count + counters.v1_login_count,
        refresh: counters.refresh_success,
        logout: counters.logout_success,
        failure: events.filter((event) => classifyAuthEvent(event) === 'security').length,
        securityEvents: events.filter((event) => classifyAuthEvent(event) === 'security').length,
      },
      counters,
      refreshFailureRate: refreshAttempts === 0 ? 0 : counters.refresh_failed / refreshAttempts,
    };
  }

  private exportActiveSessions(mode: AuthEventMode): void {
    this.events.gauge('active_sessions', this.activeSessionIds.size, { mode });
  }

  private record(eventType: AuthEventInput['eventType'], success: boolean, context: EventContext) {
    return this.events.record({
      eventType,
      success,
      requestId: context.requestId,
      userId: context.userId,
      sessionId: context.sessionId,
      mode: context.mode,
      clientType: context.clientType,
      reason: context.reason,
      createdAt: context.createdAt,
    });
  }
}

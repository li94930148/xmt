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
};

export class AuthMetricsService {
  constructor(private readonly events: AuthEventService) {}

  countLoginSuccess(context: EventContext) { return this.record('auth.login.success', true, context); }
  countLoginFailed(context: EventContext) { return this.record('auth.login.failed', false, context); }
  countRefreshSuccess(context: EventContext) { return this.record('auth.refresh.success', true, context); }
  countRefreshFailed(context: EventContext) { return this.record('auth.refresh.failed', false, context); }
  countCsrfFailed(context: EventContext) { return this.record('auth.csrf.failed', false, context); }
  countTokenReuse(context: EventContext) { return this.record('auth.token.reuse_detected', false, context); }
  countLogoutSuccess(context: EventContext) { return this.record('auth.logout.success', true, context); }
  countExpired(context: EventContext) { return this.record('auth.session.revoked', false, context); }
  recordSessionCreated(context: EventContext) { return this.record('auth.session.created', true, context); }
  recordSessionRevoked(context: EventContext) { return this.record('auth.session.revoked', true, context); }
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

  private record(eventType: AuthEventInput['eventType'], success: boolean, context: EventContext) {
    return this.events.record({ ...context, eventType, success });
  }
}

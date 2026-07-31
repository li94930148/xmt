import {
  AUTH_MIGRATION_METRIC_NAMES,
  type AuthMigrationMetricEvent,
  type AuthMigrationMetricName,
  type AuthMigrationMetrics,
} from './auth-migration.metrics.js';

export type AuthMigrationMetricCategory = 'login' | 'refresh' | 'logout' | 'failure';

const CATEGORY_METRICS: Record<AuthMigrationMetricCategory, ReadonlySet<AuthMigrationMetricName>> = {
  login: new Set(['legacy_login_count', 'v1_login_count']),
  refresh: new Set(['refresh_success']),
  logout: new Set(['logout_success']),
  failure: new Set(['refresh_failed', 'csrf_failed', 'token_reuse_detected', 'expired_count']),
};

export class AuthMigrationMetricsService {
  constructor(private readonly metrics: AuthMigrationMetrics) {}

  aggregate(windowMinutes: number, now = new Date()) {
    const safeWindow = Math.min(7 * 24 * 60, Math.max(1, Math.round(windowMinutes)));
    const since = new Date(now.getTime() - safeWindow * 60_000);
    const events = this.metrics.eventsSince(since);
    const categories = {
      login: this.countCategory(events, 'login'),
      refresh: this.countCategory(events, 'refresh'),
      logout: this.countCategory(events, 'logout'),
      failure: this.countCategory(events, 'failure'),
    };
    const counters = Object.fromEntries(
      AUTH_MIGRATION_METRIC_NAMES.map((name) => [name, events.filter((event) => event.name === name).length]),
    ) as Record<AuthMigrationMetricName, number>;
    const refreshAttempts = counters.refresh_success + counters.refresh_failed;

    return {
      windowMinutes: safeWindow,
      from: since.toISOString(),
      to: now.toISOString(),
      categories,
      counters,
      refreshFailureRate: refreshAttempts === 0 ? 0 : counters.refresh_failed / refreshAttempts,
    };
  }

  private countCategory(events: AuthMigrationMetricEvent[], category: AuthMigrationMetricCategory): number {
    const names = CATEGORY_METRICS[category];
    return events.reduce((count, event) => count + (names.has(event.name) ? 1 : 0), 0);
  }
}

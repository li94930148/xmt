export const AUTH_MIGRATION_METRIC_NAMES = [
  'legacy_login_count',
  'v1_login_count',
  'refresh_success',
  'refresh_failed',
  'csrf_failed',
  'token_reuse_detected',
  'logout_success',
  'expired_count',
] as const;

export type AuthMigrationMetricName = typeof AUTH_MIGRATION_METRIC_NAMES[number];
export type AuthMigrationMetricsSnapshot = Record<AuthMigrationMetricName, number>;
export type AuthMigrationMetricEvent = { name: AuthMigrationMetricName; createdAt: string };

export class AuthMigrationMetrics {
  private readonly counters = new Map<AuthMigrationMetricName, number>(
    AUTH_MIGRATION_METRIC_NAMES.map((name) => [name, 0]),
  );
  private events: AuthMigrationMetricEvent[] = [];

  increment(name: AuthMigrationMetricName, at = new Date()): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
    this.events.push({ name, createdAt: at.toISOString() });
    if (this.events.length > 10_000) this.events = this.events.slice(-10_000);
  }

  snapshot(): AuthMigrationMetricsSnapshot {
    return Object.fromEntries(this.counters) as AuthMigrationMetricsSnapshot;
  }

  reset(): void {
    for (const name of AUTH_MIGRATION_METRIC_NAMES) this.counters.set(name, 0);
    this.events = [];
  }

  eventsSince(since: Date): AuthMigrationMetricEvent[] {
    const threshold = since.getTime();
    return this.events.filter((event) => Date.parse(event.createdAt) >= threshold);
  }
}

export const authMigrationMetrics = new AuthMigrationMetrics();

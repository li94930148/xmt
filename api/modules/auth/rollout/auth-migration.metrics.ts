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

export class AuthMigrationMetrics {
  private readonly counters = new Map<AuthMigrationMetricName, number>(
    AUTH_MIGRATION_METRIC_NAMES.map((name) => [name, 0]),
  );

  increment(name: AuthMigrationMetricName): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  snapshot(): AuthMigrationMetricsSnapshot {
    return Object.fromEntries(this.counters) as AuthMigrationMetricsSnapshot;
  }

  reset(): void {
    for (const name of AUTH_MIGRATION_METRIC_NAMES) this.counters.set(name, 0);
  }
}

export const authMigrationMetrics = new AuthMigrationMetrics();

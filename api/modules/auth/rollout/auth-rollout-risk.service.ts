import type { AuthMetricsService } from '../events/auth-metrics.service.js';
import type { AuthRolloutThresholdConfig } from './auth-rollout-threshold.config.js';

export type AuthRolloutRiskEvent = {
  code: 'REFRESH_FAILURE_RATE' | 'CSRF_FAILURES' | 'TOKEN_REUSE' | 'EXPIRED_SESSIONS';
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
  reason: string;
  createdAt: string;
};

export class AuthRolloutRiskService {
  constructor(
    private readonly metrics: AuthMetricsService,
    private readonly thresholds: AuthRolloutThresholdConfig,
  ) {}

  evaluate(now = new Date()) {
    const aggregate = this.metrics.aggregate(this.thresholds.windowMinutes, now);
    const risks: AuthRolloutRiskEvent[] = [];
    const add = (
      code: AuthRolloutRiskEvent['code'],
      severity: AuthRolloutRiskEvent['severity'],
      value: number,
      threshold: number,
      reason: string,
    ) => risks.push({ code, severity, value, threshold, reason, createdAt: now.toISOString() });

    if (aggregate.refreshFailureRate > this.thresholds.refreshFailureRate) {
      add('REFRESH_FAILURE_RATE', 'critical', aggregate.refreshFailureRate, this.thresholds.refreshFailureRate, 'Refresh 失败率超过停止阈值');
    }
    if (aggregate.counters.csrf_failed > this.thresholds.csrfFailureCount) {
      add('CSRF_FAILURES', 'warning', aggregate.counters.csrf_failed, this.thresholds.csrfFailureCount, 'CSRF 失败次数超过停止阈值');
    }
    if (aggregate.counters.token_reuse_detected > this.thresholds.tokenReuseCount) {
      add('TOKEN_REUSE', 'critical', aggregate.counters.token_reuse_detected, this.thresholds.tokenReuseCount, 'Token reuse 次数超过停止阈值');
    }
    if (aggregate.counters.expired_count > this.thresholds.expiredCount) {
      add('EXPIRED_SESSIONS', 'warning', aggregate.counters.expired_count, this.thresholds.expiredCount, 'Expired 次数超过停止阈值');
    }

    return { status: risks.length === 0 ? 'healthy' as const : 'risk' as const, risks, aggregate };
  }
}

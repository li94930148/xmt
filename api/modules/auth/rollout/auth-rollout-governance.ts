import { authMigrationMetrics } from './auth-migration.metrics.js';
import { AuthMigrationMetricsService } from './auth-migration-metrics.service.js';
import { readAuthRolloutConfig } from './auth-rollout.config.js';
import { AuthRolloutAuditService } from './auth-rollout-audit.service.js';
import { AuthRolloutRiskService } from './auth-rollout-risk.service.js';
import { AuthRolloutStatusService } from './auth-rollout.status.service.js';
import { readAuthRolloutThresholdConfig } from './auth-rollout-threshold.config.js';

const rolloutConfig = readAuthRolloutConfig();
const thresholds = readAuthRolloutThresholdConfig();

export const authRolloutStatusService = new AuthRolloutStatusService(rolloutConfig);
export const authMigrationMetricsService = new AuthMigrationMetricsService(authMigrationMetrics);
export const authRolloutRiskService = new AuthRolloutRiskService(authMigrationMetricsService, thresholds);
export const authRolloutAuditService = new AuthRolloutAuditService();

authRolloutAuditService.record({
  actor: 'system',
  action: 'config_loaded',
  before: null,
  after: authRolloutStatusService.current(),
  reason: '服务启动时载入 Auth Rollout 只读配置',
});

export { thresholds as authRolloutThresholds };

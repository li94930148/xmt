import { authEventService, authMetricsRegistry, authMetricsService } from '../events/index.js';
import { authRolloutRuntimeConfig } from '../../../config/auth-rollout-runtime.js';
import { AuthRolloutAuditService } from './auth-rollout-audit.service.js';
import { AuthRolloutRiskService } from './auth-rollout-risk.service.js';
import { AuthRolloutStatusService } from './auth-rollout.status.service.js';
import { readAuthRolloutThresholdConfig } from './auth-rollout-threshold.config.js';

const rolloutConfig = {
  mode: authRolloutRuntimeConfig.rolloutMode,
  productionApproved: authRolloutRuntimeConfig.productionApproved,
  allowlistedUserIds: authRolloutRuntimeConfig.allowlistedUserIds,
  internalUserIds: authRolloutRuntimeConfig.internalUserIds,
  percentage: authRolloutRuntimeConfig.percentage,
  hashSalt: authRolloutRuntimeConfig.hashSalt,
};
const thresholds = readAuthRolloutThresholdConfig();

export const authRolloutStatusService = new AuthRolloutStatusService(rolloutConfig);
export const authRolloutRiskService = new AuthRolloutRiskService(authMetricsService, thresholds);
export { authMetricsService };
export { authEventService, authMetricsRegistry };
export const authRolloutAuditService = new AuthRolloutAuditService();

authRolloutAuditService.record({
  actor: 'system',
  action: 'config_loaded',
  before: null,
  after: authRolloutStatusService.current(),
  reason: '服务启动时载入 Auth Rollout 只读配置',
});

export { thresholds as authRolloutThresholds };

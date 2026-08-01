import { readAuthRolloutConfig, type AuthRolloutMode } from './auth-rollout.config.js';
import { AuthRolloutService } from './auth-rollout.service.js';

export type LoginRolloutDecision = {
  mode: 'legacy' | 'v1-web';
  enabled: boolean;
  reason: string;
};

export type LoginRolloutUser = { id: number; role?: string | null };

export type LoginRolloutPolicyConfig = {
  environment: string | undefined;
  enabled: boolean;
  mode: AuthRolloutMode;
  productionApproved: boolean;
  percentageApproved: boolean;
  adminProtected: boolean;
  rollout: AuthRolloutService;
  allowlistedUserIds: ReadonlySet<number>;
};

export function readLoginRolloutPolicyConfig(env: NodeJS.ProcessEnv = process.env): LoginRolloutPolicyConfig {
  const rollout = readAuthRolloutConfig(env);
  return {
    environment: env.NODE_ENV,
    enabled: env.XMT_LOGIN_ROLLOUT_ENABLED === 'true',
    mode: rollout.mode,
    productionApproved: rollout.productionApproved,
    percentageApproved: env.XMT_LOGIN_ROLLOUT_PERCENTAGE_APPROVED === 'true',
    adminProtected: env.XMT_LOGIN_ROLLOUT_ADMIN_PROTECTED !== 'false',
    rollout: new AuthRolloutService(rollout),
    allowlistedUserIds: rollout.allowlistedUserIds,
  };
}

export class LoginRolloutPolicy {
  constructor(private readonly config: LoginRolloutPolicyConfig) {}

  decide(user: LoginRolloutUser): LoginRolloutDecision {
    if (!this.config.enabled) return { mode: 'legacy', enabled: false, reason: 'login_rollout_disabled' };
    if (!Number.isSafeInteger(user.id) || user.id <= 0) return { mode: 'legacy', enabled: false, reason: 'invalid_user' };
    if (this.config.adminProtected && (user.role === 'admin' || user.role === 'director')) {
      return { mode: 'legacy', enabled: false, reason: 'protected_role' };
    }
    if (this.config.environment === 'production' && !this.config.productionApproved) {
      return { mode: 'legacy', enabled: false, reason: 'production_approval_required' };
    }
    if (this.config.mode === 'percentage' && !this.config.percentageApproved) {
      return { mode: 'legacy', enabled: false, reason: 'percentage_approval_required' };
    }
    if (!['allowlist', 'percentage'].includes(this.config.mode)) {
      return { mode: 'legacy', enabled: false, reason: 'legacy_mode' };
    }
    if (!this.config.rollout.shouldUseWebAuth({ id: user.id })) {
      return { mode: 'legacy', enabled: false, reason: 'user_not_eligible' };
    }
    return { mode: 'v1-web', enabled: true, reason: this.config.mode };
  }
}

export function createLoginRolloutPolicy(env: NodeJS.ProcessEnv = process.env) {
  return new LoginRolloutPolicy(readLoginRolloutPolicyConfig(env));
}

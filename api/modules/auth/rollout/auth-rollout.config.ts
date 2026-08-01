import {
  parseAuthRolloutUserIds,
  resolveAuthRolloutRuntimeConfig,
  type AuthRolloutMode,
} from '../../../config/auth-rollout-runtime.js';

export type { AuthRolloutMode } from '../../../config/auth-rollout-runtime.js';

export type AuthRolloutConfig = {
  mode: AuthRolloutMode;
  productionApproved: boolean;
  allowlistedUserIds: ReadonlySet<number>;
  internalUserIds: ReadonlySet<number>;
  percentage: number;
  hashSalt: string;
};

export { parseAuthRolloutUserIds };

export function readAuthRolloutConfig(env: NodeJS.ProcessEnv = process.env): AuthRolloutConfig {
  const runtime = resolveAuthRolloutRuntimeConfig(env);

  return {
    mode: runtime.rolloutMode,
    productionApproved: runtime.productionApproved,
    allowlistedUserIds: runtime.allowlistedUserIds,
    internalUserIds: runtime.internalUserIds,
    percentage: runtime.percentage,
    hashSalt: runtime.hashSalt,
  };
}

export function isWebAuthRolloutEnabled(config: AuthRolloutConfig): boolean {
  return config.mode !== 'disabled' && config.mode !== 'legacy';
}

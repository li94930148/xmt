import {
  isWebAuthRolloutEnabled,
  readAuthRolloutConfig,
  type AuthRolloutConfig,
} from '../rollout/auth-rollout.config.js';
import { AuthRolloutService } from '../rollout/auth-rollout.service.js';
import { parseAuthRolloutUserIds, resolveAuthRolloutRuntimeConfig } from '../../../config/auth-rollout-runtime.js';

export type AuthWebConfig = {
  enabled: boolean;
  allowlistedUserIds: ReadonlySet<number>;
  rolloutConfig?: AuthRolloutConfig;
  allowedOrigins: ReadonlySet<string>;
  csrfSecret: string | null;
  secureCookies: boolean;
};

export function parseAuthWebAllowlist(value: string | undefined): ReadonlySet<number> {
  return parseAuthRolloutUserIds(value);
}

export function readAuthWebConfig(env: NodeJS.ProcessEnv = process.env): AuthWebConfig {
  const runtime = resolveAuthRolloutRuntimeConfig(env);
  const rolloutConfig = readAuthRolloutConfig(env);
  return {
    enabled: runtime.authWebEnabled && isWebAuthRolloutEnabled(rolloutConfig),
    allowlistedUserIds: runtime.allowlistedUserIds,
    rolloutConfig,
    allowedOrigins: runtime.allowedOrigins,
    csrfSecret: runtime.csrfSecret,
    secureCookies: runtime.secureCookies,
  };
}

export function isAuthWebAllowed(userId: number, env: NodeJS.ProcessEnv = process.env): boolean {
  const config = readAuthWebConfig(env);
  if (!config.enabled || !config.rolloutConfig) return false;
  return new AuthRolloutService(config.rolloutConfig).shouldUseWebAuth({ id: userId });
}

import { parseConfiguredOrigins } from '../security/origin-policy.js';
import { parseTrustProxy } from '../utils/trustProxy.js';
import { resolveAuthRolloutRuntimeConfig } from './auth-rollout-runtime.js';

export type AppRuntimeConfig = {
  trustProxyHops: number;
  allowedOrigins: ReadonlySet<string>;
  topicsV1Enabled: boolean;
  authV1Enabled: boolean;
  authV1LoginEnabled: boolean;
  authRefreshPepper: string;
  environment: string;
};

/** Resolve app startup settings from one environment snapshot. */
export function resolveAppRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AppRuntimeConfig {
  const authV1Enabled = resolveAuthRolloutRuntimeConfig(env).authV1Enabled;
  const authRefreshPepper = env.XMT_AUTH_REFRESH_PEPPER?.trim() || '';

  return {
    trustProxyHops: parseTrustProxy(env.TRUST_PROXY),
    // Keep the legacy precedence: ALLOWED_ORIGINS wins when non-empty, otherwise
    // CORS_ORIGINS remains the compatibility fallback.
    allowedOrigins: parseConfiguredOrigins(env.ALLOWED_ORIGINS || env.CORS_ORIGINS),
    topicsV1Enabled: env.XMT_TOPICS_V1_ENABLED === 'true',
    authV1Enabled,
    // The legacy login adapter stayed disabled unless the rollout and pepper
    // were both present. The API v1 mount still fails fast if enabled without a pepper.
    authV1LoginEnabled: authV1Enabled && authRefreshPepper.length > 0,
    authRefreshPepper,
    environment: env.NODE_ENV || 'development',
  };
}

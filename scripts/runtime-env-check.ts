import { createAuthRolloutRuntimeConfig } from '../api/config/auth-rollout-runtime.js';
import { inspectRuntimeEnvironment } from '../api/config/runtime-env-loader.js';
import { parseConfiguredOrigins } from '../api/security/origin-policy.js';
import { resolveServerBinding } from '../api/config/server-bind.js';

const inspected = inspectRuntimeEnvironment();
const env = inspected.variables;
const runtime = createAuthRolloutRuntimeConfig(env);
const origins = parseConfiguredOrigins(env.ALLOWED_ORIGINS || env.CORS_ORIGINS);
if (origins.size === 0) throw new Error('Runtime env must configure at least one allowed origin');

console.log(JSON.stringify({
  status: 'PASS',
  source: inspected.source,
  runtimeEnvFileConfigured: Boolean(inspected.runtimeEnvFile),
  nodeEnv: env.NODE_ENV || 'development',
  host: resolveServerBinding(env).host,
  authV1Enabled: runtime.authV1Enabled,
  authWebEnabled: runtime.authWebEnabled,
  mobileAuthEnabled: runtime.mobileAuthEnabled,
  mobileAuthApproved: runtime.mobileAuthApproved,
  mobileAllowlistCount: runtime.mobileAllowlistedUserIds.size,
  mobileSocketEnabled: runtime.mobileSocketEnabled,
  refreshPepper: env.XMT_AUTH_REFRESH_PEPPER?.trim() ? 'PRESENT' : 'MISSING',
  allowedOriginCount: origins.size,
}));

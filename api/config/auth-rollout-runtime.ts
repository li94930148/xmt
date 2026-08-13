import { getRuntimeEnvironmentMetadata } from './runtime-env-loader.js';

export type AuthRolloutMode = 'disabled' | 'legacy' | 'internal' | 'allowlist' | 'percentage';

export type AuthRolloutRuntimeConfig = {
  source: 'runtime_env_file' | 'pm2_process_env' | 'development_env';
  loadedAt: string;
  processId: number;
  authV1Enabled: boolean;
  authWebEnabled: boolean;
  loginRolloutEnabled: boolean;
  rolloutMode: AuthRolloutMode;
  effectiveRolloutMode: AuthRolloutMode;
  productionApproved: boolean;
  percentageApproved: boolean;
  adminProtected: boolean;
  socketBridgeEnabled: boolean;
  socketBridgeApproval: boolean;
  mobileAuthEnabled: boolean;
  mobileAuthApproved: boolean;
  mobileSocketEnabled: boolean;
  mobileAllowlistedUserIds: ReadonlySet<number>;
  observationWindowMinutes: number;
  allowlistedUserIds: ReadonlySet<number>;
  internalUserIds: ReadonlySet<number>;
  percentage: number;
  hashSalt: string;
  allowedOrigins: ReadonlySet<string>;
  csrfSecret: string | null;
  secureCookies: boolean;
};

const MODES = new Set<AuthRolloutMode>(['disabled', 'legacy', 'internal', 'allowlist', 'percentage']);

export function parseAuthRolloutUserIds(value: string | undefined): ReadonlySet<number> {
  return new Set((value ?? '').split(',').map((item) => Number(item.trim())).filter((id) => Number.isSafeInteger(id) && id > 0));
}

function percentage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

export function createAuthRolloutRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AuthRolloutRuntimeConfig {
  const runtimeEnvironment = getRuntimeEnvironmentMetadata(env);
  const isProduction = env.NODE_ENV === 'production';
  const requested = env.XMT_AUTH_ROLLOUT_MODE?.trim().toLowerCase() as AuthRolloutMode | undefined;
  const rawMode = requested && MODES.has(requested)
    ? requested
    : env.XMT_AUTH_V1_ENABLED === 'true' && env.XMT_AUTH_WEB_ENABLED === 'true' ? 'allowlist' : 'legacy';
  const productionApproved = env.XMT_AUTH_ROLLOUT_APPROVED === 'true';
  const baseMode = isProduction && rawMode !== 'legacy' && rawMode !== 'disabled' && (!productionApproved || rawMode !== 'allowlist')
    ? 'legacy'
    : rawMode;
  const mobileAuthApproved = env.XMT_MOBILE_AUTH_APPROVED === 'true';
  const mobileAuthRequested = env.XMT_MOBILE_AUTH_ENABLED === 'true';
  const mobileAllowlistedUserIds = parseAuthRolloutUserIds(env.XMT_MOBILE_AUTH_ALLOWLIST_USER_IDS);
  const webV1Approved = productionApproved && baseMode === 'allowlist';
  // V1 may be mounted for either independently approved surface. This does not
  // make the generic endpoint eligible; its controller remains web-gated.
  const authV1Enabled = env.XMT_AUTH_V1_ENABLED === 'true' && (!isProduction || webV1Approved || (mobileAuthRequested && mobileAuthApproved));
  const authWebEnabled = authV1Enabled && env.XMT_AUTH_WEB_ENABLED === 'true' && baseMode !== 'legacy' && baseMode !== 'disabled';
  const mobileAuthEnabled = authV1Enabled && (mobileAuthRequested || !isProduction) && (!isProduction || mobileAuthApproved);
  const effectiveRolloutMode = authWebEnabled ? baseMode : 'legacy';
  const loginRolloutEnabled = env.XMT_LOGIN_ROLLOUT_ENABLED === 'true';
  const socketBridgeApproval = env.XMT_SOCKET_BRIDGE_APPROVED === 'true';
  const socketRequested = env.XMT_SOCKET_AUTH_BRIDGE_ENABLED === 'true';
  const socketBridgeEnabled = isProduction
    ? socketRequested && loginRolloutEnabled && baseMode === 'allowlist' && socketBridgeApproval
    : socketRequested;
  const mobileSocketRequested = env.XMT_MOBILE_SOCKET_ENABLED === 'true';
  const mobileSocketApproved = env.XMT_MOBILE_SOCKET_APPROVED === 'true';
  const mobileSocketEnabled = mobileAuthEnabled && mobileSocketRequested && (!isProduction || mobileSocketApproved);
  return {
    source: runtimeEnvironment.source, loadedAt: runtimeEnvironment.loadedAt, processId: process.pid,
    authV1Enabled, authWebEnabled, loginRolloutEnabled, rolloutMode: baseMode, effectiveRolloutMode, productionApproved,
    percentageApproved: env.XMT_LOGIN_ROLLOUT_PERCENTAGE_APPROVED === 'true',
    adminProtected: env.XMT_LOGIN_ROLLOUT_ADMIN_PROTECTED !== 'false',
    socketBridgeEnabled, socketBridgeApproval, mobileAuthEnabled, mobileAuthApproved, mobileSocketEnabled,
    mobileAllowlistedUserIds,
    observationWindowMinutes: percentage(env.XMT_AUTH_GRAY_WINDOW_MINUTES),
    allowlistedUserIds: parseAuthRolloutUserIds(env.XMT_AUTH_WEB_ALLOWLIST_USER_IDS),
    internalUserIds: parseAuthRolloutUserIds(env.XMT_AUTH_ROLLOUT_INTERNAL_USER_IDS),
    percentage: percentage(env.XMT_AUTH_ROLLOUT_PERCENTAGE),
    hashSalt: env.XMT_AUTH_ROLLOUT_HASH_SALT?.trim() || 'xmt-auth-rollout-v1',
    allowedOrigins: new Set((env.XMT_AUTH_WEB_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)),
    csrfSecret: env.XMT_AUTH_CSRF_SECRET?.trim() || null,
    secureCookies: isProduction || env.XMT_AUTH_COOKIE_SECURE === 'true',
  };
}

// This is deliberately created once while the PM2 worker starts. Every Auth surface
// consumes this snapshot; changing .env alone cannot silently change the live process.
export const authRolloutRuntimeConfig = createAuthRolloutRuntimeConfig();

export function resolveAuthRolloutRuntimeConfig(env?: NodeJS.ProcessEnv): AuthRolloutRuntimeConfig {
  return env === undefined || env === process.env ? authRolloutRuntimeConfig : createAuthRolloutRuntimeConfig(env);
}

/** First-phase native rollout is intentionally allowlist-only and fail-closed. */
export function isMobileAuthEligibleUser(
  user: { id: number; enabled?: boolean | number },
  env?: NodeJS.ProcessEnv,
): boolean {
  const runtime = resolveAuthRolloutRuntimeConfig(env);
  const userEnabled = user.enabled === undefined || user.enabled === true || user.enabled === 1;
  // Development/test modules may be created directly. Production alone is
  // fail-closed and requires the complete explicit approval tuple.
  if ((env ?? process.env).NODE_ENV !== 'production') return userEnabled;
  return runtime.mobileAuthEnabled && userEnabled && runtime.mobileAllowlistedUserIds.has(user.id);
}

export function authRolloutRuntimeDiagnostics(runtime = authRolloutRuntimeConfig) {
  return {
    effectiveConfigSource: runtime.source,
    effectiveAuthV1Enabled: runtime.authV1Enabled,
    effectiveAuthWebEnabled: runtime.authWebEnabled,
    effectiveLoginRolloutEnabled: runtime.loginRolloutEnabled,
    effectiveRolloutMode: runtime.effectiveRolloutMode,
    effectiveSocketBridgeEnabled: runtime.socketBridgeEnabled,
    effectiveMobileAuthEnabled: runtime.mobileAuthEnabled,
    mobileAuthApproved: runtime.mobileAuthApproved,
    mobileAllowlistCount: runtime.mobileAllowlistedUserIds.size,
    effectiveMobileSocketEnabled: runtime.mobileSocketEnabled,
    allowlistCount: runtime.allowlistedUserIds.size,
    processId: runtime.processId,
    loadedAt: runtime.loadedAt,
  };
}

export function authRolloutRuntimeReadiness(runtime = authRolloutRuntimeConfig) {
  return {
    ...authRolloutRuntimeDiagnostics(runtime),
    socketBridgeApproval: runtime.socketBridgeApproval,
    observationWindowMinutes: runtime.observationWindowMinutes,
  };
}

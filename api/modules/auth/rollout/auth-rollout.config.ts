export type AuthRolloutMode = 'disabled' | 'legacy' | 'internal' | 'allowlist' | 'percentage';

export type AuthRolloutConfig = {
  mode: AuthRolloutMode;
  allowlistedUserIds: ReadonlySet<number>;
  internalUserIds: ReadonlySet<number>;
  percentage: number;
  hashSalt: string;
};

const MODES = new Set<AuthRolloutMode>(['disabled', 'legacy', 'internal', 'allowlist', 'percentage']);

export function parseAuthRolloutUserIds(value: string | undefined): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const item of value?.split(',') ?? []) {
    const id = Number(item.trim());
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

function parsePercentage(value: string | undefined): number {
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return 0;
  return Math.min(100, Math.max(0, percentage));
}

function legacyCompatibleMode(env: NodeJS.ProcessEnv): AuthRolloutMode {
  return env.XMT_AUTH_V1_ENABLED === 'true' && env.XMT_AUTH_WEB_ENABLED === 'true'
    ? 'allowlist'
    : 'legacy';
}

export function readAuthRolloutConfig(env: NodeJS.ProcessEnv = process.env): AuthRolloutConfig {
  const requested = env.XMT_AUTH_ROLLOUT_MODE?.trim().toLowerCase() as AuthRolloutMode | undefined;
  let mode = requested && MODES.has(requested) ? requested : legacyCompatibleMode(env);
  if (env.NODE_ENV === 'production' && mode !== 'disabled' && mode !== 'legacy') mode = 'legacy';

  return {
    mode,
    allowlistedUserIds: parseAuthRolloutUserIds(env.XMT_AUTH_WEB_ALLOWLIST_USER_IDS),
    internalUserIds: parseAuthRolloutUserIds(env.XMT_AUTH_ROLLOUT_INTERNAL_USER_IDS),
    percentage: parsePercentage(env.XMT_AUTH_ROLLOUT_PERCENTAGE),
    hashSalt: env.XMT_AUTH_ROLLOUT_HASH_SALT?.trim() || 'xmt-auth-rollout-v1',
  };
}

export function isWebAuthRolloutEnabled(config: AuthRolloutConfig): boolean {
  return config.mode !== 'disabled' && config.mode !== 'legacy';
}

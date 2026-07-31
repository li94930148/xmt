import {
  isWebAuthRolloutEnabled,
  readAuthRolloutConfig,
  type AuthRolloutConfig,
} from '../rollout/auth-rollout.config.js';
import { AuthRolloutService } from '../rollout/auth-rollout.service.js';

export type AuthWebConfig = {
  enabled: boolean;
  allowlistedUserIds: ReadonlySet<number>;
  rolloutConfig?: AuthRolloutConfig;
  allowedOrigins: ReadonlySet<string>;
  csrfSecret: string | null;
  secureCookies: boolean;
};

export function parseAuthWebAllowlist(value: string | undefined): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const item of value?.split(',') ?? []) {
    const id = Number(item.trim());
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

export function readAuthWebConfig(env: NodeJS.ProcessEnv = process.env): AuthWebConfig {
  const rolloutConfig = readAuthRolloutConfig(env);
  return {
    enabled: isWebAuthRolloutEnabled(rolloutConfig),
    allowlistedUserIds: parseAuthWebAllowlist(env.XMT_AUTH_WEB_ALLOWLIST_USER_IDS),
    rolloutConfig,
    allowedOrigins: new Set((env.XMT_AUTH_WEB_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)),
    csrfSecret: env.XMT_AUTH_CSRF_SECRET?.trim() || null,
    secureCookies: env.NODE_ENV === 'production' || env.XMT_AUTH_COOKIE_SECURE === 'true',
  };
}

export function isAuthWebAllowed(userId: number, env: NodeJS.ProcessEnv = process.env): boolean {
  const config = readAuthWebConfig(env);
  if (!config.enabled || !config.rolloutConfig) return false;
  return new AuthRolloutService(config.rolloutConfig).shouldUseWebAuth({ id: userId });
}

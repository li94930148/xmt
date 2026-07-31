export type AuthWebConfig = {
  enabled: boolean;
  allowlistedUserIds: ReadonlySet<number>;
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
  return {
    enabled: env.XMT_AUTH_V1_ENABLED === 'true'
      && env.XMT_AUTH_WEB_ENABLED === 'true'
      && env.NODE_ENV !== 'production',
    allowlistedUserIds: parseAuthWebAllowlist(env.XMT_AUTH_WEB_ALLOWLIST_USER_IDS),
  };
}

export function isAuthWebAllowed(userId: number, env: NodeJS.ProcessEnv = process.env): boolean {
  const config = readAuthWebConfig(env);
  return config.enabled && config.allowlistedUserIds.has(userId);
}

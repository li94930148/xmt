export type AuthMode = 'legacy' | 'v1-web';

export function resolveAuthMode(options: {
  webAuthEnabled?: boolean;
  userId?: number | null;
  allowlistedUserIds?: ReadonlySet<number>;
} = {}): AuthMode {
  if (!options.webAuthEnabled || !options.userId) return 'legacy';
  return options.allowlistedUserIds?.has(options.userId) ? 'v1-web' : 'legacy';
}

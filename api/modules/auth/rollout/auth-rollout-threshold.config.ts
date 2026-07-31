export type AuthRolloutThresholdConfig = {
  windowMinutes: number;
  refreshFailureRate: number;
  csrfFailureCount: number;
  tokenReuseCount: number;
  expiredCount: number;
};

function numberInRange(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function readAuthRolloutThresholdConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthRolloutThresholdConfig {
  return {
    windowMinutes: numberInRange(env.XMT_AUTH_ROLLOUT_THRESHOLD_WINDOW_MINUTES, 60, 1, 10_080),
    refreshFailureRate: numberInRange(env.XMT_AUTH_ROLLOUT_MAX_REFRESH_FAILURE_RATE, 0.2, 0, 1),
    csrfFailureCount: numberInRange(env.XMT_AUTH_ROLLOUT_MAX_CSRF_FAILURES, 5, 0, 1_000_000),
    tokenReuseCount: numberInRange(env.XMT_AUTH_ROLLOUT_MAX_TOKEN_REUSE, 1, 0, 1_000_000),
    expiredCount: numberInRange(env.XMT_AUTH_ROLLOUT_MAX_EXPIRED, 10, 0, 1_000_000),
  };
}

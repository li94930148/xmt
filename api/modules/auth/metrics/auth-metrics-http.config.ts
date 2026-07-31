export type AuthMetricsHttpConfig = {
  enabled: boolean;
  allowedCidrs: readonly string[];
};

export function readAuthMetricsHttpConfig(env: NodeJS.ProcessEnv = process.env): AuthMetricsHttpConfig {
  return {
    enabled: env.XMT_AUTH_METRICS_HTTP_ENABLED === 'true',
    allowedCidrs: (env.XMT_AUTH_METRICS_ALLOWED_CIDRS ?? '127.0.0.1/32,::1/128')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

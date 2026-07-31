import { isIP } from 'node:net';
import { Router, type Request } from 'express';
import type { PrometheusAuthMetricsExporter } from './prometheus/prometheus-auth-metrics.exporter.js';
import type { AuthMetricsHttpConfig } from './auth-metrics-http.config.js';

function normalizeIp(value: string): string {
  const withoutZone = value.split('%')[0];
  return withoutZone.startsWith('::ffff:') ? withoutZone.slice(7) : withoutZone;
}

function ipv4Number(value: string): number | null {
  if (isIP(value) !== 4) return null;
  return value.split('.').reduce((result, part) => (result << 8) + Number(part), 0) >>> 0;
}

export function isIpAllowed(ip: string, cidrs: readonly string[]): boolean {
  const normalized = normalizeIp(ip);
  if (normalized === '::1') return cidrs.includes('::1') || cidrs.includes('::1/128');
  const candidate = ipv4Number(normalized);
  if (candidate === null) return false;
  return cidrs.some((cidr) => {
    const [networkText, prefixText = '32'] = cidr.split('/');
    const network = ipv4Number(networkText);
    const prefix = Number(prefixText);
    if (network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (candidate & mask) === (network & mask);
  });
}

export function createAuthMetricsHttpRouter(
  exporter: PrometheusAuthMetricsExporter,
  config: AuthMetricsHttpConfig,
) {
  const router = Router();
  router.get('/', (req: Request, res) => {
    if (!config.enabled) return res.status(404).end();
    if (!isIpAllowed(req.ip || req.socket.remoteAddress || '', config.allowedCidrs)) {
      return res.status(403).type('text/plain').send('Forbidden\n');
    }
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(exporter.metrics());
  });
  return router;
}

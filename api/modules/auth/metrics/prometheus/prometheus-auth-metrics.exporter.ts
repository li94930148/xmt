import {
  AUTH_PRODUCTION_METRICS,
  type AuthMetricLabels,
  type AuthMetricsExporter,
  type AuthMetricsExporterStatus,
} from '../auth-metrics.types.js';

type MetricSample = { value: number; labels: AuthMetricLabels };

const TYPES = new Map<string, 'counter' | 'gauge' | 'histogram'>([
  ['xmt_auth_login_total', 'counter'],
  ['xmt_auth_refresh_total', 'counter'],
  ['xmt_auth_refresh_failed_total', 'counter'],
  ['xmt_auth_logout_total', 'counter'],
  ['xmt_auth_security_events_total', 'counter'],
  ['xmt_auth_active_sessions', 'gauge'],
  ['xmt_auth_refresh_duration_seconds', 'histogram'],
]);

export class PrometheusAuthMetricsExporter implements AuthMetricsExporter {
  readonly name = 'prometheus';
  readonly kind = 'prometheus' as const;
  private samples = new Map<string, MetricSample>();
  private observations = new Map<string, number[]>();
  private lastExportAt: string | null = null;

  increment(name: string, value = 1, labels: AuthMetricLabels = {}, at = new Date()): void {
    const mapped = this.map(name, labels);
    if (!mapped) return;
    const key = this.key(mapped.name, mapped.labels);
    const current = this.samples.get(key)?.value ?? 0;
    this.samples.set(key, { value: current + value, labels: mapped.labels });
    this.lastExportAt = at.toISOString();
  }

  observe(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    const mapped = this.map(name, labels);
    if (!mapped) return;
    const key = this.key(mapped.name, mapped.labels);
    this.observations.set(key, [...(this.observations.get(key) ?? []), value]);
    this.samples.set(key, { value, labels: mapped.labels });
    this.lastExportAt = at.toISOString();
  }

  gauge(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    const mapped = this.map(name, labels);
    if (!mapped) return;
    this.samples.set(this.key(mapped.name, mapped.labels), { value, labels: mapped.labels });
    this.lastExportAt = at.toISOString();
  }

  metrics(): string {
    const lines: string[] = [];
    for (const [name, type] of TYPES) {
      lines.push(`# HELP ${name} XMT Auth ${name.replace('xmt_auth_', '').split('_').join(' ')}`);
      lines.push(`# TYPE ${name} ${type}`);
      const entries = [...this.samples.entries()].filter(([key]) => key.startsWith(`${name}|`));
      if (type === 'histogram') {
        for (const [key, sample] of entries) {
          const values = this.observations.get(key) ?? [];
          for (const upperBound of [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]) {
            lines.push(`${name}_bucket${this.labels({ ...sample.labels, le: String(upperBound) })} ${values.filter((value) => value <= upperBound).length}`);
          }
          lines.push(`${name}_bucket${this.labels({ ...sample.labels, le: '+Inf' })} ${values.length}`);
          lines.push(`${name}_count${this.labels(sample.labels)} ${values.length}`);
          lines.push(`${name}_sum${this.labels(sample.labels)} ${values.reduce((sum, item) => sum + item, 0)}`);
        }
      } else {
        for (const [, sample] of entries) lines.push(`${name}${this.labels(sample.labels)} ${sample.value}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  status(): AuthMetricsExporterStatus {
    return { name: this.name, kind: this.kind, enabled: true, healthy: true, lastExportAt: this.lastExportAt, reason: null };
  }

  private map(name: string, labels: AuthMetricLabels) {
    const metricName = AUTH_PRODUCTION_METRICS[name as keyof typeof AUTH_PRODUCTION_METRICS];
    if (!metricName) return null;
    const mode = name === 'legacy_login_count' ? 'legacy' : labels.mode ?? (name === 'v1_login_count' ? 'v1-web' : undefined);
    const normalized: AuthMetricLabels = name === 'security_events'
      ? { mode: mode ?? 'unknown', eventType: labels.eventType ?? 'unknown', reason: labels.reason ?? 'unknown' }
      : mode ? { mode } : {};
    return { name: metricName, labels: normalized };
  }

  private key(name: string, labels: AuthMetricLabels): string {
    return `${name}|${Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(',')}`;
  }

  private labels(labels: AuthMetricLabels): string {
    const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0 ? '' : `{${entries.map(([key, value]) => `${key}="${value.split('\\').join('\\\\').split('"').join('\\"')}"`).join(',')}}`;
  }
}

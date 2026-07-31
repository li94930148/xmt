import type {
  AuthMetricLabels,
  AuthMetricsExporter,
  AuthMetricsExporterStatus,
} from './auth-metrics.types.js';

export class AuthMetricsRegistry implements AuthMetricsExporter {
  readonly name = 'auth-metrics-registry';
  private lastMetricAt: string | null = null;

  constructor(private readonly exporters: readonly AuthMetricsExporter[]) {}

  increment(name: string, value = 1, labels: AuthMetricLabels = {}, at = new Date()): void {
    this.dispatch('increment', name, value, labels, at);
  }

  observe(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    this.dispatch('observe', name, value, labels, at);
  }

  gauge(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    this.dispatch('gauge', name, value, labels, at);
  }

  statuses(): AuthMetricsExporterStatus[] {
    return this.exporters.map((exporter, index) => exporter.status?.() ?? ({
      name: exporter.name ?? `exporter-${index + 1}`,
      kind: exporter.kind ?? 'memory',
      enabled: true,
      healthy: true,
      lastExportAt: this.lastMetricAt,
      reason: null,
    }));
  }

  source(): string[] {
    return this.statuses().filter((status) => status.enabled).map((status) => status.kind);
  }

  lastExportAt(): string | null {
    return this.lastMetricAt;
  }

  private dispatch(
    operation: 'increment' | 'observe' | 'gauge',
    name: string,
    value: number,
    labels: AuthMetricLabels,
    at: Date,
  ): void {
    for (const exporter of this.exporters) exporter[operation](name, value, labels, at);
    this.lastMetricAt = at.toISOString();
  }
}

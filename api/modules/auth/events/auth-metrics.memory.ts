import type { AuthMetricLabels, AuthMetricsExporter } from './auth-metrics.exporter.js';

export type AuthMetricPoint = {
  operation: 'increment' | 'observe' | 'gauge';
  name: string;
  value: number;
  labels: AuthMetricLabels;
  createdAt: string;
};

export class MemoryAuthMetricsExporter implements AuthMetricsExporter {
  readonly name = 'memory';
  readonly kind = 'memory' as const;
  private points: AuthMetricPoint[] = [];

  increment(name: string, value = 1, labels: AuthMetricLabels = {}, at = new Date()): void {
    this.push('increment', name, value, labels, at);
  }

  observe(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    this.push('observe', name, value, labels, at);
  }

  gauge(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    this.push('gauge', name, value, labels, at);
  }

  list(): AuthMetricPoint[] {
    return this.points.map((point) => ({ ...point, labels: { ...point.labels } }));
  }

  reset(): void {
    this.points = [];
  }

  status() {
    const last = this.points.at(-1)?.createdAt ?? null;
    return { name: this.name, kind: this.kind, enabled: true, healthy: true, lastExportAt: last, reason: null };
  }

  private push(operation: AuthMetricPoint['operation'], name: string, value: number, labels: AuthMetricLabels, at: Date): void {
    this.points.push({ operation, name, value, labels: { ...labels }, createdAt: at.toISOString() });
    if (this.points.length > 10_000) this.points = this.points.slice(-10_000);
  }
}

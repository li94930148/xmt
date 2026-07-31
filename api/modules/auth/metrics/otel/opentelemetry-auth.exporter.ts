import {
  AUTH_PRODUCTION_METRICS,
  type AuthMetricLabels,
  type AuthMetricsExporter,
  type AuthMetricsExporterStatus,
} from '../auth-metrics.types.js';

export type OpenTelemetryMetricInstrument = {
  add?: (value: number, attributes?: AuthMetricLabels) => void;
  record?: (value: number, attributes?: AuthMetricLabels) => void;
};

export type OpenTelemetryMeterAdapter = {
  createCounter(name: string): OpenTelemetryMetricInstrument;
  createHistogram(name: string): OpenTelemetryMetricInstrument;
  createGauge?(name: string): OpenTelemetryMetricInstrument;
  createUpDownCounter?(name: string): OpenTelemetryMetricInstrument;
};

export class OpenTelemetryAuthExporter implements AuthMetricsExporter {
  readonly name = 'opentelemetry';
  readonly kind = 'opentelemetry' as const;
  private instruments = new Map<string, OpenTelemetryMetricInstrument>();
  private gaugeValues = new Map<string, number>();
  private lastExportAt: string | null = null;

  constructor(private readonly meter: OpenTelemetryMeterAdapter) {}

  increment(name: string, value = 1, labels: AuthMetricLabels = {}, at = new Date()): void {
    const mapped = this.map(name, labels);
    if (!mapped) return;
    this.instrument('counter', mapped.name).add?.(value, mapped.labels);
    this.lastExportAt = at.toISOString();
  }

  observe(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    const mapped = this.map(name, labels);
    if (!mapped) return;
    this.instrument('histogram', mapped.name).record?.(value, mapped.labels);
    this.lastExportAt = at.toISOString();
  }

  gauge(name: string, value: number, labels: AuthMetricLabels = {}, at = new Date()): void {
    const mapped = this.map(name, labels);
    if (!mapped) return;
    const instrument = this.instrument('gauge', mapped.name);
    if (instrument.record) instrument.record(value, mapped.labels);
    else {
      const key = `${mapped.name}:${JSON.stringify(mapped.labels)}`;
      const previous = this.gaugeValues.get(key) ?? 0;
      instrument.add?.(value - previous, mapped.labels);
      this.gaugeValues.set(key, value);
    }
    this.lastExportAt = at.toISOString();
  }

  status(): AuthMetricsExporterStatus {
    return { name: this.name, kind: this.kind, enabled: true, healthy: true, lastExportAt: this.lastExportAt, reason: null };
  }

  private instrument(type: 'counter' | 'histogram' | 'gauge', name: string): OpenTelemetryMetricInstrument {
    const key = `${type}:${name}`;
    let instrument = this.instruments.get(key);
    if (!instrument) {
      instrument = type === 'counter' ? this.meter.createCounter(name)
        : type === 'histogram' ? this.meter.createHistogram(name)
          : this.meter.createGauge?.(name) ?? this.meter.createUpDownCounter?.(name) ?? {};
      this.instruments.set(key, instrument);
    }
    return instrument;
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
}

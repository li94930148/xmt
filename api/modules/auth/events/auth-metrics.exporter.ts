export type AuthMetricLabels = Readonly<Record<string, string>>;

export interface AuthMetricsExporter {
  increment(name: string, value?: number, labels?: AuthMetricLabels, at?: Date): void;
  observe(name: string, value: number, labels?: AuthMetricLabels, at?: Date): void;
  gauge(name: string, value: number, labels?: AuthMetricLabels, at?: Date): void;
}

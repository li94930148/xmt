export type AuthMetricLabels = Readonly<Record<string, string>>;

export type AuthMetricsExporterKind = 'memory' | 'prometheus' | 'opentelemetry';

export type AuthMetricsExporterStatus = {
  name: string;
  kind: AuthMetricsExporterKind;
  enabled: boolean;
  healthy: boolean;
  lastExportAt: string | null;
  reason: string | null;
};

export interface AuthMetricsExporter {
  readonly name?: string;
  readonly kind?: AuthMetricsExporterKind;
  increment(name: string, value?: number, labels?: AuthMetricLabels, at?: Date): void;
  observe(name: string, value: number, labels?: AuthMetricLabels, at?: Date): void;
  gauge(name: string, value: number, labels?: AuthMetricLabels, at?: Date): void;
  status?(): AuthMetricsExporterStatus;
}

export const AUTH_PRODUCTION_METRICS = {
  legacy_login_count: 'xmt_auth_login_total',
  v1_login_count: 'xmt_auth_login_total',
  refresh_success: 'xmt_auth_refresh_total',
  refresh_failed: 'xmt_auth_refresh_failed_total',
  logout_success: 'xmt_auth_logout_total',
  security_events: 'xmt_auth_security_events_total',
  active_sessions: 'xmt_auth_active_sessions',
  refresh_duration_seconds: 'xmt_auth_refresh_duration_seconds',
} as const;

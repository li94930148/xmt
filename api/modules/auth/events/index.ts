import { AuthEventService } from './auth-event.service.js';
import { AuthMetricsService } from './auth-metrics.service.js';
import { MemoryAuthMetricsExporter } from './auth-metrics.memory.js';
import { AuthMetricsRegistry } from '../metrics/auth-metrics.registry.js';
import { PrometheusAuthMetricsExporter } from '../metrics/prometheus/prometheus-auth-metrics.exporter.js';
import { readAuthMetricsHttpConfig } from '../metrics/auth-metrics-http.config.js';

export const authMetricsMemoryExporter = new MemoryAuthMetricsExporter();
export const authMetricsPrometheusExporter = new PrometheusAuthMetricsExporter(undefined, readAuthMetricsHttpConfig().enabled);
export const authMetricsRegistry = new AuthMetricsRegistry([
  authMetricsMemoryExporter,
  authMetricsPrometheusExporter,
]);
export const authEventService = new AuthEventService([authMetricsRegistry]);
export const authMetricsService = new AuthMetricsService(authEventService);

export * from './auth-event.types.js';
export * from './auth-event.mapper.js';
export * from './auth-event.service.js';
export * from './auth-metrics.exporter.js';
export * from './auth-metrics.memory.js';
export * from './auth-metrics.service.js';

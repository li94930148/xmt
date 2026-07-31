import { AuthEventService } from './auth-event.service.js';
import { AuthMetricsService } from './auth-metrics.service.js';
import { MemoryAuthMetricsExporter } from './auth-metrics.memory.js';

export const authMetricsMemoryExporter = new MemoryAuthMetricsExporter();
export const authEventService = new AuthEventService([authMetricsMemoryExporter]);
export const authMetricsService = new AuthMetricsService(authEventService);

export * from './auth-event.types.js';
export * from './auth-event.mapper.js';
export * from './auth-event.service.js';
export * from './auth-metrics.exporter.js';
export * from './auth-metrics.memory.js';
export * from './auth-metrics.service.js';

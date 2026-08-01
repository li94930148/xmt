import { z } from 'zod';

export const authRolloutModeSchema = z.enum(['disabled', 'legacy', 'internal', 'allowlist', 'percentage']);

export const authMigrationCountersSchema = z.object({
  legacy_login_count: z.number().int().nonnegative(),
  v1_login_count: z.number().int().nonnegative(),
  refresh_success: z.number().int().nonnegative(),
  refresh_failed: z.number().int().nonnegative(),
  csrf_failed: z.number().int().nonnegative(),
  token_reuse_detected: z.number().int().nonnegative(),
  logout_success: z.number().int().nonnegative(),
  expired_count: z.number().int().nonnegative(),
}).strict();

const aggregateSchema = z.object({
  windowMinutes: z.number().positive(),
  from: z.string(),
  to: z.string(),
  categories: z.object({
    login: z.number().int().nonnegative(),
    refresh: z.number().int().nonnegative(),
    logout: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative(),
    securityEvents: z.number().int().nonnegative(),
  }).strict(),
  counters: authMigrationCountersSchema,
  refreshFailureRate: z.number().min(0).max(1),
}).strict();

export const authRolloutStatusDataSchema = z.object({
  runtime: z.object({
    effectiveConfigSource: z.literal('pm2_process_env'),
    effectiveAuthV1Enabled: z.boolean(),
    effectiveAuthWebEnabled: z.boolean(),
    effectiveLoginRolloutEnabled: z.boolean(),
    effectiveRolloutMode: authRolloutModeSchema,
    effectiveSocketBridgeEnabled: z.boolean(),
    allowlistCount: z.number().int().nonnegative(),
    processId: z.number().int().positive(),
    loadedAt: z.string(),
  }).strict(),
  rollout: z.object({
    mode: authRolloutModeSchema,
    enabled: z.boolean(),
    percentage: z.number().min(0).max(100),
    allowlistCount: z.number().int().nonnegative(),
    internalCount: z.number().int().nonnegative(),
  }).strict(),
  diagnostic: z.object({
    userId: z.number().int().positive(),
    mode: authRolloutModeSchema,
    enabled: z.boolean(),
    matchedRule: z.union([authRolloutModeSchema, z.literal('none')]),
    reason: z.string(),
  }).strict(),
  metrics: z.object({ last5Minutes: aggregateSchema, lastHour: aggregateSchema, last24Hours: aggregateSchema }).strict(),
  exporters: z.object({
    source: z.array(z.enum(['memory', 'prometheus', 'opentelemetry'])),
    status: z.array(z.object({
      name: z.string(),
      kind: z.enum(['memory', 'prometheus', 'opentelemetry']),
      enabled: z.boolean(),
      healthy: z.boolean(),
      lastExportAt: z.string().nullable(),
      reason: z.string().nullable(),
    }).strict()),
    lastEventAt: z.string().nullable(),
    lastExportAt: z.string().nullable(),
  }).strict(),
  risk: z.object({
    status: z.enum(['healthy', 'risk']),
    events: z.array(z.object({
      code: z.string(),
      severity: z.enum(['warning', 'critical']),
      value: z.number(),
      threshold: z.number(),
      reason: z.string(),
      createdAt: z.string(),
    }).strict()),
  }).strict(),
  thresholds: z.object({
    windowMinutes: z.number().positive(),
    refreshFailureRate: z.number().min(0).max(1),
    csrfFailureCount: z.number().nonnegative(),
    tokenReuseCount: z.number().nonnegative(),
    expiredCount: z.number().nonnegative(),
  }).strict(),
  audits: z.array(z.object({
    actor: z.string(),
    action: z.string(),
    before: z.record(z.string(), z.unknown()).nullable(),
    after: z.record(z.string(), z.unknown()).nullable(),
    reason: z.string(),
    created_at: z.string(),
  }).strict()),
  generatedAt: z.string(),
}).strict();

export const authRolloutStatusQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
}).strict();

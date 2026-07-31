import { z } from 'zod';
import { apiSuccessSchema } from './error.schema';

export const authV1ClientSchema = z.object({
  type: z.enum(['web', 'ios', 'android']),
  deviceName: z.string().trim().min(1).max(120).optional(),
  appVersion: z.string().trim().min(1).max(40).optional(),
}).strict();

export const loginV1RequestSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(1024),
  client: authV1ClientSchema,
}).strict();

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32).max(512),
}).strict();

export const authV1UserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  forceChangePassword: z.boolean(),
}).strict();

export const authSessionSummarySchema = z.object({
  id: z.string().min(1),
  clientType: z.string(),
  deviceName: z.string().nullable(),
  appVersion: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  idleExpiresAt: z.string(),
  absoluteExpiresAt: z.string(),
  current: z.boolean(),
}).strict();

export const loginV1DataSchema = z.object({
  user: authV1UserSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).describe('Experimental body transport; disabled by default'),
  expiresIn: z.literal(900),
  session: authSessionSummarySchema,
}).strict();

export const refreshDataSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).describe('Experimental body transport; disabled by default'),
  expiresIn: z.literal(900),
  session: authSessionSummarySchema,
}).strict();

export const sessionsDataSchema = z.array(authSessionSummarySchema);

export const loginV1ResponseSchema = apiSuccessSchema(loginV1DataSchema);
export const refreshResponseSchema = apiSuccessSchema(refreshDataSchema);
export const sessionResponseSchema = apiSuccessSchema(sessionsDataSchema);

export const LoginV1Request = loginV1RequestSchema;
export const LoginV1Response = loginV1ResponseSchema;
export const RefreshRequest = refreshRequestSchema;
export const RefreshResponse = refreshResponseSchema;
export const SessionResponse = sessionResponseSchema;

export type LoginV1RequestInput = z.infer<typeof loginV1RequestSchema>;
export type LoginV1Data = z.infer<typeof loginV1DataSchema>;
export type RefreshData = z.infer<typeof refreshDataSchema>;
export type AuthSessionSummary = z.infer<typeof authSessionSummarySchema>;
export type AuthV1User = z.infer<typeof authV1UserSchema>;

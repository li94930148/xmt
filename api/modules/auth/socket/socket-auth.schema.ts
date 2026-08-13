import { z } from 'zod';

export const socketAuthContextSchema = z.object({
  userId: z.number().int().positive(),
  sessionId: z.string().min(1).nullable(),
  tokenType: z.enum(['legacy', 'access']),
  authMode: z.enum(['legacy', 'v1-web']),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

export const socketAuthHandshakeSchema = z.object({
  token: z.string().min(1),
  mode: z.enum(['legacy', 'v1-web', 'v1-mobile']).default('legacy'),
  contractVersion: z.number().int().positive().optional(),
}).strict();

export type SocketAuthContextInput = z.infer<typeof socketAuthContextSchema>;

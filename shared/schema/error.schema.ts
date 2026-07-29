import { z } from 'zod';
import { apiMetaSchema, requestIdSchema } from './common.schema';

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'PERMISSION_DENIED',
  'RESOURCE_NOT_FOUND',
  'VALIDATION_ERROR',
  'INVALID_STATUS',
  'CONFLICT',
  'INTERNAL_ERROR',
]);

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: requestIdSchema,
    details: z.unknown().optional(),
  }).strict(),
}).strict();

export function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: apiMetaSchema.optional(),
  }).strict();
}

export const ApiErrorSchema = apiErrorSchema;
export const ApiSuccessSchema = apiSuccessSchema;

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: z.infer<typeof apiMetaSchema>;
};

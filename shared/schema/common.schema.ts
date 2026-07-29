import { z } from 'zod';
import { paginationSchema } from './pagination.schema';

export const idSchema = z.coerce.number().int().positive();
export const dateSchema = z.string().datetime({ offset: true });
export const requestIdSchema = z.string().min(1).max(128);

export const apiMetaSchema = z.object({
  page: paginationSchema.shape.page.optional(),
  limit: paginationSchema.shape.limit.optional(),
  total: paginationSchema.shape.total.optional(),
  requestId: requestIdSchema.optional(),
}).catchall(z.unknown());

export { paginationSchema };

export const IdSchema = idSchema;
export const DateSchema = dateSchema;
export const PaginationSchema = paginationSchema;

import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
}).strict();

export type Pagination = z.infer<typeof paginationSchema>;

import { z } from 'zod';

export const topicStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'production',
  'shooting',
  'publishing',
  'completed',
]);
const topicQueryStatusSchema = z.union([topicStatusSchema, z.literal('creation')]);

const emptyToUndefined = (value: unknown) => (value === '' || value === undefined || value === null ? undefined : value);
const creatorTopicSuggestionSourceSchema = z.object({
  account_uid: z.string().trim().min(1).max(256),
  suggestion_id: z.string().regex(/^[a-f0-9]{20}$/),
  evidence_id: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();

export const topicQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, topicQueryStatusSchema.optional()),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(10),
}).strict();

export const createTopicInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().optional().default(''),
  outline: z.string().nullable().optional(),
  outlineMarkdown: z.string().nullable().optional(),
  outlineJson: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional(),
  platform: z.string().max(100).optional().default(''),
  deadline: z.string().optional().default(''),
  assignee_id: z.coerce.number().int().positive().nullable().optional(),
  creator_suggestion_source: creatorTopicSuggestionSourceSchema.optional(),
}).strict();

export const updateTopicInputSchema = createTopicInputSchema
  .omit({ creator_suggestion_source: true })
  .partial()
  .extend({
    version_action: z.enum(['minor', 'major', 'none']).optional(),
    expected_content: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.version_action && value.version_action !== 'none'
      && (value.outline === undefined || value.expected_content === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: '创建选题版本时必须提供当前大纲和预期原稿' });
    }
  })
  .refine((value) => Object.keys(value).length > 0, '没有需要更新的字段');

export const auditTopicInputSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional().default(''),
  assignee_id: z.coerce.number().int().positive().optional(),
}).strict();

export const transitionTopicInputSchema = z.object({
  status: topicStatusSchema,
}).strict();

export const topicResponseSchema = z.object({
  id: z.coerce.number().int(),
  title: z.string(),
  description: z.string().nullable().optional(),
  outline: z.string().nullable().optional(),
  outline_markdown: z.string().nullable().optional(),
  outline_json: z.string().nullable().optional(),
  status: topicStatusSchema,
  platform: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  creator_id: z.coerce.number().int().nullable(),
  assignee_id: z.coerce.number().int().nullable(),
  creator_name: z.string().nullable().optional(),
  assignee_name: z.string().nullable().optional(),
  submitted_at: z.string().nullable().optional(),
  stage_entered_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

export type CreateTopicInput = z.infer<typeof createTopicInputSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicInputSchema>;
export type TopicQuery = z.infer<typeof topicQuerySchema>;
export type TopicResponse = z.infer<typeof topicResponseSchema>;
export type AuditTopicInput = z.infer<typeof auditTopicInputSchema>;
export type TransitionTopicInput = z.infer<typeof transitionTopicInputSchema>;

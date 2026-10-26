import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { apiErrorSchema, apiSuccessSchema } from '@shared/schema/error.schema';
import { idSchema } from '@shared/schema/common.schema';
import {
  createTopicInputSchema,
  auditTopicInputSchema,
  topicQuerySchema,
  topicResponseSchema,
  transitionTopicInputSchema,
  updateTopicInputSchema,
} from '@shared/schema/topics.schema';
import {
  loginV1WebDataSchema,
  loginV1DataSchema,
  loginV1RequestSchema,
  refreshDataSchema,
  refreshRequestSchema,
  refreshWebDataSchema,
  refreshWebRequestSchema,
  sessionsDataSchema,
} from '@shared/schema/auth.schema';
import {
  authRolloutStatusDataSchema,
  authRolloutStatusQuerySchema,
} from '@shared/schema/auth-rollout.schema';

const registry = new OpenAPIRegistry();

function registerSchema<T extends z.ZodType>(refId: string, schema: T): T {
  return schema.meta({ ...(schema.meta() ?? {}), id: refId });
}

const ApiError = registerSchema('ApiError', apiErrorSchema);
const Topic = registerSchema('Topic', topicResponseSchema);
const TopicListResponse = registerSchema('TopicListResponse', apiSuccessSchema(z.array(Topic)));
const TopicResponse = registerSchema('TopicResponse', apiSuccessSchema(Topic));
const TopicMutationResponse = registerSchema('TopicMutationResponse', apiSuccessSchema(z.null()));
const TopicCreateRequest = registerSchema('TopicCreateRequest', createTopicInputSchema.extend({
  client_request_id: z.string().uuid().optional(),
}));
const TopicCreateRequestStatusParams = registerSchema('TopicCreateRequestStatusParams', z.object({ requestId: z.string().uuid() }).strict());
const TopicCreateRequestStatusData = z.discriminatedUnion('state', [
  z.object({ state: z.literal('created'), topicId: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('not_found') }).strict(),
]);
const TopicCreateRequestStatusResponse = registerSchema(
  'TopicCreateRequestStatusResponse',
  apiSuccessSchema(TopicCreateRequestStatusData),
);
const BackupCreateRequest = registerSchema('BackupCreateRequest', z.object({
  client_request_id: z.string().uuid().optional(),
}).strict());
const BackupCreateRequestStatusParams = registerSchema('BackupCreateRequestStatusParams', z.object({
  requestId: z.string().uuid(),
}).strict());
const BackupCreateResponse = registerSchema('BackupCreateResponse', z.object({
  message: z.string(),
  name: z.string(),
}).strict());
const BackupCreateRequestStatusResponse = registerSchema('BackupCreateRequestStatusResponse', z.discriminatedUnion('state', [
  z.object({ state: z.literal('created'), name: z.string() }).strict(),
  z.object({ state: z.literal('pending') }).strict(),
  z.object({ state: z.literal('not_found') }).strict(),
]));
const TopicCreatedResponse = registerSchema(
  'TopicCreatedResponse',
  apiSuccessSchema(z.object({ topicId: z.number().int().positive() }).strict()),
);
const ResourceCreateRequest = registerSchema('ResourceCreateRequest', z.object({
  title: z.string().min(1),
  library_type: z.enum(['project', 'content_archive', 'knowledge', 'media']),
  visibility: z.enum(['private', 'project', 'team', 'company']).optional(),
  summary: z.string().nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  content_text: z.string().nullable().optional(),
  source_type: z.string().optional(),
  source_uri: z.string().nullable().optional(),
  client_request_id: z.string().uuid().optional(),
}));
const ResourceCreateRequestStatusParams = registerSchema('ResourceCreateRequestStatusParams', z.object({ requestId: z.string().uuid() }).strict());
const ResourceCreateRequestStatusResponse = registerSchema('ResourceCreateRequestStatusResponse', z.discriminatedUnion('state', [
  z.object({ state: z.literal('created'), resourceId: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('not_found') }).strict(),
]));
const ResourceUpdateRequest = registerSchema('ResourceUpdateRequest', z.object({
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  visibility: z.enum(['private', 'project', 'team', 'company']).optional(),
  content_text: z.string().nullable().optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
  client_request_id: z.string().uuid().optional(),
}).passthrough());
const ResourceUpdateIdParams = registerSchema('ResourceUpdateIdParams', z.object({ id: idSchema }).strict());
const ResourceUpdateRequestStatusParams = registerSchema('ResourceUpdateRequestStatusParams', z.object({
  id: idSchema,
  requestId: z.string().uuid(),
}).strict());
const ResourceUpdateRequestStatusResponse = registerSchema('ResourceUpdateRequestStatusResponse', z.discriminatedUnion('state', [
  z.object({ state: z.literal('updated'), resourceId: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('not_found') }).strict(),
]));
const ResourceUpdatedResponse = registerSchema('ResourceUpdatedResponse', z.object({
  message: z.string(),
}).strict());
const ResourceCategoryMutationStatusParams = registerSchema('ResourceCategoryMutationStatusParams', z.object({ requestId: z.string().uuid() }).strict());
const ResourceCategoryMutationStatusQuery = registerSchema('ResourceCategoryMutationStatusQuery', z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
const ResourceCategoryMutationStatusResponse = registerSchema('ResourceCategoryMutationStatusResponse', z.discriminatedUnion('state', [
  z.object({ state: z.literal('created'), categoryId: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('updated'), categoryId: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('deleted'), categoryId: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('not_found') }).strict(),
]));
const ResourceCategoryCreateRequest = registerSchema('ResourceCategoryCreateRequest', z.object({
  library_type: z.enum(['project', 'content_archive', 'knowledge', 'media']),
  name: z.string().min(1).max(100),
  parent_id: z.number().int().positive().nullable().optional(),
  client_request_id: z.string().uuid().optional(),
}).passthrough());
const ResourceCategoryUpdateIdParams = registerSchema('ResourceCategoryUpdateIdParams', z.object({ id: idSchema }).strict());
const ResourceCategoryUpdateRequest = registerSchema('ResourceCategoryUpdateRequest', z.object({
  library_type: z.enum(['project', 'content_archive', 'knowledge', 'media']).optional(),
  name: z.string().min(1).max(100).optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  client_request_id: z.string().uuid().optional(),
}).passthrough());
const ResourceCategoryDeleteRequest = registerSchema('ResourceCategoryDeleteRequest', z.object({
  library_type: z.enum(['project', 'content_archive', 'knowledge', 'media']),
  client_request_id: z.string().uuid(),
}).strict());
const ResourceCreatedResponse = registerSchema('ResourceCreatedResponse', z.object({
  message: z.string(),
  id: z.number().int().positive(),
}).strict());
const HomeAttentionSummary = registerSchema(
  'HomeAttentionSummary',
  z.object({
    scope: z.enum(['all-visible-content', 'personal']),
    generated_at: z.string(),
    stale_stage_days: z.number().int().positive(),
    active_topics: z.object({
      total: z.number().int().nonnegative(),
      topics: z.array(z.object({
        id: z.number().int().positive(), title: z.string(), status: z.string(),
      }).strict()).max(3),
    }).strict(),
    counts: z.object({
      overdue: z.number().int().nonnegative(),
      due_soon: z.number().int().nonnegative(),
      stalled: z.number().int().nonnegative(),
      stage_time_unknown: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }).strict(),
    today_publishing: z.object({
      total: z.number().int().nonnegative(),
      tasks: z.array(z.object({
        id: z.number().int().positive(),
        topic_id: z.number().int().positive(),
        topic_title: z.string(),
        platform: z.string().nullable(),
        publish_time: z.string(),
        status: z.enum(['pending', 'scheduled']),
        operator_name: z.string().nullable(),
      }).strict()).max(8),
    }).strict(),
    sync_anomalies: z.object({
      available: z.boolean(),
      total: z.number().int().nonnegative(),
      tasks: z.array(z.object({
        id: z.number().int().positive(),
        platform: z.string(),
        account_name: z.string(),
        account_uid: z.string(),
        status: z.enum(['failed', 'partial_success']),
        start_time: z.string(),
        success_count: z.number().int().nonnegative(),
        failed_count: z.number().int().nonnegative(),
        owner_name: z.string().nullable(),
      }).strict()).max(8),
    }).strict(),
    production_reviews: z.object({
      available: z.boolean(),
      total: z.number().int().nonnegative(),
      tasks: z.array(z.object({
        id: z.number().int().positive(),
        topic_id: z.number().int().positive(),
        topic_title: z.string(),
        version: z.string().nullable(),
        updated_at: z.string(),
        operator_name: z.string().nullable(),
        assignee_name: z.string().nullable(),
      }).strict()).max(8),
    }).strict(),
    retrospectives: z.object({
      available: z.boolean(),
      total: z.number().int().nonnegative(),
      tasks: z.array(z.object({
        id: z.number().int().positive(),
        title: z.string(),
        period_start: z.string(),
        period_end: z.string(),
        status: z.enum(['draft', 'published', 'archived']),
        updated_at: z.string(),
      }).strict()).max(3),
    }).strict(),
    topics: z.array(z.object({
      id: z.number().int().positive(),
      title: z.string(),
      status: z.string(),
      deadline: z.string().nullable(),
      stage_entered_at: z.string().nullable(),
      assignee_name: z.string().nullable(),
      is_overdue: z.boolean(),
      is_due_soon: z.boolean(),
      is_stalled: z.boolean(),
    }).strict()).max(8),
    topic_stages: z.object({
      pending: z.object({ total: z.number().int().nonnegative(), topics: z.array(z.object({
        id: z.number().int().positive(), title: z.string(), status: z.literal('pending'), created_at: z.string(),
        stage_entered_at: z.string().nullable(), creator_name: z.string().nullable(), assignee_name: z.string().nullable(),
      }).strict()).max(3) }).strict(),
      production: z.object({ total: z.number().int().nonnegative(), topics: z.array(z.object({
        id: z.number().int().positive(), title: z.string(), status: z.enum(['approved', 'production']), created_at: z.string(),
        stage_entered_at: z.string().nullable(), creator_name: z.string().nullable(), assignee_name: z.string().nullable(),
      }).strict()).max(3) }).strict(),
      shooting: z.object({ total: z.number().int().nonnegative(), topics: z.array(z.object({
        id: z.number().int().positive(), title: z.string(), status: z.literal('shooting'), created_at: z.string(),
        stage_entered_at: z.string().nullable(), creator_name: z.string().nullable(), assignee_name: z.string().nullable(),
      }).strict()).max(3) }).strict(),
      publishing: z.object({ total: z.number().int().nonnegative(), topics: z.array(z.object({
        id: z.number().int().positive(), title: z.string(), status: z.literal('publishing'), created_at: z.string(),
        stage_entered_at: z.string().nullable(), creator_name: z.string().nullable(), assignee_name: z.string().nullable(),
      }).strict()).max(3) }).strict(),
      completed: z.object({ total: z.number().int().nonnegative(), topics: z.array(z.object({
        id: z.number().int().positive(), title: z.string(), status: z.literal('completed'), created_at: z.string(),
        stage_entered_at: z.string().nullable(), creator_name: z.string().nullable(), assignee_name: z.string().nullable(),
      }).strict()).max(3) }).strict(),
    }).strict(),
    my_drafts: z.object({ tasks: z.array(z.object({
      id: z.number().int().positive(),
      topic_id: z.number().int().positive().nullable(),
      topic_title: z.string().nullable(),
      status: z.enum(['draft', 'rejected']),
      version: z.string().nullable(),
      updated_at: z.string(),
    }).strict()).max(12) }).strict(),
  }).strict(),
);
const HomeAttentionError = registerSchema(
  'HomeAttentionError',
  z.object({ message: z.string(), code: z.string().optional() }).strict(),
);
const HomeActivitySummary = registerSchema(
  'HomeActivitySummary',
  z.object({
    scope: z.enum(['all-visible-content', 'personal']),
    generated_at: z.string(),
    events: z.array(z.object({
      id: z.string(),
      kind: z.enum(['version', 'review', 'reply', 'topic_status']),
      label: z.string(),
      title: z.string(),
      detail: z.string(),
      occurred_at: z.string(),
      path: z.string(),
    }).strict()).max(12),
  }).strict(),
);
const TopicIdParams = registerSchema('TopicIdParams', z.object({ id: idSchema }).strict());
const AuthV1LoginRequest = registerSchema('AuthV1LoginRequest', loginV1RequestSchema);
const AuthV1WebLoginResponse = registerSchema('AuthV1WebLoginResponse', apiSuccessSchema(loginV1WebDataSchema));
const AuthV1WebRefreshRequest = registerSchema('AuthV1WebRefreshRequest', refreshWebRequestSchema);
const AuthV1WebRefreshResponse = registerSchema('AuthV1WebRefreshResponse', apiSuccessSchema(refreshWebDataSchema));
const AuthV1SessionsResponse = registerSchema('AuthV1SessionsResponse', apiSuccessSchema(sessionsDataSchema));
const AuthV1LogoutResponse = registerSchema('AuthV1LogoutResponse', apiSuccessSchema(z.null()));
const AuthV1MobileLoginResponse = registerSchema('AuthV1MobileLoginResponse', apiSuccessSchema(loginV1DataSchema));
const AuthV1MobileRefreshResponse = registerSchema('AuthV1MobileRefreshResponse', apiSuccessSchema(refreshDataSchema));
const AuthV1MobileRefreshRequest = registerSchema('AuthV1MobileRefreshRequest', refreshRequestSchema);
const AuthV1MobileSessionResponse = registerSchema('AuthV1MobileSessionResponse', apiSuccessSchema(sessionsDataSchema.element));
const AuthRolloutStatusResponse = registerSchema('AuthRolloutStatusResponse', apiSuccessSchema(authRolloutStatusDataSchema));
const Sha256Fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const LegacyTemplate = registerSchema('LegacyTemplate', z.object({ id: z.number().int(), name: z.string(), platform: z.string().nullable().optional(), description: z.string().nullable().optional(), template_data: z.string().nullable().optional(), creator_name: z.string().nullable().optional(), base_fingerprint: Sha256Fingerprint }).passthrough());
const LegacyTemplateInput = registerSchema('LegacyTemplateInput', z.object({ name: z.string().trim().min(1).max(120), platform: z.string().max(50).optional(), description: z.string().max(1000).optional(), template_data: z.union([z.string().max(100_000), z.record(z.string(), z.unknown())]), is_default: z.boolean().optional() }).strict());
const LegacyTemplateCreateRequest = registerSchema('LegacyTemplateCreateRequest', LegacyTemplateInput.extend({ client_request_id: z.string().uuid().optional(), request_fingerprint: Sha256Fingerprint.optional() }).strict());
const LegacyTemplateUpdateRequest = registerSchema('LegacyTemplateUpdateRequest', LegacyTemplateInput.partial().extend({ client_request_id: z.string().uuid().optional(), base_fingerprint: Sha256Fingerprint.optional(), request_fingerprint: Sha256Fingerprint.optional() }).strict());
const LegacyTemplateDeleteRequest = registerSchema('LegacyTemplateDeleteRequest', z.object({ client_request_id: z.string().uuid().optional(), base_fingerprint: Sha256Fingerprint.optional(), request_fingerprint: Sha256Fingerprint.optional() }).strict());
const LegacyTemplateMutationResponse = registerSchema('LegacyTemplateMutationResponse', z.object({ message: z.string(), id: z.number().int().positive().optional(), idempotent_replay: z.boolean().optional() }).strict());
const LegacyTemplateMutationStatusParams = registerSchema('LegacyTemplateMutationStatusParams', z.object({ requestId: z.string().uuid() }).strict());
const LegacyTemplateMutationStatusQuery = registerSchema('LegacyTemplateMutationStatusQuery', z.object({ operation: z.enum(['create', 'update', 'delete']), target_id: idSchema.optional(), request_fingerprint: Sha256Fingerprint }).strict());
const LegacyTemplateMutationStatusResponse = registerSchema('LegacyTemplateMutationStatusResponse', z.object({
  data: z.object({ state: z.enum(['processed', 'not_found', 'target_missing', 'conflict']), target_id: z.number().int().positive().optional() }).strict(),
}).strict());
const AnonymousFeedbackAdminRow = registerSchema('AnonymousFeedbackAdminRow', z.object({
  id: z.number().int().positive(),
  type: z.string(),
  content: z.string(),
  need_reply: z.union([z.number(), z.boolean()]),
  reply_content: z.string().nullable(),
  status: z.string(),
  is_public: z.union([z.number(), z.boolean()]),
  created_at: z.string(),
  updated_at: z.string(),
  base_fingerprint: Sha256Fingerprint,
}).passthrough());
const AnonymousFeedbackAdminListResponse = registerSchema('AnonymousFeedbackAdminListResponse', z.object({ data: z.array(AnonymousFeedbackAdminRow) }).strict());
const AnonymousFeedbackUpdateIdParams = registerSchema('AnonymousFeedbackUpdateIdParams', z.object({ id: idSchema }).strict());
const AnonymousFeedbackUpdateRequest = registerSchema('AnonymousFeedbackUpdateRequest', z.object({
  status: z.enum(['pending', 'processing', 'completed']).optional(),
  reply_content: z.string().max(2000).optional(),
  is_public: z.boolean().optional(),
  client_request_id: z.string().uuid().optional(),
  base_fingerprint: Sha256Fingerprint.optional(),
  request_fingerprint: Sha256Fingerprint.optional(),
}).passthrough());
const AnonymousFeedbackUpdateStatusParams = registerSchema('AnonymousFeedbackUpdateStatusParams', z.object({ targetId: idSchema, requestId: z.string().uuid() }).strict());
const AnonymousFeedbackUpdateStatusQuery = registerSchema('AnonymousFeedbackUpdateStatusQuery', z.object({ request_fingerprint: Sha256Fingerprint }).strict());
const AnonymousFeedbackUpdateStatusResponse = registerSchema('AnonymousFeedbackUpdateStatusResponse', z.object({
  data: z.object({ state: z.enum(['processed', 'not_found', 'target_missing', 'conflict']) }).strict(),
}).strict());
const ReportSummaryQuery = registerSchema('ReportSummaryQuery', z.object({
  year: z.coerce.number().int().positive().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
}).strict());
const ReportSummaryYearQuery = registerSchema('ReportSummaryYearQuery', z.object({
  year: z.coerce.number().int().positive().optional(),
}).strict());
const ReportSummaryStatusParams = registerSchema('ReportSummaryStatusParams', z.object({ requestId: z.string().uuid() }).strict());
const ReportSummaryMonthlyStatusQuery = registerSchema('ReportSummaryMonthlyStatusQuery', z.object({
  year: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  fingerprint: Sha256Fingerprint,
}).strict());
const ReportSummaryYearlyStatusQuery = registerSchema('ReportSummaryYearlyStatusQuery', z.object({
  year: z.coerce.number().int().positive(),
  fingerprint: Sha256Fingerprint,
}).strict());
const ReportSummaryRecord = registerSchema('ReportSummaryRecord', z.object({
  id: z.number().int().positive().optional(),
  year: z.number().int().positive(),
  month: z.number().int().min(1).max(12).optional(),
  content_md: z.string().optional(),
  work_summary_md: z.string().optional(),
  key_projects_md: z.string().optional(),
  issues_plan_md: z.string().optional(),
  annual_summary_md: z.string().optional(),
  achievements_md: z.string().optional(),
  shortcomings_md: z.string().optional(),
  next_year_plan_md: z.string().optional(),
  display_content_md: z.string().optional(),
  baseline_fingerprint: Sha256Fingerprint.optional(),
}).passthrough());
const ReportSummaryReadResponse = registerSchema('ReportSummaryReadResponse', z.object({
  success: z.literal(true),
  data: ReportSummaryRecord,
}).strict());
const ReportSummaryWriteRequest = registerSchema('ReportSummaryWriteRequest', z.object({
  contentMd: z.string().optional(),
  work_summary_md: z.string().optional(),
  workSummaryMd: z.string().optional(),
  key_projects_md: z.string().optional(),
  keyProjectsMd: z.string().optional(),
  issues_plan_md: z.string().optional(),
  issuesPlanMd: z.string().optional(),
  annual_summary_md: z.string().optional(),
  annualSummaryMd: z.string().optional(),
  achievements_md: z.string().optional(),
  achievementsMd: z.string().optional(),
  shortcomings_md: z.string().optional(),
  shortcomingsMd: z.string().optional(),
  next_year_plan_md: z.string().optional(),
  nextYearPlanMd: z.string().optional(),
  client_request_id: z.string().uuid().optional(),
  base_fingerprint: Sha256Fingerprint.optional(),
}).passthrough());
const ReportSummaryWriteResponse = registerSchema('ReportSummaryWriteResponse', z.object({
  success: z.literal(true),
  data: ReportSummaryRecord.nullable(),
}).strict());
const ReportSummaryUpdateStatusResponse = registerSchema('ReportSummaryUpdateStatusResponse', z.discriminatedUnion('status', [
  z.object({ status: z.literal('processed'), data: ReportSummaryRecord }).strict(),
  z.object({ status: z.literal('not_found') }).strict(),
]));
const ReportSummaryUpdateConflictResponse = registerSchema('ReportSummaryUpdateConflictResponse', z.object({
  success: z.literal(false),
  message: z.string(),
  code: z.enum(['REPORT_SUMMARY_UPDATE_BASE_CONFLICT', 'REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT']),
  base_fingerprint: Sha256Fingerprint.optional(),
}).strict());
const ReportSummaryStatusConflictResponse = registerSchema('ReportSummaryStatusConflictResponse', z.object({
  status: z.literal('conflict'),
  code: z.literal('REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT').optional(),
  message: z.string(),
}).strict());
const WorkflowTemplateNodeInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string(),
  node_order: z.number().int().nonnegative().optional(),
  status_from: z.string(),
  status_to: z.string(),
  approver_type: z.string().optional(),
  approver_value: z.string().optional(),
  is_required: z.boolean().optional(),
}).strict();
const WorkflowTemplateCreateInput = registerSchema('WorkflowTemplateCreateInput', z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(WorkflowTemplateNodeInput).optional(),
  client_request_id: z.string().uuid().optional(),
}).strict());
const WorkflowTemplateUpdateInput = registerSchema('WorkflowTemplateUpdateInput', z.object({
  // The legacy PUT supports partial updates. Keyed requests enforce a complete payload in the route.
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  nodes: z.array(WorkflowTemplateNodeInput).optional(),
  base_fingerprint: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  client_request_id: z.string().uuid().optional(),
}).strict());
const WorkflowTemplateCreateResponse = registerSchema('WorkflowTemplateCreateResponse', z.object({
  message: z.string(),
  id: z.number().int().positive(),
  idempotent_replay: z.boolean().optional(),
}).strict());
const WorkflowTemplateUpdateResponse = registerSchema('WorkflowTemplateUpdateResponse', z.object({
  message: z.string(),
  idempotent_replay: z.boolean().optional(),
}).strict());
const WorkflowTemplateUpdateConflictResponse = registerSchema('WorkflowTemplateUpdateConflictResponse', z.object({
  message: z.string(),
  code: z.enum(['WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT', 'WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT']),
  base_fingerprint: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
}).passthrough());
const WorkflowTemplateCreateStatusResponse = registerSchema('WorkflowTemplateCreateStatusResponse', z.object({
  templateId: z.number().int().positive(),
}).strict());
const WorkflowTemplateCreateDeletedResponse = registerSchema('WorkflowTemplateCreateDeletedResponse', z.object({
  message: z.string(),
  deleted: z.literal(true),
}).strict());
const WorkflowTemplateCreateErrorResponse = registerSchema('WorkflowTemplateCreateErrorResponse', z.object({
  message: z.string(),
  code: z.string().optional(),
  required: z.array(z.string()).optional(),
  deleted: z.literal(true).optional(),
}).passthrough());
const WorkflowTemplateCreateRequestParams = registerSchema('WorkflowTemplateCreateRequestParams', z.object({ requestId: z.string().uuid() }).strict());
const WorkflowTemplateCreateStatusQuery = registerSchema('WorkflowTemplateCreateStatusQuery', z.object({
  fingerprint: z.string().regex(/^[0-9a-fA-F]{64}$/),
}).strict());
const WorkflowTemplateUpdateIdParams = registerSchema('WorkflowTemplateUpdateIdParams', z.object({ id: z.string().regex(/^[1-9]\d*$/) }).strict());
const WorkflowTemplateUpdateRequestParams = registerSchema('WorkflowTemplateUpdateRequestParams', z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  requestId: z.string().uuid(),
}).strict());
const WorkflowTemplateUpdateStatusResponse = registerSchema('WorkflowTemplateUpdateStatusResponse', z.discriminatedUnion('state', [
  z.object({ state: z.literal('updated'), templateId: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('not_found') }).strict(),
]));
const WorkflowTemplateNodeResponse = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  node_order: z.number().int().nonnegative(),
  status_from: z.string(),
  status_to: z.string(),
  approver_type: z.string().nullable().optional(),
  approver_value: z.string().nullable().optional(),
  is_required: z.union([z.boolean(), z.number().int()]).nullable().optional(),
}).passthrough();
const WorkflowTemplateDetailResponse = registerSchema('WorkflowTemplateDetailResponse', z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable().optional(),
  nodes: z.array(WorkflowTemplateNodeResponse),
  base_fingerprint: z.string().regex(/^[0-9a-fA-F]{64}$/),
}).passthrough());
const LegacyPomodoroStart = registerSchema('LegacyPomodoroStart', z.object({ duration: z.number().int().min(1).max(180).optional(), topic_id: z.number().int().positive().nullable().optional() }).strict());
const LegacyIdParams = registerSchema('LegacyIdParams', z.object({ id: idSchema }).strict());

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const errorResponses = {
  400: { description: '请求参数不合法', content: { 'application/json': { schema: ApiError } } },
  401: { description: '未登录或登录已失效', content: { 'application/json': { schema: ApiError } } },
  403: { description: '权限不足', content: { 'application/json': { schema: ApiError } } },
  404: { description: '资源不存在', content: { 'application/json': { schema: ApiError } } },
  409: { description: '业务状态冲突', content: { 'application/json': { schema: ApiError } } },
  500: { description: '服务端内部错误', content: { 'application/json': { schema: ApiError } } },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth-rollout/status',
  tags: ['Auth Rollout Governance'],
  summary: '查询 Auth 灰度运行状态',
  description: '管理员只读诊断接口。接受当前 legacy Bearer JWT，不修改灰度配置。',
  security: [{ bearerAuth: [] }],
  request: { query: authRolloutStatusQuerySchema },
  responses: {
    200: { description: '灰度模式、用户诊断、指标、风险和审计', content: { 'application/json': { schema: AuthRolloutStatusResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/dashboard/home-attention',
  tags: ['Dashboard (Legacy)'],
  summary: '获取首页关注事项汇总',
  description: '需要登录。选题关注事项按当前账号现有全内容可见范围或本人创建/负责范围统计；今日发布任务另遵循发布列表范围（本人创建、负责或发布记录操作人）。逾期、两日内截止和阶段停留超过两日的数量可重叠；选题 total 去重，列表各最多返回 8 条。今日任务仅含发布中选题的待发布/已定时记录，已发布或发布异常不算待处理；同一选题任一平台已发布则不再出现在任务中。管理员/负责人且有 creator:data:view 权限时，另返回每个账号最新一次同步结果为失败或部分失败的记录；正在执行的后续任务会取代旧结果，成功后异常自动移除，不返回同步错误原文。另按现有 production:update 权限及创作编辑范围汇总待审核稿件，不包含正文，也不代表存在专属指定审核人。',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '按当前账号内容范围汇总的首页关注事项', content: { 'application/json': { schema: HomeAttentionSummary } } },
    401: { description: '未登录或登录已失效', content: { 'application/json': { schema: HomeAttentionError } } },
    403: { description: '当前账号需要先修改密码', content: { 'application/json': { schema: HomeAttentionError } } },
    500: { description: '关注事项汇总暂时不可用', content: { 'application/json': { schema: HomeAttentionError } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/dashboard/home-activity',
  tags: ['Dashboard (Legacy)'],
  summary: '获取首页最近变化',
  description: '需要登录。返回当前账号可见范围内的稿件显式版本历史、稿件批注/回复和选题状态历史；最多 12 条，仅返回标题、类型、时间和站内链接，不返回稿件正文、批注正文或历史备注。',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '按当前账号内容可见范围汇总的最近变化', content: { 'application/json': { schema: HomeActivitySummary } } },
    401: { description: '未登录或登录已失效', content: { 'application/json': { schema: HomeAttentionError } } },
    403: { description: '当前账号需要先修改密码', content: { 'application/json': { schema: HomeAttentionError } } },
    500: { description: '最近变化暂时不可用', content: { 'application/json': { schema: HomeAttentionError } } },
  },
});

for (const path of ['/api/v1/auth/mobile/login', '/api/v1/auth/mobile/refresh'] as const) {
  const login = path.endsWith('/login');
  registry.registerPath({ method: 'post', path, tags: ['Auth Mobile (Experimental)'], summary: login ? '移动端实验性登录' : '移动端实验性 token 轮换', 'x-experimental': true,
    request: { body: { content: { 'application/json': { schema: login ? AuthV1LoginRequest : AuthV1MobileRefreshRequest } } } },
    responses: { 200: { description: '移动端会话凭据', content: { 'application/json': { schema: login ? AuthV1MobileLoginResponse : AuthV1MobileRefreshResponse } } }, ...errorResponses } });
}
registry.registerPath({ method: 'post', path: '/api/v1/auth/mobile/logout', tags: ['Auth Mobile (Experimental)'], summary: '撤销当前移动会话', 'x-experimental': true, security: [{ bearerAuth: [] }], responses: { 200: { description: '会话已撤销', content: { 'application/json': { schema: AuthV1LogoutResponse } } }, ...errorResponses } });
registry.registerPath({ method: 'get', path: '/api/v1/auth/mobile/session', tags: ['Auth Mobile (Experimental)'], summary: '查询当前移动会话', 'x-experimental': true, security: [{ bearerAuth: [] }], responses: { 200: { description: '当前会话', content: { 'application/json': { schema: AuthV1MobileSessionResponse } } }, ...errorResponses } });

registry.registerPath({
  method: 'get',
  path: '/api/v1/topics',
  tags: ['Topics'],
  summary: '获取选题列表',
  security: [{ bearerAuth: [] }],
  request: { query: topicQuerySchema },
  responses: {
    200: { description: '选题分页列表', content: { 'application/json': { schema: TopicListResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth (Experimental)'],
  summary: '实验性 v1 登录',
  description: '默认关闭；生产仅在独立批准且命中明确用户 ID allowlist 时可用。',
  'x-experimental': true,
  request: { body: { content: { 'application/json': { schema: AuthV1LoginRequest } } } },
  responses: {
    200: { description: 'Web 会话创建成功；Refresh Token 仅通过 HttpOnly Cookie 交付', content: { 'application/json': { schema: AuthV1WebLoginResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth (Experimental)'],
  summary: '实验性 token 轮换',
  description: 'Web 模式只从 HttpOnly Cookie 读取 Refresh Token，并要求 Origin 与 CSRF Header。',
  'x-experimental': true,
  request: { body: { content: { 'application/json': { schema: AuthV1WebRefreshRequest } } } },
  responses: {
    200: { description: '轮换成功；新 Refresh Token 仅通过 Cookie 交付', content: { 'application/json': { schema: AuthV1WebRefreshResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth (Experimental)'],
  summary: '撤销当前实验性会话',
  description: '只影响 v1 session，不改变 legacy logout。',
  'x-experimental': true,
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '会话已撤销', content: { 'application/json': { schema: AuthV1LogoutResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/sessions',
  tags: ['Auth (Experimental)'],
  summary: '查询当前用户实验性会话',
  description: '不返回 token hash、完整 User-Agent 或 IP。',
  'x-experimental': true,
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '活跃会话列表', content: { 'application/json': { schema: AuthV1SessionsResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/topics/{id}',
  tags: ['Topics'],
  summary: '获取选题详情',
  security: [{ bearerAuth: [] }],
  request: { params: TopicIdParams },
  responses: {
    200: { description: '选题详情与历史', content: { 'application/json': { schema: TopicResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/topics',
  tags: ['Topics'],
  summary: '创建选题',
  description: '仍要求 topic:create。可选 client_request_id 为 UUID；同一操作者及相同规范化载荷重放返回原 topicId，不同操作者或载荷复用编号返回 409。旧客户端可继续省略请求编号。',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: TopicCreateRequest } } } },
  responses: {
    200: { description: '选题创建成功', content: { 'application/json': { schema: TopicCreatedResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/topics/create-requests/{requestId}',
  tags: ['Topics'],
  summary: '只读核实选题创建结果',
  description: '只需要登录，状态按当前操作者与请求编号隔离；只返回 created + topicId 或 not_found，不返回选题内容。所有响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: TopicCreateRequestStatusParams },
  responses: {
    200: { description: '当前操作者的最小化创建状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: TopicCreateRequestStatusResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/resource-center/resources',
  tags: ['Resource Center (Legacy)'],
  summary: '创建资料',
  description: '需要 resource:create。新客户端可传 UUID client_request_id；同一操作者及相同规范化载荷返回原资料 ID，其他操作者或不同载荷复用编号返回 409。旧客户端省略请求编号时保留原创建行为。创建、审计和请求回执同事务提交。',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: ResourceCreateRequest } } } },
  responses: {
    201: { description: '资料已创建', content: { 'application/json': { schema: ResourceCreatedResponse } } },
    200: { description: '创建结果已确认并重放原资料 ID', content: { 'application/json': { schema: ResourceCreatedResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/resource-center/resources/create-requests/{requestId}',
  tags: ['Resource Center (Legacy)'],
  summary: '只读核实资料创建结果',
  description: '只需要登录。状态按当前操作者与请求编号隔离，只返回 created + resourceId 或 not_found，不返回资料内容。所有响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: ResourceCreateRequestStatusParams },
  responses: {
    200: { description: '当前操作者的最小化创建状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: ResourceCreateRequestStatusResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/resource-center/categories',
  tags: ['Resource Center (Legacy)'],
  summary: '创建资料分类',
  description: '需要 resource:category_manage。新客户端可传 UUID client_request_id；分类行和操作者隔离回执同事务提交。相同操作者、资料库、请求编号和载荷重放返回原分类 ID；请求编号复用到不同目标或载荷返回 409。旧客户端省略编号时保留原创建行为。',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: ResourceCategoryCreateRequest } } } },
  responses: {
    201: { description: '分类创建成功或已确认先前创建结果', content: { 'application/json': { schema: ResourceCreatedResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/resource-center/categories/{id}',
  tags: ['Resource Center (Legacy)'],
  summary: '更新资料分类',
  description: '需要 resource:category_manage。键控请求需附 UUID client_request_id 和 library_type；分类树路径及请求回执同事务提交。相同操作者、分类、资料库、请求编号和载荷重放不会重复更新；旧客户端可省略请求编号。',
  security: [{ bearerAuth: [] }],
  request: { params: ResourceCategoryUpdateIdParams, body: { content: { 'application/json': { schema: ResourceCategoryUpdateRequest } } } },
  responses: { 200: { description: '分类已更新或已确认先前更新结果' }, ...errorResponses },
});

registry.registerPath({
  method: 'delete',
  path: '/api/resource-center/categories/{id}',
  tags: ['Resource Center (Legacy)'],
  summary: '删除资料分类',
  description: '需要 resource:category_manage。键控请求的 client_request_id、library_type 与分类删除同事务提交；重放原编号只返回原删除结果。存在资料或子分类时拒绝删除。旧客户端可沿用无编号请求。',
  security: [{ bearerAuth: [] }],
  request: { params: ResourceCategoryUpdateIdParams, body: { content: { 'application/json': { schema: ResourceCategoryDeleteRequest } } } },
  responses: { 200: { description: '分类已删除或已确认先前删除结果' }, ...errorResponses },
});

registry.registerPath({
  method: 'get',
  path: '/api/resource-center/categories/mutation-requests/{requestId}',
  tags: ['Resource Center (Legacy)'],
  summary: '只读核实资料分类操作结果',
  description: '需要 resource:category_manage，并提供 64 位 SHA-256 fingerprint。状态按操作者、请求编号和原载荷指纹隔离；返回 created/updated/deleted + categoryId 或 not_found。响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: ResourceCategoryMutationStatusParams, query: ResourceCategoryMutationStatusQuery },
  responses: {
    200: { description: '当前操作者的最小化操作状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: ResourceCategoryMutationStatusResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/backup/create',
  tags: ['Backup (Legacy)'],
  summary: '创建应用备份',
  description: '需要 system:backup。新客户端提供 UUID client_request_id；相同操作者和编号在备份文件保留期间只返回同一备份。旧客户端可继续不带编号创建，但无法通过结果状态接口恢复该请求。',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: BackupCreateRequest } } } },
  responses: {
    200: { description: '备份已创建或同请求结果已恢复', content: { 'application/json': { schema: BackupCreateResponse } } },
    400: { description: '请求编号无效' },
    401: { description: '未登录或登录已失效' },
    403: { description: '缺少 system:backup 权限' },
    409: { description: '备份正在进行' },
    500: { description: '备份创建失败' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/backup/create-requests/{requestId}',
  tags: ['Backup (Legacy)'],
  summary: '只读核实备份创建结果',
  description: '需要 system:backup。状态按当前操作者和 UUID 隔离；仅返回 created + name、pending 或 not_found，不暴露文件路径。所有响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: BackupCreateRequestStatusParams },
  responses: {
    200: { description: '当前操作者的最小化备份状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: BackupCreateRequestStatusResponse } } },
    400: { description: '请求编号无效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    401: { description: '未登录或登录已失效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    403: { description: '缺少 system:backup 权限', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    500: { description: '暂时无法核实备份状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/resource-center/resources/{id}',
  tags: ['Resource Center (Legacy)'],
  summary: '更新资料',
  description: '仍要求 resource:update 和现有资料编辑范围权限。新客户端可传 UUID client_request_id；资料字段、标签、审计记录和操作者/资料/载荷回执在同一事务提交。相同操作者、资料、请求编号与载荷重放返回原成功响应且不重复写审计；编号跨操作者、资料或载荷复用时返回 409。旧客户端省略请求编号时保留原更新行为。',
  security: [{ bearerAuth: [] }],
  request: {
    params: ResourceUpdateIdParams,
    body: { content: { 'application/json': { schema: ResourceUpdateRequest } } },
  },
  responses: {
    200: { description: '资料已更新或已确认此前更新', content: { 'application/json': { schema: ResourceUpdatedResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/resource-center/resources/{id}/update-requests/{requestId}',
  tags: ['Resource Center (Legacy)'],
  summary: '只读核实资料更新结果',
  description: '只需要登录。状态按当前操作者、资料编号和请求编号隔离，只返回 updated + resourceId 或 not_found，不返回资料内容。所有响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: ResourceUpdateRequestStatusParams },
  responses: {
    200: { description: '当前操作者和目标资料的最小化更新状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: ResourceUpdateRequestStatusResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/topics/{id}',
  tags: ['Topics'],
  summary: '更新选题',
  security: [{ bearerAuth: [] }],
  request: {
    params: TopicIdParams,
    body: { content: { 'application/json': { schema: updateTopicInputSchema } } },
  },
  responses: {
    200: { description: '选题更新成功', content: { 'application/json': { schema: TopicMutationResponse } } },
    ...errorResponses,
  },
});

registry.registerPath({ method: 'delete', path: '/api/v1/topics/{id}', tags: ['Topics'], summary: '删除选题', security: [{ bearerAuth: [] }], request: { params: TopicIdParams }, responses: { 200: { description: '选题已删除', content: { 'application/json': { schema: TopicMutationResponse } } }, ...errorResponses } });
registry.registerPath({ method: 'post', path: '/api/v1/topics/{id}/audit', tags: ['Topics'], summary: '审核选题', security: [{ bearerAuth: [] }], request: { params: TopicIdParams, body: { content: { 'application/json': { schema: auditTopicInputSchema } } } }, responses: { 200: { description: '审核完成', content: { 'application/json': { schema: TopicMutationResponse } } }, ...errorResponses } });
registry.registerPath({ method: 'post', path: '/api/v1/topics/{id}/status', tags: ['Topics'], summary: '变更选题状态', security: [{ bearerAuth: [] }], request: { params: TopicIdParams, body: { content: { 'application/json': { schema: transitionTopicInputSchema } } } }, responses: { 200: { description: '状态已变更', content: { 'application/json': { schema: TopicMutationResponse } } }, ...errorResponses } });

registry.registerPath({
  method: 'get',
  path: '/api/report-summaries/monthly',
  tags: ['Report Summaries (Legacy)'],
  summary: '读取本人月报总结',
  description: '需要登录；仅读取当前用户和月份的总结。year/month 缺省时使用当前年月。响应包含 baseline_fingerprint；无记录时返回对应空内容和稳定的 no-row 基线。',
  security: [{ bearerAuth: [] }],
  request: { query: ReportSummaryQuery },
  responses: { 200: { description: '本人指定月份的总结与并发基线', content: { 'application/json': { schema: ReportSummaryReadResponse } } }, ...errorResponses },
});
registry.registerPath({
  method: 'put',
  path: '/api/report-summaries/monthly',
  tags: ['Report Summaries (Legacy)'],
  summary: '保存本人月报总结',
  description: '需要登录；写入范围仍仅限当前用户。旧客户端可不带恢复字段并沿用 upsert。新客户端提供 UUID client_request_id 与 GET 返回的 base_fingerprint，服务端以月报字段值生成请求指纹，并在一个事务中先核对回执、再比较 baseline、upsert 和写入完整回执。基线变化返回 REPORT_SUMMARY_UPDATE_BASE_CONFLICT；其他请求编号/载荷复用返回 REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT。',
  security: [{ bearerAuth: [] }],
  request: { query: ReportSummaryQuery, body: { content: { 'application/json': { schema: ReportSummaryWriteRequest } } } },
  responses: {
    200: { description: '月报已保存或同请求结果已恢复', content: { 'application/json': { schema: ReportSummaryWriteResponse } } },
    400: { description: '年份、月份或恢复请求编号/基线无效' },
    401: { description: '未登录或登录已失效' },
    409: { description: '并发基线或请求编号冲突', content: { 'application/json': { schema: ReportSummaryUpdateConflictResponse } } },
    500: { description: '月报保存失败' },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/report-summaries/monthly/requests/{requestId}',
  tags: ['Report Summaries (Legacy)'],
  summary: '只读核实月报更新结果',
  description: '需要登录；当前用户、月份和请求编号隔离，必须提供 64 位 SHA-256 fingerprint。仅返回 processed + 原请求保存的总结快照或 not_found；请求指纹冲突为 409。所有响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: ReportSummaryStatusParams, query: ReportSummaryMonthlyStatusQuery },
  responses: {
    200: { description: '月报更新状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: ReportSummaryUpdateStatusResponse } } },
    400: { description: '请求编号、年份、月份或指纹无效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    401: { description: '未登录或登录已失效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    409: { description: '请求指纹与回执不匹配', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: ReportSummaryStatusConflictResponse } } },
    500: { description: '暂时无法核实月报更新结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/report-summaries/yearly',
  tags: ['Report Summaries (Legacy)'],
  summary: '读取本人年报总结',
  description: '需要登录；仅读取当前用户和年份的总结。year 缺省时使用当前年份。响应包含 baseline_fingerprint；无记录时返回对应空内容和稳定的 no-row 基线。',
  security: [{ bearerAuth: [] }],
  request: { query: ReportSummaryYearQuery },
  responses: { 200: { description: '本人指定年份的总结与并发基线', content: { 'application/json': { schema: ReportSummaryReadResponse } } }, ...errorResponses },
});
registry.registerPath({
  method: 'put',
  path: '/api/report-summaries/yearly',
  tags: ['Report Summaries (Legacy)'],
  summary: '保存本人年报总结',
  description: '需要登录；写入范围仍仅限当前用户。旧客户端可不带恢复字段并沿用 upsert。新客户端提供 UUID client_request_id 与 GET 返回的 base_fingerprint，服务端以年报字段值生成请求指纹，并在一个事务中先核对回执、再比较 baseline、upsert 和写入完整回执。基线变化返回 REPORT_SUMMARY_UPDATE_BASE_CONFLICT；其他请求编号/载荷复用返回 REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT。',
  security: [{ bearerAuth: [] }],
  request: { query: ReportSummaryYearQuery, body: { content: { 'application/json': { schema: ReportSummaryWriteRequest } } } },
  responses: {
    200: { description: '年报已保存或同请求结果已恢复', content: { 'application/json': { schema: ReportSummaryWriteResponse } } },
    400: { description: '年份或恢复请求编号/基线无效' },
    401: { description: '未登录或登录已失效' },
    409: { description: '并发基线或请求编号冲突', content: { 'application/json': { schema: ReportSummaryUpdateConflictResponse } } },
    500: { description: '年报保存失败' },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/report-summaries/yearly/requests/{requestId}',
  tags: ['Report Summaries (Legacy)'],
  summary: '只读核实年报更新结果',
  description: '需要登录；当前用户、年份和请求编号隔离，必须提供 64 位 SHA-256 fingerprint。仅返回 processed + 原请求保存的总结快照或 not_found；请求指纹冲突为 409。所有响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: ReportSummaryStatusParams, query: ReportSummaryYearlyStatusQuery },
  responses: {
    200: { description: '年报更新状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: ReportSummaryUpdateStatusResponse } } },
    400: { description: '请求编号、年份或指纹无效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    401: { description: '未登录或登录已失效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    409: { description: '请求指纹与回执不匹配', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: ReportSummaryStatusConflictResponse } } },
    500: { description: '暂时无法核实年报更新结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/admin/anonymous-feedback',
  tags: ['Anonymous Feedback (Legacy)'],
  summary: '获取匿名意见管理列表',
  description: '需要管理员角色。列表项包含服务端计算的 base_fingerprint，供 keyed PATCH 的并发比较使用。客户端列表读取应使用 no-store，避免缓存验证响应没有 JSON 正文。',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '管理员可见的意见列表', content: { 'application/json': { schema: AnonymousFeedbackAdminListResponse } } },
    ...errorResponses,
  },
});
registry.registerPath({
  method: 'patch',
  path: '/api/admin/anonymous-feedback/{id}',
  tags: ['Anonymous Feedback (Legacy)'],
  summary: '更新意见状态、回复或公开状态',
  description: '需要管理员角色。旧客户端可不带恢复字段。新客户端提交 client_request_id、base_fingerprint 和 request_fingerprint；状态、回复内容与 is_public 目标值按 SHA256(JSON.stringify([id,base_fingerprint,status??null,trimmed_reply_or_null??null,is_public??null])) 计算请求指纹。基线比较、意见更新与操作者回执在同一事务内完成；相同请求重放不重复更新，基线冲突不写入，编号/载荷冲突返回 409。SAFE_EXPAND 迁移 063 仅新增回执表。',
  security: [{ bearerAuth: [] }],
  request: {
    params: AnonymousFeedbackUpdateIdParams,
    body: { content: { 'application/json': { schema: AnonymousFeedbackUpdateRequest } } },
  },
  responses: {
    200: { description: '意见已更新或返回此前同请求结果', content: { 'application/json': { schema: z.object({ success: z.literal(true), idempotent_replay: z.boolean().optional() }).strict() } } },
    400: { description: '意见字段、请求编号或指纹无效', content: { 'application/json': { schema: errorResponses[400].content['application/json'].schema } } },
    401: { description: '未登录或登录已失效', content: { 'application/json': { schema: errorResponses[401].content['application/json'].schema } } },
    403: { description: '仅管理员可更新匿名意见', content: { 'application/json': { schema: errorResponses[403].content['application/json'].schema } } },
    404: { description: '意见不存在', content: { 'application/json': { schema: errorResponses[404].content['application/json'].schema } } },
    409: { description: '基线冲突或请求编号冲突；冲突状态不得作为未写入证据', content: { 'application/json': { schema: errorResponses[409].content['application/json'].schema } } },
    500: { description: '意见更新失败', content: { 'application/json': { schema: errorResponses[500].content['application/json'].schema } } },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/admin/anonymous-feedback/{targetId}/update-requests/{requestId}',
  tags: ['Anonymous Feedback (Legacy)'],
  summary: '只读核实匿名意见更新结果',
  description: '需要管理员角色，且不授予额外意见写权限。查询需提供 request_fingerprint；状态按当前操作者、目标意见和指纹隔离，仅返回 processed/not_found/target_missing/conflict，不返回意见正文。所有响应均 Cache-Control: no-store。',
  security: [{ bearerAuth: [] }],
  request: { params: AnonymousFeedbackUpdateStatusParams, query: AnonymousFeedbackUpdateStatusQuery },
  responses: {
    200: { description: '当前操作者的最小化更新状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: AnonymousFeedbackUpdateStatusResponse } } },
    400: { description: '请求编号、意见编号或指纹无效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    401: { description: '未登录或登录已失效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    403: { description: '仅管理员可核实匿名意见更新结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    500: { description: '暂时无法核实更新结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
  },
});

registry.registerPath({ method: 'get', path: '/api/templates', tags: ['Templates (Legacy)'], summary: '获取选题模板', description: '需要登录。当前响应包含服务端计算的 base_fingerprint，供带请求编号的更新/删除执行 compare-and-swap。', security: [{ bearerAuth: [] }], responses: { 200: { description: '模板列表', content: { 'application/json': { schema: z.object({ data: z.array(LegacyTemplate) }) } } }, ...errorResponses } });
registry.registerPath({
  method: 'get',
  path: '/api/templates/requests/{requestId}',
  tags: ['Templates (Legacy)'],
  summary: '只读核实选题模板操作结果',
  description: '需要 system:template 权限。查询需带 operation=create|update|delete 和 request_fingerprint；update/delete 还需带 target_id。状态按操作者、操作、目标与指纹隔离，仅返回 processed/not_found/target_missing/conflict；create 的 processed 状态另返回 target_id。响应禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: LegacyTemplateMutationStatusParams, query: LegacyTemplateMutationStatusQuery },
  responses: {
    200: { description: '当前操作者的最小化模板操作状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: LegacyTemplateMutationStatusResponse } } },
    400: { description: '请求编号、操作、目标或指纹无效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    401: { description: '未登录或登录已失效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    403: { description: '缺少 system:template 权限', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
    500: { description: '暂时无法核实模板操作结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } } },
  },
});
registry.registerPath({ method: 'post', path: '/api/templates', tags: ['Templates (Legacy)'], summary: '创建选题模板', description: '写入要求 system:template 权限。新客户端可提供 client_request_id 和规范化请求指纹；同操作者、同载荷重放返回原模板，不同操作者或载荷返回 409。旧客户端仍可不带编号创建。', security: [{ bearerAuth: [] }], request: { body: { content: { 'application/json': { schema: LegacyTemplateCreateRequest } } } }, responses: { 200: { description: '模板已创建或已确认此前同请求结果', content: { 'application/json': { schema: LegacyTemplateMutationResponse } } }, ...errorResponses } });
registry.registerPath({ method: 'put', path: '/api/templates/{id}', tags: ['Templates (Legacy)'], summary: '更新选题模板', description: '写入要求 system:template 权限。新客户端提供 client_request_id、写前 base_fingerprint 和规范化请求指纹；服务端在事务中比较基线后更新并记回执。基线变化不应用本次更新；旧客户端仍可不带编号更新。', security: [{ bearerAuth: [] }], request: { params: LegacyIdParams, body: { content: { 'application/json': { schema: LegacyTemplateUpdateRequest } } } }, responses: { 200: { description: '模板已更新或已确认此前同请求结果', content: { 'application/json': { schema: LegacyTemplateMutationResponse } } }, ...errorResponses } });
registry.registerPath({ method: 'delete', path: '/api/templates/{id}', tags: ['Templates (Legacy)'], summary: '删除选题模板', description: '写入要求 system:template 权限。新客户端提供 client_request_id、写前 base_fingerprint 和请求指纹；服务端在事务内比较基线、删除模板并写入结果回执。旧客户端仍可不带编号删除。', security: [{ bearerAuth: [] }], request: { params: LegacyIdParams, body: { content: { 'application/json': { schema: LegacyTemplateDeleteRequest } } } }, responses: { 200: { description: '模板已删除或已确认此前同请求结果', content: { 'application/json': { schema: LegacyTemplateMutationResponse } } }, ...errorResponses } });
registry.registerPath({
  method: 'post',
  path: '/api/workflow-templates',
  tags: ['Workflow Templates (Legacy)'],
  summary: '创建审批流模板',
  description: '写入需要 system:template 权限。可选 client_request_id 为 UUID；同一操作者和相同载荷的重放返回首次创建的模板，不同载荷或操作者冲突返回 409。旧客户端可继续省略该字段。',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: WorkflowTemplateCreateInput } } } },
  responses: {
    200: { description: '模板已创建或返回同请求既有结果', content: { 'application/json': { schema: WorkflowTemplateCreateResponse } } },
    410: { description: '原请求对应模板已删除，重放不会复活模板', content: { 'application/json': { schema: WorkflowTemplateCreateDeletedResponse } } },
    400: { description: '请求参数或 UUID 不合法', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    401: { description: '未登录或登录已失效', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    403: { description: '缺少 system:template 写权限', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    409: { description: '请求编号已用于其他操作者或载荷', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    500: { description: '模板创建失败', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/workflow-templates/create-requests/{requestId}',
  tags: ['Workflow Templates (Legacy)'],
  summary: '只读核实审批流模板创建结果',
  description: '只需要登录，不授予创建权限；必须提供 64 位十六进制 SHA-256 fingerprint。先按当前操作者和请求编号隔离，跨操作者和不存在的请求统一返回 404；本人请求指纹不匹配返回 409，匹配后返回 200 或 410。所有响应均禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: WorkflowTemplateCreateRequestParams, query: WorkflowTemplateCreateStatusQuery },
  responses: {
    200: { description: '当前操作者的模板创建结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateStatusResponse } } },
    410: { description: '指纹匹配，但模板已被删除，原创建请求保持墓碑', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateDeletedResponse } } },
    404: { description: '没有找到当前操作者的请求记录；跨操作者与不存在请求统一响应', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    409: { description: '当前操作者的请求记录存在，但载荷指纹不匹配', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    400: { description: '请求编号或 fingerprint 缺失或不合法', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    401: { description: '未登录或登录已失效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    500: { description: '暂时无法核实创建结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/workflow-templates/{id}',
  tags: ['Workflow Templates (Legacy)'],
  summary: '获取审批流模板详情',
  description: '详情响应附带服务端按名称、说明和节点生成的 base_fingerprint；编辑器应将其连同原快照保存，并在带请求编号的更新中提交。',
  security: [{ bearerAuth: [] }],
  request: { params: WorkflowTemplateUpdateIdParams },
  responses: {
    200: { description: '模板详情及并发更新基线指纹', content: { 'application/json': { schema: WorkflowTemplateDetailResponse } } },
    401: { description: '未登录或登录已失效', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    404: { description: '模板不存在', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    500: { description: '模板详情读取失败', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
  },
});
registry.registerPath({
  method: 'put',
  path: '/api/workflow-templates/{id}',
  tags: ['Workflow Templates (Legacy)'],
  summary: '更新审批流模板',
  description: '仍要求 system:template。带 UUID client_request_id 的新客户端必须提交完整载荷与详情 GET 返回的 base_fingerprint。服务端先识别已处理回执，再在写事务中比对当前模板/节点指纹；基线已变化时返回 WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT 409，不修改模板、不替换节点且不写回执。成功时模板、节点和回执同事务提交；同操作者、模板、请求编号、基线及载荷重放不重复替换节点；请求编号跨操作者、模板、基线或载荷复用返回 409。旧客户端不带请求编号时仍执行既有更新路径。',
  security: [{ bearerAuth: [] }],
  request: {
    params: WorkflowTemplateUpdateIdParams,
    body: { content: { 'application/json': { schema: WorkflowTemplateUpdateInput } } },
  },
  responses: {
    200: { description: '模板更新成功或返回此前同请求结果', content: { 'application/json': { schema: WorkflowTemplateUpdateResponse } } },
    400: { description: '模板名称、节点转换、UUID 或 base_fingerprint 不合法', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    401: { description: '未登录或登录已失效', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    403: { description: '缺少 system:template 写权限', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    404: { description: '模板不存在', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    409: { description: 'WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT 表示确认未写入并返回当前基线；WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT 表示请求编号冲突，需继续核实', content: { 'application/json': { schema: WorkflowTemplateUpdateConflictResponse } } },
    500: { description: '模板更新失败', content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/workflow-templates/{id}/update-requests/{requestId}',
  tags: ['Workflow Templates (Legacy)'],
  summary: '只读核实审批流模板更新结果',
  description: '只需要登录，不授予模板写权限；按当前操作者、模板 ID 和请求编号隔离，并要求提供 64 位 SHA-256 复合 fingerprint=SHA256(JSON.stringify([base_fingerprint,payload_fingerprint]))。返回 updated + templateId 或 not_found；本人请求指纹不匹配返回 409。所有响应均禁止缓存。',
  security: [{ bearerAuth: [] }],
  request: { params: WorkflowTemplateUpdateRequestParams, query: WorkflowTemplateCreateStatusQuery },
  responses: {
    200: { description: '模板更新状态', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateUpdateStatusResponse } } },
    400: { description: '模板 ID、请求编号或 fingerprint 无效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    401: { description: '未登录或登录已失效', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    409: { description: '请求存在但载荷指纹不匹配', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
    500: { description: '暂时无法核实更新结果', headers: { 'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } } }, content: { 'application/json': { schema: WorkflowTemplateCreateErrorResponse } } },
  },
});
registry.registerPath({ method: 'post', path: '/api/templates', tags: ['Templates (Legacy)'], summary: '创建选题模板', security: [{ bearerAuth: [] }], request: { body: { content: { 'application/json': { schema: LegacyTemplateInput } } } }, responses: { 200: { description: '模板已创建' }, ...errorResponses } });
registry.registerPath({ method: 'put', path: '/api/templates/{id}', tags: ['Templates (Legacy)'], summary: '更新选题模板', security: [{ bearerAuth: [] }], request: { params: LegacyIdParams, body: { content: { 'application/json': { schema: LegacyTemplateInput.partial() } } } }, responses: { 200: { description: '模板已更新' }, ...errorResponses } });
registry.registerPath({ method: 'delete', path: '/api/templates/{id}', tags: ['Templates (Legacy)'], summary: '删除选题模板', security: [{ bearerAuth: [] }], request: { params: LegacyIdParams }, responses: { 200: { description: '模板已删除' }, ...errorResponses } });
registry.registerPath({ method: 'post', path: '/api/pomodoro/start', tags: ['Pomodoro (Legacy)'], summary: '开始专注计时', security: [{ bearerAuth: [] }], request: { body: { content: { 'application/json': { schema: LegacyPomodoroStart } } } }, responses: { 200: { description: '计时已开始' }, ...errorResponses } });
for (const action of ['complete', 'cancel'] as const) registry.registerPath({ method: 'post', path: `/api/pomodoro/{id}/${action}`, tags: ['Pomodoro (Legacy)'], summary: action === 'complete' ? '完成专注计时' : '放弃专注计时', security: [{ bearerAuth: [] }], request: { params: LegacyIdParams }, responses: { 200: { description: '操作完成' }, ...errorResponses } });
for (const path of ['/api/pomodoro/stats', '/api/pomodoro/ranking'] as const) registry.registerPath({ method: 'get', path, tags: ['Pomodoro (Legacy)'], summary: path.endsWith('stats') ? '获取个人专注统计' : '获取脱敏团队排行', security: [{ bearerAuth: [] }], responses: { 200: { description: '统计结果' }, ...errorResponses } });

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'XMT API',
      version: '1.0.0',
      description: 'XMT v1 API 契约，以及已完成 schema 化的首页关注事项/最近变化、模板和专注计时 legacy 接口。未列出的 legacy /api/* 不在此契约内。',
    },
    servers: [{ url: '/' }],
  });
}

export const openApiDocument = generateOpenApiDocument();
export const openApiRouter = express.Router();

openApiRouter.get('/openapi.json', (_req, res) => res.json(openApiDocument));
openApiRouter.use('/', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  swaggerOptions: { persistAuthorization: true },
}));

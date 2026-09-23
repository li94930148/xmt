import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
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

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const ApiError = registry.register('ApiError', apiErrorSchema);
const Topic = registry.register('Topic', topicResponseSchema);
const TopicListResponse = registry.register('TopicListResponse', apiSuccessSchema(z.array(Topic)));
const TopicResponse = registry.register('TopicResponse', apiSuccessSchema(Topic));
const TopicMutationResponse = registry.register('TopicMutationResponse', apiSuccessSchema(z.null()));
const TopicCreatedResponse = registry.register(
  'TopicCreatedResponse',
  apiSuccessSchema(z.object({ topicId: z.number().int().positive() }).strict()),
);
const TopicIdParams = registry.register('TopicIdParams', z.object({ id: idSchema }).strict());
const AuthV1LoginRequest = registry.register('AuthV1LoginRequest', loginV1RequestSchema);
const AuthV1WebLoginResponse = registry.register('AuthV1WebLoginResponse', apiSuccessSchema(loginV1WebDataSchema));
const AuthV1WebRefreshRequest = registry.register('AuthV1WebRefreshRequest', refreshWebRequestSchema);
const AuthV1WebRefreshResponse = registry.register('AuthV1WebRefreshResponse', apiSuccessSchema(refreshWebDataSchema));
const AuthV1SessionsResponse = registry.register('AuthV1SessionsResponse', apiSuccessSchema(sessionsDataSchema));
const AuthV1LogoutResponse = registry.register('AuthV1LogoutResponse', apiSuccessSchema(z.null()));
const AuthV1MobileLoginResponse = registry.register('AuthV1MobileLoginResponse', apiSuccessSchema(loginV1DataSchema));
const AuthV1MobileRefreshResponse = registry.register('AuthV1MobileRefreshResponse', apiSuccessSchema(refreshDataSchema));
const AuthV1MobileRefreshRequest = registry.register('AuthV1MobileRefreshRequest', refreshRequestSchema);
const AuthV1MobileSessionResponse = registry.register('AuthV1MobileSessionResponse', apiSuccessSchema(sessionsDataSchema.element));
const AuthRolloutStatusResponse = registry.register('AuthRolloutStatusResponse', apiSuccessSchema(authRolloutStatusDataSchema));
const LegacyTemplate = registry.register('LegacyTemplate', z.object({ id: z.number().int(), name: z.string(), platform: z.string().nullable().optional(), description: z.string().nullable().optional(), template_data: z.string().nullable().optional(), creator_name: z.string().nullable().optional() }).passthrough());
const LegacyTemplateInput = registry.register('LegacyTemplateInput', z.object({ name: z.string().trim().min(1).max(120), platform: z.string().max(50).optional(), description: z.string().max(1000).optional(), template_data: z.union([z.string().max(100_000), z.record(z.unknown())]), is_default: z.boolean().optional() }).strict());
const LegacyPomodoroStart = registry.register('LegacyPomodoroStart', z.object({ duration: z.number().int().min(1).max(180).optional(), topic_id: z.number().int().positive().nullable().optional() }).strict());
const LegacyIdParams = registry.register('LegacyIdParams', z.object({ id: idSchema }).strict());

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
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createTopicInputSchema } } } },
  responses: {
    200: { description: '选题创建成功', content: { 'application/json': { schema: TopicCreatedResponse } } },
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

registry.registerPath({ method: 'get', path: '/api/templates', tags: ['Templates (Legacy)'], summary: '获取选题模板', security: [{ bearerAuth: [] }], responses: { 200: { description: '模板列表', content: { 'application/json': { schema: z.object({ data: z.array(LegacyTemplate) }) } } }, ...errorResponses } });
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
      description: 'XMT v1 API 契约，以及已完成 schema 化的模板和专注计时 legacy 接口。未列出的 legacy /api/* 不在此契约内。',
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

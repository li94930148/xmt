import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { apiErrorSchema, apiSuccessSchema } from '@shared/schema/error.schema';
import { idSchema } from '@shared/schema/common.schema';
import {
  createTopicInputSchema,
  topicQuerySchema,
  topicResponseSchema,
  updateTopicInputSchema,
} from '@shared/schema/topics.schema';
import {
  loginV1WebDataSchema,
  loginV1RequestSchema,
  refreshWebDataSchema,
  refreshWebRequestSchema,
  sessionsDataSchema,
} from '@shared/schema/auth.schema';

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
  description: '仅在 XMT_AUTH_V1_ENABLED=true 时可用；默认关闭。',
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

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'XMT API',
      version: '1.0.0',
      description: 'XMT v1 API Contract。legacy /api/* 不属于此契约。',
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

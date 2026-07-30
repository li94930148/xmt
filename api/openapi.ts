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

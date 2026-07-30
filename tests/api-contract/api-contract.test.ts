import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-api-contract-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'api-contract.test.db');
process.env.JWT_SECRET = 'api-contract-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { requestId } = await import('../../api/middleware/request-id.js');
const { sendV1Error, sendV1Success } = await import('../../api/utils/response.js');
const { apiErrorSchema, apiSuccessSchema } = await import('../../shared/schema/error.schema.js');
const { SqliteTopicRepository } = await import('../../api/modules/topics/topics.sqlite-repository.js');
const { TopicService } = await import('../../api/modules/topics/topics.service.js');
const { TopicController } = await import('../../api/modules/topics/topics.controller.js');
const { currentTopicPolicy } = await import('../../api/modules/topics/topics.policy.js');
const { createV1TopicsRouter } = await import('../../api/modules/topics/topics.routes.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { generateOpenApiDocument } = await import('../../api/openapi.js');
const { z } = await import('zod');

await initDatabase();

function startApp() {
  const repository = new SqliteTopicRepository();
  const service = new TopicService({
    repository,
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
  });
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.get('/contract/success', (req, res) => sendV1Success(req, res, { ok: true }, { page: 1, limit: 10, total: 1 }));
  app.get('/contract/error', (req, res) => sendV1Error(req, res, {
    code: 'VALIDATION_ERROR',
    message: '测试错误',
    details: { field: 'title' },
  }, 400));
  app.use('/api/v1/topics', createV1TopicsRouter(new TopicController(service)));
  return app.listen(0, '127.0.0.1');
}

async function responseAndRequestIdTests(baseUrl: string) {
  const suppliedId = 'api-contract-supplied-id';
  const successResponse = await fetch(`${baseUrl}/contract/success`, {
    headers: { 'X-Request-ID': suppliedId },
  });
  assert.equal(successResponse.headers.get('X-Request-ID'), suppliedId);
  const success = await successResponse.json();
  assert.deepEqual(apiSuccessSchema(z.object({ ok: z.boolean() })).parse(success), {
    success: true,
    data: { ok: true },
    meta: { page: 1, limit: 10, total: 1, requestId: suppliedId },
  });

  const errorResponse = await fetch(`${baseUrl}/contract/error`);
  const generatedId = errorResponse.headers.get('X-Request-ID');
  assert.match(generatedId || '', /^[0-9a-f-]{36}$/);
  const error = apiErrorSchema.parse(await errorResponse.json());
  assert.equal(error.error.code, 'VALIDATION_ERROR');
  assert.equal(error.error.requestId, generatedId);
  assert.deepEqual(error.error.details, { field: 'title' });
}

async function topicV1Tests(baseUrl: string) {
  const userId = await executeInsert(
    `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['api-contract-user', 'unused', 'contract@example.invalid', 'admin', 'Contract User', 1, 0],
  );
  await execute(
    'INSERT INTO topics (title, description, platform, creator_id, status) VALUES (?, ?, ?, ?, ?)',
    ['Contract Topic', 'API v1', 'douyin', userId, 'pending'],
  );
  const headers = {
    Authorization: `Bearer ${signToken({ userId })}`,
    'X-Request-ID': 'topic-v1-request',
  };

  const listResponse = await fetch(`${baseUrl}/api/v1/topics?search=Contract`, { headers });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json() as {
    success: boolean;
    data: unknown[];
    meta: { page: number; limit: number; total: number; requestId: string };
  };
  assert.equal(list.success, true);
  assert.equal(list.data.length, 1);
  assert.deepEqual(list.meta, { page: 1, limit: 10, total: 1, requestId: 'topic-v1-request' });

  const missingResponse = await fetch(`${baseUrl}/api/v1/topics/999999`, { headers });
  assert.equal(missingResponse.status, 404);
  const missing = apiErrorSchema.parse(await missingResponse.json());
  assert.equal(missing.error.code, 'RESOURCE_NOT_FOUND');
  assert.equal(missing.error.requestId, 'topic-v1-request');

  const invalidIdResponse = await fetch(`${baseUrl}/api/v1/topics/not-a-number`, { headers });
  assert.equal(invalidIdResponse.status, 400);
  const invalidId = apiErrorSchema.parse(await invalidIdResponse.json());
  assert.equal(invalidId.error.code, 'VALIDATION_ERROR');

  const unauthenticatedResponse = await fetch(`${baseUrl}/api/v1/topics`);
  assert.equal(unauthenticatedResponse.status, 401);
  const unauthenticated = apiErrorSchema.parse(await unauthenticatedResponse.json());
  assert.equal(unauthenticated.error.code, 'AUTH_REQUIRED');
}

function openApiTests() {
  const document = generateOpenApiDocument();
  assert.equal(document.openapi, '3.0.3');
  assert.ok(document.paths['/api/v1/topics']?.get);
  assert.ok(document.paths['/api/v1/topics']?.post);
  assert.ok(document.paths['/api/v1/topics/{id}']?.get);
  assert.ok(document.paths['/api/v1/topics/{id}']?.put);
  assert.equal(document.paths['/api/v1/auth/login']?.post?.['x-experimental'], true);
  assert.equal(document.paths['/api/v1/auth/refresh']?.post?.['x-experimental'], true);
  assert.equal(document.paths['/api/v1/auth/logout']?.post?.['x-experimental'], true);
  assert.equal(document.paths['/api/v1/auth/sessions']?.get?.['x-experimental'], true);
  assert.ok(document.components?.schemas?.ApiError);
  assert.ok(document.components?.schemas?.Topic);
  assert.ok(document.components?.securitySchemes?.bearerAuth);
}

const server = startApp();
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  await responseAndRequestIdTests(baseUrl);
  await topicV1Tests(baseUrl);
  openApiTests();
  console.log('API Contract tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

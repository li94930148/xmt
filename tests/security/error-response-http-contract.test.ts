import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 必须在导入 app 之前设置，与项目其他后端测试保持一致
process.env.JWT_SECRET = 'error-response-http-contract-test-secret';
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-error-http-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'test.db');

/**
 * HTTP 层契约测试。
 *
 * 背景：`api/app.ts` 通过一个挂在 `/api` 上的中间件（monkey-patch `res.json`）
 * 统一剥离 5xx 响应里的可枚举 error 字段。源码中仍有一百多处
 * `res.status(500).json({ message, error })` 的旧写法，安全性完全依赖该中间件。
 *
 * 纯函数测试（error-response-sanitization.test.ts）只验证 `sanitizeServerErrorPayload`，
 * 无法发现"中间件被误删/路由挪出 /api 前缀"这类问题——那种情况下单测全绿而 SQL 已泄露。
 * 本测试直接打真实 HTTP 请求，守护的正是这层真正的防护。
 */
const { default: app } = await import('../../api/app.js');
const { queryOne } = await import('../../api/database/utils.js');
const { closeDatabase } = await import('../../api/database/db.js');

const PROBE_TABLE = 'no_such_table_for_http_contract';
const PROBE_PARAM = 'super-secret-binding-value';

const probeRouter = express.Router();
probeRouter.get('/__error_contract_probe', async (_req, res) => {
  try {
    await queryOne(`SELECT * FROM ${PROBE_TABLE} WHERE token = ?`, [PROBE_PARAM]);
    res.json({ ok: true });
  } catch (error) {
    // 复刻源码中遗留的旧写法
    res.status(500).json({ message: '操作失败', error });
  }
});

// app 末尾有一个 "API not found" 的兜底，直接 app.use 会被它吃掉，
// 因此把探针层插到兜底之前，确保走的是真实的中间件链。
const stack = (app as unknown as { _router: { stack: unknown[] } })._router.stack;
app.use('/api', probeRouter);
const routerLayer = stack.pop();
const insertAt = Math.max(stack.length - 1, 0);
stack.splice(insertAt, 0, routerLayer);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const port = (server.address() as { port: number }).port;

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/__error_contract_probe`);
  const body = await response.text();

  assert.equal(response.status, 500, '探针应返回 500，否则说明中间件链未按预期执行');

  // 核心断言：任何实现细节都不得出现在响应体中
  assert.equal(body.includes(PROBE_TABLE), false, '响应体泄露了 SQL 表名');
  assert.equal(body.includes(PROBE_PARAM), false, '响应体泄露了 SQL 绑定参数');
  assert.equal(body.includes('"sql"'), false, '响应体泄露了 sql 字段');
  assert.equal(body.includes('"params"'), false, '响应体泄露了 params 字段');

  // 同时在保留业务语义：message 要留，且要给出可追踪的错误码
  assert.equal(body.includes('操作失败'), true, '业务 message 不应被一并抹掉');
  assert.equal(body.includes('INTERNAL_ERROR'), true, '应返回 INTERNAL_ERROR 便于前后端定位');

  const notFoundResponse = await fetch(`http://127.0.0.1:${port}/api/__missing_error_contract_probe`);
  const notFoundBody = await notFoundResponse.json() as { error?: string };
  assert.equal(notFoundResponse.status, 404);
  assert.equal(notFoundBody.error, '暂时找不到此功能，请刷新页面后重试', '未知功能的提示应使用用户可读中文');

  const notFoundV1Response = await fetch(`http://127.0.0.1:${port}/api/v1/__missing_error_contract_probe`);
  const notFoundV1Body = await notFoundV1Response.json() as { error?: { message?: string } };
  assert.equal(notFoundV1Response.status, 404);
  assert.equal(notFoundV1Body.error?.message, '暂时找不到此功能，请刷新页面后重试', '新接口的兜底提示也应使用用户可读中文');

  const oversizedBody = JSON.stringify({ content: 'x'.repeat(16 * 1024 * 1024) });
  for (const endpoint of ['/api/__payload_limit_contract_probe', '/api/v1/__payload_limit_contract_probe']) {
    const oversizedResponse = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversizedBody,
    });
    const oversizedResponseBody = await oversizedResponse.json() as {
      error?: string | { message?: string };
      message?: string;
    };
    assert.equal(oversizedResponse.status, 413);
    if (endpoint.startsWith('/api/v1/')) {
      assert.equal(typeof oversizedResponseBody.error, 'object');
      assert.equal((oversizedResponseBody.error as { message?: string }).message, '文件或内容过大，请精简后重试');
    } else {
      assert.equal(oversizedResponseBody.error, '内容过大');
      assert.equal(oversizedResponseBody.message, '文件或内容过大，请精简后重试');
    }
    assert.equal(JSON.stringify(oversizedResponseBody).includes('请求体'), false, '提示中不应出现请求体术语');
  }

  console.log('错误响应 HTTP 层契约通过：SQL/参数未外泄，404/413 提示使用用户可读中文');

} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

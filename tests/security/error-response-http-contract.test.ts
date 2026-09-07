import assert from 'node:assert/strict';
import express from 'express';

// 必须在导入 app 之前设置，与项目其他后端测试保持一致
process.env.JWT_SECRET = 'error-response-http-contract-test-secret';

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

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const port = (server.address() as { port: number }).port;

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

console.log('错误响应 HTTP 层脱敏契约通过：SQL 与绑定参数均未外泄，业务 message 保留');

server.close();
process.exit(0);

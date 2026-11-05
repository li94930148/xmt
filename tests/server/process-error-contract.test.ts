import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAsyncRouter } from '../../api/middleware/async-router.js';
import { getProcessReadiness } from '../../api/middleware/process-health.js';
import { createRequestErrorHandler } from '../../api/middleware/request-error-handler.js';
import { requestId } from '../../api/middleware/request-id.js';

const SENSITIVE_VALUE = 'SENSITIVE_ROUTE_ERROR_VALUE';
const logged: Array<{ details: unknown; message: string }> = [];
const logger = {
  error: (details: unknown, message: string) => logged.push({ details, message }),
  warn: (details: unknown, message: string) => logged.push({ details, message }),
} as unknown as Parameters<typeof createRequestErrorHandler>[0];

const app = express();
app.use(requestId);

const routes = createAsyncRouter();
routes.get('/sync-throw', () => { throw Object.assign(new Error(SENSITIVE_VALUE), { sql: 'SELECT secret' }); });
routes.get('/async-reject', async () => { throw Object.assign(new Error(SENSITIVE_VALUE), { token: 'private' }); });
routes.get('/returned-promise-reject', () => Promise.reject(new Error(SENSITIVE_VALUE)));
routes.route('/chained-async-reject').get(async () => { throw new Error(SENSITIVE_VALUE); });
routes.get('/nested-async-reject', [[async () => { throw new Error(SENSITIVE_VALUE); }]]);
routes.get('/unsafe-error-name', () => {
  const error = new Error(SENSITIVE_VALUE);
  error.name = SENSITIVE_VALUE;
  throw error;
});
routes.get('/health', (_req, res) => {
  const readiness = getProcessReadiness();
  res.status(readiness.ready ? 200 : 503).json({ status: readiness.ready ? 'ok' : 'unhealthy' });
});
app.use('/api', routes);
app.use(createRequestErrorHandler(logger));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
process.on('unhandledRejection', onUnhandled);

try {
  for (const pathName of ['/sync-throw', '/async-reject', '/returned-promise-reject', '/chained-async-reject', '/nested-async-reject', '/unsafe-error-name']) {
    const response = await fetch(`${base}${pathName}`, pathName === '/sync-throw'
      ? { headers: { 'X-Request-ID': SENSITIVE_VALUE } }
      : undefined);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 500, `${pathName} should use the shared error middleware`);
    assert.deepEqual(body, {
      success: false,
      code: 'INTERNAL_ERROR',
      message: '请稍后重试。',
    }, `${pathName} should receive only the generic safe payload`);

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200, `health should remain available after ${pathName}`);
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, [], 'route errors must not escape to process-level unhandledRejection');
  assert.equal(JSON.stringify(logged).includes(SENSITIVE_VALUE), false, 'structured logs must not contain raw error messages');
  assert.equal(JSON.stringify(logged).includes('SELECT secret'), false, 'structured logs must not include SQL');
  assert.equal(logged.length, 6, 'each failure should produce one structured error record');
  const firstLog = logged[0].details as {
    module?: string; operation?: string; method?: string; path?: string; requestId?: string;
    error?: { code?: string; name?: string };
  };
  assert.deepEqual(
    { module: firstLog.module, operation: firstLog.operation, method: firstLog.method, path: firstLog.path, error: firstLog.error },
    { module: 'http', operation: 'request.failed', method: 'GET', path: '/sync-throw', error: { code: 'INTERNAL_ERROR', name: 'Error' } },
  );
  assert.equal(firstLog.requestId, undefined, 'untrusted non-UUID request IDs must not be logged');
  const secondLog = logged[1].details as { requestId?: string };
  assert.match(secondLog.requestId || '', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'generated request IDs remain useful for correlation');
} finally {
  process.off('unhandledRejection', onUnhandled);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const childPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'process-rejection-child.ts');
const child = spawnSync(process.execPath, ['--import', 'tsx', childPath], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 10_000,
  env: { ...process.env, NODE_ENV: 'test', XMT_TEST_SHUTDOWN_MODE: 'UNHANDLED_REJECTION' },
});
assert.equal(child.error, undefined, child.error?.message);
assert.equal(child.status, 1, `process-level rejection should exit nonzero after shutdown: ${child.stderr}`);
assert.equal(child.stdout.includes('SENSITIVE_TOKEN_VALUE'), false, 'process-level logs must not expose token data');
assert.equal(child.stdout.includes('sensitive token value'), false, 'process-level logs must not expose rejection messages');
const shutdownRecord = child.stdout.split('\n').map((line) => {
  try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; }
}).find((record) => record?.event === 'shutdown_complete');
assert(shutdownRecord, 'process-level rejection should finish the controlled shutdown');
assert.deepEqual(shutdownRecord.readiness, { ready: false, failureCode: 'UNHANDLED_REJECTION' });
assert.equal(shutdownRecord.listening, false, 'controlled shutdown should close the listener before process exit');
assert.equal(shutdownRecord.healthStatus, 503, 'readiness must degrade before the server begins closing');

const signalChild = spawnSync(process.execPath, ['--import', 'tsx', childPath], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 10_000,
  env: { ...process.env, NODE_ENV: 'test', XMT_TEST_SHUTDOWN_MODE: 'SIGTERM' },
});
assert.equal(signalChild.error, undefined, signalChild.error?.message);
assert.equal(signalChild.status, 0, `SIGTERM should drain and close cleanly: ${signalChild.stderr}`);
const signalRecord = signalChild.stdout.split('\n').map((line) => {
  try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; }
}).find((record) => record?.event === 'signal_shutdown_complete');
assert(signalRecord, 'SIGTERM should close the listening server');
assert.deepEqual(signalRecord.readiness, { ready: false, failureCode: 'SERVER_SHUTTING_DOWN' });
assert.equal(signalRecord.listening, false);

const forcedChild = spawnSync(process.execPath, ['--import', 'tsx', childPath], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 10_000,
  env: { ...process.env, NODE_ENV: 'test', XMT_TEST_SHUTDOWN_MODE: 'FORCED_TIMEOUT' },
});
assert.equal(forcedChild.error, undefined, forcedChild.error?.message);
assert.equal(forcedChild.status, 1, `forced shutdown should close listener and leave a failure exit code: ${forcedChild.stderr}`);
const forcedRecord = forcedChild.stdout.split('\n').map((line) => {
  try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; }
}).find((record) => record?.event === 'forced_shutdown_complete');
assert(forcedRecord, 'timeout escalation should finish forced listener shutdown');
assert.deepEqual(forcedRecord.readiness, { ready: false, failureCode: 'FORCED_SERVER_SHUTDOWN' });
assert.equal(forcedRecord.listening, false);

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'api/server.ts'), 'utf8');
assert.equal((serverSource.match(/process\.exit\s*\(/g) || []).length, 1,
  'process.exit is reserved for uncaughtException; other paths use controlled shutdown and exitCode');
assert.match(serverSource, /process\.on\('uncaughtException',[\s\S]*?process\.exit\(1\)/,
  'uncaughtException remains fatal');

console.log('HTTP and process error contracts passed');

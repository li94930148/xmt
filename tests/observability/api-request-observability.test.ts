import assert from 'node:assert/strict';
import express, { type Request } from 'express';
import { once } from 'node:events';
import { requestObservability } from '../../api/middleware/request-observability.js';
import { requestId } from '../../api/middleware/request-id.js';

type LogRecord = {
  level: 'info' | 'warn' | 'error';
  fields: Record<string, unknown>;
  message: string;
};

const records: LogRecord[] = [];
const logger = {
  info: (fields: Record<string, unknown>, message: string) => records.push({ level: 'info', fields, message }),
  warn: (fields: Record<string, unknown>, message: string) => records.push({ level: 'warn', fields, message }),
  error: (fields: Record<string, unknown>, message: string) => records.push({ level: 'error', fields, message }),
};

const app = express();
app.use(requestId);
const router = express.Router();
router.post('/:recordId', (req, res) => {
  req.user = { id: 42 } as NonNullable<Request['user']>;
  assert.equal(req.body.secret, 'do-not-log-request-body');
  res.status(503).json({
    success: false,
    error: { code: 'UPSTREAM_UNAVAILABLE', message: 'do-not-log-response-message' },
    secret: 'do-not-log-response-body',
  });
});
app.use('/api/creators', requestObservability(logger));
app.use(express.json());
app.use('/api/creators', router);

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');

try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/creators/private-record-123?token=do-not-log-query-token`, {
    method: 'POST',
    headers: {
      'X-Request-ID': 'observability-contract-42',
      Authorization: 'Bearer do-not-log-header-token',
      Cookie: 'session=do-not-log-cookie',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ secret: 'do-not-log-request-body' }),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-request-id'), 'observability-contract-42');
  await response.arrayBuffer();

  assert.equal(records.length, 1, 'one completed API request should produce one structured log');
  const [record] = records;
  assert.equal(record.level, 'error');
  assert.equal(record.message, 'api.request.completed');
  assert.equal(record.fields.requestId, 'observability-contract-42');
  assert.equal(record.fields.userId, 42);
  assert.equal(record.fields.module, 'creators');
  assert.equal(record.fields.operation, 'POST /:recordId', 'log operation uses the route template rather than the record id');
  assert.equal(record.fields.statusCode, 503);
  assert.equal(Number.isFinite(record.fields.durationMs), true);
  assert.deepEqual(record.fields.error, { code: 'UPSTREAM_UNAVAILABLE' });

  const serialized = JSON.stringify(record);
  for (const secret of [
    'private-record-123',
    'do-not-log-query-token',
    'do-not-log-header-token',
    'do-not-log-cookie',
    'do-not-log-request-body',
    'do-not-log-response-message',
    'do-not-log-response-body',
  ]) {
    assert.equal(serialized.includes(secret), false, `structured log leaked ${secret}`);
  }

  console.log('API request observability contract passed: correlation, route template, status, duration, and secret exclusion');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

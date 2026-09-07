import assert from 'node:assert/strict';
import { sanitizeServerErrorPayload } from '../../api/utils/response.js';

process.env.JWT_SECRET = 'error-response-sanitization-test-secret';
const { parseListPagination } = await import('../../api/routes/workflow.js');

const unsafe = {
  message: '操作失败',
  error: {
    sql: 'SELECT * FROM users WHERE password_hash = ?',
    params: ['sensitive-value'],
    name: 'DatabaseError',
  },
};
const sanitized = sanitizeServerErrorPayload(unsafe, 'test-request-id') as Record<string, unknown>;
assert.deepEqual(sanitized, { message: '操作失败', success: false, code: 'INTERNAL_ERROR' });
assert.equal(JSON.stringify(sanitized).includes('password_hash'), false);
assert.equal(JSON.stringify(sanitized).includes('sensitive-value'), false);
assert.deepEqual(parseListPagination({}), { page: 1, limit: 50, offset: 0 });
assert.deepEqual(parseListPagination({ page: '2', limit: '9999' }), { page: 2, limit: 100, offset: 100 });
assert.deepEqual(parseListPagination({ page: '-1', limit: 'x' }), { page: 1, limit: 50, offset: 0 });
console.log('错误响应脱敏与 Workflow 分页合同通过');

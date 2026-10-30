import assert from 'node:assert/strict';
import { toFriendlyRetroError } from '../../src/components/retrospectives/retroLabels';

assert.equal(
  toFriendlyRetroError(new TypeError('Failed to fetch')),
  '复盘操作暂时无法完成，请稍后重试',
  'browser network errors use a Chinese recovery message',
);
assert.equal(
  toFriendlyRetroError(new Error('Internal Server Error')),
  '复盘操作暂时无法完成，请稍后重试',
  'technical server errors are not shown directly',
);
assert.equal(
  toFriendlyRetroError(Object.assign(new Error('标题不能为空'), { status: 400 })),
  '标题不能为空',
  'actionable Chinese validation errors remain visible',
);
assert.equal(
  toFriendlyRetroError(Object.assign(new Error('HTTP 400 Bad Request'), { status: 400 })),
  '请求信息不正确，请检查后重试',
  'raw HTTP status codes are replaced with a helpful fallback',
);
assert.equal(
  toFriendlyRetroError(null),
  '复盘操作暂时无法完成，请稍后重试',
  'unknown thrown values cannot break the error boundary',
);

console.log('Retrospective user-facing error message tests passed');

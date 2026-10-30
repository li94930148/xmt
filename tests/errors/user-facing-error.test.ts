import assert from 'node:assert/strict';
import { getUserFacingErrorMessage } from '../../src/lib/userFacingError';

const fallback = '操作暂时无法完成，请稍后重试。';

for (const message of [
  'Failed to fetch',
  'Load failed',
  'Failed to load resource: the server responded with a status of 503',
  'NetworkError when attempting to fetch resource.',
  'TimeoutError: The operation timed out',
  'net::ERR_CONNECTION_REFUSED',
  'connect ECONNREFUSED 127.0.0.1:3001',
  'read ECONNRESET',
  'getaddrinfo ENOTFOUND api.example.test',
  'Network request failed',
  'HTTP 503 Service Unavailable',
  'Conflict',
  'Internal Server Error',
  'Request failed with status code 503',
  'QuotaExceededError: The quota has been exceeded.',
  'The quota has been exceeded.',
  "Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota.",
]) {
  assert.equal(
    getUserFacingErrorMessage(new Error(message), fallback),
    fallback,
    `${message} is replaced with a readable recovery message`,
  );
}

assert.equal(
  getUserFacingErrorMessage(new Error('当前选题状态不支持创建拍摄计划'), fallback),
  '当前选题状态不支持创建拍摄计划',
  'readable Chinese business guidance remains visible',
);
assert.equal(getUserFacingErrorMessage(null, fallback), fallback, 'unknown thrown values use the fallback');
assert.equal(getUserFacingErrorMessage(new Error('   '), fallback), fallback, 'empty messages use the fallback');

console.log('User-facing error message tests passed');

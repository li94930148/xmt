/**
 * Usage:
 *   DOUYIN_WEBHOOK_TEST_URL=http://127.0.0.1:3001/api/douyin/webhook node scripts/test-douyin-webhook-challenge.mjs
 * Optional for duplicate-event verification against a signed endpoint:
 *   DOUYIN_WEBHOOK_TEST_SIGNATURE=<valid X-Douyin-Signature>
 */
const url = process.env.DOUYIN_WEBHOOK_TEST_URL || 'http://127.0.0.1:3001/api/douyin/webhook';

async function post(payload, headers = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  return { status: response.status, contentType: response.headers.get('content-type') || '', body: await response.json().catch(() => null) };
}

const challenge = await post({ event: 'verify_webhook', content: { challenge: '123456' } });
if (challenge.status !== 200 || challenge.body?.challenge !== '123456' || !challenge.contentType.includes('application/json')) throw new Error(`challenge 验证失败: ${JSON.stringify(challenge)}`);
console.log('PASS verify_webhook: 200 application/json with challenge');

const unsigned = await post({ event: 'authorize', event_id: 'xmt-unsigned-webhook-test' });
if (unsigned.status !== 401) throw new Error(`无签名普通事件未被拒绝: ${JSON.stringify(unsigned)}`);
console.log('PASS unsigned normal event: 401');

if (!process.env.DOUYIN_WEBHOOK_TEST_SIGNATURE) {
  console.log('SKIP duplicate event: set DOUYIN_WEBHOOK_TEST_SIGNATURE to a valid signature for the exact payload.');
  process.exit(0);
}
const event = { event: 'authorize', event_id: 'xmt-duplicate-webhook-test' };
const signedHeaders = { 'X-Douyin-Signature': process.env.DOUYIN_WEBHOOK_TEST_SIGNATURE };
const first = await post(event, signedHeaders); const second = await post(event, signedHeaders);
if (first.status !== 202 || second.status !== 200 || second.body?.duplicate !== true) throw new Error(`重复事件去重失败: ${JSON.stringify({ first, second })}`);
console.log('PASS duplicate event: accepted once and deduplicated once');

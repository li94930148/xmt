import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { verifyWebhook } = await import('../../api/services/douyin/webhook.service.js');
const payload = '{"event":"authorize","event_id":"local-security-test"}';
delete process.env.DOUYIN_WEBHOOK_SECRET;
assert.equal(verifyWebhook(payload), false);
process.env.DOUYIN_WEBHOOK_SECRET = 'webhook-security-test-secret';
const expected = crypto.createHmac('sha256', process.env.DOUYIN_WEBHOOK_SECRET).update(payload).digest('hex');
for (const value of [undefined, 'a', `${expected}00`, 'not-hex!', crypto.createHash('sha256').update(payload).digest('hex')]) assert.equal(verifyWebhook(payload, value), false);
assert.equal(verifyWebhook(payload, expected), true);
console.log('Douyin webhook fail-closed tests passed');

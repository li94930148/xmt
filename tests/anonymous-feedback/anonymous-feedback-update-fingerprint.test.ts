import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.JWT_SECRET = 'anonymous-feedback-update-fingerprint-test-secret';
const {
  anonymousFeedbackBaseFingerprint,
  anonymousFeedbackUpdateRequestFingerprint,
} = await import('../../api/routes/anonymous-feedback.js');

const row = {
  id: 4,
  type: 'process',
  content: '改善流程',
  need_reply: 1,
  reply_content: null,
  status: 'pending',
  is_public: 1,
  created_at: '2026-10-26 10:00:00',
  updated_at: '2026-10-26 10:00:00',
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const baseline = hash([4, 'process', '改善流程', 1, null, 'pending', 1, row.created_at, row.updated_at]);
assert.equal(anonymousFeedbackBaseFingerprint(row), baseline, 'baseline fingerprint uses the agreed stable row tuple');

const payload = { status: 'completed', reply_content: ' 已处理 ', is_public: false };
const canonical = hash([4, baseline, 'completed', '已处理', false]);
assert.equal(anonymousFeedbackUpdateRequestFingerprint(4, baseline, payload), canonical, 'request fingerprint trims reply and preserves field order');
assert.equal(
  anonymousFeedbackUpdateRequestFingerprint(4, baseline, { reply_content: '   ' }),
  hash([4, baseline, null, null, null]),
  'empty reply is canonicalized to null',
);
assert.notEqual(anonymousFeedbackUpdateRequestFingerprint(4, baseline, { status: 'completed' }), canonical, 'payload changes produce a distinct fingerprint');

console.log('Anonymous-feedback update fingerprint test passed.');

import assert from 'node:assert/strict';
import { getMobileDailyReportStatusView } from '../../src/platform/mobile-daily-report-status';

const expected = {
  draft: { label: '草稿', readOnly: false },
  submitted: { label: '审核中', readOnly: false },
  approved: { label: '已通过', readOnly: true },
  rejected: { label: '已退回', readOnly: false },
  archived: { label: '已归档', readOnly: true },
} as const;

for (const [status, view] of Object.entries(expected)) {
  const actual = getMobileDailyReportStatusView(status as keyof typeof expected);
  assert.equal(actual.label, view.label, `${status} has a Chinese status label`);
  assert.equal(actual.readOnly, view.readOnly, `${status} matches the server editability contract`);
  assert(actual.description.length > 0, `${status} explains the next action`);
  assert.notEqual(actual.label, status, `${status} must not be exposed as a raw code`);
}

assert.deepEqual(getMobileDailyReportStatusView(null), {
  label: '未填写',
  description: '今天尚未填写，可保存草稿或提交。',
  readOnly: false,
});
console.log('Mobile daily report status labels and editability passed');

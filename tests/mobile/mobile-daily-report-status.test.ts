import assert from 'node:assert/strict';
import { getMobileDailyReportStatusView } from '../../src/platform/mobile-daily-report-status';

const expected = {
  draft: { label: '草稿', readOnly: false },
  submitted: { label: '审核中', readOnly: true },
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
assert.deepEqual(getMobileDailyReportStatusView('draft', true), {
  label: '状态待确认',
  description: '提交结果尚无法确认，核实前不要重复提交。',
  readOnly: true,
}, 'an ambiguous submission must not be presented as a confirmed draft');
assert.deepEqual(getMobileDailyReportStatusView('future_status' as keyof typeof expected), {
  label: '状态待确认',
  description: '服务器返回了暂不支持的日报状态，当前为只读状态。',
  readOnly: true,
}, 'a future report status must be neutral and read-only');
console.log('Mobile daily report status labels and editability passed');

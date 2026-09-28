import assert from 'node:assert/strict';
import test from 'node:test';
import { createBatchMutationNotice } from '../../src/utils/batch-mutation-feedback.js';

test('batch delete success reports only completed work', () => {
  assert.deepEqual(createBatchMutationNotice({
    action: 'delete',
    selectedIds: [1, 2],
    failedIds: [],
  }), {
    title: '批量删除成功',
    message: '已删除 2 个选题。',
    type: 'success',
    failedIds: [],
  });
});

test('partial audit reports failures and retains only failed topics for retry', () => {
  const notice = createBatchMutationNotice({
    action: 'audit',
    selectedIds: [1, 2, 3],
    failedIds: [2, 99],
    status: 'rejected',
    firstError: '审核服务暂不可用\n请重试',
  });

  assert.equal(notice.title, '批量审核部分完成');
  assert.equal(notice.type, 'warning');
  assert.deepEqual(notice.failedIds, [2]);
  assert.match(notice.message, /已驳回 2 个选题，1 个失败/);
  assert.match(notice.message, /失败的 1 个选题已保留选择，可重试/);
  assert.match(notice.message, /审核服务暂不可用 请重试/);
});

test('all failed delete is an error and preserves every selected topic', () => {
  const notice = createBatchMutationNotice({
    action: 'delete',
    selectedIds: [4, 5],
    failedIds: [4, 5],
    firstError: 'x'.repeat(200),
  });

  assert.equal(notice.title, '批量删除失败');
  assert.equal(notice.type, 'error');
  assert.deepEqual(notice.failedIds, [4, 5]);
  assert.match(notice.message, /选中的 2 个选题均未成功/);
  assert.ok(notice.message.length < 300, 'server error details are bounded');
});

import assert from 'node:assert/strict';
import { getBatchActionFeedback } from '../../src/utils/batch-action-feedback.js';
import { describe, it } from 'vitest';

describe('batch action feedback', () => {
  it('reports full success, partial success, failure and clamps invalid counts', () => {
    assert.deepEqual(getBatchActionFeedback('审核', 3, 3), {
      title: '批量审核完成',
      message: '成功 3 项',
      type: 'success',
    });

    assert.deepEqual(getBatchActionFeedback('删除', 3, 1), {
      title: '批量删除部分完成',
      message: '成功 1 项，失败 2 项',
      type: 'warning',
    });

    assert.deepEqual(getBatchActionFeedback('审核', 2, 0), {
      title: '批量审核失败',
      message: '2 项均未完成，请检查后重试',
      type: 'error',
    });

    assert.deepEqual(getBatchActionFeedback('审核', 2, 5), {
      title: '批量审核完成',
      message: '成功 2 项',
      type: 'success',
    });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { localizeMessage } from '../../api/utils/messageLocalization.js';

describe('historical message localization', () => {
  it('localizes a submitted daily report while preserving its metadata', () => {
    assert.deepEqual(
      localizeMessage({ id: 1, title: 'Daily report pending review', content: '李文锐 submitted a daily report for 2026-09-14.' }),
      { id: 1, title: '新的日报待审核', content: '李文锐 提交了 2026-09-14 的日报。' },
    );
  });

  it('localizes an approved daily report and preserves the review note', () => {
    assert.deepEqual(
      localizeMessage({ title: 'Daily report approved', content: '2026-09-14 daily report was approved: 内容完整' }),
      { title: '日报审核通过', content: '2026-09-14 的日报已审核通过：内容完整' },
    );
  });

  it('localizes a rejected daily report', () => {
    assert.deepEqual(
      localizeMessage({ title: 'Daily report rejected', content: '2026-09-14 daily report was rejected' }),
      { title: '日报已退回', content: '2026-09-14 的日报已退回修改' },
    );
  });

  it('leaves unrelated messages unchanged', () => {
    const unrelated = { title: 'System maintenance', content: 'Keep this message unchanged.' };
    assert.equal(localizeMessage(unrelated), unrelated);
  });
});

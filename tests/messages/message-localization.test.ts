import assert from 'node:assert/strict';
import { localizeMessage } from '../../api/utils/messageLocalization.js';

assert.deepEqual(
  localizeMessage({ id: 1, title: 'Daily report pending review', content: '李文锐 submitted a daily report for 2026-09-14.' }),
  { id: 1, title: '新的日报待审核', content: '李文锐 提交了 2026-09-14 的日报。' },
);

assert.deepEqual(
  localizeMessage({ title: 'Daily report approved', content: '2026-09-14 daily report was approved: 内容完整' }),
  { title: '日报审核通过', content: '2026-09-14 的日报已审核通过：内容完整' },
);

assert.deepEqual(
  localizeMessage({ title: 'Daily report rejected', content: '2026-09-14 daily report was rejected' }),
  { title: '日报已退回', content: '2026-09-14 的日报已退回修改' },
);

const unrelated = { title: 'System maintenance', content: 'Keep this message unchanged.' };
assert.equal(localizeMessage(unrelated), unrelated);

console.log('Message localization tests passed');

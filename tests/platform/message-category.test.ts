import assert from 'node:assert/strict';
import { getMobileMessageCategory } from '../../src/platform/message-category.js';

assert.equal(getMobileMessageCategory({ title: '协作评论', content: '有人留下批注', link: '/topics/8' }), 'collaboration');
assert.equal(getMobileMessageCategory({ title: '日报待审核', content: '请完成日报', link: '/daily-report' }), 'workflow');
assert.equal(getMobileMessageCategory({ title: '系统公告', content: '服务维护通知' }), 'system');
console.log('Mobile message category tests passed');

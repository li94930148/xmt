import assert from 'node:assert/strict';
import { buildMessageDesktopNotification, type MessageNotificationGroup } from '../../src/utils/message-notification';

const groups = new Map<string, MessageNotificationGroup>();
const first = buildMessageDesktopNotification({
  id: 1,
  title: '选题审核提醒',
  content: '选题等待审核',
  type: 'warning',
  link: '/topics/42',
}, groups, 1_000);
assert.equal(first.url, '/topics/42', 'valid internal topic links open the business page directly');
assert.equal(first.tag, 'xmt-topic-42-warning');
assert.equal(first.silent, false, 'the first notification in a group may play its sound');

const repeated = buildMessageDesktopNotification({
  id: 2,
  title: '选题仍待审核',
  content: '又有一条同类提醒',
  type: 'warning',
  link: '/topics/42?tab=history',
}, groups, 1_000 + 4 * 60 * 1000);
assert.equal(repeated.tag, first.tag, 'same topic and type reuse a desktop notification tag');
assert.equal(repeated.url, '/topics/42?tab=history');
assert.equal(repeated.silent, true, 'updates within the group do not replay the notification sound');
assert.match(repeated.title, /2条/);
assert.match(repeated.body, /2 条同类提醒/);

const differentType = buildMessageDesktopNotification({ id: 3, type: 'success', link: '/topics/42' }, groups, 1_000 + 4 * 60 * 1000);
const differentTopic = buildMessageDesktopNotification({ id: 4, type: 'warning', link: '/topics/43' }, groups, 1_000 + 4 * 60 * 1000);
assert.notEqual(differentType.tag, first.tag, 'different message types remain separate');
assert.notEqual(differentTopic.tag, first.tag, 'different topics remain separate');

const afterWindow = buildMessageDesktopNotification({ id: 5, type: 'warning', link: '/topics/42' }, groups, 1_000 + 5 * 60 * 1000 + 1);
assert.equal(afterWindow.silent, false, 'a new five-minute window starts a new audible notification');
assert.doesNotMatch(afterWindow.title, /2条/);

for (const unsafeLink of ['https://attacker.example/path', '//attacker.example/path', '/\\attacker.example/path', 'javascript:alert(1)']) {
  const unsafe = buildMessageDesktopNotification({ id: 10, link: unsafeLink }, groups, 9_000_000);
  assert.equal(unsafe.url, '/messages', `unsafe link falls back to the inbox: ${unsafeLink}`);
}

const unrelated = buildMessageDesktopNotification({ id: 11, type: 'warning', link: '/retrospectives/9' }, groups, 9_000_001);
assert.equal(unrelated.url, '/retrospectives/9');
assert.equal(unrelated.tag, 'xmt-msg-11', 'non-topic business messages are not coalesced by guesswork');

console.log('Desktop message notification grouping and safe-link contract passed');

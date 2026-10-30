import assert from 'node:assert/strict';
import {
  getNotificationSettings,
  notificationPreferencesMatch,
  saveNotificationPreferences,
} from '../../src/api/notificationSettings';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

async function run() {
  const calls: string[] = [];
  const data = await getNotificationSettings('test-token', async (input, init) => {
    calls.push(String(input));
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    if (String(input).endsWith('/preferences')) return response([{ channel: 'email', event_type: 'review', enabled: true }]);
    if (String(input).endsWith('/channels')) return response([{ id: 'email', name: '邮件', description: '' }]);
    return response([{ id: 'review', name: '审核', description: '' }]);
  });
  assert.equal(calls.length, 3);
  assert.equal(data.preferences[0].enabled, true);
  assert.equal(data.channels[0].id, 'email');
  assert.equal(data.events[0].id, 'review');

  await assert.rejects(
    getNotificationSettings('test-token', async (input) => String(input).endsWith('/events')
      ? response({ message: '事件服务暂不可用' }, 503)
      : response([])),
    /事件服务暂不可用/,
  );
  await assert.rejects(
    getNotificationSettings('test-token', async (input) => String(input).endsWith('/events')
      ? response({ message: 'HTTP 503 Service Unavailable' }, 503)
      : response([])),
    /事件暂时无法加载，请重试/,
    'technical status messages are replaced with an actionable Chinese fallback',
  );
  await assert.rejects(
    getNotificationSettings('test-token', async () => response({ items: [] })),
    /数据格式异常/,
  );

  const submitted = [{ channel: 'web', event_type: 'review', enabled: true }];
  assert.equal(notificationPreferencesMatch(
    [{ id: 88, channel: 'web', event_type: 'review', enabled: true, config: null }],
    submitted,
  ), true, 'read-back comparison ignores server-generated ids and normalizes null config');
  assert.equal(notificationPreferencesMatch(submitted, [{ channel: 'web', event_type: 'review', enabled: false }]), false);

  const lostResponseCalls: string[] = [];
  const lostResponse = await saveNotificationPreferences('test-token', submitted, async (_input, init) => {
    lostResponseCalls.push(init?.method || 'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    if (init?.method === 'PUT') throw new TypeError('connection reset after commit');
    assert.equal(init?.cache, 'no-store', 'verification reads must bypass cached preferences');
    return response([{ id: 99, channel: 'web', event_type: 'review', enabled: true }]);
  });
  assert.deepEqual(lostResponseCalls, ['PUT', 'GET']);
  assert.equal(lostResponse.kind, 'saved');
  if (lostResponse.kind === 'saved') assert.equal(lostResponse.recovered, true);

  const conflictCalls: string[] = [];
  const conflict = await saveNotificationPreferences('test-token', submitted, async (_input, init) => {
    conflictCalls.push(init?.method || 'GET');
    return init?.method === 'PUT'
      ? response({ message: '暂时失败' }, 503)
      : response([{ channel: 'web', event_type: 'review', enabled: false }]);
  });
  assert.deepEqual(conflictCalls, ['PUT', 'GET'], 'an ambiguous failure performs a read-only verification without replay');
  assert.equal(conflict.kind, 'conflict');

  const unknown = await saveNotificationPreferences('test-token', submitted, async (_input, init) => (
    init?.method === 'PUT' ? response({ message: 'temporarily unavailable' }, 500) : response({ message: 'read unavailable' }, 503)
  ));
  assert.equal(unknown.kind, 'unknown', 'a failed verification retains an unresolved outcome');

  const rejectedCalls: string[] = [];
  const rejected = await saveNotificationPreferences('test-token', submitted, async (_input, init) => {
    rejectedCalls.push(init?.method || 'GET');
    return response({ message: '输入不合法' }, 400);
  });
  assert.deepEqual(rejectedCalls, ['PUT'], 'a definite client rejection does not trigger unnecessary verification');
  assert.deepEqual(rejected, { kind: 'rejected', message: '输入不合法' });

  const technicalRejected = await saveNotificationPreferences('test-token', submitted, async () => (
    response({ message: 'HTTP 400 Bad Request' }, 400)
  ));
  assert.deepEqual(
    technicalRejected,
    { kind: 'rejected', message: '通知偏好保存失败，请重试' },
    'status-code fallback text is not shown as a user message',
  );
}

void run().then(() => console.log('Notification settings load contract passed'));

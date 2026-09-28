import assert from 'node:assert/strict';
import { getNotificationSettings } from '../../src/api/notificationSettings';

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
    getNotificationSettings('test-token', async () => response({ items: [] })),
    /数据格式异常/,
  );
}

void run().then(() => console.log('Notification settings load contract passed'));

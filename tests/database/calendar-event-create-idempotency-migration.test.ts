import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { calendarEventCreateIdempotencyMigration } from '../../api/database/migrations/038_calendar_event_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-calendar-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'calendar.db')}` });

try {
  await client.execute(`CREATE TABLE calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)`);
  await client.execute(`INSERT INTO calendar_events (title) VALUES ('历史日历事件')`);
  await calendarEventCreateIdempotencyMigration.up(client);
  await calendarEventCreateIdempotencyMigration.up(client);
  assert.deepEqual((await client.execute('SELECT id,title FROM calendar_events WHERE id=1')).rows[0], { id: 1, title: '历史日历事件' });

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: `INSERT INTO calendar_event_create_request_keys(client_request_id,creator_id,event_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO calendar_event_create_request_keys(client_request_id,creator_id,event_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i);
  await client.execute('DELETE FROM calendar_events WHERE id=1');
  assert.deepEqual((await client.execute(
    'SELECT event_id,creator_id,request_fingerprint FROM calendar_event_create_request_keys WHERE client_request_id=?',
    [requestId],
  )).rows[0], { event_id: 1, creator_id: 7, request_fingerprint: 'same-payload' }, 'request tombstones survive deletion');
  console.log('Calendar event create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}

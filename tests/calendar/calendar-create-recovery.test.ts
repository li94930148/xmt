import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';
import { buildCalendarCreatePayload, clearPendingCalendarCreate, persistPendingCalendarCreatePhase, readPendingCalendarCreate, savePendingCalendarCreate } from '../../src/utils/calendarCreateRecovery';
import type { PendingCalendarCreate } from '../../src/components/calendar/calendarTypes';

const originalWindow = globalThis.window;
const values = new Map<string, string>();
const sessionStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage } });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

test('calendar create recovery preserves the same request while changing phases and only clears its own request', () => {
  const pending: PendingCalendarCreate = {
    userId: 23,
    clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    payload: { title: '专题发布', event_date: '2026-11-04', event_type: 'publish', topic_id: 7 },
    phase: 'uncertain',
  };

  assert.equal(savePendingCalendarCreate(pending), true);
  assert.deepEqual(readPendingCalendarCreate(23), {
    ...pending,
    payload: { ...pending.payload, description: undefined },
  });
  assert.equal(persistPendingCalendarCreatePhase({ ...pending, phase: 'ready' }), true);
  assert.equal(readPendingCalendarCreate(23)?.phase, 'ready');
  assert.equal(clearPendingCalendarCreate(23, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), false);
  assert.equal(readPendingCalendarCreate(23)?.clientRequestId, pending.clientRequestId);
  assert.equal(clearPendingCalendarCreate(23, pending.clientRequestId), true);
  assert.equal(readPendingCalendarCreate(23), null);
});

test('calendar create recovery rejects malformed and cross-user session records', () => {
  const key = 'xmt:calendar-create-pending:v1:user:23';
  values.set(key, JSON.stringify({ userId: 24, clientRequestId: 'invalid', payload: {}, phase: 'uncertain' }));
  assert.equal(readPendingCalendarCreate(23), null);
  values.set(key, JSON.stringify({
    userId: 23,
    clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    payload: { title: '专题发布', event_date: '2026-11-04' },
    phase: 'unknown',
  }));
  assert.equal(readPendingCalendarCreate(23), null);
});

test('calendar create payload leaves optional blank fields unset', () => {
  assert.deepEqual(buildCalendarCreatePayload({
    title: '  发布  ',
    description: '',
    event_type: 'publish',
    topic_id: '',
  }, '2026-11-04'), {
    title: '  发布  ',
    description: undefined,
    event_date: '2026-11-04',
    event_type: 'publish',
    topic_id: undefined,
  });
});

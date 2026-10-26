import assert from 'node:assert/strict';
import { deleteAnnouncement, getAnnouncements } from '../../src/api/announcements.js';

const originalFetch = globalThis.fetch;
const captured: Array<{ url: string; init?: RequestInit }> = [];

try {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init });
    return new Response(JSON.stringify({ message: 'simulated uncertain delete' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  await assert.rejects(deleteAnnouncement(42), (error: Error & { status?: number }) => {
    assert.equal(error.status, 503, 'the DELETE status is preserved for outcome classification');
    return true;
  });

  captured.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  assert.deepEqual(await getAnnouncements(), [], 'a valid empty list is distinguishable from a malformed response');
  assert.equal(captured[0]?.init?.cache, 'no-store', 'authoritative recovery reads bypass cache');

  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  await assert.rejects(getAnnouncements(), /公告列表数据格式无效/, 'a malformed list must not be treated as proof that a target is absent');

  console.log('Announcement client contract passed: DELETE status preservation and fail-closed no-store list verification.');
} finally {
  globalThis.fetch = originalFetch;
}

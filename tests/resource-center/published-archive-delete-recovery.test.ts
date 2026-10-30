import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPublishedArchiveDeleteRecovery,
  createPublishedArchiveDeleteRequestId,
  normalizePublishedArchiveDeleteRecovery,
  persistPublishedArchiveDeleteRecovery,
  publishedArchiveDeleteRecoveryStorageKey,
  readPublishedArchiveDeleteRecovery,
  type PublishedArchiveDeleteRecovery,
} from '../../src/utils/publishedArchiveDeleteRecovery.js';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  blocked = false;
  failSet = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { if (this.blocked) throw new Error('storage unavailable'); return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { if (this.blocked) throw new Error('storage unavailable'); this.values.delete(key); }
  setItem(key: string, value: string) { if (this.blocked || this.failSet) throw new Error('storage unavailable'); this.values.set(key, String(value)); }
}

const recovery: PublishedArchiveDeleteRecovery = {
  version: 1,
  actorId: 41,
  archiveId: 701,
  requestId: '67f40ad4-5e91-4d8c-9fd1-282f536f14b2',
};

test('published archive delete recovery is persisted and isolated by actor', () => {
  const storage = new MemoryStorage();
  assert.equal(publishedArchiveDeleteRecoveryStorageKey(41), 'xmt:published-archive-delete-pending:v1:user:41');
  persistPublishedArchiveDeleteRecovery(recovery, storage);
  assert.deepEqual(readPublishedArchiveDeleteRecovery(41, storage), { state: 'valid', recovery });
  assert.deepEqual(readPublishedArchiveDeleteRecovery(42, storage), { state: 'none' });
  assert.equal(normalizePublishedArchiveDeleteRecovery(recovery, 42), null);
  assert.equal(readPublishedArchiveDeleteRecovery(41, storage).state, 'valid', 'a second request cannot overwrite an unresolved marker');
  assert.throws(() => persistPublishedArchiveDeleteRecovery({ ...recovery, requestId: 'ad5f5aa9-72bf-4f9b-a8f5-6b61bcd481c1' }, storage), /已有归档删除结果待核实/);
  assert.equal(clearPublishedArchiveDeleteRecovery({ ...recovery, requestId: 'ad5f5aa9-72bf-4f9b-a8f5-6b61bcd481c1' }, storage), false, 'a stale operation cannot clear the marker');
  assert.equal(clearPublishedArchiveDeleteRecovery(recovery, storage), true);
  assert.deepEqual(readPublishedArchiveDeleteRecovery(41, storage), { state: 'none' });
});

test('published archive delete recovery fails closed on corrupt or unavailable storage', () => {
  const storage = new MemoryStorage();
  storage.setItem(publishedArchiveDeleteRecoveryStorageKey(41), '{broken');
  assert.deepEqual(readPublishedArchiveDeleteRecovery(41, storage), { state: 'invalid' });
  assert.throws(() => persistPublishedArchiveDeleteRecovery(recovery, storage), /无法安全读取/);
  storage.clear();
  storage.blocked = true;
  assert.deepEqual(readPublishedArchiveDeleteRecovery(41, storage), { state: 'unavailable' });
  assert.throws(() => persistPublishedArchiveDeleteRecovery(recovery, storage), /未发送删除请求/);
});

test('published archive delete recovery verifies persistence and creates a secure request identifier', () => {
  const storage = new MemoryStorage();
  storage.failSet = true;
  assert.throws(() => persistPublishedArchiveDeleteRecovery(recovery, storage), /未发送删除请求/);
  const requestId = createPublishedArchiveDeleteRequestId();
  assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('archive API preserves delete/detail HTTP status and disables detail caching', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      const status = String(input).includes('/701') ? 404 : 503;
      return new Response(JSON.stringify({ message: status === 404 ? '归档不存在' : '服务暂不可用' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const { deleteResource, getArchiveDetail } = await import('../../src/api/resources.js');
    await assert.rejects(deleteResource(702), (error) => {
      assert.equal((error as { status?: number }).status, 503);
      assert.equal((error as Error).message, '服务暂不可用');
      return true;
    });
    await assert.rejects(getArchiveDetail(701), (error) => {
      assert.equal((error as { status?: number }).status, 404);
      assert.equal((error as Error).message, '归档不存在');
      return true;
    });
    assert.equal(calls[1]?.init?.cache, 'no-store');
    assert.equal(calls.length, 2, 'the API helpers never retry writes or reads automatically');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

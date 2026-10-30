import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearProductionAutosaveRecovery,
  normalizeProductionAutosaveRecovery,
  persistProductionAutosaveRecovery,
  readProductionAutosaveRecovery,
  writeAndVerifyProductionAutosaveDraft,
  type ProductionAutosaveRecovery,
} from '../../src/pages/production/productionAutosaveRecovery';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function recovery(overrides: Partial<ProductionAutosaveRecovery> = {}): ProductionAutosaveRecovery {
  return {
    version: 1,
    userId: 17,
    productionId: 81,
    topicId: 46,
    productionVersion: 'v2.3',
    status: 'draft',
    baselineFingerprint: 'a'.repeat(64),
    targetFingerprint: 'b'.repeat(64),
    requestId: '6243d34c-f769-4a61-b6da-97084f9cebe9',
    phase: 'uncertain',
    ...overrides,
  };
}

test('recovery markers are readable only within the same user and production', () => {
  const storage = new MemoryStorage();
  persistProductionAutosaveRecovery(recovery(), storage);

  assert.deepEqual(readProductionAutosaveRecovery(17, 81, storage), { state: 'valid', recovery: recovery() });
  assert.deepEqual(readProductionAutosaveRecovery(18, 81, storage), { state: 'none' });
  assert.deepEqual(readProductionAutosaveRecovery(17, 82, storage), { state: 'none' });
});

test('a marker is never cleared by a different request id', () => {
  const storage = new MemoryStorage();
  const first = recovery();
  persistProductionAutosaveRecovery(first, storage);

  assert.equal(clearProductionAutosaveRecovery(recovery({ requestId: '7243d34c-f769-4a61-b6da-97084f9cebe9' }), storage), false);
  assert.deepEqual(readProductionAutosaveRecovery(17, 81, storage), { state: 'valid', recovery: first });
  assert.equal(clearProductionAutosaveRecovery(first, storage), true);
  assert.deepEqual(readProductionAutosaveRecovery(17, 81, storage), { state: 'none' });
});

test('corrupt or storage-inaccessible markers fail closed', () => {
  const corruptStorage = new MemoryStorage();
  corruptStorage.setItem('xmt:production-autosave-recovery:v1:user:17:production:81', '{');
  assert.deepEqual(readProductionAutosaveRecovery(17, 81, corruptStorage), { state: 'invalid' });
  assert.equal(normalizeProductionAutosaveRecovery({ ...recovery(), targetFingerprint: 'bad' }, 17, 81), null);

  const unavailableStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  } as unknown as Storage;
  assert.deepEqual(readProductionAutosaveRecovery(17, 81, unavailableStorage), { state: 'unavailable' });
  assert.throws(() => persistProductionAutosaveRecovery(recovery(), unavailableStorage), /无法安全读取/);
});

test('recovery writes require a successful read-back before a network write can be allowed', () => {
  let saved: string | null = null;
  assert.equal(writeAndVerifyProductionAutosaveDraft('draft', 'latest', (_key, value) => { saved = value; return true; }, () => saved), true);
  assert.equal(writeAndVerifyProductionAutosaveDraft('draft', 'latest', () => true, () => 'older'), false);
  assert.equal(writeAndVerifyProductionAutosaveDraft(null, 'latest', () => true, () => 'latest'), false);
  assert.equal(writeAndVerifyProductionAutosaveDraft('draft', 'latest', () => false, () => 'latest'), false);
});

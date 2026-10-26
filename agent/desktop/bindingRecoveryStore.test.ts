import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { clearPendingBindingRecord, readPendingBindingRecord, savePendingBindingRecord, type BindingSafeStorage, type PendingBindingRecord } from './bindingRecoveryStore.js';

test('binding recovery markers remain encrypted, durable and minimal after credential persistence', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xmt-agent-bind-recovery-store-'));
  const filePath = path.join(directory, 'binding-recovery.bin');
  const key = crypto.randomBytes(32);
  const storage: BindingSafeStorage = {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptString(value) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
  const requestId = crypto.randomUUID();
  const recoverySecret = crypto.randomBytes(32).toString('base64url');
  const bindingCode = 'one-time-binding-code';

  try {
    const attempt: PendingBindingRecord = {
      version: 1, phase: 'bind', mode: 'setup', requestId, recoverySecret,
      serverUrl: 'https://example.invalid', bindingCode, device: { device_id: 'device-1', os: 'test' },
    };
    assert.equal(await readPendingBindingRecord(filePath, storage), null);
    await assert.rejects(savePendingBindingRecord(filePath, { ...storage, isEncryptionAvailable: () => false }, attempt), /安全存储/);
    await savePendingBindingRecord(filePath, storage, attempt);
    const encrypted = await fs.readFile(filePath);
    assert.equal(encrypted.includes(Buffer.from(bindingCode)), false, 'the pending one-time code is not stored as plaintext');
    assert.equal(encrypted.includes(Buffer.from(recoverySecret)), false, 'the recovery capability is not stored as plaintext');
    assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600, 'the encrypted recovery record has owner-only permissions');
    assert.deepEqual(await readPendingBindingRecord(filePath, storage), attempt);

    const acknowledgement: PendingBindingRecord = { version: 1, phase: 'ack', mode: 'setup', bindingCodeHash: crypto.createHash('sha256').update(bindingCode).digest('hex'), requestId, recoverySecret, serverUrl: 'https://example.invalid' };
    await savePendingBindingRecord(filePath, storage, acknowledgement);
    assert.deepEqual(await readPendingBindingRecord(filePath, storage), acknowledgement, 'the acknowledged state drops the binding code and device payload');
    await clearPendingBindingRecord(filePath);
    assert.equal(await readPendingBindingRecord(filePath, storage), null);
    console.log('Desktop binding recovery storage tests passed.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

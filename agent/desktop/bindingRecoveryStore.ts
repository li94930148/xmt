import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type PendingBindingRecord =
  | { version: 1; phase: 'bind'; mode: 'setup' | 'rebind'; requestId: string; recoverySecret: string; serverUrl: string; bindingCode: string; device: Record<string, unknown> }
  | { version: 1; phase: 'ack'; mode: 'setup' | 'rebind'; bindingCodeHash: string; requestId: string; recoverySecret: string; serverUrl: string };

export interface BindingSafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const recoverySecretPattern = /^[A-Za-z0-9_-]{43}$/;

function assertRecord(value: unknown): asserts value is PendingBindingRecord {
  if (!value || typeof value !== 'object') throw new Error('本地绑定恢复记录格式无效');
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.requestId !== 'string' || !uuidV4.test(record.requestId)
    || typeof record.recoverySecret !== 'string' || !recoverySecretPattern.test(record.recoverySecret)
    || typeof record.serverUrl !== 'string' || !record.serverUrl) throw new Error('本地绑定恢复记录格式无效');
  if (record.phase === 'bind') {
    if ((record.mode !== 'setup' && record.mode !== 'rebind') || typeof record.bindingCode !== 'string' || !record.bindingCode
      || !record.device || typeof record.device !== 'object' || Array.isArray(record.device)) throw new Error('本地待绑定记录格式无效');
    return;
  }
  if (record.phase !== 'ack') throw new Error('本地绑定恢复记录状态无效');
  if ((record.mode !== 'setup' && record.mode !== 'rebind') || typeof record.bindingCodeHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.bindingCodeHash)) {
    throw new Error('本地绑定确认记录格式无效');
  }
}

export async function savePendingBindingRecord(filePath: string, storage: BindingSafeStorage, value: PendingBindingRecord) {
  if (!storage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用，无法安全保存绑定恢复状态');
  assertRecord(value);
  const parent = path.dirname(filePath);
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(parent, { recursive: true });
  try {
    await fs.writeFile(temporaryPath, storage.encryptString(JSON.stringify(value)), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function readPendingBindingRecord(filePath: string, storage: BindingSafeStorage): Promise<PendingBindingRecord | null> {
  let encrypted: Buffer;
  try {
    encrypted = await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (!storage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用，无法读取绑定恢复状态');
  try {
    const value: unknown = JSON.parse(storage.decryptString(encrypted));
    assertRecord(value);
    return value;
  } catch {
    throw new Error('本地绑定恢复记录无法安全解密，请勿重复使用新的绑定码');
  }
}

export async function clearPendingBindingRecord(filePath: string) {
  await fs.rm(filePath, { force: true });
}

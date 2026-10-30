import type { NotificationPreference } from '../api/notificationSettings';

export type NotificationPreferenceDraft = Pick<NotificationPreference, 'channel' | 'event_type' | 'enabled' | 'config'>;

export type PendingNotificationPreferenceRecovery = {
  version: 1;
  actorId: number;
  requestId: string;
  draft: NotificationPreferenceDraft[];
};

export type NotificationPreferenceRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: PendingNotificationPreferenceRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

export interface NotificationPreferenceRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VERSION = 1;
const KEY_PREFIX = `xmt:notification-preferences-recovery:v${VERSION}:actor:`;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(actorId: number) {
  return `${KEY_PREFIX}${actorId}`;
}

function browserStorage(): NotificationPreferenceRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeDraft(value: unknown): NotificationPreferenceDraft[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const draft: NotificationPreferenceDraft[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, ['channel', 'event_type', 'enabled', 'config'])
      || typeof item.channel !== 'string' || !item.channel.trim()
      || typeof item.event_type !== 'string' || !item.event_type.trim()
      || typeof item.enabled !== 'boolean'
      || (item.config !== null && typeof item.config !== 'string')) return null;
    draft.push({
      channel: item.channel,
      event_type: item.event_type,
      enabled: item.enabled,
      config: item.config,
    });
  }
  return draft;
}

export function normalizePendingNotificationPreferenceRecovery(
  value: unknown,
  actorId: number,
): PendingNotificationPreferenceRecovery | null {
  if (!isRecord(value) || !Number.isSafeInteger(actorId) || actorId <= 0
    || !hasExactKeys(value, ['version', 'actorId', 'requestId', 'draft'])
    || value.version !== VERSION || value.actorId !== actorId
    || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) return null;
  const draft = normalizeDraft(value.draft);
  if (!draft) return null;
  return { version: VERSION, actorId, requestId: value.requestId.toLowerCase(), draft };
}

export function readNotificationPreferenceRecovery(
  actorId: number,
  storage: NotificationPreferenceRecoveryStorage | null = browserStorage(),
): NotificationPreferenceRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return { state: 'invalid' };
  if (!storage) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(storageKey(actorId));
    if (raw === null) return { state: 'none' };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { state: 'invalid' }; }
    const recovery = normalizePendingNotificationPreferenceRecovery(parsed, actorId);
    return recovery ? { state: 'valid', recovery } : { state: 'invalid' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function persistNotificationPreferenceRecovery(
  recovery: PendingNotificationPreferenceRecovery,
  storage: NotificationPreferenceRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const normalized = normalizePendingNotificationPreferenceRecovery(recovery, recovery.actorId);
  if (!normalized) return false;
  const current = readNotificationPreferenceRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  const serialized = JSON.stringify(normalized);
  if (current.state === 'valid') return JSON.stringify(current.recovery) === serialized;
  try {
    storage.setItem(storageKey(recovery.actorId), serialized);
    if (storage.getItem(storageKey(recovery.actorId)) !== serialized) return false;
    const stored = readNotificationPreferenceRecovery(recovery.actorId, storage);
    return stored.state === 'valid' && JSON.stringify(stored.recovery) === serialized;
  } catch {
    return false;
  }
}

export function clearNotificationPreferenceRecovery(
  recovery: PendingNotificationPreferenceRecovery,
  storage: NotificationPreferenceRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  const current = readNotificationPreferenceRecovery(recovery.actorId, storage);
  if (current.state === 'invalid' || current.state === 'unavailable') return false;
  if (current.state === 'valid' && current.recovery.requestId !== recovery.requestId) return false;
  try {
    storage.removeItem(storageKey(recovery.actorId));
    return storage.getItem(storageKey(recovery.actorId)) === null
      && readNotificationPreferenceRecovery(recovery.actorId, storage).state === 'none';
  } catch {
    return false;
  }
}

export function createNotificationPreferenceRecoveryRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全的恢复编号。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

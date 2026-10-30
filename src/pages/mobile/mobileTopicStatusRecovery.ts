export type MobileTopicStatus = 'pending' | 'approved' | 'rejected' | 'production' | 'shooting' | 'publishing' | 'completed';
export type MobileTopicStatusOperation = 'audit' | 'status';

export type PendingMobileTopicStatusWrite = {
  userId: number;
  topicId: number;
  operation: MobileTopicStatusOperation;
  before: MobileTopicStatus;
  target: MobileTopicStatus;
  title: string;
  comment: string;
};

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type ReadResult = { ok: true; entries: PendingMobileTopicStatusWrite[] } | { ok: false; entries: [] };

const STORAGE_PREFIX = 'xmt:mobile-topic-status-pending:v1:user:';
const TOPIC_STATUSES = new Set<MobileTopicStatus>([
  'pending', 'approved', 'rejected', 'production', 'shooting', 'publishing', 'completed',
]);

function getSessionStorage(): RecoveryStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function storageKey(userId: number) {
  return `${STORAGE_PREFIX}${userId}`;
}

function isPendingWrite(value: unknown, userId: number): value is PendingMobileTopicStatusWrite {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PendingMobileTopicStatusWrite>;
  return Number(entry.userId) === userId
    && Number.isSafeInteger(entry.topicId) && Number(entry.topicId) > 0
    && (entry.operation === 'audit' || entry.operation === 'status')
    && typeof entry.before === 'string' && TOPIC_STATUSES.has(entry.before as MobileTopicStatus)
    && typeof entry.target === 'string' && TOPIC_STATUSES.has(entry.target as MobileTopicStatus)
    && typeof entry.title === 'string'
    && typeof entry.comment === 'string';
}

export function readPendingMobileTopicStatusWrites(userId: number, storage = getSessionStorage()): ReadResult {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !storage) return { ok: false, entries: [] };
  let raw: string | null;
  try {
    raw = storage.getItem(storageKey(userId));
  } catch {
    return { ok: false, entries: [] };
  }
  if (raw === null) return { ok: true, entries: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((entry) => isPendingWrite(entry, userId))) return { ok: false, entries: [] };
    const entries = parsed as PendingMobileTopicStatusWrite[];
    if (new Set(entries.map((entry) => entry.topicId)).size !== entries.length) return { ok: false, entries: [] };
    return { ok: true, entries };
  } catch {
    return { ok: false, entries: [] };
  }
}

export function savePendingMobileTopicStatusWrite(
  pending: PendingMobileTopicStatusWrite,
  storage = getSessionStorage(),
) {
  if (!storage || !isPendingWrite(pending, pending.userId)) return false;
  const current = readPendingMobileTopicStatusWrites(pending.userId, storage);
  if (!current.ok || current.entries.some((entry) => entry.topicId === pending.topicId)) return false;
  const serialized = JSON.stringify([...current.entries, pending]);
  try {
    storage.setItem(storageKey(pending.userId), serialized);
    return storage.getItem(storageKey(pending.userId)) === serialized;
  } catch {
    return false;
  }
}

export function clearPendingMobileTopicStatusWrite(
  pending: PendingMobileTopicStatusWrite,
  storage = getSessionStorage(),
) {
  if (!storage) return false;
  const current = readPendingMobileTopicStatusWrites(pending.userId, storage);
  if (!current.ok) return false;
  const stored = current.entries.find((entry) => entry.topicId === pending.topicId);
  if (!stored) return true;
  if (stored.userId !== pending.userId
    || stored.topicId !== pending.topicId
    || stored.operation !== pending.operation
    || stored.before !== pending.before
    || stored.target !== pending.target
    || stored.title !== pending.title
    || stored.comment !== pending.comment) return false;
  const remaining = current.entries.filter((entry) => entry.topicId !== pending.topicId);
  try {
    if (remaining.length === 0) {
      storage.removeItem(storageKey(pending.userId));
      return storage.getItem(storageKey(pending.userId)) === null;
    }
    const serialized = JSON.stringify(remaining);
    storage.setItem(storageKey(pending.userId), serialized);
    return storage.getItem(storageKey(pending.userId)) === serialized;
  } catch {
    return false;
  }
}

export type RetroTransitionOperation = 'publish' | 'archive';
export type RetroTransitionStatus = 'draft' | 'published' | 'archived';

export type PendingRetroTransitionRecovery = {
  version: 1;
  actorId: number;
  retroId: number;
  operation: RetroTransitionOperation;
  originalStatus: RetroTransitionStatus;
  targetStatus: RetroTransitionStatus;
  requestId: string;
};

export type RetroTransitionRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; marker: PendingRetroTransitionRecovery }
  | { state: 'invalid'; message: string }
  | { state: 'unavailable'; message: string };

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function retroTransitionRecoveryKey(actorId: number, retroId: number) {
  return `xmt:retro-transition:v1:${actorId}:${retroId}`;
}

function getStorage(storage?: RecoveryStorage | null): RecoveryStorage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isValidTransition(marker: Partial<PendingRetroTransitionRecovery>, actorId: number, retroId: number) {
  const expected = marker.operation === 'publish'
    ? { originalStatus: 'draft', targetStatus: 'published' }
    : marker.operation === 'archive'
      ? { originalStatus: 'published', targetStatus: 'archived' }
      : null;
  return marker.version === 1
    && Number.isSafeInteger(marker.actorId) && marker.actorId === actorId
    && Number.isSafeInteger(marker.retroId) && marker.retroId === retroId
    && expected !== null
    && marker.originalStatus === expected.originalStatus
    && marker.targetStatus === expected.targetStatus
    && typeof marker.requestId === 'string' && requestIdPattern.test(marker.requestId);
}

function parseMarker(value: string, actorId: number, retroId: number): PendingRetroTransitionRecovery | null {
  try {
    const parsed = JSON.parse(value) as Partial<PendingRetroTransitionRecovery>;
    const allowed = ['version', 'actorId', 'retroId', 'operation', 'originalStatus', 'targetStatus', 'requestId'];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.keys(parsed).some((key) => !allowed.includes(key))
      || Object.keys(parsed).length !== allowed.length
      || !isValidTransition(parsed, actorId, retroId)) return null;
    return {
      version: 1,
      actorId,
      retroId,
      operation: parsed.operation as RetroTransitionOperation,
      originalStatus: parsed.originalStatus as RetroTransitionStatus,
      targetStatus: parsed.targetStatus as RetroTransitionStatus,
      requestId: parsed.requestId as string,
    };
  } catch {
    return null;
  }
}

export function readRetroTransitionRecovery(
  actorId: number,
  retroId: number,
  storage?: RecoveryStorage | null,
): RetroTransitionRecoveryRead {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !Number.isSafeInteger(retroId) || retroId <= 0) {
    return { state: 'invalid', message: '当前账号或复盘编号无法核实，发布和归档已锁定。' };
  }
  const target = getStorage(storage);
  if (!target) return { state: 'unavailable', message: '本机发布/归档核验记录暂不可用，相关操作已锁定。' };
  try {
    const raw = target.getItem(retroTransitionRecoveryKey(actorId, retroId));
    if (raw === null) return { state: 'none' };
    const marker = parseMarker(raw, actorId, retroId);
    return marker
      ? { state: 'valid', marker }
      : { state: 'invalid', message: '本机发布/归档核验记录无法读取，相关操作已锁定。' };
  } catch {
    return { state: 'unavailable', message: '本机发布/归档核验记录暂不可用，相关操作已锁定。' };
  }
}

export function persistRetroTransitionRecovery(
  marker: PendingRetroTransitionRecovery,
  storage?: RecoveryStorage | null,
) {
  if (!isValidTransition(marker, marker.actorId, marker.retroId)) return false;
  const target = getStorage(storage);
  if (!target) return false;
  const key = retroTransitionRecoveryKey(marker.actorId, marker.retroId);
  const serialized = JSON.stringify(marker);
  try {
    if (target.getItem(key) !== null) return false;
    target.setItem(key, serialized);
    return target.getItem(key) === serialized;
  } catch {
    return false;
  }
}

export function clearRetroTransitionRecovery(
  marker: PendingRetroTransitionRecovery,
  storage?: RecoveryStorage | null,
) {
  const target = getStorage(storage);
  if (!target) return false;
  const key = retroTransitionRecoveryKey(marker.actorId, marker.retroId);
  try {
    const raw = target.getItem(key);
    if (raw === null) return true;
    const current = parseMarker(raw, marker.actorId, marker.retroId);
    if (!current || current.requestId !== marker.requestId) return false;
    target.removeItem(key);
    return target.getItem(key) === null;
  } catch {
    return false;
  }
}

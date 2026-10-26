import type { AnonymousFeedbackUpdatePayload } from './anonymousFeedback';

export const ANONYMOUS_FEEDBACK_UPDATE_RECOVERY_KEY_PREFIX = 'xmt:anonymous-feedback-update-pending:actor:';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

export interface StoredAnonymousFeedbackUpdateRecovery {
  schemaVersion: 1;
  actorId: number;
  targetId: number;
  requestId: string;
  baseFingerprint: string;
  requestFingerprint: string;
  payload: AnonymousFeedbackUpdatePayload;
  baseline: { id: number; base_fingerprint: string };
  rejected: boolean;
}

export interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ReadUpdateRecoveryResult =
  | { kind: 'none' }
  | { kind: 'ready'; recovery: StoredAnonymousFeedbackUpdateRecovery }
  | { kind: 'blocked'; recovery: StoredAnonymousFeedbackUpdateRecovery | null; reason: 'unavailable' | 'invalid' | 'conflict' };

export function anonymousFeedbackUpdateRecoveryKey(actorId: number) {
  return `${ANONYMOUS_FEEDBACK_UPDATE_RECOVERY_KEY_PREFIX}${actorId}`;
}

function anonymousFeedbackUpdateRejectedFallbackKey(actorId: number) {
  return `${anonymousFeedbackUpdateRecoveryKey(actorId)}:rejected`;
}

function isPayload(value: unknown): value is AnonymousFeedbackUpdatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const allowed = ['status', 'reply_content', 'is_public'];
  if (Object.keys(payload).some((key) => !allowed.includes(key))) return false;
  if (payload.status !== undefined && payload.status !== 'pending' && payload.status !== 'processing' && payload.status !== 'completed') return false;
  if (payload.reply_content !== undefined && typeof payload.reply_content !== 'string') return false;
  if (payload.is_public !== undefined && typeof payload.is_public !== 'boolean') return false;
  return Object.keys(payload).length > 0;
}

function isFeedbackBaseline(value: unknown): value is { id: number; base_fingerprint: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const baseline = value as Partial<{ id: number; base_fingerprint: string }>;
  return Number.isSafeInteger(baseline.id) && Number(baseline.id) > 0
    && typeof baseline.base_fingerprint === 'string' && FINGERPRINT_PATTERN.test(baseline.base_fingerprint);
}

function parseRecovery(raw: string | null, actorId: number): StoredAnonymousFeedbackUpdateRecovery | null | 'invalid' {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredAnonymousFeedbackUpdateRecovery>;
    if (value.schemaVersion !== 1 || value.actorId !== actorId
      || !Number.isSafeInteger(value.targetId) || Number(value.targetId) <= 0
      || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)
      || typeof value.baseFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(value.baseFingerprint)
      || typeof value.requestFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(value.requestFingerprint)
      || !isPayload(value.payload) || !isFeedbackBaseline(value.baseline)
      || value.baseline.id !== value.targetId || value.baseline.base_fingerprint !== value.baseFingerprint
      || typeof value.rejected !== 'boolean') return 'invalid';
    return {
      schemaVersion: 1,
      actorId,
      targetId: Number(value.targetId),
      requestId: value.requestId.toLowerCase(),
      baseFingerprint: value.baseFingerprint,
      requestFingerprint: value.requestFingerprint,
      payload: value.payload,
    baseline: { id: value.baseline.id, base_fingerprint: value.baseline.base_fingerprint },
      rejected: value.rejected,
    };
  } catch {
    return 'invalid';
  }
}

export function sameAnonymousFeedbackUpdateRecovery(
  left: StoredAnonymousFeedbackUpdateRecovery | null,
  right: StoredAnonymousFeedbackUpdateRecovery | null,
): boolean {
  if (!left || !right) return left === right;
  return left.actorId === right.actorId
    && left.targetId === right.targetId
    && left.requestId === right.requestId
    && left.baseFingerprint === right.baseFingerprint
    && left.requestFingerprint === right.requestFingerprint
    && JSON.stringify(left.payload) === JSON.stringify(right.payload)
    && JSON.stringify(left.baseline) === JSON.stringify(right.baseline);
}

export function readAnonymousFeedbackUpdateRecovery(
  actorId: number,
  sessionStorage: RecoveryStorage,
  localStorage: RecoveryStorage,
): ReadUpdateRecoveryResult {
  let sessionRaw: string | null;
  let localRaw: string | null;
  let rejectedFallbackRaw: string | null;
  try {
    sessionRaw = sessionStorage.getItem(anonymousFeedbackUpdateRecoveryKey(actorId));
    localRaw = localStorage.getItem(anonymousFeedbackUpdateRecoveryKey(actorId));
    rejectedFallbackRaw = localStorage.getItem(anonymousFeedbackUpdateRejectedFallbackKey(actorId));
  } catch {
    return { kind: 'blocked', recovery: null, reason: 'unavailable' };
  }
  const session = parseRecovery(sessionRaw, actorId);
  const local = parseRecovery(localRaw, actorId);
  const rejectedFallback = parseRecovery(rejectedFallbackRaw, actorId);
  if (session === 'invalid' || local === 'invalid' || rejectedFallback === 'invalid') return { kind: 'blocked', recovery: null, reason: 'invalid' };
  if (!session && !local && !rejectedFallback) return { kind: 'none' };
  if ((session && local && !sameAnonymousFeedbackUpdateRecovery(session, local))
    || (rejectedFallback && !rejectedFallback.rejected)
    || (rejectedFallback && session && !sameAnonymousFeedbackUpdateRecovery(rejectedFallback, session))
    || (rejectedFallback && local && !sameAnonymousFeedbackUpdateRecovery(rejectedFallback, local))) {
    return { kind: 'blocked', recovery: session, reason: 'conflict' };
  }
  const recovery = session || local || rejectedFallback;
  if (!recovery) return { kind: 'none' };
  return { kind: 'ready', recovery: { ...recovery, rejected: Boolean(session?.rejected || local?.rejected || rejectedFallback?.rejected) } };
}

export function persistAnonymousFeedbackUpdateRecovery(
  recovery: StoredAnonymousFeedbackUpdateRecovery,
  sessionStorage: RecoveryStorage,
  localStorage: RecoveryStorage,
): boolean {
  const serialized = JSON.stringify(recovery);
  try { sessionStorage.setItem(anonymousFeedbackUpdateRecoveryKey(recovery.actorId), serialized); } catch { /* checked below */ }
  try { localStorage.setItem(anonymousFeedbackUpdateRecoveryKey(recovery.actorId), serialized); } catch { /* checked below */ }
  const read = readAnonymousFeedbackUpdateRecovery(recovery.actorId, sessionStorage, localStorage);
  return read.kind === 'ready' && sameAnonymousFeedbackUpdateRecovery(read.recovery, recovery) && !read.recovery.rejected;
}

export function markAnonymousFeedbackUpdateRecoveryRejected(
  recovery: StoredAnonymousFeedbackUpdateRecovery,
  sessionStorage: RecoveryStorage,
  localStorage: RecoveryStorage,
): boolean {
  const rejected = { ...recovery, rejected: true };
  const key = anonymousFeedbackUpdateRecoveryKey(recovery.actorId);
  const serialized = JSON.stringify(rejected);
  try { sessionStorage.setItem(key, serialized); } catch { /* fallback below */ }
  try { localStorage.setItem(key, serialized); } catch { /* fallback below */ }
  try { localStorage.setItem(anonymousFeedbackUpdateRejectedFallbackKey(recovery.actorId), serialized); } catch { /* verified below */ }
  const read = readAnonymousFeedbackUpdateRecovery(recovery.actorId, sessionStorage, localStorage);
  let fallbackStored = false;
  try {
    const fallback = parseRecovery(localStorage.getItem(anonymousFeedbackUpdateRejectedFallbackKey(recovery.actorId)), recovery.actorId);
    fallbackStored = fallback !== null && fallback !== 'invalid' && fallback.rejected && sameAnonymousFeedbackUpdateRecovery(fallback, recovery);
  } catch { fallbackStored = false; }
  return fallbackStored && read.kind === 'ready' && read.recovery.rejected && sameAnonymousFeedbackUpdateRecovery(read.recovery, recovery);
}

export function removeAnonymousFeedbackUpdateRecovery(
  recovery: StoredAnonymousFeedbackUpdateRecovery,
  sessionStorage: RecoveryStorage,
  localStorage: RecoveryStorage,
): boolean {
  const key = anonymousFeedbackUpdateRecoveryKey(recovery.actorId);
  const before = readAnonymousFeedbackUpdateRecovery(recovery.actorId, sessionStorage, localStorage);
  if (before.kind === 'blocked') return false;
  if (before.kind === 'ready' && !sameAnonymousFeedbackUpdateRecovery(before.recovery, recovery)) return false;
  try { sessionStorage.removeItem(key); } catch { /* checked below */ }
  try { localStorage.removeItem(key); } catch { /* checked below */ }
  try {
    if (sessionStorage.getItem(key) !== null || localStorage.getItem(key) !== null) return false;
  } catch { return false; }
  try { localStorage.removeItem(anonymousFeedbackUpdateRejectedFallbackKey(recovery.actorId)); } catch { /* checked below */ }
  return readAnonymousFeedbackUpdateRecovery(recovery.actorId, sessionStorage, localStorage).kind === 'none';
}

export async function fingerprintAnonymousFeedbackUpdateRequest(
  targetId: number,
  baseFingerprint: string,
  payload: AnonymousFeedbackUpdatePayload,
): Promise<string> {
  const payloadFingerprintParts = [
    targetId,
    baseFingerprint,
    payload.status ?? null,
    payload.reply_content === undefined ? null : payload.reply_content.trim() || null,
    payload.is_public ?? null,
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(payloadFingerprintParts));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

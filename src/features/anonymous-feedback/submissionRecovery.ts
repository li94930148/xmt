import type { AnonymousFeedbackType } from '../../api/anonymousFeedback';

export const ANONYMOUS_FEEDBACK_SUBMISSION_RECOVERY_STORAGE_KEY = 'xmt:anonymous-feedback-submission-pending:v1';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FEEDBACK_TYPES = new Set<AnonymousFeedbackType>(['feature', 'usage', 'process', 'team', 'other']);

export type AnonymousFeedbackSubmissionPayload = {
  type: AnonymousFeedbackType;
  content: string;
  needReply: boolean;
};

export type PendingAnonymousFeedbackSubmission = {
  clientRequestId: string;
  requestFingerprint: string;
  payload: AnonymousFeedbackSubmissionPayload;
};

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isPendingAnonymousFeedbackSubmission(value: unknown): value is PendingAnonymousFeedbackSubmission {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingAnonymousFeedbackSubmission>;
  const payload = candidate.payload;
  return typeof candidate.clientRequestId === 'string'
    && REQUEST_ID_PATTERN.test(candidate.clientRequestId)
    && typeof candidate.requestFingerprint === 'string'
    && /^[0-9a-f]{64}$/i.test(candidate.requestFingerprint)
    && Boolean(payload)
    && typeof payload === 'object'
    && FEEDBACK_TYPES.has(payload.type)
    && typeof payload.content === 'string'
    && payload.content.trim().length > 0
    && payload.content.length <= 2000
    && typeof payload.needReply === 'boolean';
}

export function readPendingAnonymousFeedbackSubmission(storage: SessionStorageLike): PendingAnonymousFeedbackSubmission | null {
  const serialized = storage.getItem(ANONYMOUS_FEEDBACK_SUBMISSION_RECOVERY_STORAGE_KEY);
  if (!serialized) return null;
  const parsed: unknown = JSON.parse(serialized);
  if (!isPendingAnonymousFeedbackSubmission(parsed)) throw new Error('意见恢复记录格式无效');
  return parsed;
}

export async function fingerprintAnonymousFeedbackSubmission(payload: AnonymousFeedbackSubmissionPayload) {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器无法安全生成意见恢复校验值');
  const bytes = new TextEncoder().encode(JSON.stringify([payload.type, payload.content, payload.needReply]));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function savePendingAnonymousFeedbackSubmission(
  storage: SessionStorageLike,
  pending: PendingAnonymousFeedbackSubmission,
) {
  if (!isPendingAnonymousFeedbackSubmission(pending)) throw new Error('意见恢复记录内容无效');
  storage.setItem(ANONYMOUS_FEEDBACK_SUBMISSION_RECOVERY_STORAGE_KEY, JSON.stringify(pending));
}

export function clearPendingAnonymousFeedbackSubmission(storage: SessionStorageLike) {
  storage.removeItem(ANONYMOUS_FEEDBACK_SUBMISSION_RECOVERY_STORAGE_KEY);
}

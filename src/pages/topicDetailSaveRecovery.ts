import type { Topic } from '../types';
import {
  buildTopicDetailUpdatePayload,
  topicDetailDraftEquals,
  type TopicDetailAggregateDraft,
} from './topicDetailAggregateDraft';

export type TopicDetailSaveRecovery = {
  version: 1 | 2;
  userId: number;
  topicId: number;
  baseline: TopicDetailAggregateDraft;
  target: TopicDetailAggregateDraft;
  versionAction: 'minor' | 'major' | null;
  phase: 'sending' | 'uncertain';
  contentFingerprint?: string;
};

function recoveryKey(userId: number | null | undefined, topicId: number) {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0 || !Number.isSafeInteger(topicId) || topicId <= 0) return null;
  return `xmt:topic-detail-save-recovery:v1:user:${userId}:topic:${topicId}`;
}

function isDraft(value: unknown): value is TopicDetailAggregateDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<TopicDetailAggregateDraft>;
  return typeof draft.title === 'string'
    && typeof draft.description === 'string'
    && typeof draft.outline === 'string'
    && Boolean(draft.details && typeof draft.details === 'object'
      && Number.isSafeInteger(draft.details.assignee_id)
      && typeof draft.details.deadline === 'string'
      && typeof draft.details.platform === 'string')
    && Boolean(draft.parsedFields && typeof draft.parsedFields === 'object'
      && typeof draft.parsedFields.projectBackground === 'string'
      && typeof draft.parsedFields.targetAudience === 'string');
}

function draftFingerprintParts(draft: TopicDetailAggregateDraft) {
  return [
    draft.title,
    draft.description,
    draft.outline,
    draft.details.assignee_id,
    draft.details.deadline,
    draft.details.platform,
    draft.parsedFields.projectBackground,
    draft.parsedFields.targetAudience,
  ];
}

function recoveryContentFingerprint(recovery: Pick<TopicDetailSaveRecovery, 'version' | 'userId' | 'topicId' | 'baseline' | 'target' | 'versionAction'>) {
  const content = JSON.stringify([
    recovery.version,
    recovery.userId,
    recovery.topicId,
    draftFingerprintParts(recovery.baseline),
    draftFingerprintParts(recovery.target),
    recovery.versionAction,
  ]);
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const parts = seeds.map((seed) => {
    let hash = seed;
    for (let index = 0; index < content.length; index += 1) {
      hash = Math.imul(hash ^ content.charCodeAt(index), 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  });
  return parts.join('');
}

export function readTopicDetailSaveRecovery(
  userId: number | null | undefined,
  topicId: number,
): TopicDetailSaveRecovery | 'invalid' | null {
  const key = recoveryKey(userId, topicId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<TopicDetailSaveRecovery>;
    if ((value.version !== 1 && value.version !== 2) || value.userId !== userId || value.topicId !== topicId
      || !isDraft(value.baseline) || !isDraft(value.target)
      || (value.versionAction !== null && value.versionAction !== 'minor' && value.versionAction !== 'major')
      || (value.phase !== 'sending' && value.phase !== 'uncertain')
      || (value.version === 2 && typeof value.contentFingerprint !== 'string')
      || (typeof value.contentFingerprint === 'string' && value.contentFingerprint !== recoveryContentFingerprint({
        version: value.version,
        userId: Number(value.userId),
        topicId: Number(value.topicId),
        baseline: value.baseline,
        target: value.target,
        versionAction: value.versionAction,
      }))) return 'invalid';
    return {
      version: value.version,
      userId: Number(value.userId),
      topicId: Number(value.topicId),
      baseline: value.baseline,
      target: value.target,
      versionAction: value.versionAction,
      phase: value.phase,
      ...(typeof value.contentFingerprint === 'string' ? { contentFingerprint: value.contentFingerprint } : {}),
    };
  } catch {
    return 'invalid';
  }
}

export function persistTopicDetailSaveRecovery(recovery: TopicDetailSaveRecovery) {
  const key = recoveryKey(recovery.userId, recovery.topicId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号或选题尚未确认，无法安全保存恢复状态。');
  try {
    const marker = { ...recovery, version: 2 as const };
    const expectedFingerprint = recoveryContentFingerprint(marker);
    const serializedMarker = JSON.stringify({ ...marker, contentFingerprint: expectedFingerprint });
    window.localStorage.setItem(key, serializedMarker);
    const stored = readTopicDetailSaveRecovery(recovery.userId, recovery.topicId);
    if (!stored || stored === 'invalid' || stored.version !== 2
      || stored.versionAction !== recovery.versionAction
      || !topicDetailDraftEquals(stored.baseline, recovery.baseline)
      || !topicDetailDraftEquals(stored.target, recovery.target)
      || stored.contentFingerprint !== expectedFingerprint) {
      throw new Error('选题恢复状态未能完整保存。');
    }
  } catch (error) {
    throw new Error(`本次选题修改未发送：${error instanceof Error ? error.message : '浏览器无法保存恢复状态'}`);
  }
}

export function markTopicDetailSaveRecoveryUncertain(recovery: TopicDetailSaveRecovery) {
  try {
    persistTopicDetailSaveRecovery({ ...recovery, phase: 'uncertain' });
  } catch {
    // The original sending marker remains conservative and is checked read-only on the next visit.
  }
}

export function removeTopicDetailSaveRecovery(recovery: Pick<TopicDetailSaveRecovery, 'userId' | 'topicId' | 'baseline' | 'target' | 'versionAction'>): boolean {
  const key = recoveryKey(recovery.userId, recovery.topicId);
  if (!key || typeof window === 'undefined') return false;
  try {
    const stored = readTopicDetailSaveRecovery(recovery.userId, recovery.topicId);
    if (stored === null) return true;
    if (stored === 'invalid'
      || stored.versionAction !== recovery.versionAction
      || !topicDetailDraftEquals(stored.baseline, recovery.baseline)
      || !topicDetailDraftEquals(stored.target, recovery.target)) return false;
    window.localStorage.removeItem(key);
    return window.localStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function clearInvalidTopicDetailSaveRecovery(userId: number | null | undefined, topicId: number): boolean {
  const key = recoveryKey(userId, topicId);
  if (!key || typeof window === 'undefined') return false;
  try {
    const stored = readTopicDetailSaveRecovery(userId, topicId);
    if (stored === null) return true;
    if (stored !== 'invalid') return false;
    window.localStorage.removeItem(key);
    return window.localStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function topicMatchesDetailSaveTarget(topic: Topic, draft: TopicDetailAggregateDraft) {
  const target = buildTopicDetailUpdatePayload(draft);
  return topic.title === target.title
    && (topic.description ?? '') === target.description
    && (topic.outline ?? '') === target.outline
    && (topic.platform ?? '') === target.platform
    && (topic.deadline ?? '') === target.deadline
    && Number(topic.assignee_id) === Number(target.assignee_id);
}

export function topicMatchesDetailSaveBaseline(topic: Topic, draft: TopicDetailAggregateDraft) {
  return topic.title === draft.title
    && (topic.description ?? '') === draft.description
    && (topic.outline ?? '') === draft.outline
    && (topic.platform ?? '') === draft.details.platform
    && (topic.deadline ?? '') === draft.details.deadline
    && Number(topic.assignee_id) === Number(draft.details.assignee_id);
}

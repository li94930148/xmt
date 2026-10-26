import type { Topic } from '../types';
import {
  buildTopicDetailUpdatePayload,
  topicDetailDraftEquals,
  type TopicDetailAggregateDraft,
} from './topicDetailAggregateDraft';

export type TopicDetailSaveRecovery = {
  version: 1;
  userId: number;
  topicId: number;
  baseline: TopicDetailAggregateDraft;
  target: TopicDetailAggregateDraft;
  versionAction: 'minor' | 'major' | null;
  phase: 'sending' | 'uncertain';
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
    if (value.version !== 1 || value.userId !== userId || value.topicId !== topicId
      || !isDraft(value.baseline) || !isDraft(value.target)
      || (value.versionAction !== null && value.versionAction !== 'minor' && value.versionAction !== 'major')
      || (value.phase !== 'sending' && value.phase !== 'uncertain')) return 'invalid';
    return {
      version: 1,
      userId: Number(value.userId),
      topicId: Number(value.topicId),
      baseline: value.baseline,
      target: value.target,
      versionAction: value.versionAction,
      phase: value.phase,
    };
  } catch {
    return 'invalid';
  }
}

export function persistTopicDetailSaveRecovery(recovery: TopicDetailSaveRecovery) {
  const key = recoveryKey(recovery.userId, recovery.topicId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号或选题尚未确认，无法安全保存恢复状态。');
  try {
    window.localStorage.setItem(key, JSON.stringify(recovery));
    const stored = readTopicDetailSaveRecovery(recovery.userId, recovery.topicId);
    if (!stored || stored === 'invalid'
      || stored.versionAction !== recovery.versionAction
      || !topicDetailDraftEquals(stored.baseline, recovery.baseline)
      || !topicDetailDraftEquals(stored.target, recovery.target)) {
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

export function removeTopicDetailSaveRecovery(recovery: Pick<TopicDetailSaveRecovery, 'userId' | 'topicId' | 'target'>) {
  const key = recoveryKey(recovery.userId, recovery.topicId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = readTopicDetailSaveRecovery(recovery.userId, recovery.topicId);
    if (stored && stored !== 'invalid' && topicDetailDraftEquals(stored.target, recovery.target)) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // A stale marker is safe: reopening the page only performs a read-only verification.
  }
}

export function clearInvalidTopicDetailSaveRecovery(userId: number | null | undefined, topicId: number) {
  const key = recoveryKey(userId, topicId);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Leave the invalid marker in place if storage is temporarily unavailable.
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

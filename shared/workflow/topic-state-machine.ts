import type { TopicStatus } from '../types';

/** The authoritative set of Topic-stage transitions shared by API and workflow policy. */
export const TOPIC_STATUS_TRANSITIONS: Readonly<Record<TopicStatus, readonly TopicStatus[]>> = {
  pending: ['approved', 'rejected'],
  approved: ['production'],
  rejected: ['pending'],
  production: ['shooting'],
  shooting: ['publishing'],
  publishing: ['completed'],
  completed: [],
};

const TOPIC_PIPELINE_ORDER: readonly TopicStatus[] = [
  'pending', 'approved', 'production', 'shooting', 'publishing', 'completed',
];

export function isTopicStatus(value: unknown): value is TopicStatus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TOPIC_STATUS_TRANSITIONS, value);
}

export function canTransitionTopicStatus(from: unknown, to: unknown): boolean {
  return isTopicStatus(from)
    && isTopicStatus(to)
    && TOPIC_STATUS_TRANSITIONS[from].includes(to);
}

export function getNextTopicStatuses(current: unknown): TopicStatus[] {
  return isTopicStatus(current) ? [...TOPIC_STATUS_TRANSITIONS[current]] : [];
}

export function isTopicAtOrBeyondStage(status: unknown, expected: unknown): boolean {
  if (!isTopicStatus(status) || !isTopicStatus(expected)) return false;
  const actualOrder = TOPIC_PIPELINE_ORDER.indexOf(status);
  const expectedOrder = TOPIC_PIPELINE_ORDER.indexOf(expected);
  return actualOrder >= 0 && expectedOrder >= 0 && actualOrder >= expectedOrder;
}

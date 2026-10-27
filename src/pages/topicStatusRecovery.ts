export type TopicStatusRecoveryIdentity = {
  kind: 'write' | 'invalid';
  topicId: number;
  userId: number;
  before?: string;
  target?: string;
  createdAt?: number;
  reason?: 'expired' | 'corrupt';
};

export function isSameTopicStatusRecovery(
  left: TopicStatusRecoveryIdentity | null,
  right: TopicStatusRecoveryIdentity,
) {
  if (!left || left.kind !== right.kind || left.topicId !== right.topicId || left.userId !== right.userId) return false;
  if (left.kind === 'invalid' && right.kind === 'invalid') return left.reason === right.reason;
  return left.kind === 'write' && right.kind === 'write'
    && left.before === right.before && left.target === right.target && left.createdAt === right.createdAt;
}

/** Resolve only the recovery item captured by the completed request. */
export function completeTopicStatusRecovery(
  current: TopicStatusRecoveryIdentity | null,
  completed: TopicStatusRecoveryIdentity,
  removeMarker: (recovery: TopicStatusRecoveryIdentity) => void,
  clearCurrent: () => void,
) {
  removeMarker(completed);
  if (!isSameTopicStatusRecovery(current, completed)) return false;
  clearCurrent();
  return true;
}

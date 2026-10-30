type ProductionReference = { id: number; topic_id: number };

export type TopicProductionDraftInput = {
  topic_id: number;
  version: 'v1.0';
  content: string;
  status: 'draft';
  origin_type: 'topic_outline';
};

export type TopicProductionCreateRecovery = {
  version: 1;
  userId: number;
  topicId: number;
  requestId: string;
  payload: TopicProductionDraftInput;
  phase: 'unknown' | 'retryable';
};

export type TopicProductionCreateRecoveryRead = TopicProductionCreateRecovery | 'invalid' | null;
export type TopicProductionHandoffAction = 'start' | 'verify' | 'retry';
export type TopicProductionCreateStatus =
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'created'; productionId: number };

export type TopicProductionHandoffDependencies = {
  advanceTopic: (topicId: number, status: 'production') => Promise<unknown>;
  getTopicStatus: (topicId: number) => Promise<string>;
  listProductions: (topicId: number) => Promise<ProductionReference[]>;
  createDraft: (input: TopicProductionDraftInput, requestId: string) => Promise<{ productionId: number }>;
  getCreateStatus: (requestId: string) => Promise<TopicProductionCreateStatus>;
  getProductionById: (productionId: number) => Promise<ProductionReference>;
  userId: number | null | undefined;
  recoveryStorage?: TopicProductionRecoveryStorage | null;
};

export type TopicProductionRecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type TopicProductionHandoffResult =
  | { kind: 'opened'; productionId: number; created: boolean; advanced: boolean; verified: boolean }
  | { kind: 'retryable'; recovery: TopicProductionCreateRecovery; advanced: boolean; message: string }
  | { kind: 'unknown'; recovery: TopicProductionCreateRecovery; advanced: boolean; message: string }
  | { kind: 'invalid-recovery'; advanced: false; message: string }
  | { kind: 'deleted'; advanced: boolean; message: string };

const CREATE_RECOVERY_PREFIX = 'xmt:topic-production-handoff:v1';
const PRODUCTION_CREATE_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function browserSessionStorage(): TopicProductionRecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function recoveryKey(userId: number, topicId: number) {
  return `${CREATE_RECOVERY_PREFIX}:user:${userId}:topic:${topicId}`;
}

function validRecovery(value: unknown, userId: number, topicId: number): value is TopicProductionCreateRecovery {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TopicProductionCreateRecovery>;
  const payload = candidate.payload as Partial<TopicProductionDraftInput> | undefined;
  return candidate.version === 1
    && candidate.userId === userId
    && candidate.topicId === topicId
    && typeof candidate.requestId === 'string'
    && PRODUCTION_CREATE_REQUEST_ID.test(candidate.requestId)
    && (candidate.phase === 'unknown' || candidate.phase === 'retryable')
    && Boolean(payload)
    && payload?.topic_id === topicId
    && payload.version === 'v1.0'
    && typeof payload.content === 'string'
    && payload.status === 'draft'
    && payload.origin_type === 'topic_outline';
}

export function readTopicProductionCreateRecovery(
  userId: number | null | undefined,
  topicId: number | null | undefined,
  storage: TopicProductionRecoveryStorage | null = browserSessionStorage(),
): TopicProductionCreateRecoveryRead {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0 || !Number.isSafeInteger(topicId) || Number(topicId) <= 0) return null;
  if (!storage) return typeof window === 'undefined' ? null : 'invalid';
  try {
    const raw = storage.getItem(recoveryKey(Number(userId), Number(topicId)));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validRecovery(parsed, Number(userId), Number(topicId)) ? parsed : 'invalid';
  } catch {
    return 'invalid';
  }
}

export function persistTopicProductionCreateRecovery(
  recovery: TopicProductionCreateRecovery,
  storage: TopicProductionRecoveryStorage | null = browserSessionStorage(),
) {
  if (!storage) throw new Error('当前浏览器无法保存创作恢复状态，本次创作请求未发送。');
  try {
    storage.setItem(recoveryKey(recovery.userId, recovery.topicId), JSON.stringify(recovery));
    const stored = readTopicProductionCreateRecovery(recovery.userId, recovery.topicId, storage);
    if (!stored || stored === 'invalid' || stored.requestId !== recovery.requestId
      || stored.topicId !== recovery.topicId || stored.userId !== recovery.userId
      || stored.payload.content !== recovery.payload.content) {
      throw new Error('创作恢复状态未能完整保存。');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : '浏览器无法保存恢复状态';
    throw new Error(`本次创作请求未发送：${reason}`);
  }
}

export function clearTopicProductionCreateRecovery(
  userId: number,
  topicId: number,
  requestId: string,
  storage: TopicProductionRecoveryStorage | null = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    const stored = readTopicProductionCreateRecovery(userId, topicId, storage);
    if (stored && stored !== 'invalid' && stored.requestId === requestId) {
      storage.removeItem(recoveryKey(userId, topicId));
    }
  } catch {
    // A stale request marker is safe: reopening the topic only performs a status GET.
  }
}

function isDefiniteCreateRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

function createRequestId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('当前浏览器不支持安全的创作请求编号，本次创作请求未发送。');
  return globalThis.crypto.randomUUID();
}

function persistPhase(
  recovery: TopicProductionCreateRecovery,
  phase: TopicProductionCreateRecovery['phase'],
  storage: TopicProductionRecoveryStorage | null,
) {
  const updated = { ...recovery, phase };
  try {
    persistTopicProductionCreateRecovery(updated, storage);
    return updated;
  } catch {
    // Keep the earlier durable marker, which still forces a read-only status check.
    return recovery;
  }
}

async function resolveCreateRequest(
  recovery: TopicProductionCreateRecovery,
  dependencies: TopicProductionHandoffDependencies,
  advanced: boolean,
): Promise<TopicProductionHandoffResult> {
  const storage = Object.prototype.hasOwnProperty.call(dependencies, 'recoveryStorage')
    ? dependencies.recoveryStorage ?? null
    : browserSessionStorage();
  try {
    const result = await dependencies.getCreateStatus(recovery.requestId);
    if (result.status === 'missing') {
      const retryable = persistPhase(recovery, 'retryable', storage);
      if (retryable.phase !== 'retryable') {
        return { kind: 'unknown', recovery: retryable, advanced, message: '创作结果尚未确认，恢复状态无法更新；请稍后只读核实。' };
      }
      return { kind: 'retryable', recovery: retryable, advanced, message: '服务器暂未找到这条创作稿；原请求编号已保留，可由你明确确认后安全重试。' };
    }
    if (result.status === 'deleted') {
      clearTopicProductionCreateRecovery(recovery.userId, recovery.topicId, recovery.requestId, storage);
      return { kind: 'deleted', advanced, message: '已核实原请求对应的创作稿已删除；如仍需开始创作，请检查选题后重新操作。' };
    }

    const productionId = Number(result.productionId);
    if (!Number.isSafeInteger(productionId) || productionId <= 0) throw new Error('创作回执编号无效');
    const production = await dependencies.getProductionById(productionId);
    if (Number(production.id) !== productionId || Number(production.topic_id) !== recovery.topicId) {
      throw new Error('创作回执与当前选题不一致');
    }
    clearTopicProductionCreateRecovery(recovery.userId, recovery.topicId, recovery.requestId, storage);
    return { kind: 'opened', productionId, created: true, advanced, verified: true };
  } catch {
    const persisted = persistPhase(recovery, 'unknown', storage);
    const unknown = persisted.phase === 'unknown' ? persisted : { ...persisted, phase: 'unknown' as const };
    return { kind: 'unknown', recovery: unknown, advanced, message: '创作结果仍暂时无法确认。已锁定再次创建；请使用只读核实，不会自动重发。' };
  }
}

async function submitDraft(
  recovery: TopicProductionCreateRecovery,
  dependencies: TopicProductionHandoffDependencies,
  advanced: boolean,
): Promise<TopicProductionHandoffResult> {
  const storage = Object.prototype.hasOwnProperty.call(dependencies, 'recoveryStorage')
    ? dependencies.recoveryStorage ?? null
    : browserSessionStorage();
  const pending = { ...recovery, phase: 'unknown' as const };
  // A retryable marker must be durably relocked before the explicit retry POST.
  persistTopicProductionCreateRecovery(pending, storage);
  try {
    const created = await dependencies.createDraft(pending.payload, pending.requestId);
    const productionId = Number(created.productionId);
    if (!Number.isSafeInteger(productionId) || productionId <= 0) throw new Error('创作返回编号无效');
    clearTopicProductionCreateRecovery(pending.userId, pending.topicId, pending.requestId, storage);
    return { kind: 'opened', productionId, created: true, advanced, verified: false };
  } catch (error) {
    if (isDefiniteCreateRejection(error)) {
      clearTopicProductionCreateRecovery(pending.userId, pending.topicId, pending.requestId, storage);
      throw error;
    }
    return resolveCreateRequest(pending, dependencies, advanced);
  }
}

/**
 * Reconcile the selected topic stage before handing off. Draft creation is
 * request-keyed and persisted before POST, so unknown outcomes only trigger
 * status/detail GETs; an absent request can be replayed only by an explicit
 * same-key retry action.
 */
export async function startOrResumeTopicProduction(
  topic: { id: number; status: string; outline?: string | null },
  dependencies: TopicProductionHandoffDependencies,
  action: TopicProductionHandoffAction = 'start',
): Promise<TopicProductionHandoffResult> {
  const userId = Number(dependencies.userId);
  const topicId = Number(topic.id);
  const storage = Object.prototype.hasOwnProperty.call(dependencies, 'recoveryStorage')
    ? dependencies.recoveryStorage ?? null
    : browserSessionStorage();
  const pending = readTopicProductionCreateRecovery(userId, topicId, storage);

  if (pending === 'invalid') {
    return { kind: 'invalid-recovery', advanced: false, message: '上次创作恢复记录无法读取。为避免重复创建，已锁定创作；请重新载入或联系管理员处理。' };
  }
  if (pending) {
    if (action === 'retry' && pending.phase === 'retryable') {
      const status = await resolveCreateRequest(pending, dependencies, false);
      if (status.kind !== 'retryable') return status;
      return submitDraft(status.recovery, dependencies, false);
    }
    return resolveCreateRequest(pending, dependencies, false);
  }
  if (action !== 'start') {
    throw new Error('没有待核实的创作请求；请重新载入选题后再操作。');
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('当前账号尚未确认，无法安全保存创作请求；本次未创建稿件。');
  }
  const shouldAdvance = topic.status === 'approved';
  if (!shouldAdvance && topic.status !== 'production') {
    throw new Error('只有已通过或创作中的选题可以开始创作');
  }

  let advanced = false;
  if (shouldAdvance) {
    let currentStatus: string;
    try {
      currentStatus = await dependencies.getTopicStatus(topic.id);
    } catch {
      throw new Error('暂时无法核实选题状态，未重复提交阶段推进，也未处理稿件。请稍后重新点击“开始创作”先核实状态。');
    }

    if (currentStatus === 'production') {
      advanced = true;
    } else if (currentStatus === 'approved') {
      try {
        await dependencies.advanceTopic(topic.id, 'production');
        advanced = true;
      } catch {
        try {
          currentStatus = await dependencies.getTopicStatus(topic.id);
        } catch {
          throw new Error('阶段推进结果暂时无法确认。为避免重复提交，本次未继续处理稿件；请重新点击“开始创作”核实当前状态。');
        }

        if (currentStatus === 'production') {
          advanced = true;
        } else if (currentStatus === 'approved') {
          throw new Error('已核实选题仍处于“已通过”，阶段推进尚未生效，本次未创建或查找稿件。确认后可重新点击“开始创作”明确重试。');
        } else {
          throw new Error('选题状态已发生变化，本次未继续处理稿件。请刷新选题详情后再操作。');
        }
      }
    } else {
      throw new Error('选题状态已发生变化，本次未推进阶段或处理稿件。请刷新选题详情后再操作。');
    }
  }

  const existing = (await dependencies.listProductions(topic.id))[0];
  if (existing) {
    return { kind: 'opened', productionId: existing.id, created: false, advanced, verified: false };
  }

  const recovery: TopicProductionCreateRecovery = {
    version: 1,
    userId,
    topicId,
    requestId: createRequestId(),
    payload: {
      topic_id: topicId,
      version: 'v1.0',
      content: topic.outline || '',
      status: 'draft',
      origin_type: 'topic_outline',
    },
    phase: 'unknown',
  };
  persistTopicProductionCreateRecovery(recovery, storage);
  return submitDraft(recovery, dependencies, advanced);
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { createTopic, getTopicCreateRequestStatus, TopicApiError } from '../api/topics';
import { useAuthStore } from '../store';
import {
  clearTopicCreateRecovery,
  createTopicCreateRequestId,
  persistTopicCreateRecovery,
  persistTopicCreateRejection,
  readTopicCreateRecovery,
  type TopicCreatePayload,
  type TopicCreateRecovery,
} from '../utils/topicCreateRecovery';
import type { TopicDraft } from '../utils/topicDraft';

export type TopicCreateRecoveryPhase = 'checking' | 'uncertain' | 'not_found' | 'rejected' | 'cleanup_failed';

export type TopicCreateRecoveryEntry = {
  recovery: TopicCreateRecovery;
  phase: TopicCreateRecoveryPhase;
  confirmedTopicId?: number;
  recovered?: boolean;
  confirmedNotFound?: boolean;
};

type TopicCreateConfirmed = (topicId: number, recovery: TopicCreateRecovery, recovered: boolean) => void;

const validActorId = (value: number | null | undefined) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;

export function useTopicCreateRecovery(actorIdValue: number | null | undefined, onCreated: TopicCreateConfirmed) {
  const actorId = validActorId(actorIdValue);
  const scopeRef = useRef({ actorId, generation: 0 });
  const mountedRef = useRef(false);
  if (scopeRef.current.actorId !== actorId) {
    scopeRef.current = { actorId, generation: scopeRef.current.generation + 1 };
  }
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const pendingRef = useRef<TopicCreateRecoveryEntry | null>(null);
  const operationsRef = useRef(new Set<string>());
  const [pending, setPending] = useState<TopicCreateRecoveryEntry | null>(null);
  const [invalidRecovery, setInvalidRecovery] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [stateActorId, setStateActorId] = useState<number | null>(actorId);
  const [readyActorId, setReadyActorId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isCurrentActorScope = useCallback((expectedActorId: number, generation: number) => (
    mountedRef.current
      && scopeRef.current.actorId === expectedActorId
      && scopeRef.current.generation === generation
      && Number(useAuthStore.getState().user?.id) === expectedActorId
  ), []);

  const updatePending = useCallback((expectedActorId: number, generation: number, next: TopicCreateRecoveryEntry | null) => {
    if (!isCurrentActorScope(expectedActorId, generation)) return false;
    pendingRef.current = next;
    setPending(next);
    return true;
  }, [isCurrentActorScope]);

  const updateMessage = useCallback((expectedActorId: number, generation: number, next: string) => {
    if (!isCurrentActorScope(expectedActorId, generation)) return false;
    setMessage(next);
    return true;
  }, [isCurrentActorScope]);

  const complete = useCallback((recovery: TopicCreateRecovery, topicId: number, generation: number, recovered: boolean) => {
    if (!isCurrentActorScope(recovery.actorId, generation)) return false;
    const cleared = clearTopicCreateRecovery(recovery.actorId, recovery.requestId);
    if (!cleared) {
      updatePending(recovery.actorId, generation, {
        recovery,
        phase: 'cleanup_failed',
        confirmedTopicId: topicId,
        recovered,
      });
      updateMessage(recovery.actorId, generation, '服务器已确认选题创建成功，但本机恢复记录未能清理。为避免重复提报，当前页面保持锁定；请重试清理后继续。');
      return false;
    }
    updatePending(recovery.actorId, generation, null);
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    updateMessage(recovery.actorId, generation, '');
    onCreatedRef.current(topicId, recovery, recovered);
    return true;
  }, [isCurrentActorScope, updateMessage, updatePending]);

  const verifyRecovery = useCallback(async (recovery: TopicCreateRecovery, generation: number) => {
    const operationKey = `${recovery.actorId}:${generation}:${recovery.requestId}:status`;
    if (!isCurrentActorScope(recovery.actorId, generation) || operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    updatePending(recovery.actorId, generation, { recovery, phase: 'checking' });
    updateMessage(recovery.actorId, generation, '正在只读核实选题创建结果；核实期间不会重复提交。');
    try {
      const result = await getTopicCreateRequestStatus(recovery.requestId);
      if (!isCurrentActorScope(recovery.actorId, generation)) return;
      if (result.state === 'created') {
        complete(recovery, result.topicId, generation, true);
      } else if (recovery.rejectionStatus !== undefined) {
        updatePending(recovery.actorId, generation, { recovery, phase: 'rejected', confirmedNotFound: true });
        updateMessage(recovery.actorId, generation, rejectionMessage(recovery.rejectionStatus, true));
      } else {
        updatePending(recovery.actorId, generation, { recovery, phase: 'not_found' });
        updateMessage(recovery.actorId, generation, '服务器尚未找到这次创建请求。原表单与请求编号已保留；确认后可用同一请求编号和原内容重试。');
      }
    } catch (error) {
      if (!isCurrentActorScope(recovery.actorId, generation)) return;
      updatePending(recovery.actorId, generation, { recovery, phase: 'uncertain' });
      const reason = error instanceof Error ? error.message : '暂时无法核实选题创建结果';
      updateMessage(recovery.actorId, generation, recovery.rejectionStatus !== undefined
        ? `${rejectionMessage(recovery.rejectionStatus)} 状态查询失败（${reason}），当前仍锁定；请稍后只读重新核实。`
        : `${reason}。请求编号和原表单已保留；请只读重新核实，不要另行提报。`);
    } finally {
      operationsRef.current.delete(operationKey);
    }
  }, [complete, isCurrentActorScope, updateMessage, updatePending]);

  const postRecovery = useCallback(async (recovery: TopicCreateRecovery, generation: number, recovered: boolean) => {
    const operationKey = `${recovery.actorId}:${generation}:${recovery.requestId}:post`;
    if (!isCurrentActorScope(recovery.actorId, generation) || operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    updatePending(recovery.actorId, generation, { recovery, phase: 'checking' });
    updateMessage(recovery.actorId, generation, '正在提交选题；本次请求已安全保存。');
    try {
      const result = await createTopic({ ...recovery.payload, client_request_id: recovery.requestId });
      if (!Number.isSafeInteger(result.topicId) || result.topicId <= 0) throw new Error('创建响应未包含有效的选题编号');
      complete(recovery, result.topicId, generation, recovered);
    } catch (error) {
      if (!isCurrentActorScope(recovery.actorId, generation)) return;
      if (isDeterministicCreateRejection(error)) {
        const rejectedRecovery = { ...recovery, rejectionStatus: error.status };
        if (!persistTopicCreateRejection(rejectedRecovery)) setStorageUnavailable(true);
        updatePending(recovery.actorId, generation, { recovery: rejectedRecovery, phase: 'checking' });
        updateMessage(recovery.actorId, generation, `${rejectionMessage(error.status)} 正在只读确认服务器是否已创建。`);
        await verifyRecovery(rejectedRecovery, generation);
        return;
      }
      // A failed or malformed response is ambiguous. Always read the receipt first;
      // only a confirmed not_found state enables an explicit same-key retry.
      await verifyRecovery(recovery, generation);
    } finally {
      operationsRef.current.delete(operationKey);
    }
  }, [complete, isCurrentActorScope, updateMessage, updatePending, verifyRecovery]);

  useEffect(() => {
    const scope = scopeRef.current;
    setStateActorId(scope.actorId);
    pendingRef.current = null;
    setPending(null);
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    setMessage('');
    setReadyActorId(null);
    if (scope.actorId === null) return;

    const result = readTopicCreateRecovery(scope.actorId);
    if (result.state === 'invalid') {
      setInvalidRecovery(true);
      setMessage('本机保存的选题创建恢复信息无法读取；为避免重复创建，当前提报已暂停。请联系管理员协助检查。');
      setReadyActorId(scope.actorId);
      return;
    }
    if (result.state === 'unavailable') {
      setStorageUnavailable(true);
      setMessage('当前浏览器无法读取选题创建恢复信息；为避免重复创建，当前提报已暂停。');
      setReadyActorId(scope.actorId);
      return;
    }
    setReadyActorId(scope.actorId);
    if (result.state === 'valid') {
      const entry = { recovery: result.recovery, phase: 'checking' as const };
      pendingRef.current = entry;
      setPending(entry);
      void verifyRecovery(result.recovery, scope.generation);
    }
  }, [actorId, verifyRecovery]);

  const create = useCallback(async (
    payload: TopicCreatePayload,
    draftId?: string | null,
    draftSnapshot?: TopicDraft,
  ) => {
    if (actorId === null || readyActorId !== actorId || invalidRecovery || storageUnavailable || pendingRef.current) return;
    const generation = scopeRef.current.generation;
    if (!isCurrentActorScope(actorId, generation)) return;
    let recovery: TopicCreateRecovery;
    try {
      recovery = {
        version: 1,
        actorId,
        requestId: createTopicCreateRequestId(),
        payload,
        ...(draftId !== undefined ? { draftId } : {}),
        ...(draftSnapshot ? { draftSnapshot: { ...draftSnapshot } } : {}),
      };
      persistTopicCreateRecovery(recovery);
    } catch (error) {
      updateMessage(actorId, generation, error instanceof Error ? error.message : '无法保存选题恢复信息；本次未提交。');
      return;
    }
    updatePending(actorId, generation, { recovery, phase: 'checking' });
    await postRecovery(recovery, generation, false);
  }, [actorId, invalidRecovery, isCurrentActorScope, postRecovery, readyActorId, storageUnavailable, updateMessage, updatePending]);

  const verify = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.phase === 'checking') return;
    const generation = scopeRef.current.generation;
    await verifyRecovery(current.recovery, generation);
  }, [actorId, verifyRecovery]);

  const retry = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.phase !== 'not_found') return;
    const generation = scopeRef.current.generation;
    if (!isCurrentActorScope(current.recovery.actorId, generation)) return;
    await postRecovery(current.recovery, generation, true);
  }, [actorId, isCurrentActorScope, postRecovery]);

  const retryCleanup = useCallback(() => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.phase !== 'cleanup_failed'
      || !current.confirmedTopicId) return;
    const generation = scopeRef.current.generation;
    complete(current.recovery, current.confirmedTopicId, generation, current.recovered ?? true);
  }, [actorId, complete]);

  const releaseRejected = useCallback(() => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.phase !== 'rejected' || !current.confirmedNotFound) return;
    const generation = scopeRef.current.generation;
    if (!isCurrentActorScope(current.recovery.actorId, generation)) return;
    const cleared = clearTopicCreateRecovery(current.recovery.actorId, current.recovery.requestId);
    if (!cleared) {
      updateMessage(current.recovery.actorId, generation, '服务器已确认本次未创建，但本机恢复记录未能清理；表单仍锁定。请重试解除操作。');
      return;
    }
    updatePending(current.recovery.actorId, generation, null);
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    updateMessage(current.recovery.actorId, generation, '已确认服务端未创建并解除本次恢复锁。当前表单内容已保留；修正内容或恢复权限后，可重新提报。');
  }, [actorId, isCurrentActorScope, updateMessage, updatePending]);

  const visiblePending = pending?.recovery.actorId === actorId ? pending : null;
  const ready = actorId !== null && readyActorId === actorId;
  const currentInvalidRecovery = stateActorId === actorId && invalidRecovery;
  const currentStorageUnavailable = stateActorId === actorId && storageUnavailable;
  const currentMessage = stateActorId === actorId
    ? message || (actorId === null ? '请先登录后再提报选题。' : !ready ? '正在读取本账号的选题创建恢复状态。' : '')
    : '';
  const locked = !ready || currentInvalidRecovery || currentStorageUnavailable || Boolean(visiblePending);

  return {
    pending: visiblePending,
    invalidRecovery: currentInvalidRecovery,
    storageUnavailable: currentStorageUnavailable,
    ready,
    locked,
    message: currentMessage,
    create,
    verify,
    retry,
    retryCleanup,
    releaseRejected,
  };
}

function isDeterministicCreateRejection(error: unknown): error is TopicApiError {
  return error instanceof TopicApiError && [400, 401, 403, 422].includes(error.status);
}

function rejectionMessage(status: number, confirmedNotFound = false) {
  const suffix = confirmedNotFound
    ? '服务端已确认本次未创建；确认后可解除恢复锁，再修正内容或恢复权限。'
    : '恢复记录已保留；请等待只读核实，不会重试原载荷。';
  if (status === 401 || status === 403) {
    return `服务器拒绝了这次提报（HTTP ${status}）。请重新登录或确认提报权限。${suffix}`;
  }
  return `服务器拒绝了这次提报（HTTP ${status}）。请修正提报内容后再重新开始。${suffix}`;
}

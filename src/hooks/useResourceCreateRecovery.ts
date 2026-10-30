import { useCallback, useEffect, useRef, useState } from 'react';
import { createResourceCenterResource, getResourceCreateRequestStatus, ResourceCenterApiError } from '../api/resourceCenter';
import { useAuthStore } from '../store';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import {
  clearResourceCreateRecovery,
  createResourceCreateRequestId,
  persistResourceCreateRecovery,
  persistResourceCreateRejection,
  readResourceCreateRecovery,
  type ResourceCreateRecovery,
  type ResourceCreateRecoveryPayload,
} from '../utils/resourceCreateRecovery';

export type ResourceCreateRecoveryPhase = 'checking' | 'uncertain' | 'not_found' | 'cleanup_failed' | 'rejected_cleanup_failed';
export type ResourceCreateRecoveryEntry = {
  recovery: ResourceCreateRecovery;
  phase: ResourceCreateRecoveryPhase;
  confirmedResourceId?: number;
};

type ResourceCreated = (resourceId: number, recovery: ResourceCreateRecovery) => void;
const validActorId = (value: number | null | undefined) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
const isDefiniteRejection = (error: unknown): error is ResourceCenterApiError => error instanceof ResourceCenterApiError
  && error.status >= 400
  && error.status < 500
  && error.status !== 408
  && error.status !== 425
  && error.status !== 429
  && (error.status !== 409 || error.code === 'RESOURCE_CREATE_REQUEST_CONFLICT');

export function useResourceCreateRecovery(open: boolean, actorIdValue: number | null | undefined, onCreated: ResourceCreated) {
  const actorId = validActorId(actorIdValue);
  const scopeRef = useRef({ actorId, generation: 0 });
  const mountedRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  if (scopeRef.current.actorId !== actorId) scopeRef.current = { actorId, generation: scopeRef.current.generation + 1 };
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const pendingRef = useRef<ResourceCreateRecoveryEntry | null>(null);
  const operationsRef = useRef(new Set<string>());
  const [pending, setPending] = useState<ResourceCreateRecoveryEntry | null>(null);
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
      && openRef.current
      && scopeRef.current.actorId === expectedActorId
      && scopeRef.current.generation === generation
      && Number(useAuthStore.getState().user?.id) === expectedActorId
  ), []);

  const updatePending = useCallback((expectedActorId: number, generation: number, next: ResourceCreateRecoveryEntry | null) => {
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

  const complete = useCallback((recovery: ResourceCreateRecovery, resourceId: number, generation: number) => {
    if (!isCurrentActorScope(recovery.actorId, generation)) return false;
    if (!clearResourceCreateRecovery(recovery.actorId, recovery.requestId)) {
      updatePending(recovery.actorId, generation, { recovery, phase: 'cleanup_failed', confirmedResourceId: resourceId });
      updateMessage(recovery.actorId, generation, '服务器已确认资料创建成功，但本机恢复记录未能清理。为避免重复创建，当前窗口保持锁定；请重试清理后继续。');
      return false;
    }
    updatePending(recovery.actorId, generation, null);
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    updateMessage(recovery.actorId, generation, '');
    onCreatedRef.current(resourceId, recovery);
    return true;
  }, [isCurrentActorScope, updateMessage, updatePending]);

  const verifyRecovery = useCallback(async (recovery: ResourceCreateRecovery, generation: number) => {
    const operationKey = `${recovery.actorId}:${generation}:${recovery.requestId}:status`;
    if (!isCurrentActorScope(recovery.actorId, generation) || operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    updatePending(recovery.actorId, generation, { recovery, phase: 'checking' });
    updateMessage(recovery.actorId, generation, '正在只读核实资料创建结果；核实期间不会重复提交。');
    try {
      const result = await getResourceCreateRequestStatus(recovery.requestId);
      if (!isCurrentActorScope(recovery.actorId, generation)) return;
      if (result.state === 'created') {
        complete(recovery, result.resourceId, generation);
      } else if (recovery.rejectionStatus !== undefined) {
        updatePending(recovery.actorId, generation, { recovery, phase: 'rejected_cleanup_failed' });
        updateMessage(recovery.actorId, generation, definiteRejectionMessage(recovery.rejectionStatus));
      } else {
        updatePending(recovery.actorId, generation, { recovery, phase: 'not_found' });
        updateMessage(recovery.actorId, generation, '服务器尚未找到这次资料创建请求。原表单和请求编号已保留；确认后可用同一编号和原内容重试。');
      }
    } catch (error) {
      if (!isCurrentActorScope(recovery.actorId, generation)) return;
      updatePending(recovery.actorId, generation, { recovery, phase: 'uncertain' });
      const message = getUserFacingErrorMessage(error, '暂时无法核实资料创建结果');
      updateMessage(recovery.actorId, generation, `${message}。恢复信息已保留；请只读重新核实，不要重新创建。`);
    } finally {
      operationsRef.current.delete(operationKey);
    }
  }, [complete, isCurrentActorScope, updateMessage, updatePending]);

  const postRecovery = useCallback(async (recovery: ResourceCreateRecovery, generation: number) => {
    const operationKey = `${recovery.actorId}:${generation}:${recovery.requestId}:post`;
    if (!isCurrentActorScope(recovery.actorId, generation) || operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    updatePending(recovery.actorId, generation, { recovery, phase: 'checking' });
    updateMessage(recovery.actorId, generation, '正在创建资料；本次请求已安全保存。');
    try {
      const result = await createResourceCenterResource({ ...recovery.payload, client_request_id: recovery.requestId });
      if (!Number.isSafeInteger(result.id) || result.id <= 0) throw new Error('创建响应未包含有效的资料编号');
      complete(recovery, result.id, generation);
    } catch (error) {
      if (!isCurrentActorScope(recovery.actorId, generation)) return;
      if (isDefiniteRejection(error)) {
        const rejectedRecovery = {
          ...recovery,
          rejectionStatus: error.status,
          ...(error.code ? { rejectionCode: error.code } : {}),
        };
        if (clearResourceCreateRecovery(recovery.actorId, recovery.requestId)) {
          updatePending(recovery.actorId, generation, null);
          setInvalidRecovery(false);
          setStorageUnavailable(false);
          updateMessage(recovery.actorId, generation, definiteRejectionMessage(error.status));
        } else {
          if (!persistResourceCreateRejection(rejectedRecovery)) setStorageUnavailable(true);
          updatePending(recovery.actorId, generation, { recovery: rejectedRecovery, phase: 'rejected_cleanup_failed' });
          updateMessage(recovery.actorId, generation, `${definiteRejectionMessage(error.status)}本机恢复记录暂未清理；请确认服务器已拒绝本次请求后重试清理。`);
        }
        return;
      }
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
    if (!open || scope.actorId === null) return;

    const result = readResourceCreateRecovery(scope.actorId);
    if (result.state === 'invalid') {
      setInvalidRecovery(true);
      setMessage('本机保存的资料创建恢复信息无法读取；为避免重复创建，当前操作已暂停。');
      setReadyActorId(scope.actorId);
      return;
    }
    if (result.state === 'unavailable') {
      setStorageUnavailable(true);
      setMessage('当前浏览器无法读取资料创建恢复信息；为避免重复创建，当前操作已暂停。');
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
  }, [actorId, open, verifyRecovery]);

  const create = useCallback(async (payload: ResourceCreateRecoveryPayload) => {
    if (!open || actorId === null || readyActorId !== actorId || invalidRecovery || storageUnavailable || pendingRef.current) return;
    const generation = scopeRef.current.generation;
    if (!isCurrentActorScope(actorId, generation)) return;
    let recovery: ResourceCreateRecovery;
    try {
      recovery = { version: 1, actorId, requestId: createResourceCreateRequestId(), payload };
      persistResourceCreateRecovery(recovery);
    } catch (error) {
      updateMessage(actorId, generation, getUserFacingErrorMessage(error, '无法保存资料创建恢复信息；本次未提交。'));
      return;
    }
    updatePending(actorId, generation, { recovery, phase: 'checking' });
    await postRecovery(recovery, generation);
  }, [actorId, invalidRecovery, isCurrentActorScope, open, postRecovery, readyActorId, storageUnavailable, updateMessage, updatePending]);

  const verify = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.phase === 'checking') return;
    await verifyRecovery(current.recovery, scopeRef.current.generation);
  }, [actorId, verifyRecovery]);

  const retry = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.phase !== 'not_found') return;
    const generation = scopeRef.current.generation;
    if (!isCurrentActorScope(current.recovery.actorId, generation)) return;
    await postRecovery(current.recovery, generation);
  }, [actorId, isCurrentActorScope, postRecovery]);

  const retryCleanup = useCallback(() => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId) return;
    const generation = scopeRef.current.generation;
    if (current.phase === 'cleanup_failed' && current.confirmedResourceId) {
      complete(current.recovery, current.confirmedResourceId, generation);
      return;
    }
    if (current.phase === 'rejected_cleanup_failed' && clearResourceCreateRecovery(current.recovery.actorId, current.recovery.requestId)) {
      updatePending(current.recovery.actorId, generation, null);
      setStorageUnavailable(false);
      updateMessage(current.recovery.actorId, generation, definiteRejectionMessage(current.recovery.rejectionStatus || 400));
    }
  }, [actorId, complete, updateMessage, updatePending]);

  const visiblePending = pending?.recovery.actorId === actorId ? pending : null;
  const ready = actorId !== null && readyActorId === actorId;
  const currentInvalidRecovery = stateActorId === actorId && invalidRecovery;
  const currentStorageUnavailable = stateActorId === actorId && storageUnavailable;
  const currentMessage = stateActorId === actorId
    ? message || (actorId === null ? '请先登录后再新增资料。' : !ready ? '正在读取本账号的资料创建恢复状态。' : '')
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
  };
}

function definiteRejectionMessage(status: number) {
  if (status === 401 || status === 403) return `服务器拒绝了本次资料创建（HTTP ${status}）。请重新登录或确认资料创建权限；服务器已确认本次未创建，可修正后重新开始。`;
  return `服务器拒绝了本次资料创建（HTTP ${status}）。服务器已确认本次未创建，可修改资料后重新开始。`;
}

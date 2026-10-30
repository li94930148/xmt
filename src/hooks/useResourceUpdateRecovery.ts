import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResourceCenterApiError,
  getResourceUpdateRequestStatus,
  updateResourceCenterResource,
  type LibraryType,
  type UpdateResourceCenterResourceInput,
} from '../api/resourceCenter';
import { useAuthStore } from '../store';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import {
  clearResourceUpdateRecovery,
  createResourceUpdateRequestId,
  persistResourceUpdateRecovery,
  persistResourceUpdateRejection,
  readResourceUpdateRecovery,
  type ResourceUpdateRecovery,
} from '../utils/resourceUpdateRecovery';

export type ResourceUpdateRecoveryPhase = 'checking' | 'uncertain' | 'not_found' | 'cleanup_failed' | 'rejected_cleanup_failed';
export type ResourceUpdateRecoveryEntry = {
  recovery: ResourceUpdateRecovery;
  phase: ResourceUpdateRecoveryPhase;
  confirmedUpdated?: boolean;
  confirmedNotFound?: boolean;
};

type ConfirmedUpdate = (input: UpdateResourceCenterResourceInput) => void;
type RecoveredUpdate = () => void;
const validActorId = (value: number | null | undefined) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
const isDefiniteRejection = (error: unknown): error is ResourceCenterApiError => error instanceof ResourceCenterApiError
  && [400, 401, 403, 422].includes(error.status);

export function useResourceUpdateRecovery(
  open: boolean,
  actorIdValue: number | null | undefined,
  resourceIdValue: number,
  libraryType: LibraryType,
  onUpdated: ConfirmedUpdate,
  onRecovered: RecoveredUpdate,
) {
  const actorId = validActorId(actorIdValue);
  const resourceId = Number.isSafeInteger(resourceIdValue) && resourceIdValue > 0 ? resourceIdValue : null;
  const scopeRef = useRef({ actorId, resourceId, generation: 0 });
  const mountedRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  if (scopeRef.current.actorId !== actorId || scopeRef.current.resourceId !== resourceId) {
    scopeRef.current = { actorId, resourceId, generation: scopeRef.current.generation + 1 };
  }
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  const pendingRef = useRef<ResourceUpdateRecoveryEntry | null>(null);
  const operationsRef = useRef(new Set<string>());
  const [pending, setPending] = useState<ResourceUpdateRecoveryEntry | null>(null);
  const [invalidRecovery, setInvalidRecovery] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [stateActorId, setStateActorId] = useState<number | null>(actorId);
  const [readyActorId, setReadyActorId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isCurrentScope = useCallback((expectedActorId: number, expectedResourceId: number, generation: number) => (
    mountedRef.current
      && openRef.current
      && scopeRef.current.actorId === expectedActorId
      && scopeRef.current.resourceId === expectedResourceId
      && scopeRef.current.generation === generation
      && Number(useAuthStore.getState().user?.id) === expectedActorId
  ), []);

  const updatePending = useCallback((expectedActorId: number, expectedResourceId: number, generation: number, next: ResourceUpdateRecoveryEntry | null) => {
    if (!isCurrentScope(expectedActorId, expectedResourceId, generation)) return false;
    pendingRef.current = next;
    setPending(next);
    return true;
  }, [isCurrentScope]);

  const updateMessage = useCallback((expectedActorId: number, expectedResourceId: number, generation: number, next: string) => {
    if (!isCurrentScope(expectedActorId, expectedResourceId, generation)) return false;
    setMessage(next);
    return true;
  }, [isCurrentScope]);

  const complete = useCallback((recovery: ResourceUpdateRecovery, generation: number, input?: UpdateResourceCenterResourceInput) => {
    if (!isCurrentScope(recovery.actorId, recovery.resourceId, generation)) return false;
    if (!clearResourceUpdateRecovery(recovery.actorId, recovery.requestId)) {
      updatePending(recovery.actorId, recovery.resourceId, generation, { recovery, phase: 'cleanup_failed', confirmedUpdated: true });
      updateMessage(recovery.actorId, recovery.resourceId, generation, '服务器已确认资料更新成功，但本机恢复记录未能清理。当前保存功能保持锁定；请重试清理后刷新详情。');
      return false;
    }
    updatePending(recovery.actorId, recovery.resourceId, generation, null);
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    updateMessage(recovery.actorId, recovery.resourceId, generation, '');
    if (input) onUpdatedRef.current(input);
    else onRecoveredRef.current();
    return true;
  }, [isCurrentScope, updateMessage, updatePending]);

  const verifyRecovery = useCallback(async (recovery: ResourceUpdateRecovery, generation: number) => {
    const operationKey = `${recovery.actorId}:${recovery.resourceId}:${generation}:${recovery.requestId}:status`;
    if (!isCurrentScope(recovery.actorId, recovery.resourceId, generation) || operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    updatePending(recovery.actorId, recovery.resourceId, generation, { recovery, phase: 'checking' });
    updateMessage(recovery.actorId, recovery.resourceId, generation, '正在只读核实资料保存结果；核实期间不会再次提交。');
    try {
      const result = await getResourceUpdateRequestStatus(recovery.resourceId, recovery.requestId);
      if (!isCurrentScope(recovery.actorId, recovery.resourceId, generation)) return;
      if (result.state === 'updated') {
        complete(recovery, generation);
      } else if (recovery.rejectionStatus !== undefined) {
        updatePending(recovery.actorId, recovery.resourceId, generation, { recovery, phase: 'rejected_cleanup_failed' });
        updateMessage(recovery.actorId, recovery.resourceId, generation, definiteRejectionMessage(recovery.rejectionStatus));
      } else {
        updatePending(recovery.actorId, recovery.resourceId, generation, { recovery, phase: 'not_found', confirmedNotFound: true });
        updateMessage(recovery.actorId, recovery.resourceId, generation, '服务器暂未找到这次资料更新回执。原内容和请求编号已保留；确认后可用同一编号和原内容安全重试，服务端会去重并保持单条审计记录。');
      }
    } catch (error) {
      if (!isCurrentScope(recovery.actorId, recovery.resourceId, generation)) return;
      updatePending(recovery.actorId, recovery.resourceId, generation, { recovery, phase: 'uncertain' });
      const message = getUserFacingErrorMessage(error, '暂时无法核实资料保存结果');
      updateMessage(recovery.actorId, recovery.resourceId, generation, `${message}。恢复编号已保留；请只读重新核实，不要重复保存。`);
    } finally {
      operationsRef.current.delete(operationKey);
    }
  }, [complete, isCurrentScope, updateMessage, updatePending]);

  const rejectRecovery = useCallback((recovery: ResourceUpdateRecovery, generation: number, error: ResourceCenterApiError) => {
    if (!isCurrentScope(recovery.actorId, recovery.resourceId, generation)) return;
    const rejectedRecovery = {
      ...recovery,
      rejectionStatus: error.status,
      ...(error.code && /^[A-Z0-9_]{1,80}$/.test(error.code) ? { rejectionCode: error.code } : {}),
    };
    if (clearResourceUpdateRecovery(recovery.actorId, recovery.requestId)) {
      updatePending(recovery.actorId, recovery.resourceId, generation, null);
      setInvalidRecovery(false);
      setStorageUnavailable(false);
      updateMessage(recovery.actorId, recovery.resourceId, generation, definiteRejectionMessage(error.status));
      return;
    }
    const persisted = persistResourceUpdateRejection(rejectedRecovery);
    setStorageUnavailable(!persisted);
    updatePending(recovery.actorId, recovery.resourceId, generation, { recovery: rejectedRecovery, phase: 'rejected_cleanup_failed' });
    updateMessage(recovery.actorId, recovery.resourceId, generation, `${definiteRejectionMessage(error.status)}本机恢复编号暂未清理；请重试清理后再修改。`);
  }, [isCurrentScope, updateMessage, updatePending]);

  const putRecovery = useCallback(async (recovery: ResourceUpdateRecovery, generation: number) => {
    const operationKey = `${recovery.actorId}:${recovery.resourceId}:${generation}:${recovery.requestId}:put`;
    if (!isCurrentScope(recovery.actorId, recovery.resourceId, generation) || operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    updatePending(recovery.actorId, recovery.resourceId, generation, { recovery, phase: 'checking' });
    updateMessage(recovery.actorId, recovery.resourceId, generation, '正在保存资料；本次请求编号和原内容已安全保存。');
    try {
      await updateResourceCenterResource(recovery.resourceId, recovery.payload, recovery.requestId);
      complete(recovery, generation, recovery.payload);
    } catch (error) {
      if (!isCurrentScope(recovery.actorId, recovery.resourceId, generation)) return;
      if (isDefiniteRejection(error)) rejectRecovery(recovery, generation, error);
      else await verifyRecovery(recovery, generation);
    } finally {
      operationsRef.current.delete(operationKey);
    }
  }, [complete, isCurrentScope, rejectRecovery, updateMessage, updatePending, verifyRecovery]);

  const save = useCallback(async (input: UpdateResourceCenterResourceInput) => {
    if (!open || actorId === null || resourceId === null || readyActorId !== actorId || invalidRecovery || storageUnavailable || pendingRef.current) return;
    const generation = scopeRef.current.generation;
    if (!isCurrentScope(actorId, resourceId, generation)) return;
    let recovery: ResourceUpdateRecovery;
    try {
      recovery = { version: 1, actorId, resourceId, libraryType, requestId: createResourceUpdateRequestId(), payload: input };
      persistResourceUpdateRecovery(recovery);
    } catch (error) {
      updateMessage(actorId, resourceId, generation, getUserFacingErrorMessage(error, '无法保存资料更新恢复信息；本次未提交修改。'));
      return;
    }
    updatePending(actorId, resourceId, generation, { recovery, phase: 'checking' });
    await putRecovery(recovery, generation);
  }, [actorId, invalidRecovery, isCurrentScope, libraryType, open, putRecovery, readyActorId, resourceId, storageUnavailable, updateMessage, updatePending]);

  useEffect(() => {
    const scope = scopeRef.current;
    setStateActorId(scope.actorId);
    pendingRef.current = null;
    setPending(null);
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    setMessage('');
    setReadyActorId(null);
    if (!open || scope.actorId === null || scope.resourceId === null) return;
    const result = readResourceUpdateRecovery(scope.actorId);
    if (result.state === 'invalid') {
      setInvalidRecovery(true);
      setMessage('本机保存的资料更新恢复编号无法读取；为避免重复保存，当前编辑已暂停。');
      setReadyActorId(scope.actorId);
      return;
    }
    if (result.state === 'unavailable') {
      setStorageUnavailable(true);
      setMessage('当前浏览器无法读取资料更新恢复编号；为避免重复保存，当前编辑已暂停。');
      setReadyActorId(scope.actorId);
      return;
    }
    setReadyActorId(scope.actorId);
    if (result.state === 'valid') {
      if (result.recovery.resourceId !== scope.resourceId) {
        setInvalidRecovery(true);
        setMessage(`存在资料「${result.recovery.resourceId}」的更新请求仍待核实；请先回到该资料完成核实。`);
        return;
      }
      const entry = { recovery: result.recovery, phase: 'checking' as const };
      pendingRef.current = entry;
      setPending(entry);
      void verifyRecovery(result.recovery, scope.generation);
    }
  }, [actorId, open, resourceId, verifyRecovery]);

  const verify = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.recovery.resourceId !== resourceId || current.phase === 'checking') return;
    await verifyRecovery(current.recovery, scopeRef.current.generation);
  }, [actorId, resourceId, verifyRecovery]);

  const retry = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || current.recovery.actorId !== actorId || current.recovery.resourceId !== resourceId || current.phase !== 'not_found') return;
    const generation = scopeRef.current.generation;
    if (!isCurrentScope(current.recovery.actorId, current.recovery.resourceId, generation)) return;
    await putRecovery(current.recovery, generation);
  }, [actorId, isCurrentScope, putRecovery, resourceId]);

  const retryCleanup = useCallback(() => {
    const current = pendingRef.current;
    if (!current || !['cleanup_failed', 'rejected_cleanup_failed'].includes(current.phase) || current.recovery.actorId !== actorId || current.recovery.resourceId !== resourceId) return;
    const generation = scopeRef.current.generation;
    if (!isCurrentScope(current.recovery.actorId, current.recovery.resourceId, generation)) return;
    if (!clearResourceUpdateRecovery(current.recovery.actorId, current.recovery.requestId)) return;
    updatePending(current.recovery.actorId, current.recovery.resourceId, generation, null);
    setStorageUnavailable(false);
    if (current.confirmedUpdated) {
      updateMessage(current.recovery.actorId, current.recovery.resourceId, generation, '恢复记录已清理；正在重新读取已保存资料。');
      onRecoveredRef.current();
    } else if (current.phase === 'rejected_cleanup_failed') {
      setStorageUnavailable(false);
      updateMessage(current.recovery.actorId, current.recovery.resourceId, generation, definiteRejectionMessage(current.recovery.rejectionStatus || 400));
    } else {
      updateMessage(current.recovery.actorId, current.recovery.resourceId, generation, '恢复编号已清理；请核对当前资料后继续编辑。');
    }
  }, [actorId, isCurrentScope, resourceId, updateMessage, updatePending]);

  const visiblePending = pending?.recovery.actorId === actorId && pending.recovery.resourceId === resourceId ? pending : null;
  const ready = actorId !== null && resourceId !== null && readyActorId === actorId;
  const currentInvalidRecovery = stateActorId === actorId && invalidRecovery;
  const currentStorageUnavailable = stateActorId === actorId && storageUnavailable;
  const currentMessage = stateActorId === actorId
    ? message || (actorId === null ? '请先登录后再编辑资料。' : !ready ? '正在读取资料更新恢复状态。' : '')
    : '';
  const locked = !ready || currentInvalidRecovery || currentStorageUnavailable || Boolean(visiblePending);

  return { pending: visiblePending, invalidRecovery: currentInvalidRecovery, storageUnavailable: currentStorageUnavailable, ready, locked, message: currentMessage, save, verify, retry, retryCleanup };
}

function definiteRejectionMessage(status: number) {
  if (status === 401 || status === 403) return `服务器拒绝了本次资料更新（HTTP ${status}）。服务器已确认本次未更新；请重新登录或确认编辑权限后修改并重新保存。`;
  return `服务器拒绝了本次资料更新（HTTP ${status}）。服务器已确认本次未更新；请修正内容后重新保存。`;
}

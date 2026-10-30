import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createResourceCategory,
  deleteResourceCategory,
  getResourceCategories,
  getResourceCategoryMutationRequestStatus,
  ResourceCenterApiError,
  updateResourceCategory,
  type LibraryType,
  type ResourceCategory,
} from '../api/resourceCenter';
import { useAuthStore } from '../store';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import {
  clearResourceCategoryMutationRecovery,
  createResourceCategoryMutationFingerprint,
  createResourceCategoryMutationRequestId,
  persistResourceCategoryMutationRecovery,
  persistResourceCategoryMutationRejection,
  readResourceCategoryMutationRecovery,
  type ResourceCategoryMutationPayload,
  type ResourceCategoryMutationRecovery,
} from '../utils/resourceCategoryMutationRecovery';
import type { ResourceCategoryMutationOperation } from '../../shared/resource-category-mutation';

export type ResourceCategoryMutationPhase =
  | 'submitting'
  | 'checking'
  | 'uncertain'
  | 'not_found'
  | 'confirmed_read_failed'
  | 'cleanup_failed'
  | 'rejected_cleanup_failed'
  | 'wrong_library';

type PendingMutation = {
  recovery: ResourceCategoryMutationRecovery;
  phase: ResourceCategoryMutationPhase;
  confirmedState?: 'created' | 'updated' | 'deleted';
};

const validActorId = (value: number | null | undefined) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
const definiteRejection = (error: unknown): error is ResourceCenterApiError => error instanceof ResourceCenterApiError
  && [400, 401, 403, 404, 409, 422].includes(error.status)
  && !['RESOURCE_CATEGORY_MUTATION_REQUEST_CONFLICT', 'RESOURCE_CATEGORY_MUTATION_FINGERPRINT_CONFLICT'].includes(error.code || '');
const operationState = (operation: ResourceCategoryMutationOperation) => operation === 'create' ? 'created' : operation === 'update' ? 'updated' : 'deleted';

export function useResourceCategoryMutationRecovery(
  open: boolean,
  actorIdValue: number | null | undefined,
  libraryType: LibraryType,
  onCategoriesChange: (categories: ResourceCategory[]) => void,
  onCompleted: (operation: ResourceCategoryMutationOperation) => void,
) {
  const actorId = validActorId(actorIdValue);
  const scopeRef = useRef({ actorId, libraryType, generation: 0 });
  if (scopeRef.current.actorId !== actorId || scopeRef.current.libraryType !== libraryType) {
    scopeRef.current = { actorId, libraryType, generation: scopeRef.current.generation + 1 };
  }
  const openRef = useRef(open);
  openRef.current = open;
  const mountedRef = useRef(false);
  const operationsRef = useRef(new Set<string>());
  const pendingRef = useRef<PendingMutation | null>(null);
  const onCategoriesChangeRef = useRef(onCategoriesChange);
  onCategoriesChangeRef.current = onCategoriesChange;
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const [pending, setPending] = useState<PendingMutation | null>(null);
  const [invalidRecovery, setInvalidRecovery] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [readyActorId, setReadyActorId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isCurrent = useCallback((expectedActorId: number, generation: number) => (
    mountedRef.current
      && openRef.current
      && scopeRef.current.actorId === expectedActorId
      && scopeRef.current.generation === generation
      && Number(useAuthStore.getState().user?.id) === expectedActorId
  ), []);

  const setPendingFor = useCallback((expectedActorId: number, generation: number, next: PendingMutation | null) => {
    if (!isCurrent(expectedActorId, generation)) return false;
    pendingRef.current = next;
    setPending(next);
    return true;
  }, [isCurrent]);

  const refreshAndComplete = useCallback(async (
    recovery: ResourceCategoryMutationRecovery,
    generation: number,
    confirmedState: 'created' | 'updated' | 'deleted',
  ) => {
    if (!isCurrent(recovery.actorId, generation) || recovery.libraryType !== scopeRef.current.libraryType) return;
    try {
      const response = await getResourceCategories(recovery.libraryType);
      if (!isCurrent(recovery.actorId, generation)) return;
      onCategoriesChangeRef.current(response.data);
      if (!clearResourceCategoryMutationRecovery(recovery.actorId, recovery.requestId)) {
        setPendingFor(recovery.actorId, generation, { recovery, phase: 'cleanup_failed', confirmedState });
        setMessage('服务器已确认分类操作成功，列表也已更新，但本机恢复记录未能清理。请重试清理后再继续操作。');
        return;
      }
      setPendingFor(recovery.actorId, generation, null);
      setInvalidRecovery(false);
      setStorageUnavailable(false);
      setMessage(confirmedState === 'created' ? '服务端已确认分类创建成功。' : confirmedState === 'updated' ? '服务端已确认分类更新成功。' : '服务端已确认分类删除成功。');
      setError('');
      onCompletedRef.current(recovery.operation);
    } catch (cause) {
      if (!isCurrent(recovery.actorId, generation)) return;
      setPendingFor(recovery.actorId, generation, { recovery, phase: 'confirmed_read_failed', confirmedState });
      const detail = getUserFacingErrorMessage(cause, '系统暂时无法读取分类列表。');
      setMessage(`服务端已确认分类操作成功，但列表刷新失败；请只重试读取，不要重复写入。${detail}`);
    }
  }, [isCurrent, setPendingFor]);

  const verifyRecovery = useCallback(async (recovery: ResourceCategoryMutationRecovery, generation: number) => {
    if (!isCurrent(recovery.actorId, generation)) return;
    if (recovery.libraryType !== scopeRef.current.libraryType) {
      setPendingFor(recovery.actorId, generation, { recovery, phase: 'wrong_library' });
      setMessage(`这次分类操作属于${recovery.libraryType}资料库；请返回对应资料库后继续核实。`);
      return;
    }
    const operationKey = `${recovery.actorId}:${generation}:${recovery.requestId}:status`;
    if (operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    setPendingFor(recovery.actorId, generation, { recovery, phase: 'checking' });
    setMessage('正在只读核实分类操作结果；核实期间不会再次提交。');
    try {
      const result = await getResourceCategoryMutationRequestStatus(recovery.requestId, recovery.fingerprint);
      if (!isCurrent(recovery.actorId, generation)) return;
      const expectedState = operationState(recovery.operation);
      if (result.state === expectedState && ('categoryId' in result)) {
        await refreshAndComplete(recovery, generation, result.state);
      } else if (result.state === 'not_found' && recovery.rejectionStatus !== undefined) {
        setPendingFor(recovery.actorId, generation, { recovery, phase: 'rejected_cleanup_failed' });
        setMessage(`服务器已明确拒绝这次分类操作（HTTP ${recovery.rejectionStatus}），恢复记录暂未清理；请重试清理，不要重发。`);
      } else if (result.state === 'not_found') {
        setPendingFor(recovery.actorId, generation, { recovery, phase: 'not_found' });
        setMessage('服务器尚未找到这次分类操作回执。原内容和请求编号已保留；确认后可用同一编号和原内容安全重试。');
      } else {
        setPendingFor(recovery.actorId, generation, { recovery, phase: 'uncertain' });
        setMessage('服务器返回的分类操作状态与当前请求不一致；操作保持锁定，请只读重新核实。');
      }
    } catch (cause) {
      if (!isCurrent(recovery.actorId, generation)) return;
      setPendingFor(recovery.actorId, generation, { recovery, phase: 'uncertain' });
      const detail = getUserFacingErrorMessage(cause, '系统暂时无法读取操作回执。');
      setMessage(`暂时无法核实分类操作结果；恢复编号已保留，请只读重新核实，不要重复操作。${detail}`);
    } finally {
      operationsRef.current.delete(operationKey);
    }
  }, [isCurrent, refreshAndComplete, setPendingFor]);

  const executeRecovery = useCallback(async (recovery: ResourceCategoryMutationRecovery, generation: number) => {
    if (!isCurrent(recovery.actorId, generation) || recovery.libraryType !== scopeRef.current.libraryType) return;
    const operationKey = `${recovery.actorId}:${generation}:${recovery.requestId}:write`;
    if (operationsRef.current.has(operationKey)) return;
    operationsRef.current.add(operationKey);
    setPendingFor(recovery.actorId, generation, { recovery, phase: 'submitting' });
    setMessage('正在提交分类操作；本次编号和原内容已安全保存。');
    setError('');
    try {
      if (recovery.operation === 'create') {
        const payload = recovery.payload as { name: string; parent_id: number | null };
        await createResourceCategory({ library_type: recovery.libraryType, ...payload, client_request_id: recovery.requestId });
      } else if (recovery.operation === 'update') {
        const payload = recovery.payload as { name: string; parent_id: number | null };
        await updateResourceCategory(Number(recovery.categoryId), { ...payload, library_type: recovery.libraryType, client_request_id: recovery.requestId });
      } else {
        await deleteResourceCategory(Number(recovery.categoryId), { library_type: recovery.libraryType, client_request_id: recovery.requestId });
      }
      if (!isCurrent(recovery.actorId, generation)) return;
      await refreshAndComplete(recovery, generation, operationState(recovery.operation));
    } catch (cause) {
      if (!isCurrent(recovery.actorId, generation)) return;
      if (definiteRejection(cause)) {
        const rejectedRecovery = { ...recovery, rejectionStatus: cause.status };
        const rejectionPersisted = persistResourceCategoryMutationRejection(rejectedRecovery);
        if (clearResourceCategoryMutationRecovery(recovery.actorId, recovery.requestId)) {
          setPendingFor(recovery.actorId, generation, null);
          setError(getUserFacingErrorMessage(cause, '服务器已拒绝分类操作，请检查权限、内容或当前分类状态。'));
          setMessage('');
        } else {
          setPendingFor(recovery.actorId, generation, { recovery: rejectedRecovery, phase: 'rejected_cleanup_failed' });
          const persistenceDetail = rejectionPersisted ? '' : '本机暂未能保存拒绝状态。';
          const detail = getUserFacingErrorMessage(cause, '请检查权限、分类内容或当前状态。');
          setMessage(`服务器已明确拒绝这次分类操作；${persistenceDetail}恢复记录暂未清理。${detail}`);
        }
      } else {
        await verifyRecovery(recovery, generation);
      }
    } finally {
      operationsRef.current.delete(operationKey);
    }
  }, [isCurrent, refreshAndComplete, setPendingFor, verifyRecovery]);

  useEffect(() => {
    if (!open || actorId === null) return;
    const generation = scopeRef.current.generation;
    setPending(null);
    pendingRef.current = null;
    setMessage('');
    setError('');
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    setReadyActorId(null);
    const result = readResourceCategoryMutationRecovery(actorId);
    if (result.state === 'invalid') {
      setInvalidRecovery(true);
      setMessage('本机保存的分类操作恢复编号无法读取；为避免重复操作，当前管理功能已暂停。');
      setReadyActorId(actorId);
      return;
    }
    if (result.state === 'unavailable') {
      setStorageUnavailable(true);
      setMessage('当前浏览器无法读取分类操作恢复编号；为避免重复操作，当前管理功能已暂停。');
      setReadyActorId(actorId);
      return;
    }
    setReadyActorId(actorId);
    if (result.state === 'valid') {
      const entry = { recovery: result.recovery, phase: 'checking' as const };
      pendingRef.current = entry;
      setPending(entry);
      void verifyRecovery(result.recovery, generation);
    }
  }, [actorId, open, libraryType, verifyRecovery]);

  const mutate = useCallback(async (
    operation: ResourceCategoryMutationOperation,
    categoryId: number | null,
    payload: ResourceCategoryMutationPayload,
  ) => {
    if (!open || actorId === null || readyActorId !== actorId || invalidRecovery || storageUnavailable || pendingRef.current) return false;
    const generation = scopeRef.current.generation;
    if (!isCurrent(actorId, generation)) return false;
    try {
      const requestId = createResourceCategoryMutationRequestId();
      const fingerprint = await createResourceCategoryMutationFingerprint(operation, libraryType, categoryId, payload);
      if (!isCurrent(actorId, generation)) return false;
      const recovery: ResourceCategoryMutationRecovery = {
        version: 1,
        actorId,
        libraryType,
        operation,
        categoryId,
        requestId,
        fingerprint,
        payload,
      };
      persistResourceCategoryMutationRecovery(recovery);
      setPendingFor(actorId, generation, { recovery, phase: 'submitting' });
      await executeRecovery(recovery, generation);
      return true;
    } catch (cause) {
      if (isCurrent(actorId, generation)) {
        setError(getUserFacingErrorMessage(cause, '无法安全准备分类操作；本次未提交修改。'));
      }
      return false;
    }
  }, [actorId, executeRecovery, invalidRecovery, isCurrent, libraryType, open, readyActorId, setPendingFor, storageUnavailable]);

  const retry = useCallback(() => {
    const entry = pendingRef.current;
    if (!entry || entry.phase !== 'not_found') return;
    void executeRecovery(entry.recovery, scopeRef.current.generation);
  }, [executeRecovery]);

  const verify = useCallback(() => {
    const entry = pendingRef.current;
    if (!entry || entry.phase === 'wrong_library') return;
    void verifyRecovery(entry.recovery, scopeRef.current.generation);
  }, [verifyRecovery]);

  const retryRead = useCallback(async () => {
    const entry = pendingRef.current;
    if (!entry || (entry.phase !== 'confirmed_read_failed' && entry.phase !== 'cleanup_failed') || !entry.confirmedState) return;
    await refreshAndComplete(entry.recovery, scopeRef.current.generation, entry.confirmedState);
  }, [refreshAndComplete]);

  const retryCleanup = useCallback(() => {
    const entry = pendingRef.current;
    if (!entry || (entry.phase !== 'cleanup_failed' && entry.phase !== 'rejected_cleanup_failed')) return;
    if (!clearResourceCategoryMutationRecovery(entry.recovery.actorId, entry.recovery.requestId)) return;
    setPendingFor(entry.recovery.actorId, scopeRef.current.generation, null);
    setInvalidRecovery(false);
    setStorageUnavailable(false);
    setMessage('恢复记录已清理，可以继续管理分类。');
    if (entry.confirmedState) onCompletedRef.current(entry.recovery.operation);
  }, [setPendingFor]);

  return {
    pending,
    message,
    error,
    ready: actorId !== null && readyActorId === actorId,
    locked: pending !== null || invalidRecovery || storageUnavailable,
    verify,
    retry,
    retryRead,
    retryCleanup,
    mutate,
    clearError: () => setError(''),
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, MessageSquare, Trash2 } from 'lucide-react';
import { deleteAnonymousFeedback, getAnonymousFeedback, getAnonymousFeedbackDeleteRequestStatus, getAnonymousFeedbackUpdateRequestStatus, updateAnonymousFeedback, AnonymousFeedbackApiError, type AnonymousFeedback, type AnonymousFeedbackStatus, type AnonymousFeedbackUpdatePayload } from '../api/anonymousFeedback';
import { fingerprintAnonymousFeedbackUpdateRequest, markAnonymousFeedbackUpdateRecoveryRejected, persistAnonymousFeedbackUpdateRecovery, readAnonymousFeedbackUpdateRecovery, removeAnonymousFeedbackUpdateRecovery, sameAnonymousFeedbackUpdateRecovery, type StoredAnonymousFeedbackUpdateRecovery } from '../api/anonymousFeedbackUpdateRecovery';
import { useAppStore, useAuthStore } from '../store';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { formatBeijingDate } from '../lib/utils';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell, ResponsiveTableShell, StatusPill } from '../components/studio';
import LoadingState from '../components/common/LoadingState';
import BaseModal from '../components/common/BaseModal';
import FormModal from '../components/common/FormModal';
import ConfirmModal from '../components/common/ConfirmModal';

const typeLabels = { feature: '功能建议', usage: '使用问题', process: '流程优化', team: '团队建议', other: '其他' } as const;
const statusLabels = { pending: '待处理', processing: '处理中', completed: '已完成' } as const;
const statusTones = { pending: 'amber', processing: 'cyan', completed: 'success' } as const;
const feedbackActionName = (action: string, item: AnonymousFeedback) => `${action}：${item.content.replace(/\s+/g, ' ').trim().slice(0, 48)}`;
const DELETE_RECOVERY_KEY_PREFIX = 'xmt:anonymous-feedback-delete-pending:actor:';
const DELETE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredAnonymousFeedbackDeleteRecovery {
  actorId: number;
  requestId: string;
  targetId: number;
}

type AnonymousFeedbackDeleteRecoveryState = 'checking' | 'submitting' | 'not_found' | 'target_missing' | 'conflict' | 'unavailable' | 'storage_blocked' | null;
type AnonymousFeedbackUpdateRecoveryState = 'checking' | 'submitting' | 'not_found' | 'target_missing' | 'conflict' | 'unavailable' | 'processed_cleanup' | 'target_missing_cleanup' | 'rejected_cleanup' | 'rejected_mark_failed' | 'storage_blocked' | null;

function getUpdateRecoveryStorage() {
  return { session: window.sessionStorage, local: window.localStorage };
}

function readBrowserUpdateRecovery(actorId: number) {
  try {
    const storage = getUpdateRecoveryStorage();
    return readAnonymousFeedbackUpdateRecovery(actorId, storage.session, storage.local);
  } catch {
    return { kind: 'blocked' as const, recovery: null, reason: 'unavailable' as const };
  }
}

function intendedUpdateMatches(item: AnonymousFeedback, payload: AnonymousFeedbackUpdatePayload) {
  return (payload.status === undefined || item.status === payload.status)
    && (payload.is_public === undefined || Boolean(Number(item.is_public)) === payload.is_public)
    && (payload.reply_content === undefined || (item.reply_content || '') === payload.reply_content);
}

function anonymousFeedbackDeleteRecoveryKey(actorId: number) {
  return `${DELETE_RECOVERY_KEY_PREFIX}${actorId}`;
}

function readAnonymousFeedbackDeleteRecovery(actorId: number):
  | { kind: 'ready'; recovery: StoredAnonymousFeedbackDeleteRecovery }
  | { kind: 'none' }
  | { kind: 'blocked' } {
  try {
    const raw = window.sessionStorage.getItem(anonymousFeedbackDeleteRecoveryKey(actorId));
    if (!raw) return { kind: 'none' };
    const value = JSON.parse(raw) as Partial<StoredAnonymousFeedbackDeleteRecovery>;
    if (value.actorId !== actorId || !Number.isSafeInteger(value.targetId) || Number(value.targetId) <= 0
      || typeof value.requestId !== 'string' || !DELETE_REQUEST_ID_PATTERN.test(value.requestId)) return { kind: 'blocked' };
    return { kind: 'ready', recovery: { actorId, requestId: value.requestId.toLowerCase(), targetId: Number(value.targetId) } };
  } catch {
    return { kind: 'blocked' };
  }
}

function persistAnonymousFeedbackDeleteRecovery(recovery: StoredAnonymousFeedbackDeleteRecovery) {
  try {
    const key = anonymousFeedbackDeleteRecoveryKey(recovery.actorId);
    const serialized = JSON.stringify(recovery);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function clearAnonymousFeedbackDeleteRecovery(recovery: StoredAnonymousFeedbackDeleteRecovery) {
  try {
    const result = readAnonymousFeedbackDeleteRecovery(recovery.actorId);
    if (result.kind === 'blocked') return false;
    if (result.kind === 'none') return true;
    if (result.recovery.requestId !== recovery.requestId || result.recovery.targetId !== recovery.targetId) return false;
    const key = anonymousFeedbackDeleteRecoveryKey(recovery.actorId);
    window.sessionStorage.removeItem(key);
    return window.sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

export default function AnonymousFeedbackAdmin() {
  const actorId = useAuthStore((state) => Number(state.user?.id) || 0);
  const [initialDeleteRecoveryRead] = useState(() => actorId > 0 ? readAnonymousFeedbackDeleteRecovery(actorId) : { kind: 'none' as const });
  const [items, setItems] = useState<AnonymousFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnonymousFeedback | null>(null);
  const [replying, setReplying] = useState<AnonymousFeedback | null>(null);
  const [deleting, setDeleting] = useState<AnonymousFeedback | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState('');
  const [refreshNotice, setRefreshNotice] = useState('');
  const [pendingDeleteRecovery, setPendingDeleteRecovery] = useState<StoredAnonymousFeedbackDeleteRecovery | null>(() => (
    initialDeleteRecoveryRead.kind === 'ready' ? initialDeleteRecoveryRead.recovery : null
  ));
  const [deleteRecoveryState, setDeleteRecoveryState] = useState<AnonymousFeedbackDeleteRecoveryState>(() => (
    initialDeleteRecoveryRead.kind === 'ready' ? 'checking' : initialDeleteRecoveryRead.kind === 'blocked' ? 'storage_blocked' : null
  ));
  const [deleteRecoveryError, setDeleteRecoveryError] = useState(() => initialDeleteRecoveryRead.kind === 'blocked' ? '浏览器无法安全读取删除恢复记录。' : '');
  const [deleteOutcomeNotice, setDeleteOutcomeNotice] = useState('');
  const [pendingUpdateRecovery, setPendingUpdateRecovery] = useState<StoredAnonymousFeedbackUpdateRecovery | null>(() => {
    const initialActor = Number(useAuthStore.getState().user?.id) || 0;
    const result = initialActor > 0 ? readBrowserUpdateRecovery(initialActor) : null;
    return result?.kind === 'ready' ? result.recovery : null;
  });
  const [updateRecoveryState, setUpdateRecoveryState] = useState<AnonymousFeedbackUpdateRecoveryState>(() => {
    const initialActor = Number(useAuthStore.getState().user?.id) || 0;
    const result = initialActor > 0 ? readBrowserUpdateRecovery(initialActor) : null;
    return result?.kind === 'ready' ? (result.recovery.rejected ? 'rejected_cleanup' : 'checking') : result?.kind === 'blocked' ? 'storage_blocked' : null;
  });
  const [updateRecoveryError, setUpdateRecoveryError] = useState('');
  const [updateOutcomeNotice, setUpdateOutcomeNotice] = useState('');
  const mutationLock = useRef(false);
  const mutationGeneration = useRef(0);
  const mutationActor = useRef(actorId);
  const updateRecoveryRef = useRef<StoredAnonymousFeedbackUpdateRecovery | null>(pendingUpdateRecovery);
  const listRequestSequence = useRef(0);
  const addNotification = useAppStore((state) => state.addNotification);
  const activeDeleteRecovery = pendingDeleteRecovery?.actorId === actorId ? pendingDeleteRecovery : null;
  const activeUpdateRecovery = pendingUpdateRecovery?.actorId === actorId ? pendingUpdateRecovery : null;
  const updateStorageBlocked = updateRecoveryState === 'storage_blocked';
  const writeLocked = busy || Boolean(activeDeleteRecovery) || Boolean(activeUpdateRecovery) || updateStorageBlocked || deleteRecoveryState === 'storage_blocked';

  const load = useCallback(async () => {
    const requestSequence = ++listRequestSequence.current;
    const requestActorId = Number(useAuthStore.getState().user?.id) || 0;
    setListError('');
    try {
      const nextItems = await getAnonymousFeedback();
      if (requestSequence !== listRequestSequence.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setItems(nextItems);
      setSelected((current) => current ? nextItems.find((item) => item.id === current.id) || null : null);
      return true;
    } catch (error) {
      if (requestSequence !== listRequestSequence.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setListError(getUserFacingErrorMessage(error, '匿名意见列表暂不可用，请检查连接后重新加载。'));
      return false;
    }
    finally {
      if (requestSequence === listRequestSequence.current && Number(useAuthStore.getState().user?.id) === requestActorId) setLoading(false);
    }
  }, []);

  const readCurrentItems = useCallback(async () => {
    const requestSequence = ++listRequestSequence.current;
    const requestActorId = Number(useAuthStore.getState().user?.id) || 0;
    try {
      const nextItems = await getAnonymousFeedback();
      if (requestSequence !== listRequestSequence.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setItems(nextItems);
      setSelected((current) => current ? nextItems.find((item) => item.id === current.id) || null : null);
      setListError('');
      setLoading(false);
      return nextItems;
    } catch (error) {
      if (requestSequence !== listRequestSequence.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return null;
      setListError(getUserFacingErrorMessage(error, '匿名意见列表暂不可用，请检查连接后重新加载。'));
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    if (mutationActor.current === actorId) return;
    mutationActor.current = actorId;
    mutationGeneration.current += 1;
    listRequestSequence.current += 1;
    mutationLock.current = false;
    setBusy(false);
  }, [actorId]);

  const verifyDeleteRecovery = useCallback(async (
    recovery: StoredAnonymousFeedbackDeleteRecovery,
    isActive: () => boolean = () => true,
  ): Promise<'committed' | 'not_found' | 'target_missing' | 'conflict' | 'unavailable' | null> => {
    setDeleteRecoveryState('checking');
    setDeleteRecoveryError('');
    try {
      const state = await getAnonymousFeedbackDeleteRequestStatus(recovery.targetId, recovery.requestId);
      if (!isActive() || Number(useAuthStore.getState().user?.id) !== recovery.actorId) return null;
      if (state === 'committed') {
        mutationLock.current = true;
        setBusy(true);
        const recoveryCleared = clearAnonymousFeedbackDeleteRecovery(recovery);
        setPendingDeleteRecovery(recoveryCleared ? null : recovery);
        setDeleteRecoveryState(recoveryCleared ? null : 'storage_blocked');
        setDeleteRecoveryError(recoveryCleared ? '' : '删除结果已确认，但浏览器恢复记录无法清除。请恢复浏览器存储并重试清理；其他写操作继续暂停。');
        setDeleteOutcomeNotice('');
        setDeleting(null);
        setItems((current) => current.filter((item) => item.id !== recovery.targetId));
        setSelected((current) => current?.id === recovery.targetId ? null : current);
        const refreshed = await load();
        if (refreshed === false) setRefreshNotice('匿名意见已删除');
        else if (refreshed === true) {
          setRefreshNotice('');
          addNotification({ title: '删除结果已核实', message: '该条匿名意见已删除', type: 'success' });
        }
        mutationLock.current = false;
        setBusy(false);
        if (!isActive() || Number(useAuthStore.getState().user?.id) !== recovery.actorId) return 'committed';
        return 'committed';
      }
      if (state === 'target_missing') {
        mutationLock.current = true;
        setBusy(true);
        const recoveryCleared = clearAnonymousFeedbackDeleteRecovery(recovery);
        setPendingDeleteRecovery(recoveryCleared ? null : recovery);
        setDeleteRecoveryState(recoveryCleared ? null : 'storage_blocked');
        setDeleteRecoveryError(recoveryCleared ? '' : '目标已不存在，但浏览器恢复记录无法清除。请恢复浏览器存储并重试清理；其他写操作继续暂停。');
        setDeleting(null);
        setItems((current) => current.filter((item) => item.id !== recovery.targetId));
        setSelected((current) => current?.id === recovery.targetId ? null : current);
        setDeleteOutcomeNotice('这条匿名意见已不存在，可能已由其他管理员或旧版本页面删除；本次操作未确认删除成功。你可以继续处理其他意见。');
        await load();
        addNotification({ title: '意见已不存在', message: '本次删除未确认成功；已解除操作锁定，可继续处理其他意见。', type: 'warning' });
        mutationLock.current = false;
        setBusy(false);
        if (!isActive() || Number(useAuthStore.getState().user?.id) !== recovery.actorId) return 'target_missing';
        return 'target_missing';
      }
      setDeleteRecoveryState(state);
      await load();
      if (!isActive() || Number(useAuthStore.getState().user?.id) !== recovery.actorId) return null;
      return state;
    } catch (error) {
      if (!isActive() || Number(useAuthStore.getState().user?.id) !== recovery.actorId) return null;
      setDeleteRecoveryState('unavailable');
      setDeleteRecoveryError(getUserFacingErrorMessage(error, '暂时无法读取删除结果，请只读重新核实；不要重复删除。'));
      await load();
      return 'unavailable';
    }
  }, [addNotification, load]);

  const retryDeleteRecoveryCleanup = () => {
    if (!activeDeleteRecovery) {
      window.location.reload();
      return;
    }
    if (!clearAnonymousFeedbackDeleteRecovery(activeDeleteRecovery)) {
      setDeleteRecoveryError('浏览器恢复记录仍无法安全清除，所有写操作继续暂停。');
      return;
    }
    setPendingDeleteRecovery(null);
    setDeleteRecoveryState(null);
    setDeleteRecoveryError('');
    setDeleting(null);
  };

  const setUpdateRecovery = (recovery: StoredAnonymousFeedbackUpdateRecovery, state: AnonymousFeedbackUpdateRecoveryState) => {
    updateRecoveryRef.current = recovery;
    setPendingUpdateRecovery(recovery);
    setUpdateRecoveryState(state);
    setUpdateRecoveryError('');
  };

  const isCurrentUpdateRecovery = (recovery: StoredAnonymousFeedbackUpdateRecovery, isActive: () => boolean = () => true) => (
    isActive()
    && Number(useAuthStore.getState().user?.id) === recovery.actorId
    && sameAnonymousFeedbackUpdateRecovery(updateRecoveryRef.current, recovery)
  );

  const clearUpdateRecovery = useCallback((
    recovery: StoredAnonymousFeedbackUpdateRecovery,
    isActive: () => boolean = () => true,
    failedCleanupState: AnonymousFeedbackUpdateRecoveryState = recovery.rejected ? 'rejected_cleanup' : 'processed_cleanup',
  ) => {
    if (!isCurrentUpdateRecovery(recovery, isActive)) return false;
    let removed = false;
    try {
      const storage = getUpdateRecoveryStorage();
      removed = removeAnonymousFeedbackUpdateRecovery(recovery, storage.session, storage.local);
    } catch { removed = false; }
    if (!removed) {
      setUpdateRecoveryState(failedCleanupState);
      setUpdateRecoveryError('恢复标记尚未安全清除，相关写操作继续锁定。');
      return false;
    }
    updateRecoveryRef.current = null;
    setPendingUpdateRecovery(null);
    setUpdateRecoveryState(null);
    setUpdateRecoveryError('');
    return true;
  }, []);

  const releaseRejectedUpdate = useCallback((recovery: StoredAnonymousFeedbackUpdateRecovery, message: string) => {
    if (!isCurrentUpdateRecovery(recovery)) return false;
    let rejectedSaved = false;
    try {
      const storage = getUpdateRecoveryStorage();
      rejectedSaved = markAnonymousFeedbackUpdateRecoveryRejected(recovery, storage.session, storage.local);
    } catch { rejectedSaved = false; }
    if (!rejectedSaved) {
      setUpdateRecoveryState('rejected_mark_failed');
      setUpdateRecoveryError('服务器已拒绝本次修改，但浏览器未能持久保存拒绝标记。写操作保持锁定，请重试保存标记。');
      return false;
    }
    const rejectedRecovery = { ...recovery, rejected: true };
    updateRecoveryRef.current = rejectedRecovery;
    setPendingUpdateRecovery(rejectedRecovery);
    if (!clearUpdateRecovery(rejectedRecovery)) return false;
    setUpdateOutcomeNotice(message);
    addNotification({ title: '更新失败', message, type: 'warning' });
    return true;
  }, [addNotification, clearUpdateRecovery]);

  const completeProcessedUpdate = useCallback(async (
    recovery: StoredAnonymousFeedbackUpdateRecovery,
    isActive: () => boolean = () => true,
  ) => {
    if (!isCurrentUpdateRecovery(recovery, isActive)) return 'unavailable' as const;
    const currentItems = await readCurrentItems();
    if (!isCurrentUpdateRecovery(recovery, isActive)) return 'unavailable' as const;
    if (!currentItems) {
      const localChanges: Partial<AnonymousFeedback> = recovery.payload;
      setItems((current) => current.map((item) => item.id === recovery.targetId ? { ...item, ...localChanges } : item));
      setListError('修改结果已确认，但当前列表暂不可用。');
    }
    const currentItem = currentItems?.find((item) => item.id === recovery.targetId);
    const didChangeAgain = Boolean(currentItem && !intendedUpdateMatches(currentItem, recovery.payload));
    const savedMessage = didChangeAgain
      ? '本次修改已保存；这条意见随后又有更新，请重新读取当前内容后再编辑。'
      : recovery.payload.status
        ? `意见已标记为${statusLabels[recovery.payload.status]}`
        : recovery.payload.is_public !== undefined
          ? recovery.payload.is_public ? '该条意见已公开' : '该条意见已隐藏'
          : '回复已保存，意见已标记为完成';
    const message = currentItems || didChangeAgain ? savedMessage : `${savedMessage}；列表刷新失败，请重新加载列表。`;
    if (recovery.payload.reply_content !== undefined) {
      setReplying(null);
      setReply('');
    }
    if (!clearUpdateRecovery(recovery, isActive)) return 'processed' as const;
    setUpdateOutcomeNotice(message);
    if (!currentItems) setRefreshNotice(`${savedMessage}；列表刷新失败，请重新加载列表。`);
    else setRefreshNotice('');
    const notificationTitle = didChangeAgain
      ? '意见已有后续更新'
      : recovery.payload.status
        ? '状态已更新'
        : recovery.payload.is_public !== undefined
          ? '公开状态已更新'
          : '回复已保存';
    addNotification({ title: notificationTitle, message, type: didChangeAgain ? 'warning' : 'success' });
    return 'processed' as const;
  }, [addNotification, clearUpdateRecovery, readCurrentItems]);

  const verifyUpdateRecovery = useCallback(async (
    recovery: StoredAnonymousFeedbackUpdateRecovery,
    isActive: () => boolean = () => true,
  ): Promise<'processed' | 'not_found' | 'target_missing' | 'conflict' | 'unavailable' | null> => {
    if (recovery.rejected) {
      if (!isCurrentUpdateRecovery(recovery, isActive)) return null;
      clearUpdateRecovery(recovery, isActive);
      return 'unavailable';
    }
    setUpdateRecoveryState('checking');
    setUpdateRecoveryError('');
    try {
      const state = await getAnonymousFeedbackUpdateRequestStatus(recovery.targetId, recovery.requestId, recovery.requestFingerprint);
      if (!isCurrentUpdateRecovery(recovery, isActive)) return null;
      if (state === 'processed') {
        await completeProcessedUpdate(recovery, isActive);
        return 'processed';
      }
      if (state === 'target_missing') {
        setItems((current) => current.filter((item) => item.id !== recovery.targetId));
        if (!clearUpdateRecovery(recovery, isActive, 'target_missing_cleanup')) return 'target_missing';
        const message = '这条匿名意见已不存在；本次修改未确认成功，可以继续处理其他意见。';
        setUpdateOutcomeNotice(message);
        addNotification({ title: '意见已不存在', message, type: 'warning' });
        return 'target_missing';
      }
      if (state === 'conflict') {
        setUpdateRecoveryState('conflict');
        setUpdateRecoveryError('请求编号、操作者、意见或载荷指纹发生冲突。为避免覆盖或重复操作，恢复标记保持锁定。');
        return 'conflict';
      }

      const currentItems = await readCurrentItems();
      if (!isCurrentUpdateRecovery(recovery, isActive)) return null;
      if (!currentItems) {
        setUpdateRecoveryState('unavailable');
        setUpdateRecoveryError('无法读取当前意见版本，不能安全重试。');
        return 'unavailable';
      }
      const currentItem = currentItems.find((item) => item.id === recovery.targetId);
      if (!currentItem) {
        setItems((itemsBefore) => itemsBefore.filter((item) => item.id !== recovery.targetId));
        if (!clearUpdateRecovery(recovery, isActive, 'target_missing_cleanup')) return 'target_missing';
        const message = '这条匿名意见已不存在；本次修改未确认成功，可以继续处理其他意见。';
        setUpdateOutcomeNotice(message);
        addNotification({ title: '意见已不存在', message, type: 'warning' });
        return 'target_missing';
      }
      if (currentItem.base_fingerprint !== recovery.baseFingerprint) {
        releaseRejectedUpdate(recovery, '意见内容已被其他管理员更新，本次请求未写入。请使用当前内容重新编辑。');
        return 'not_found';
      }
      setUpdateRecoveryState('not_found');
      setUpdateRecoveryError('服务端尚未找到这次修改记录。只有明确点击“使用原请求重试”才会发送原载荷和原请求编号。');
      return 'not_found';
    } catch (error) {
      if (!isCurrentUpdateRecovery(recovery, isActive)) return null;
      setUpdateRecoveryState('unavailable');
      setUpdateRecoveryError(getUserFacingErrorMessage(error, '暂时无法核实意见修改结果，请只读重新核实。'));
      return 'unavailable';
    }
  }, [addNotification, clearUpdateRecovery, completeProcessedUpdate, readCurrentItems, releaseRejectedUpdate]);

  const finishRejectedRecovery = useCallback((recovery: StoredAnonymousFeedbackUpdateRecovery) => {
    if (!isCurrentUpdateRecovery(recovery)) return false;
    return clearUpdateRecovery(recovery);
  }, [clearUpdateRecovery]);

  useEffect(() => {
    const deleteRecovery = actorId > 0 ? readAnonymousFeedbackDeleteRecovery(actorId) : { kind: 'none' as const };
    if (deleteRecovery.kind === 'ready') return undefined;
    if (actorId > 0) {
      const updateRecovery = readBrowserUpdateRecovery(actorId);
      if (updateRecovery.kind !== 'none') return undefined;
    }
    void load();
    return () => { listRequestSequence.current += 1; };
  }, [actorId, load]);

  useEffect(() => {
    if (actorId <= 0) {
      setPendingDeleteRecovery(null);
      setDeleteRecoveryState(null);
      setDeleteOutcomeNotice('');
      return undefined;
    }
    let active = true;
    const result = readAnonymousFeedbackDeleteRecovery(actorId);
    if (result.kind === 'blocked') {
      setPendingDeleteRecovery(null);
      setDeleteRecoveryState('storage_blocked');
      setDeleteRecoveryError('浏览器无法安全读取删除恢复记录，所有写操作已暂停。请恢复浏览器存储后重新检查。');
      return () => { active = false; };
    }
    const recovery = result.kind === 'ready' ? result.recovery : null;
    setPendingDeleteRecovery(recovery);
    setDeleteRecoveryState(recovery ? 'checking' : null);
    setDeleteRecoveryError('');
    setDeleteOutcomeNotice('');
    if (recovery) void verifyDeleteRecovery(recovery, () => active);
    return () => { active = false; };
  }, [actorId, verifyDeleteRecovery]);

  useEffect(() => {
    if (actorId <= 0) {
      updateRecoveryRef.current = null;
      setPendingUpdateRecovery(null);
      setUpdateRecoveryState(null);
      setUpdateRecoveryError('');
      return undefined;
    }
    let active = true;
    const stored = readBrowserUpdateRecovery(actorId);
    if (stored.kind === 'blocked') {
      updateRecoveryRef.current = stored.recovery;
      setPendingUpdateRecovery(stored.recovery);
      setUpdateRecoveryState('storage_blocked');
      setUpdateRecoveryError(stored.reason === 'conflict'
        ? '本地恢复标记不一致，所有写操作保持锁定。'
        : stored.reason === 'invalid'
          ? '本地恢复标记无法识别，所有写操作保持锁定。'
          : '浏览器存储暂不可用，无法安全检查是否有待核实的修改。');
      return () => { active = false; };
    }
    if (stored.kind === 'none') {
      updateRecoveryRef.current = null;
      setPendingUpdateRecovery(null);
      setUpdateRecoveryState(null);
      setUpdateRecoveryError('');
      return () => { active = false; };
    }
    updateRecoveryRef.current = stored.recovery;
    setPendingUpdateRecovery(stored.recovery);
    setUpdateRecoveryError('');
    if (stored.recovery.rejected) {
      setUpdateRecoveryState('rejected_cleanup');
      finishRejectedRecovery(stored.recovery);
    } else {
      setUpdateRecoveryState('checking');
      void verifyUpdateRecovery(stored.recovery, () => active);
    }
    return () => { active = false; };
  }, [actorId, finishRejectedRecovery, verifyUpdateRecovery]);

  const invalidatePendingListRequests = () => { listRequestSequence.current += 1; };

  const refreshAfterMutation = async (message: string, notification: { title: string; message: string }) => {
    const refreshed = await load();
    if (refreshed === null) return;
    if (!refreshed) {
      setRefreshNotice(message);
      return;
    }
    setRefreshNotice('');
    addNotification({ ...notification, type: 'success' });
  };

  const retryList = async () => {
    setRefreshing(true);
    try {
      if (await load()) setRefreshNotice('');
    } finally { setRefreshing(false); }
  };

  const retryDeleteStatusCheck = () => {
    if (!activeDeleteRecovery || busy || deleteRecoveryState === 'checking' || deleteRecoveryState === 'submitting') return;
    void verifyDeleteRecovery(activeDeleteRecovery);
  };

  const executeUpdateRequest = async (recovery: StoredAnonymousFeedbackUpdateRecovery, explicitRetry = false, lockAlreadyHeld = false) => {
    const generation = mutationGeneration.current;
    if (!lockAlreadyHeld) {
      if (mutationLock.current || activeDeleteRecovery || updateStorageBlocked
        || (activeUpdateRecovery && !sameAnonymousFeedbackUpdateRecovery(activeUpdateRecovery, recovery))) return;
      mutationLock.current = true;
      setBusy(true);
    }
    const stillCurrent = () => isCurrentUpdateRecovery(recovery);
    try {
      if (!stillCurrent() || recovery.rejected) return;
      if (explicitRetry) {
        const currentItems = await readCurrentItems();
        if (!stillCurrent()) return;
        if (!currentItems) {
          setUpdateRecoveryState('unavailable');
          setUpdateRecoveryError('无法读取当前意见版本，不能安全重试。');
          return;
        }
        const currentItem = currentItems.find((item) => item.id === recovery.targetId);
        if (!currentItem) {
          setItems((before) => before.filter((item) => item.id !== recovery.targetId));
          if (clearUpdateRecovery(recovery, () => true, 'target_missing_cleanup')) {
            const message = '这条匿名意见已不存在；没有重发修改请求。';
            setUpdateOutcomeNotice(message);
            addNotification({ title: '意见已不存在', message, type: 'warning' });
          }
          return;
        }
        if (currentItem.base_fingerprint !== recovery.baseFingerprint) {
          releaseRejectedUpdate(recovery, '意见内容已被其他管理员更新，本次请求未重发。请使用当前内容重新编辑。');
          return;
        }
      }
      setUpdateRecoveryState('submitting');
      setUpdateRecoveryError('');
      setRefreshNotice('');
      setDeleteOutcomeNotice('');
      await updateAnonymousFeedback(recovery.targetId, recovery.payload, {
        client_request_id: recovery.requestId,
        request_fingerprint: recovery.requestFingerprint,
        base_fingerprint: recovery.baseFingerprint,
      });
      if (!stillCurrent()) return;
      invalidatePendingListRequests();
      await completeProcessedUpdate(recovery);
    } catch (error) {
      if (!stillCurrent()) return;
      const apiError = error instanceof AnonymousFeedbackApiError ? error : null;
      if (apiError?.status === 409 && apiError.code === 'ANONYMOUS_FEEDBACK_UPDATE_BASE_CONFLICT') {
        releaseRejectedUpdate(recovery, '意见内容已被其他管理员更新，本次请求未写入。请重新读取后编辑。');
      } else if (apiError?.status === 409) {
        setUpdateRecoveryState('conflict');
        setUpdateRecoveryError(getUserFacingErrorMessage(apiError, '请求编号冲突，修改结果保持锁定，只能只读核实。'));
      } else if (apiError && [400, 401, 403, 404, 405, 413, 415, 422].includes(apiError.status)) {
        releaseRejectedUpdate(recovery, getUserFacingErrorMessage(apiError, '服务器拒绝了本次修改，未自动重试。'));
      } else {
        await verifyUpdateRecovery(recovery);
      }
    } finally {
      if (generation === mutationGeneration.current && (lockAlreadyHeld || mutationLock.current)) {
        mutationLock.current = false;
        setBusy(false);
      }
    }
  };

  const beginUpdate = async (item: AnonymousFeedback, payload: AnonymousFeedbackUpdatePayload) => {
    if (mutationLock.current || activeDeleteRecovery || activeUpdateRecovery || updateStorageBlocked) return;
    if (actorId <= 0 || !item.base_fingerprint || !/^[0-9a-f]{64}$/.test(item.base_fingerprint)) {
      addNotification({ title: '无法安全修改', message: '当前意见缺少有效的服务端版本标记，请重新加载列表后再操作。', type: 'error' });
      return;
    }
    const generation = mutationGeneration.current;
    mutationLock.current = true;
    setBusy(true);
    setUpdateOutcomeNotice('');
    setRefreshNotice('');
    try {
      const baseFingerprint = item.base_fingerprint;
      const requestId = window.crypto.randomUUID().toLowerCase();
      const requestFingerprint = await fingerprintAnonymousFeedbackUpdateRequest(item.id, baseFingerprint, payload);
      if (Number(useAuthStore.getState().user?.id) !== actorId) return;
      const currentStored = readBrowserUpdateRecovery(actorId);
      if (currentStored.kind === 'blocked') {
        setUpdateRecoveryState('storage_blocked');
        setUpdateRecoveryError('浏览器中已有无法核实的修改恢复信息，因此没有发送本次请求。');
        return;
      }
      if (currentStored.kind === 'ready') {
        setUpdateRecovery(currentStored.recovery, currentStored.recovery.rejected ? 'rejected_cleanup' : 'checking');
        if (currentStored.recovery.rejected) finishRejectedRecovery(currentStored.recovery);
        else void verifyUpdateRecovery(currentStored.recovery);
        return;
      }
      const recovery: StoredAnonymousFeedbackUpdateRecovery = {
        schemaVersion: 1,
        actorId,
        targetId: item.id,
        requestId,
        baseFingerprint,
        requestFingerprint,
        payload: { ...payload },
        baseline: { id: item.id, base_fingerprint: baseFingerprint },
        rejected: false,
      };
      let persisted = false;
      try {
        const storage = getUpdateRecoveryStorage();
        persisted = persistAnonymousFeedbackUpdateRecovery(recovery, storage.session, storage.local);
      } catch { persisted = false; }
      if (!persisted) {
        const stored = readBrowserUpdateRecovery(actorId);
        if (stored.kind === 'ready') setUpdateRecovery(stored.recovery, 'storage_blocked');
        else {
          setUpdateRecoveryState('storage_blocked');
          setUpdateRecoveryError('浏览器无法保存修改恢复信息，因此没有发送请求。请检查浏览器存储后重新加载。');
        }
        return;
      }
      setUpdateRecovery(recovery, 'submitting');
      await executeUpdateRequest(recovery, false, true);
    } catch (error) {
      setUpdateRecoveryState(activeUpdateRecovery ? 'unavailable' : null);
      addNotification({ title: '无法安全修改', message: getUserFacingErrorMessage(error, '恢复信息准备失败，因此没有发送请求。请检查浏览器存储后重试。'), type: 'error' });
    } finally {
      if (generation === mutationGeneration.current) {
        mutationLock.current = false;
        setBusy(false);
      }
    }
  };

  const update = async (item: AnonymousFeedback, status: AnonymousFeedbackStatus) => {
    await beginUpdate(item, { status });
  };

  const togglePublic = async (item: AnonymousFeedback) => {
    await beginUpdate(item, { is_public: !Number(item.is_public) });
  };

  const submitReply = async () => {
    if (!replying) return;
    await beginUpdate(replying, { reply_content: reply, status: 'completed' });
  };

  const retryUpdateStatusCheck = () => {
    if (!activeUpdateRecovery || busy || updateRecoveryState === 'checking' || updateRecoveryState === 'submitting') return;
    void verifyUpdateRecovery(activeUpdateRecovery);
  };

  const retryUpdateRequest = () => {
    if (!activeUpdateRecovery || activeUpdateRecovery.rejected || updateRecoveryState !== 'not_found' || busy) return;
    void executeUpdateRequest(activeUpdateRecovery, true);
  };

  const retryUpdateCleanup = () => {
    if (!activeUpdateRecovery || busy) return;
    if (activeUpdateRecovery.rejected || updateRecoveryState === 'rejected_mark_failed') {
      try {
        const storage = getUpdateRecoveryStorage();
        if (!markAnonymousFeedbackUpdateRecoveryRejected(activeUpdateRecovery, storage.session, storage.local)) {
          setUpdateRecoveryError('拒绝标记仍未成功保存，写操作继续锁定。');
          return;
        }
        const rejectedRecovery = { ...activeUpdateRecovery, rejected: true };
        updateRecoveryRef.current = rejectedRecovery;
        setPendingUpdateRecovery(rejectedRecovery);
        clearUpdateRecovery(rejectedRecovery);
      } catch {
        setUpdateRecoveryError('浏览器存储暂不可用，无法清理拒绝标记。');
      }
    } else {
      const failureState = updateRecoveryState === 'target_missing_cleanup'
        ? 'target_missing_cleanup'
        : updateRecoveryState === 'storage_blocked' ? 'storage_blocked' : 'processed_cleanup';
      clearUpdateRecovery(activeUpdateRecovery, () => true, failureState);
    }
  };

  const remove = async () => {
    if (mutationLock.current || activeUpdateRecovery || updateStorageBlocked || deleteRecoveryState === 'storage_blocked') return;
    const targetId = deleting?.id ?? activeDeleteRecovery?.targetId;
    if (!targetId || actorId <= 0) return;
    if (activeDeleteRecovery && (deleteRecoveryState !== 'not_found' || activeDeleteRecovery.targetId !== targetId)) return;
    const recovery = activeDeleteRecovery || {
      actorId,
      requestId: window.crypto.randomUUID().toLowerCase(),
      targetId,
    };
    const generation = mutationGeneration.current;
    mutationLock.current = true;
    setBusy(true);
    setRefreshNotice('');
    setDeleteOutcomeNotice('');
    setDeleteRecoveryError('');
    if (!activeDeleteRecovery) {
      if (!persistAnonymousFeedbackDeleteRecovery(recovery)) {
        mutationLock.current = false;
        setBusy(false);
        setDeleteRecoveryState('storage_blocked');
        setDeleteRecoveryError('浏览器无法保存并核验删除恢复记录，因此本次删除请求未发送。请取消确认并重新检查浏览器存储。');
        addNotification({ title: '无法安全删除', message: '浏览器无法保存本次删除恢复信息，因此没有发送删除请求。', type: 'error' });
        return;
      }
      setPendingDeleteRecovery(recovery);
    }
    setDeleteRecoveryState('submitting');
    try {
      await deleteAnonymousFeedback(targetId, recovery.requestId);
      invalidatePendingListRequests();
      const recoveryCleared = clearAnonymousFeedbackDeleteRecovery(recovery);
      setPendingDeleteRecovery(recoveryCleared ? null : recovery);
      setDeleteRecoveryState(recoveryCleared ? null : 'storage_blocked');
      setDeleteRecoveryError(recoveryCleared ? '' : '删除结果已确认，但浏览器恢复记录无法清除。请恢复浏览器存储并重试清理；其他写操作继续暂停。');
      setDeleteOutcomeNotice('');
      setItems((current) => current.filter((item) => item.id !== targetId));
      setSelected((current) => current?.id === targetId ? null : current);
      setDeleting(null);
      await refreshAfterMutation('匿名意见已删除', { title: '删除成功', message: '该条意见已删除' });
    } catch (error) {
      const status = await verifyDeleteRecovery(recovery);
      if (status === 'not_found') {
        addNotification({ title: '删除尚未确认', message: '服务器尚未记录这次删除；请显式使用原请求重试。其他写操作会保持锁定。', type: 'warning' });
      } else if (status === 'conflict') {
        addNotification({ title: '删除请求冲突', message: '请求编号与操作者或目标意见不匹配，已锁定写操作以避免重复删除。', type: 'error' });
      } else if (status === 'unavailable') {
        addNotification({ title: '删除结果待核实', message: deleteRecoveryError || getUserFacingErrorMessage(error, '暂时无法核实删除结果，请只读重新核实；不要重复删除。'), type: 'error' });
      }
    }
    finally {
      if (generation === mutationGeneration.current) {
        mutationLock.current = false;
        setBusy(false);
      }
    }
  };

  return <PageShell>
    <PageHeader title="匿名意见管理" description="查看和处理团队成员提交的匿名意见" />
    {activeUpdateRecovery ? <div role="alert" data-testid="feedback-update-recovery" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{updateRecoveryState === 'not_found'
        ? '服务端尚未找到这次修改。核对下方原载荷后，可明确使用相同请求编号重试；其他写操作保持锁定。'
        : updateRecoveryState === 'conflict'
          ? '修改请求发生编号或指纹冲突。所有写操作保持锁定，只能进行只读核实。'
          : updateRecoveryState === 'unavailable'
            ? '修改结果暂时无法核实。请勿重复操作；所有写操作保持锁定。'
            : updateRecoveryState === 'processed_cleanup'
              ? '本次修改已确认，但恢复标记尚未安全清除。写操作继续锁定。'
                : updateRecoveryState === 'target_missing_cleanup'
                  ? '这条意见已不存在，但恢复标记尚未安全清除。写操作继续锁定。'
              : updateRecoveryState === 'rejected_cleanup'
                ? '本次修改已被拒绝，恢复标记尚未安全清除。不会重试该请求，写操作继续锁定。'
                : updateRecoveryState === 'rejected_mark_failed'
                  ? '本次修改已被拒绝，但浏览器未能保存拒绝标记。写操作保持锁定，请重试保存标记。'
                : updateRecoveryState === 'storage_blocked'
                  ? '浏览器恢复信息无法安全读取或保存，因此没有发送新的修改请求；写操作保持锁定。'
                  : updateRecoveryState === 'submitting'
                    ? '正在发送或恢复这次修改；期间其他写操作保持锁定。'
                    : '正在只读核实上次修改结果；核实完成前，其他写操作保持锁定。'}</p>
      <div className="rounded-lg border border-studio-border-soft bg-studio-surface/70 p-3 text-studio-text-secondary">
        <p>原请求编号：<span className="font-mono text-xs">{activeUpdateRecovery.requestId}</span></p>
        <p className="mt-1">修改目标：{activeUpdateRecovery.payload.status ? `状态改为${statusLabels[activeUpdateRecovery.payload.status]}` : ''}{activeUpdateRecovery.payload.is_public !== undefined ? `设为${activeUpdateRecovery.payload.is_public ? '公开' : '隐藏'}` : ''}{activeUpdateRecovery.payload.reply_content !== undefined ? '保存回复' : ''}</p>
        {activeUpdateRecovery.payload.reply_content !== undefined ? <div className="mt-2"><p className="text-xs text-studio-text-muted">原回复内容</p><p className="mt-1 whitespace-pre-wrap break-words">{activeUpdateRecovery.payload.reply_content || '（空内容）'}</p></div> : null}
      </div>
      {updateRecoveryError ? <p className="text-studio-text-secondary">{updateRecoveryError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {updateRecoveryState === 'not_found' && !activeUpdateRecovery.rejected ? <ActionButton variant="primary" onClick={retryUpdateRequest} disabled={busy}>使用原请求重试</ActionButton> : null}
        {updateRecoveryState === 'processed_cleanup' || updateRecoveryState === 'target_missing_cleanup' || updateRecoveryState === 'rejected_cleanup' || updateRecoveryState === 'rejected_mark_failed' || updateRecoveryState === 'storage_blocked' ? <ActionButton variant="secondary" onClick={retryUpdateCleanup} disabled={busy}>{updateRecoveryState === 'rejected_mark_failed' ? '重试保存拒绝标记' : '重试清理恢复标记'}</ActionButton> : null}
        {updateRecoveryState !== 'processed_cleanup' && updateRecoveryState !== 'target_missing_cleanup' && updateRecoveryState !== 'rejected_cleanup' && updateRecoveryState !== 'rejected_mark_failed' && updateRecoveryState !== 'storage_blocked' ? <ActionButton variant="secondary" onClick={retryUpdateStatusCheck} disabled={busy || updateRecoveryState === 'checking' || updateRecoveryState === 'submitting'}>
          {updateRecoveryState === 'checking' ? '正在核实…' : '只读重新核实'}
        </ActionButton> : null}
      </div>
    </div> : updateRecoveryState === 'storage_blocked' ? <div role="alert" className="mb-4 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">浏览器恢复信息无法安全读取，因此暂停所有写操作。</p>
      {updateRecoveryError ? <p className="mt-2 text-studio-text-secondary">{updateRecoveryError}</p> : null}
      <ActionButton variant="secondary" className="mt-3" onClick={() => window.location.reload()}>重新检查</ActionButton>
    </div> : null}
    {updateOutcomeNotice ? <div role="status" className="mb-4 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-secondary">{updateOutcomeNotice}</div> : null}
    {activeDeleteRecovery ? <div role="alert" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{deleteRecoveryState === 'not_found'
        ? '服务端当前没有找到本操作者对这条意见的删除记录。只有明确点击下方按钮才会使用原请求编号重试；其他写操作仍保持锁定。'
        : deleteRecoveryState === 'conflict'
          ? '删除请求编号与操作者或目标意见不匹配，无法安全判断结果；所有写操作保持锁定。'
          : deleteRecoveryState === 'unavailable'
            ? '删除结果暂时无法核实。请勿重复操作；所有写操作保持锁定。'
            : deleteRecoveryState === 'storage_blocked'
              ? '删除结果已确认，但浏览器恢复记录无法安全清除。恢复记录清理前，其他写操作保持锁定。'
              : '正在核实上次删除结果；核实完成前，其他写操作保持锁定。'}</p>
      {deleteRecoveryError ? <p className="text-studio-text-secondary">{deleteRecoveryError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {deleteRecoveryState === 'not_found' ? <ActionButton variant="danger" onClick={() => void remove()} disabled={busy}>使用原请求重试</ActionButton> : null}
        {deleteRecoveryState === 'storage_blocked'
          ? <ActionButton variant="secondary" onClick={retryDeleteRecoveryCleanup} disabled={busy}>{activeDeleteRecovery ? '重试清理恢复记录' : '重新检查'}</ActionButton>
          : <ActionButton variant="secondary" onClick={retryDeleteStatusCheck} disabled={busy || deleteRecoveryState === 'checking' || deleteRecoveryState === 'submitting'}>
            {deleteRecoveryState === 'checking' ? '正在核实…' : '只读重新核实'}
          </ActionButton>}
      </div>
    </div> : deleteRecoveryState === 'storage_blocked' ? <div role="alert" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">浏览器恢复信息无法安全读取，因此暂停所有意见写操作。</p>
      {deleteRecoveryError ? <p className="text-studio-text-secondary">{deleteRecoveryError}</p> : null}
      <ActionButton variant="secondary" onClick={retryDeleteRecoveryCleanup}>重新检查</ActionButton>
    </div> : null}
    {deleteOutcomeNotice ? <div role="status" className="mb-4 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">{deleteOutcomeNotice}</div> : null}
    {listError ? <div role="alert" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{refreshNotice ? `${refreshNotice}；列表刷新失败，请重新加载列表，不要重复执行刚才的操作。` : '匿名意见列表暂不可用。'}</p>
      <p className="text-studio-text-secondary">{listError}</p>
      <ActionButton variant="secondary" onClick={() => void retryList()} disabled={refreshing}>{refreshing ? '正在重新加载…' : '重新加载列表'}</ActionButton>
    </div> : null}
    <GlassPanel data-testid="anonymous-feedback-admin-table-panel" className="overflow-visible">
      {loading ? <LoadingState type="table" rows={5} /> : items.length === 0 ? listError ? null : activeDeleteRecovery
        ? <div role="status" className="px-4 py-8 text-center text-sm text-studio-text-secondary">删除结果尚未核实，暂不将空列表视为删除成功。</div>
        : <EmptyState icon={MessageSquare} title="暂无匿名意见" description="团队成员提交的意见会显示在这里。" /> : <ResponsiveTableShell>
        <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
          <thead className="border-b border-studio-border-soft bg-studio-surface-soft text-xs text-studio-text-muted"><tr><th className="px-4 py-3">时间</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">内容</th><th className="px-4 py-3">需要回复</th><th className="px-4 py-3">公开</th><th className="px-4 py-3">状态</th><th className="sticky right-0 z-20 w-[260px] border-l border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-right sm:w-[340px]">操作</th></tr></thead>
          <tbody className="divide-y divide-studio-border-soft">{items.map((item) => <tr key={item.id} className="text-studio-text-secondary">
            <td className="whitespace-nowrap px-4 py-4 text-xs">{formatBeijingDate(item.created_at)}</td>
            <td className="px-4 py-4">{typeLabels[item.type]}</td>
            <td className="max-w-md px-4 py-4"><p className="line-clamp-2">{item.content}</p></td>
            <td className="px-4 py-4">{Number(item.need_reply) ? '是' : '否'}</td>
            <td className="px-4 py-4">{Number(item.is_public) ? '公开' : '隐藏'}</td>
            <td className="px-4 py-4"><StatusPill tone={statusTones[item.status]}>{statusLabels[item.status]}</StatusPill></td>
            <td data-testid={`feedback-row-actions-${item.id}`} className="sticky right-0 z-10 w-[260px] border-l border-studio-border-soft bg-studio-surface px-4 py-4 sm:w-[340px]">
              <div className="flex flex-wrap justify-end gap-1 sm:flex-nowrap">
                <ActionButton variant="ghost" title="查看详情" aria-label={feedbackActionName('查看意见详情', item)} disabled={busy} onClick={() => setSelected(item)}><Eye className="h-4 w-4" /></ActionButton>
                {item.status === 'pending' ? <ActionButton variant="ghost" title="标记处理中" aria-label={feedbackActionName('标记为处理中', item)} disabled={writeLocked} onClick={() => void update(item, 'processing')}><Check className="h-4 w-4" /></ActionButton> : null}
                <ActionButton variant="ghost" title="标记完成" aria-label={feedbackActionName('标记为已完成', item)} disabled={writeLocked} onClick={() => void update(item, 'completed')}><Check className="h-4 w-4" /></ActionButton>
                <ActionButton variant="ghost" title={Number(item.is_public) ? '隐藏意见' : '公开意见'} aria-label={feedbackActionName(Number(item.is_public) ? '隐藏意见' : '公开意见', item)} disabled={writeLocked} onClick={() => void togglePublic(item)}>{Number(item.is_public) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</ActionButton>
                <ActionButton variant="ghost" title="回复" aria-label={feedbackActionName('回复匿名意见', item)} disabled={writeLocked} onClick={() => { setReplying(item); setReply(item.reply_content || ''); }}><MessageSquare className="h-4 w-4" /></ActionButton>
                <ActionButton variant="ghost" title="删除" aria-label={feedbackActionName('删除匿名意见', item)} disabled={writeLocked} onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4 text-studio-coral" /></ActionButton>
              </div>
            </td>
          </tr>)}</tbody>
        </table>
      </ResponsiveTableShell>}
    </GlassPanel>
    <BaseModal open={Boolean(selected)} onClose={() => setSelected(null)} title="意见详情" closeOnEscape><div className="space-y-4 text-sm"><p className="whitespace-pre-wrap leading-7 text-studio-text-primary">{selected?.content}</p>{selected?.reply_content ? <div className="rounded-button bg-studio-surface-soft p-4"><p className="mb-2 text-xs text-studio-text-muted">管理员回复</p><p className="whitespace-pre-wrap text-studio-text-secondary">{selected.reply_content}</p></div> : null}</div></BaseModal>
    <FormModal open={Boolean(replying)} onCancel={() => setReplying(null)} onSubmit={submitReply} loading={writeLocked} title="回复意见" submitText="保存回复">
      <label className="block space-y-2 text-sm text-studio-text-secondary">
        回复内容
        <textarea rows={6} maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="输入回复内容" disabled={writeLocked} className="xmt-field w-full resize-y disabled:opacity-60" />
      </label>
    </FormModal>
    <ConfirmModal
      open={Boolean(deleting)}
      onCancel={() => setDeleting(null)}
      onConfirm={remove}
      loading={busy}
      confirmDisabled={Boolean(activeUpdateRecovery || updateStorageBlocked || deleteRecoveryState === 'storage_blocked' || (activeDeleteRecovery && deleteRecoveryState !== 'not_found'))}
      variant="danger"
      title="删除意见"
      description={deleteRecoveryState === 'storage_blocked' && deleteRecoveryError
        ? deleteRecoveryError
        : activeDeleteRecovery && deleteRecoveryState === 'not_found'
        ? '服务端当前没有找到本操作者对这条意见的删除记录。确认后会使用原请求编号重试；其他写操作仍保持锁定。'
        : activeDeleteRecovery
          ? '上次删除结果尚未核实。确认前请先完成只读核实；核实期间不会再次发送删除请求。'
          : '删除后无法恢复，确认继续吗？'}
      confirmText={activeDeleteRecovery ? '使用原请求重试' : '删除'}
    />
  </PageShell>;
}

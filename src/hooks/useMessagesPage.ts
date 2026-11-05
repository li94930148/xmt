import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getMessages,
  getMessageClearRequestStatus,
  getMessageReadAllRequestStatus,
  getMessageReadStatus,
  markMessageAsRead,
  markAllAsRead,
  clearMessages,
} from '../api';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { useAppStore, useAuthStore, useMessageStore } from '../store';
import type { Message } from '../types';
import {
  MESSAGE_PAGE_SIZE,
  MESSAGE_CLEAR_RECOVERY_VERSION,
  createMessageClearRequestId,
  createMessageReadAllRequestId,
  readMessageClearRecovery,
  readMessageReadAllRecovery,
  persistMessageClearRecovery,
  persistMessageReadAllRecovery,
  removeMessageClearRecovery,
  removeMessageReadAllRecovery,
} from '../pages/messages/messageRecovery';
import type {
  StoredMessageClearRecovery,
  MessageClearRecoveryState,
  StoredMessageReadAllRecovery,
  MessageReadAllRecoveryState,
  PendingSingleMessageReadVerification,
} from '../pages/messages/messageRecovery';

export type MessageFilter = 'all' | 'unread' | 'actionable' | 'system';
type MessageSummary = { total: number; unread: number; actionable: number };

export function useMessagesPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const [initialMessageReadAllRecovery] = useState(() => readMessageReadAllRecovery(useAuthStore.getState().user?.id));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summaryState, setSummaryState] = useState<{ actorId: number | undefined; summary: MessageSummary } | null>(null);
  const [searchParams] = useSearchParams();
  const [initialClearRecovery] = useState(() => readMessageClearRecovery(useAuthStore.getState().user?.id));
  const [pendingClearRecovery, setPendingClearRecovery] = useState<StoredMessageClearRecovery | null>(initialClearRecovery);
  const [clearRecoveryState, setClearRecoveryState] = useState<MessageClearRecoveryState>(initialClearRecovery ? 'checking' : null);
  const [clearOutcomeNotice, setClearOutcomeNotice] = useState<{ actorId: number; message: string } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(Boolean(initialClearRecovery));
  const [clearConfirmActorId, setClearConfirmActorId] = useState<number | null>(initialClearRecovery?.actorId ?? null);
  const [clearingActorIds, setClearingActorIds] = useState<Set<number>>(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingMessageReadAllRecovery, setPendingMessageReadAllRecoveryState] = useState<StoredMessageReadAllRecovery | null>(initialMessageReadAllRecovery.recovery);
  const [messageReadAllRecoveryState, setMessageReadAllRecoveryState] = useState<MessageReadAllRecoveryState>(
    initialMessageReadAllRecovery.recovery ? 'checking' : initialMessageReadAllRecovery.error ? 'unavailable' : null,
  );
  const [messageReadAllRecoveryError, setMessageReadAllRecoveryError] = useState<string | null>(initialMessageReadAllRecovery.error);
  const [messageReadAllOutcomeNotice, setMessageReadAllOutcomeNotice] = useState<string | null>(
    initialMessageReadAllRecovery.recovery ? '正在只读核实此前的批量已读请求；核实期间不会再次提交。' : initialMessageReadAllRecovery.error,
  );
  const [singleMessageReadVerificationByActor, setSingleMessageReadVerificationByActor] = useState<Map<number, PendingSingleMessageReadVerification>>(() => new Map());
  const [verifyingSingleMessageReadActors, setVerifyingSingleMessageReadActors] = useState<Set<number>>(() => new Set());
  const [activeFilter, setActiveFilter] = useState<MessageFilter>(() => searchParams.get('filter') === 'actionable' ? 'actionable' : 'all');
  const markingMessageIdsByActorRef = useRef(new Map<number, Set<number>>());
  const markingAllRefreshPendingRef = useRef(false);
  const markingAllRef = useRef(false);
  const pendingMessageReadAllRecoveryRef = useRef(initialMessageReadAllRecovery.recovery);
  const messageReadAllVerificationRef = useRef<string | null>(null);
  const activeMessageReadAllActorRef = useRef(userId);
  const clearingActorIdsRef = useRef(new Set<number>());
  const activeClearActorRef = useRef(userId);
  const latestMessageRequestRef = useRef(0);
  const loadedQueryKeyRef = useRef<string | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [markingMessageIdsByActor, setMarkingMessageIdsByActor] = useState<Map<number, Set<number>>>(() => new Map());

  const navigate = useNavigate();
  const messageQueryKey = JSON.stringify([userId ?? null, page, activeFilter]);
  const messageQueryKeyRef = useRef(messageQueryKey);
  messageQueryKeyRef.current = messageQueryKey;
  const addNotification = useAppStore((state) => state.addNotification);
  const setStoreMessages = useMessageStore((state) => state.setMessages);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);
  const currentSingleMessageReadVerification = userId == null ? null : singleMessageReadVerificationByActor.get(userId) ?? null;
  const currentActorMarkingMessageIds = userId == null ? null : markingMessageIdsByActor.get(userId) ?? null;
  const currentActorClearing = userId != null && clearingActorIds.has(userId);
  const currentPendingClearRecovery = userId != null && pendingClearRecovery?.actorId === userId ? pendingClearRecovery : null;
  const currentClearRecoveryState = currentPendingClearRecovery ? clearRecoveryState : null;
  const currentClearOutcomeNotice = clearOutcomeNotice && clearOutcomeNotice.actorId === userId
    ? clearOutcomeNotice.message : null;
  const currentShowClearConfirm = userId != null && showClearConfirm && clearConfirmActorId === userId;

  const setClearOutcomeNoticeForActor = useCallback((actorId: number, message: string) => {
    setClearOutcomeNotice({ actorId, message });
  }, []);

  const setPendingMessageReadAllRecovery = useCallback((recovery: StoredMessageReadAllRecovery | null) => {
    pendingMessageReadAllRecoveryRef.current = recovery;
    setPendingMessageReadAllRecoveryState(recovery);
  }, []);

  const scheduleMessageReadAllRefresh = useCallback(() => {
    markingAllRefreshPendingRef.current = true;
    if (activeFilter === 'unread' || activeFilter === 'actionable') setPage(1);
    setLoading(true);
    setReloadKey((current) => current + 1);
  }, [activeFilter]);

  const verifyMessageReadAllStatus = useCallback(async (recovery: StoredMessageReadAllRecovery) => {
    const requestKey = `${recovery.actorId}:${recovery.requestId}`;
    if (messageReadAllVerificationRef.current === requestKey) return;
    messageReadAllVerificationRef.current = requestKey;
    markingAllRef.current = true;
    setMarkingAll(true);
    setMessageReadAllRecoveryState('checking');

    const isCurrent = () => useAuthStore.getState().user?.id === recovery.actorId
      && pendingMessageReadAllRecoveryRef.current?.requestId === recovery.requestId;
    try {
      const result = await getMessageReadAllRequestStatus(recovery.requestId);
      if (!isCurrent()) return;

      if (result.state === 'processed' && Number.isSafeInteger(result.updatedCount) && result.updatedCount >= 0) {
        removeMessageReadAllRecovery(recovery.actorId);
        setPendingMessageReadAllRecovery(null);
        setMessageReadAllRecoveryState(null);
        setMessageReadAllRecoveryError(null);
        setMessageReadAllOutcomeNotice(`已核实上次批量已读：处理了 ${result.updatedCount} 条消息，正在读取最新状态。`);
        addNotification({ title: '批量已读结果已核实', message: '不会重复提交；正在重新读取最新消息。', type: 'success' });
        latestMessageRequestRef.current += 1;
        scheduleMessageReadAllRefresh();
        return;
      }

      if (result.state === 'not_found') {
        setMessageReadAllRecoveryState('not_found');
        setMessageReadAllRecoveryError(null);
        setMessageReadAllOutcomeNotice('服务器尚未找到这次批量已读的完成记录。请求编号已保留；读取当前消息后，可明确确认并使用同一编号重试。');
        scheduleMessageReadAllRefresh();
        return;
      }

      throw new Error('批量已读状态格式不正确');
    } catch {
      if (!isCurrent()) return;
      setMessageReadAllRecoveryState('unavailable');
      setMessageReadAllOutcomeNotice('暂时无法核实上次批量已读结果。请求编号已保留；核实前不会重发，请只读重新核实。');
      setMessageReadAllRecoveryError(null);
    } finally {
      if (messageReadAllVerificationRef.current === requestKey) messageReadAllVerificationRef.current = null;
      if (useAuthStore.getState().user?.id === recovery.actorId && !markingAllRefreshPendingRef.current) {
        markingAllRef.current = false;
        setMarkingAll(false);
      }
    }
  }, [addNotification, scheduleMessageReadAllRefresh, setPendingMessageReadAllRecovery]);

  const recheckMessageReadAllRecovery = () => {
    if (!userId) return;
    const stored = readMessageReadAllRecovery(userId);
    setMessageReadAllRecoveryError(stored.error);
    if (stored.error) {
      const current = pendingMessageReadAllRecoveryRef.current;
      if (current?.actorId === userId) {
        setMessageReadAllRecoveryState('unavailable');
        setMessageReadAllOutcomeNotice(stored.error);
        return;
      }
      setPendingMessageReadAllRecovery(null);
      setMessageReadAllRecoveryState('unavailable');
      setMessageReadAllOutcomeNotice(stored.error);
      return;
    }

    setPendingMessageReadAllRecovery(stored.recovery);
    if (stored.recovery) {
      setMessageReadAllRecoveryState('checking');
      setMessageReadAllOutcomeNotice('正在只读核实此前的批量已读请求；核实期间不会再次提交。');
      void verifyMessageReadAllStatus(stored.recovery);
    } else {
      setMessageReadAllRecoveryState(null);
      setMessageReadAllOutcomeNotice(null);
    }
  };

  useEffect(() => {
    if (activeClearActorRef.current === userId) return;
    activeClearActorRef.current = userId;
    const recovery = readMessageClearRecovery(userId);
    setPendingClearRecovery(recovery);
    setClearRecoveryState(recovery ? 'checking' : null);
    setClearConfirmActorId(recovery?.actorId ?? userId ?? null);
    setShowClearConfirm(Boolean(recovery));
  }, [userId]);

  useEffect(() => {
    if (activeMessageReadAllActorRef.current === userId) return;
    activeMessageReadAllActorRef.current = userId;
    messageReadAllVerificationRef.current = null;
    markingAllRefreshPendingRef.current = false;
    markingAllRef.current = false;
    setMarkingAll(false);
    const stored = readMessageReadAllRecovery(userId);
    setPendingMessageReadAllRecovery(stored.recovery);
    setMessageReadAllRecoveryError(stored.error);
    setMessageReadAllRecoveryState(stored.recovery ? 'checking' : stored.error ? 'unavailable' : null);
    setMessageReadAllOutcomeNotice(stored.recovery
      ? '正在只读核实此前的批量已读请求；核实期间不会再次提交。'
      : stored.error);
  }, [setPendingMessageReadAllRecovery, userId]);

  useEffect(() => {
    if (!pendingMessageReadAllRecovery || messageReadAllRecoveryState !== 'checking') return;
    void verifyMessageReadAllStatus(pendingMessageReadAllRecovery);
  }, [messageReadAllRecoveryState, pendingMessageReadAllRecovery, verifyMessageReadAllStatus]);

  useEffect(() => {
    if (!pendingClearRecovery || pendingClearRecovery.actorId !== userId || clearRecoveryState !== 'checking') return;
    let active = true;
    const recovery = pendingClearRecovery;
    void getMessageClearRequestStatus(recovery.requestId)
      .then((status) => {
        if (!active || useAuthStore.getState().user?.id !== recovery.actorId) return;
        if (status.state === 'cleared') {
          removeMessageClearRecovery(recovery.actorId);
          setPendingClearRecovery(null);
          setClearRecoveryState(null);
          setShowClearConfirm(false);
          setClearOutcomeNoticeForActor(recovery.actorId, `上次清空请求已确认（处理 ${status.deletedCount} 条原有消息）；正在重新读取，以保留之后到达的新消息。`);
          setLoading(true);
          latestMessageRequestRef.current += 1;
          setPage(1);
          setReloadKey((current) => current + 1);
          addNotification({ title: '清空结果已核实', message: '不会重复清空；正在重新读取最新消息。', type: 'success' });
          return;
        }
        setClearRecoveryState('not_found');
        setClearOutcomeNoticeForActor(recovery.actorId, '服务器暂未找到这条清空请求的完成记录。确认重试会沿用原请求编号；若原请求稍后完成，服务器只返回原结果，不会再次删除后来到达的消息。');
      })
      .catch(() => {
        if (!active || useAuthStore.getState().user?.id !== recovery.actorId) return;
        setClearRecoveryState('unavailable');
        setClearOutcomeNoticeForActor(recovery.actorId, '暂时无法核实上次清空结果。恢复编号已保留，请只读重新核实；核实前不会再次发送删除请求。');
      });
    return () => { active = false; };
  }, [addNotification, clearRecoveryState, pendingClearRecovery, setClearOutcomeNoticeForActor, userId]);

  useEffect(() => {
    let active = true;
    const requestId = ++latestMessageRequestRef.current;
    const params = {
      page,
      limit: MESSAGE_PAGE_SIZE,
      ...(activeFilter === 'unread' ? { read: 'unread' as const } : {}),
      ...(activeFilter === 'actionable' ? { read: 'unread' as const, link: 'present' as const } : {}),
      ...(activeFilter === 'system' ? { link: 'absent' as const } : {}),
    };

    setLoading(true);
    setLoadError(null);
    void getMessages(params)
      .then((result) => {
        if (!active || requestId !== latestMessageRequestRef.current) return;
        setMessages(result.data);
        setTotal(result.total);
        setSummaryState({ actorId: userId, summary: result.summary });
        loadedQueryKeyRef.current = messageQueryKey;
        setLoadedQueryKey(messageQueryKey);
        setStoreMessages(result.data);
        setUnreadCount(result.summary.unread);
        setClearOutcomeNotice(null);
      })
      .catch((error) => {
        if (!active || requestId !== latestMessageRequestRef.current) return;
        const message = getUserFacingErrorMessage(error, '消息暂时无法加载，请检查网络后重试。');
        if (loadedQueryKeyRef.current !== messageQueryKey) {
          setMessages([]);
          setTotal(0);
          setLoadedQueryKey(null);
          loadedQueryKeyRef.current = null;
          setStoreMessages([]);
        }
        setLoadError(message);
        addNotification({ title: '获取消息失败', message, type: 'error' });
      })
      .finally(() => {
        if (active && requestId === latestMessageRequestRef.current) {
          setLoading(false);
          if (markingAllRefreshPendingRef.current) {
            markingAllRefreshPendingRef.current = false;
            markingAllRef.current = false;
            setMarkingAll(false);
          }
        }
      });

    return () => {
      active = false;
    };
  }, [activeFilter, addNotification, messageQueryKey, page, reloadKey, setStoreMessages, setUnreadCount, userId]);

  const totalPages = Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE));
  const summary = summaryState && summaryState.actorId === userId ? summaryState.summary : null;
  const unreadCount = summary?.unread ?? null;
  const filteredMessages = messages;
  const showUnreadOnly = activeFilter === 'unread' || activeFilter === 'actionable';
  const hasCurrentResults = loadedQueryKey === messageQueryKey;
  const summaryPendingLabel = loading || (!hasCurrentResults && loadError === null) ? '正在读取…' : '暂不可用';

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const applyConfirmedMessageRead = (message: Message, requestQueryKey: string, requestSequence: number) => {
    markStoreMessageAsRead(message.id);
    if (messageQueryKeyRef.current !== requestQueryKey || latestMessageRequestRef.current !== requestSequence) {
      // The user changed filters/pages or started another read while this write was pending.
      // Keep the active query eligible to finish, then refresh it against the confirmed state.
      setLoading(true);
      setReloadKey((current) => current + 1);
      return;
    }

    latestMessageRequestRef.current += 1;
    setLoading(false);
    setMessages((current) => showUnreadOnly
      ? current.filter((item) => item.id !== message.id)
      : current.map((item) => (item.id === message.id ? { ...item, read: true } : item)));
    if (showUnreadOnly) setTotal((current) => Math.max(0, current - 1));
    setSummaryState((current) => current && current.actorId === userId ? {
      ...current,
      summary: {
        ...current.summary,
        unread: Math.max(0, current.summary.unread - 1),
        actionable: message.link ? Math.max(0, current.summary.actionable - 1) : current.summary.actionable,
      },
    } : current);
  };

  const setSingleMessageReadVerification = (actorId: number, recovery: PendingSingleMessageReadVerification | null) => {
    setSingleMessageReadVerificationByActor((current) => {
      const next = new Map(current);
      if (recovery) next.set(actorId, recovery);
      else next.delete(actorId);
      return next;
    });
  };

  const verifyPendingSingleMessageRead = async () => {
    const recovery = currentSingleMessageReadVerification;
    if (!recovery || userId == null || useAuthStore.getState().user?.id !== userId
      || verifyingSingleMessageReadActors.has(userId)) return;
    const actorId = userId;
    const requestQueryKey = messageQueryKeyRef.current;
    const requestSequence = latestMessageRequestRef.current;
    setVerifyingSingleMessageReadActors((current) => new Set(current).add(actorId));
    try {
      const status = await getMessageReadStatus(recovery.message.id);
      if (useAuthStore.getState().user?.id !== actorId) return;
      if (status.state === 'missing') {
        setSingleMessageReadVerification(actorId, null);
        addNotification({ title: '消息已不可用', message: '正在重新读取当前账号的消息列表。', type: 'warning' });
        setLoading(true);
        setReloadKey((current) => current + 1);
        return;
      }
      if (status.read) {
        setSingleMessageReadVerification(actorId, null);
        applyConfirmedMessageRead(recovery.message, requestQueryKey, requestSequence);
        addNotification({ title: '已读状态已核实', message: '消息已确认标记为已读。', type: 'success' });
        if (recovery.message.link) navigate(recovery.message.link);
        return;
      }
      setSingleMessageReadVerification(actorId, null);
      addNotification({ title: '消息仍未读', message: '服务器已确认消息仍未读；没有自动重试。再次点击消息可明确重试。', type: 'info' });
    } catch (error) {
      if (useAuthStore.getState().user?.id !== actorId) return;
      const reason = getUserFacingErrorMessage(error, '暂时无法核实消息状态');
      setSingleMessageReadVerification(actorId, { ...recovery, error: reason });
      addNotification({ title: '消息结果待核实', message: '暂时无法核实这条消息。核实前不会再次提交。', type: 'warning' });
    } finally {
      setVerifyingSingleMessageReadActors((current) => {
        if (!current.has(actorId)) return current;
        const next = new Set(current);
        next.delete(actorId);
        return next;
      });
    }
  };

  const handleMessageClick = async (message: Message) => {
    if (!message.read) {
      if (currentSingleMessageReadVerification) return;
      const requestQueryKey = messageQueryKey;
      const requestSequence = latestMessageRequestRef.current;
      const requestActorId = userId;
      if (requestActorId == null || useAuthStore.getState().user?.id !== requestActorId) return;
      const actorMarkingIds = markingMessageIdsByActorRef.current.get(requestActorId);
      if (actorMarkingIds?.size) return;
      const nextMarkingByActor = new Map(markingMessageIdsByActorRef.current);
      const nextActorMarkingIds = new Set(actorMarkingIds ?? []);
      nextActorMarkingIds.add(message.id);
      nextMarkingByActor.set(requestActorId, nextActorMarkingIds);
      markingMessageIdsByActorRef.current = nextMarkingByActor;
      setMarkingMessageIdsByActor(nextMarkingByActor);
      let confirmedRead = false;

      try {
        await markMessageAsRead(message.id);
        if (useAuthStore.getState().user?.id !== requestActorId) return;
        applyConfirmedMessageRead(message, requestQueryKey, requestSequence);
        confirmedRead = true;
      } catch {
        if (useAuthStore.getState().user?.id !== requestActorId) return;
        try {
          const status = await getMessageReadStatus(message.id);
          if (useAuthStore.getState().user?.id !== requestActorId) return;
          if (status.state === 'available' && status.read) {
            applyConfirmedMessageRead(message, requestQueryKey, requestSequence);
            confirmedRead = true;
          } else if (status.state === 'missing') {
            addNotification({ title: '消息已不可用', message: '正在重新读取当前账号的消息列表。', type: 'warning' });
            setLoading(true);
            setReloadKey((current) => current + 1);
          } else {
            addNotification({
              title: '标记已读失败',
              message: '服务器已确认消息仍未读；没有自动重试。再次点击消息可明确重试。',
              type: 'error',
            });
          }
        } catch (verificationError) {
          if (useAuthStore.getState().user?.id !== requestActorId) return;
          const reason = verificationError instanceof Error ? verificationError.message : '暂时无法核实消息状态';
          setSingleMessageReadVerification(requestActorId, { message, error: reason });
          addNotification({
            title: '消息结果待核实',
            message: '暂时无法核实这条消息。核实前不会再次提交。',
            type: 'warning',
          });
        }
        if (!confirmedRead) return;
        addNotification({ title: '已读状态已核实', message: '消息已确认标记为已读。', type: 'success' });
      } finally {
        const activeActorMarkingIds = markingMessageIdsByActorRef.current.get(requestActorId);
        if (activeActorMarkingIds?.has(message.id)) {
          const nextMarkingByActor = new Map(markingMessageIdsByActorRef.current);
          const nextActorMarkingIds = new Set(activeActorMarkingIds);
          nextActorMarkingIds.delete(message.id);
          if (nextActorMarkingIds.size === 0) nextMarkingByActor.delete(requestActorId);
          else nextMarkingByActor.set(requestActorId, nextActorMarkingIds);
          markingMessageIdsByActorRef.current = nextMarkingByActor;
          setMarkingMessageIdsByActor(nextMarkingByActor);
        }
      }

      if (confirmedRead && message.link && useAuthStore.getState().user?.id === requestActorId) {
        navigate(message.link);
      }
      return;
    }

    if (message.link) {
      navigate(message.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    const canExplicitlyRetry = pendingMessageReadAllRecovery !== null && messageReadAllRecoveryState === 'not_found';
    if (markingAllRef.current || markingAll || loading || !userId || currentSingleMessageReadVerification
      || messageReadAllRecoveryError !== null
      || (pendingMessageReadAllRecovery !== null && !canExplicitlyRetry)
      || (!canExplicitlyRetry && (unreadCount === null || unreadCount === 0))) return;

    let recovery = pendingMessageReadAllRecovery;
    if (!recovery) {
      try {
        recovery = { actorId: userId, requestId: createMessageReadAllRequestId() };
        persistMessageReadAllRecovery(recovery);
        setPendingMessageReadAllRecovery(recovery);
        setMessageReadAllRecoveryError(null);
      } catch (error) {
        const message = getUserFacingErrorMessage(error, '无法安全保存批量已读请求编号；请检查浏览器存储设置后重试。');
        setMessageReadAllRecoveryError(message);
        setMessageReadAllRecoveryState('unavailable');
        setMessageReadAllOutcomeNotice(message);
        addNotification({ title: '无法安全发起批量已读', message, type: 'error' });
        return;
      }
    }
    if (recovery.actorId !== userId) return;

    markingAllRef.current = true;
    setMarkingAll(true);
    setMessageReadAllRecoveryState('submitting');
    setMessageReadAllOutcomeNotice('正在提交批量已读请求…');
    try {
      const result = await markAllAsRead(undefined, recovery.requestId);
      if (useAuthStore.getState().user?.id !== recovery.actorId
        || pendingMessageReadAllRecoveryRef.current?.requestId !== recovery.requestId) return;
      removeMessageReadAllRecovery(recovery.actorId);
      setPendingMessageReadAllRecovery(null);
      setMessageReadAllRecoveryState(null);
      setMessageReadAllRecoveryError(null);
      setMessageReadAllOutcomeNotice(`已确认将 ${result.updatedCount} 条未读消息标记为已读，正在读取最新状态。`);
      latestMessageRequestRef.current += 1;
      // Re-read the authoritative summary and current page after the write. A message can arrive
      // after the transaction commits but before this response reaches the browser.
      scheduleMessageReadAllRefresh();
      addNotification({
        title: '操作成功',
        message: result.updatedCount > 0
          ? `已将 ${result.updatedCount} 条未读消息标记为已读`
          : '当前没有需要标记的未读消息',
        type: 'success',
      });
    } catch (error) {
      const isCurrentRequest = useAuthStore.getState().user?.id === recovery.actorId
        && pendingMessageReadAllRecoveryRef.current?.requestId === recovery.requestId;
      if (isCurrentRequest) {
        setMessageReadAllRecoveryState('checking');
        setMessageReadAllOutcomeNotice('批量已读请求结果尚未确认；系统正在只读核实，不会自动重发。');
        void verifyMessageReadAllStatus(recovery);
        addNotification({
          title: '批量已读结果待核实',
          message: getUserFacingErrorMessage(error, '服务端结果未确认；系统将先只读核实，不会盲目重复提交。'),
          type: 'error',
        });
      }
    } finally {
      const isCurrentActor = useAuthStore.getState().user?.id === recovery.actorId;
      const sameRequestStillPending = isCurrentActor
        && pendingMessageReadAllRecoveryRef.current?.requestId === recovery.requestId;
      if (isCurrentActor && !markingAllRefreshPendingRef.current && !sameRequestStillPending) {
        markingAllRef.current = false;
        setMarkingAll(false);
      }
    }
  };

  const handleClearAll = async () => {
    if (currentPendingClearRecovery && currentClearRecoveryState !== 'not_found') {
      if (currentClearRecoveryState === 'unavailable') setClearRecoveryState('checking');
      return;
    }

    if (!userId) {
      addNotification({ title: '无法清空消息', message: '当前登录状态不可用，请重新登录后再试。', type: 'error' });
      return;
    }

    if (clearingActorIdsRef.current.has(userId)) return;

    let recovery = currentPendingClearRecovery;
    if (!recovery) {
      try {
        recovery = { version: MESSAGE_CLEAR_RECOVERY_VERSION, actorId: userId, requestId: createMessageClearRequestId() };
        persistMessageClearRecovery(recovery);
        setPendingClearRecovery(recovery);
      } catch (error) {
        addNotification({ title: '无法安全发起清空', message: getUserFacingErrorMessage(error, '无法安全准备清空请求编号；请检查浏览器存储设置后重试。'), type: 'error' });
        return;
      }
    }

    if (recovery.actorId !== userId) return;
    const nextClearingActorIds = new Set(clearingActorIdsRef.current).add(recovery.actorId);
    clearingActorIdsRef.current = nextClearingActorIds;
    setClearingActorIds(nextClearingActorIds);
    setClearRecoveryState('submitting');
    try {
      const result = await clearMessages(recovery.requestId);
      removeMessageClearRecovery(recovery.actorId);
      // A late response from a previous account must not update the current account's inbox.
      if (useAuthStore.getState().user?.id !== recovery.actorId) return;
      setPendingClearRecovery(null);
      setClearRecoveryState(null);
      setShowClearConfirm(false);
      setClearOutcomeNoticeForActor(recovery.actorId, `清空请求已确认（处理 ${result.deletedCount} 条原有消息）；正在重新读取，以保留之后到达的新消息。`);
      latestMessageRequestRef.current += 1;
      setLoading(true);
      setPage(1);
      setReloadKey((current) => current + 1);
      addNotification({ title: '操作成功', message: `已清空 ${result.deletedCount} 条消息，正在重新读取最新消息。`, type: 'success' });
    } catch (error) {
      if (useAuthStore.getState().user?.id !== recovery.actorId) return;
      setClearRecoveryState('checking');
      addNotification({ title: '清空结果待核实', message: getUserFacingErrorMessage(error, '服务端结果未确认；系统将先只读核实，不会盲目重复删除。'), type: 'error' });
    } finally {
      const activeClearingActorIds = clearingActorIdsRef.current;
      if (activeClearingActorIds.has(recovery.actorId)) {
        const nextActiveClearingActorIds = new Set(activeClearingActorIds);
        nextActiveClearingActorIds.delete(recovery.actorId);
        clearingActorIdsRef.current = nextActiveClearingActorIds;
        setClearingActorIds(nextActiveClearingActorIds);
      }
    }
  };

  return {
    userId,
    messages,
    loading,
    loadError,
    setReloadKey,
    page,
    setPage,
    total,
    summary,
    unreadCount,
    summaryPendingLabel,
    totalPages,
    activeFilter,
    setActiveFilter,
    filteredMessages,
    hasCurrentResults,
    showUnreadOnly,
    pendingMessageReadAllRecovery,
    messageReadAllRecoveryState,
    messageReadAllRecoveryError,
    messageReadAllOutcomeNotice,
    recheckMessageReadAllRecovery,
    markingAll,
    handleMarkAllAsRead,
    currentActorMarkingMessageIds,
    currentSingleMessageReadVerification,
    verifyingSingleMessageReadActors,
    verifyPendingSingleMessageRead,
    currentActorClearing,
    currentPendingClearRecovery,
    currentClearRecoveryState,
    currentClearOutcomeNotice,
    currentShowClearConfirm,
    setClearConfirmActorId,
    setShowClearConfirm,
    handleClearAll,
    handleMessageClick,
  };
}

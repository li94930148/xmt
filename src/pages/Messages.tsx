import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Inbox,
  Radio,
  Trash2,
  XCircle,
} from 'lucide-react';
import { getMessages, getMessageClearRequestStatus, getMessageReadAllRequestStatus, markMessageAsRead, markAllAsRead, clearMessages } from '../api';
import { ConfirmModal, LoadingState } from '../components/common';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  MetricCard,
  PageHeader,
  PageShell,
  StatusPill,
} from '../components/studio';
import { formatBeijingTime } from '../lib/utils';
import { useAppStore, useAuthStore, useMessageStore } from '../store';
import type { Message } from '../types';

const MESSAGE_PAGE_SIZE = 20;
const MESSAGE_CLEAR_RECOVERY_VERSION = 1;
const MESSAGE_CLEAR_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_READ_ALL_RECOVERY_VERSION = 1;
const MESSAGE_READ_ALL_REQUEST_ID_PATTERN = MESSAGE_CLEAR_REQUEST_ID_PATTERN;

interface StoredMessageClearRecovery {
  version: 1;
  actorId: number;
  requestId: string;
}

type MessageClearRecoveryState = 'checking' | 'not_found' | 'unavailable' | 'submitting' | null;

interface StoredMessageReadAllRecovery {
  actorId: number;
  requestId: string;
}

type MessageReadAllRecoveryState = 'checking' | 'not_found' | 'unavailable' | 'submitting' | null;

type MessageReadAllRecoveryRead =
  | { recovery: StoredMessageReadAllRecovery | null; error: null }
  | { recovery: null; error: string };

function messageClearRecoveryStorageKey(actorId: number) {
  return `xmt:message-clear-pending:v${MESSAGE_CLEAR_RECOVERY_VERSION}:actor:${actorId}`;
}

function readMessageClearRecovery(actorId: number | null | undefined): StoredMessageClearRecovery | null {
  if (typeof window === 'undefined' || !actorId) return null;
  try {
    const raw = window.sessionStorage.getItem(messageClearRecoveryStorageKey(actorId));
    if (!raw || raw.length > 2_048) return null;
    const value = JSON.parse(raw) as Partial<StoredMessageClearRecovery> | null;
    if (!value || value.version !== MESSAGE_CLEAR_RECOVERY_VERSION || value.actorId !== actorId
      || typeof value.requestId !== 'string' || !MESSAGE_CLEAR_REQUEST_ID_PATTERN.test(value.requestId)) return null;
    return { version: MESSAGE_CLEAR_RECOVERY_VERSION, actorId, requestId: value.requestId.toLowerCase() };
  } catch {
    return null;
  }
}

function persistMessageClearRecovery(recovery: StoredMessageClearRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存清空请求编号');
  window.sessionStorage.setItem(messageClearRecoveryStorageKey(recovery.actorId), JSON.stringify(recovery));
}

function removeMessageClearRecovery(actorId: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(messageClearRecoveryStorageKey(actorId));
  } catch {
    // A stale marker is safe: recovery only performs an actor-scoped status read.
  }
}

function createMessageClearRequestId() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    throw new Error('当前浏览器无法生成安全的清空请求编号');
  }
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function messageReadAllRecoveryStorageKey(actorId: number) {
  return `xmt:message-read-all-pending:v${MESSAGE_READ_ALL_RECOVERY_VERSION}:actor:${actorId}`;
}

function readMessageReadAllRecovery(actorId: number | null | undefined): MessageReadAllRecoveryRead {
  if (typeof window === 'undefined' || !Number.isSafeInteger(actorId) || !actorId) return { recovery: null, error: null };
  try {
    const raw = window.sessionStorage.getItem(messageReadAllRecoveryStorageKey(actorId));
    if (!raw) return { recovery: null, error: null };
    if (raw.length > 2_048) throw new Error('恢复标记超出允许大小');
    const value = JSON.parse(raw) as Partial<StoredMessageReadAllRecovery> | null;
    if (!value || value.actorId !== actorId || typeof value.requestId !== 'string'
      || !MESSAGE_READ_ALL_REQUEST_ID_PATTERN.test(value.requestId)) {
      throw new Error('恢复标记格式无法确认');
    }
    return { recovery: { actorId, requestId: value.requestId.toLowerCase() }, error: null };
  } catch {
    return { recovery: null, error: '无法安全读取批量已读恢复标记；核实前不会再次提交。请重试只读检查。' };
  }
}

function persistMessageReadAllRecovery(recovery: StoredMessageReadAllRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存批量已读请求编号');
  try {
    window.sessionStorage.setItem(messageReadAllRecoveryStorageKey(recovery.actorId), JSON.stringify(recovery));
  } catch {
    throw new Error('当前浏览器无法安全保存批量已读请求编号');
  }
}

function removeMessageReadAllRecovery(actorId: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(messageReadAllRecoveryStorageKey(actorId));
  } catch {
    // A stale marker is safe: the next visit only performs an actor-scoped status read.
  }
}

function createMessageReadAllRequestId() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    throw new Error('当前浏览器无法生成安全的批量已读请求编号');
  }
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

type MessageFilter = 'all' | 'unread' | 'actionable' | 'system';

const filters: { key: MessageFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'actionable', label: '待处理' },
  { key: 'system', label: '系统' },
];

const typeMeta: Record<string, { icon: ReactNode; tone: 'success' | 'coral' | 'amber' | 'cyan'; label: string }> = {
  success: { icon: <CheckCircle className="h-5 w-5" />, tone: 'success', label: '完成' },
  error: { icon: <XCircle className="h-5 w-5" />, tone: 'coral', label: '异常' },
  warning: { icon: <AlertTriangle className="h-5 w-5" />, tone: 'amber', label: '提醒' },
  info: { icon: <Info className="h-5 w-5" />, tone: 'cyan', label: '通知' },
};

export default function Messages() {
  const userId = useAuthStore((state) => state.user?.id);
  const [initialMessageReadAllRecovery] = useState(() => readMessageReadAllRecovery(useAuthStore.getState().user?.id));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total: 0, unread: 0, actionable: 0 });
  const [searchParams] = useSearchParams();
  const [initialClearRecovery] = useState(() => readMessageClearRecovery(useAuthStore.getState().user?.id));
  const [pendingClearRecovery, setPendingClearRecovery] = useState<StoredMessageClearRecovery | null>(initialClearRecovery);
  const [clearRecoveryState, setClearRecoveryState] = useState<MessageClearRecoveryState>(initialClearRecovery ? 'checking' : null);
  const [clearOutcomeNotice, setClearOutcomeNotice] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(Boolean(initialClearRecovery));
  const [clearing, setClearing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingMessageReadAllRecovery, setPendingMessageReadAllRecoveryState] = useState<StoredMessageReadAllRecovery | null>(initialMessageReadAllRecovery.recovery);
  const [messageReadAllRecoveryState, setMessageReadAllRecoveryState] = useState<MessageReadAllRecoveryState>(
    initialMessageReadAllRecovery.recovery ? 'checking' : initialMessageReadAllRecovery.error ? 'unavailable' : null,
  );
  const [messageReadAllRecoveryError, setMessageReadAllRecoveryError] = useState<string | null>(initialMessageReadAllRecovery.error);
  const [messageReadAllOutcomeNotice, setMessageReadAllOutcomeNotice] = useState<string | null>(
    initialMessageReadAllRecovery.recovery ? '正在只读核实此前的批量已读请求；核实期间不会再次提交。' : initialMessageReadAllRecovery.error,
  );
  const [activeFilter, setActiveFilter] = useState<MessageFilter>(() => searchParams.get('filter') === 'actionable' ? 'actionable' : 'all');
  const markingMessageIdsRef = useRef(new Set<number>());
  const markingAllRefreshPendingRef = useRef(false);
  const markingAllRef = useRef(false);
  const pendingMessageReadAllRecoveryRef = useRef(initialMessageReadAllRecovery.recovery);
  const messageReadAllVerificationRef = useRef<string | null>(null);
  const activeMessageReadAllActorRef = useRef(userId);
  const clearingRef = useRef(false);
  const activeClearActorRef = useRef(userId);
  const latestMessageRequestRef = useRef(0);
  const loadedQueryKeyRef = useRef<string | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [markingMessageIds, setMarkingMessageIds] = useState<Set<number>>(() => new Set());

  const navigate = useNavigate();
  const messageQueryKey = JSON.stringify([userId ?? null, page, activeFilter]);
  const messageQueryKeyRef = useRef(messageQueryKey);
  messageQueryKeyRef.current = messageQueryKey;
  const addNotification = useAppStore((state) => state.addNotification);
  const setStoreMessages = useMessageStore((state) => state.setMessages);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);

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
    const refreshMessages = () => setReloadKey((current) => current + 1);
    window.addEventListener('xmt-messages-refresh', refreshMessages);
    return () => window.removeEventListener('xmt-messages-refresh', refreshMessages);
  }, []);

  useEffect(() => {
    if (activeClearActorRef.current === userId) return;
    activeClearActorRef.current = userId;
    const recovery = readMessageClearRecovery(userId);
    setPendingClearRecovery(recovery);
    setClearRecoveryState(recovery ? 'checking' : null);
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
    if (!pendingClearRecovery || clearRecoveryState !== 'checking') return;
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
          setClearOutcomeNotice(`上次清空请求已确认（处理 ${status.deletedCount} 条原有消息）；正在重新读取，以保留之后到达的新消息。`);
          setLoading(true);
          latestMessageRequestRef.current += 1;
          setPage(1);
          setReloadKey((current) => current + 1);
          addNotification({ title: '清空结果已核实', message: '不会重复清空；正在重新读取最新消息。', type: 'success' });
          return;
        }
        setClearRecoveryState('not_found');
        setClearOutcomeNotice('服务器暂未找到这条清空请求的完成记录。确认重试会沿用原请求编号；若原请求稍后完成，服务器只返回原结果，不会再次删除后来到达的消息。');
      })
      .catch(() => {
        if (!active || useAuthStore.getState().user?.id !== recovery.actorId) return;
        setClearRecoveryState('unavailable');
        setClearOutcomeNotice('暂时无法核实上次清空结果。恢复编号已保留，请只读重新核实；核实前不会再次发送删除请求。');
      });
    return () => { active = false; };
  }, [addNotification, clearRecoveryState, pendingClearRecovery, userId]);

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
        setSummary(result.summary);
        loadedQueryKeyRef.current = messageQueryKey;
        setLoadedQueryKey(messageQueryKey);
        setStoreMessages(result.data);
        setUnreadCount(result.summary.unread);
        setClearOutcomeNotice(null);
      })
      .catch((error) => {
        if (!active || requestId !== latestMessageRequestRef.current) return;
        const message = error instanceof Error ? error.message : '请检查网络后重试';
        if (loadedQueryKeyRef.current !== messageQueryKey) {
          setMessages([]);
          setTotal(0);
          setSummary({ total: 0, unread: 0, actionable: 0 });
          setLoadedQueryKey(null);
          loadedQueryKeyRef.current = null;
          setStoreMessages([]);
          setUnreadCount(0);
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
  }, [activeFilter, addNotification, messageQueryKey, page, reloadKey, setStoreMessages, setUnreadCount]);

  const totalPages = Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE));
  const unreadCount = summary.unread;
  const actionableCount = summary.actionable;
  const filteredMessages = messages;
  const showUnreadOnly = activeFilter === 'unread' || activeFilter === 'actionable';
  const hasCurrentResults = loadedQueryKey === messageQueryKey;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleMessageClick = async (message: Message) => {
    if (!message.read) {
      if (markingMessageIdsRef.current.has(message.id)) return;
      const requestQueryKey = messageQueryKey;
      const requestSequence = latestMessageRequestRef.current;
      markingMessageIdsRef.current.add(message.id);
      setMarkingMessageIds(new Set(markingMessageIdsRef.current));

      try {
        await markMessageAsRead(message.id);
        markStoreMessageAsRead(message.id);

        if (messageQueryKeyRef.current !== requestQueryKey || latestMessageRequestRef.current !== requestSequence) {
          // The user changed filters/pages or started another read while this write was pending.
          // Keep the active query eligible to finish, then refresh it against the confirmed write.
          setLoading(true);
          setReloadKey((current) => current + 1);
        } else {
          latestMessageRequestRef.current += 1;
          setLoading(false);
          setMessages((current) => showUnreadOnly
            ? current.filter((item) => item.id !== message.id)
            : current.map((item) => (item.id === message.id ? { ...item, read: true } : item)));
          if (showUnreadOnly) setTotal((current) => Math.max(0, current - 1));
          setSummary((current) => ({
            ...current,
            unread: Math.max(0, current.unread - 1),
            actionable: message.link ? Math.max(0, current.actionable - 1) : current.actionable,
          }));
        }
      } catch (error) {
        addNotification({
          title: '标记已读失败',
          message: error instanceof Error ? error.message : '消息仍保持未读，请稍后重试',
          type: 'error',
        });
        return;
      } finally {
        markingMessageIdsRef.current.delete(message.id);
        setMarkingMessageIds(new Set(markingMessageIdsRef.current));
      }
    }

    if (message.link) {
      navigate(message.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    const canExplicitlyRetry = pendingMessageReadAllRecovery !== null && messageReadAllRecoveryState === 'not_found';
    if (markingAllRef.current || markingAll || loading || !userId
      || messageReadAllRecoveryError !== null
      || (pendingMessageReadAllRecovery !== null && !canExplicitlyRetry)
      || (!canExplicitlyRetry && unreadCount === 0)) return;

    let recovery = pendingMessageReadAllRecovery;
    if (!recovery) {
      try {
        recovery = { actorId: userId, requestId: createMessageReadAllRequestId() };
        persistMessageReadAllRecovery(recovery);
        setPendingMessageReadAllRecovery(recovery);
        setMessageReadAllRecoveryError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : '无法安全保存批量已读请求编号';
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
          message: error instanceof Error ? error.message : '服务端结果未确认；系统将先只读核实，不会盲目重复提交。',
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
    if (clearingRef.current) return;

    if (pendingClearRecovery && clearRecoveryState !== 'not_found') {
      if (clearRecoveryState === 'unavailable') setClearRecoveryState('checking');
      return;
    }

    if (!userId) {
      addNotification({ title: '无法清空消息', message: '当前登录状态不可用，请重新登录后再试。', type: 'error' });
      return;
    }

    let recovery = pendingClearRecovery;
    if (!recovery) {
      try {
        recovery = { version: MESSAGE_CLEAR_RECOVERY_VERSION, actorId: userId, requestId: createMessageClearRequestId() };
        persistMessageClearRecovery(recovery);
        setPendingClearRecovery(recovery);
      } catch (error) {
        addNotification({ title: '无法安全发起清空', message: error instanceof Error ? error.message : '请检查浏览器存储设置后重试', type: 'error' });
        return;
      }
    }

    if (recovery.actorId !== userId) return;
    clearingRef.current = true;
    setClearing(true);
    setClearRecoveryState('submitting');
    try {
      const result = await clearMessages(recovery.requestId);
      removeMessageClearRecovery(recovery.actorId);
      setPendingClearRecovery(null);
      setClearRecoveryState(null);
      setShowClearConfirm(false);
      setClearOutcomeNotice(`清空请求已确认（处理 ${result.deletedCount} 条原有消息）；正在重新读取，以保留之后到达的新消息。`);
      latestMessageRequestRef.current += 1;
      setLoading(true);
      setPage(1);
      setReloadKey((current) => current + 1);
      addNotification({ title: '操作成功', message: `已清空 ${result.deletedCount} 条消息，正在重新读取最新消息。`, type: 'success' });
    } catch (error) {
      setClearRecoveryState('checking');
      addNotification({ title: '清空结果待核实', message: error instanceof Error ? error.message : '服务端结果未确认；系统将先只读核实，不会盲目重复删除。', type: 'error' });
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  };

  return (
    <>
      <PageShell>
        <PageHeader
          title="消息中心"
          description="聚合协作提醒、审核反馈和系统通知，优先处理仍未读的内容节点。"
          actions={
            <>
              {(pendingMessageReadAllRecovery && messageReadAllRecoveryState === 'unavailable') || messageReadAllRecoveryError ? (
                <ActionButton type="button" variant="ghost" onClick={recheckMessageReadAllRecovery} disabled={markingAll}>
                  只读核实
                </ActionButton>
              ) : null}
              <ActionButton onClick={handleMarkAllAsRead}
                disabled={loading || markingAll || messageReadAllRecoveryError !== null
                  || (pendingMessageReadAllRecovery !== null && messageReadAllRecoveryState !== 'not_found')
                  || (unreadCount === 0 && !(pendingMessageReadAllRecovery && messageReadAllRecoveryState === 'not_found'))}>
                <CheckCircle2 className="h-4 w-4" />
                {markingAll || messageReadAllRecoveryState === 'checking' || messageReadAllRecoveryState === 'submitting'
                  ? '处理中'
                  : messageReadAllRecoveryError || messageReadAllRecoveryState === 'unavailable'
                    ? '结果待核实'
                    : pendingMessageReadAllRecovery && messageReadAllRecoveryState === 'not_found'
                      ? '确认重试全部已读'
                      : '全部已读'}
              </ActionButton>
              <ActionButton onClick={() => setShowClearConfirm(true)} variant="danger" disabled={clearing}>
                <Trash2 className="h-4 w-4" />
                {pendingClearRecovery ? '核实清空' : '清空'}
              </ActionButton>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard title="未读消息" value={unreadCount} trend={{ label: '需要关注', up: unreadCount === 0 }} icon={Bell} tone="cyan" />
          <MetricCard title="待处理跳转" value={actionableCount} trend={{ label: '关联业务页面', up: actionableCount === 0 }} icon={Radio} tone="violet" />
          <MetricCard title="消息总量" value={summary.total} trend={{ label: '本地通知流', up: true }} icon={Inbox} tone="amber" />
        </div>

        <GlassPanel className="overflow-hidden">
          {messageReadAllOutcomeNotice ? (
            <div role="status" className="border-b border-studio-border-soft bg-studio-primary-soft px-5 py-3 text-sm leading-6 text-studio-text-primary">
              {messageReadAllOutcomeNotice}
            </div>
          ) : null}
          {clearOutcomeNotice ? (
            <div role="status" className="border-b border-studio-border-soft bg-studio-primary-soft px-5 py-3 text-sm leading-6 text-studio-text-primary">
              {clearOutcomeNotice}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 border-b border-studio-border-soft px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={activeFilter === filter.key}
                  onClick={() => {
                    setPage(1);
                    setActiveFilter(filter.key);
                  }}
                  className={`min-h-10 rounded-button border px-3 py-2 text-sm font-semibold leading-snug transition ${
                    activeFilter === filter.key
                      ? 'border-studio-border-active bg-studio-primary/14 text-studio-text-primary'
                      : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary hover:border-studio-border-active hover:text-studio-text-primary'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-studio-text-secondary">本页 {filteredMessages.length} 条，共 {total} 条</span>
          </div>

          {loading ? (
            <div className="px-6 py-12">
              <LoadingState type="section" text="正在同步消息流..." />
            </div>
          ) : loadError && !hasCurrentResults ? (
            <div className="flex flex-col items-center gap-4 p-6">
              <EmptyState icon={AlertTriangle} title="消息加载失败" description={loadError} />
              <ActionButton type="button" onClick={() => setReloadKey((current) => current + 1)}>重试加载</ActionButton>
            </div>
          ) : (
            <>
              {loadError ? (
                <div role="alert" className="flex flex-col gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-5 py-4 text-studio-text-primary md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber-contrast" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">刷新失败，仍显示上次成功加载的消息</p>
                      <p className="mt-1 break-words text-sm text-studio-text-secondary">{loadError} 当前内容可能不是最新。</p>
                    </div>
                  </div>
                  <ActionButton type="button" onClick={() => setReloadKey((current) => current + 1)}>重新加载</ActionButton>
                </div>
              ) : null}
              {messages.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Bell} title="暂无消息" description="协作通知、审核反馈和系统提醒会出现在这里。" />
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Inbox} title="当前筛选无消息" description="切换筛选条件查看其他消息类型。" />
                </div>
              ) : (
                <div className="divide-y divide-studio-border-soft">
                  {filteredMessages.map((message) => {
                    const meta = typeMeta[message.type] || typeMeta.info;
                    const isMarking = markingMessageIds.has(message.id);

                    return (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => handleMessageClick(message)}
                        disabled={isMarking}
                        aria-busy={isMarking}
                        className={`group w-full px-5 py-4 text-left transition hover:bg-studio-surface-soft ${
                          !message.read ? 'bg-studio-primary/[0.055] shadow-[inset_3px_0_0_rgba(34,211,238,0.65)]' : ''
                        } ${isMarking ? 'cursor-wait' : message.link ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border bg-studio-surface-soft ${
                            meta.tone === 'success'
                              ? 'border-studio-success/35 text-studio-success-contrast'
                              : meta.tone === 'coral'
                                ? 'border-studio-coral/35 text-studio-coral-contrast'
                                : meta.tone === 'amber'
                                  ? 'border-studio-amber/35 text-studio-amber-contrast'
                                  : 'border-studio-cyan/35 text-studio-cyan-contrast'
                          }`}
                          >
                            {meta.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-studio-text-primary">{message.title}</h3>
                              <StatusPill tone={message.read ? 'muted' : 'cyan'}>{isMarking ? '标记中' : message.read ? '已读' : '未读'}</StatusPill>
                              {message.link ? <ExternalLink className="h-4 w-4 text-studio-text-muted opacity-60 transition group-hover:opacity-100" /> : null}
                            </div>
                            <p className="mt-1 text-sm leading-6 text-studio-text-secondary">{message.content}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                              <span>{formatBeijingTime(message.created_at)}</span>
                              <span>{meta.label}</span>
                              {message.link ? <span className="text-studio-cyan-contrast">可进入关联页面</span> : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!loading && (!loadError || hasCurrentResults) && total > MESSAGE_PAGE_SIZE ? (
            <div className="flex flex-col gap-3 border-t border-studio-border-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-studio-text-secondary">共 {total} 条，第 {page} / {totalPages} 页</span>
              <div className="flex items-center gap-2">
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> 上一页
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </ActionButton>
              </div>
            </div>
          ) : null}
        </GlassPanel>
      </PageShell>

      <ConfirmModal
        open={showClearConfirm}
        title={pendingClearRecovery ? '核实清空消息结果' : '确认清空消息'}
        description={pendingClearRecovery
          ? clearRecoveryState === 'checking'
            ? '正在只读核实此前的清空请求；核实期间不会再次发送删除。'
            : clearRecoveryState === 'unavailable'
              ? '暂时无法核实此前的清空请求。恢复编号已保留，点击“只读重新核实”再次查询，不会重复删除。'
              : clearRecoveryState === 'not_found'
                ? '服务器暂未找到此前请求的完成记录。确认后将沿用原请求编号；如果原请求稍后完成，服务器会返回原结果，避免再次删除后来到达的消息。本次显式重试仍会清空当时账户内的消息。'
                : '清空请求正在提交，请稍候。'
          : '确定要清空当前账户的所有消息吗？操作不可恢复；若响应丢失，系统会先核实原请求，不会盲目重复清空。'}
        confirmText={pendingClearRecovery
          ? clearRecoveryState === 'unavailable' ? '只读重新核实' : clearRecoveryState === 'not_found' ? '同编号安全重试' : '正在核实'
          : '确认清空'}
        cancelText="取消"
        variant="danger"
        loading={clearing}
        confirmDisabled={Boolean(pendingClearRecovery && clearRecoveryState !== 'unavailable' && clearRecoveryState !== 'not_found')}
        onConfirm={handleClearAll}
        onCancel={() => {
          if (!clearing) {
            setShowClearConfirm(false);
          }
        }}
      />
    </>
  );
}

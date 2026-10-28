import { Bell, CheckCheck, Inbox, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMessageReadAllRequestStatus, getMessageReadStatus, getMessages, markAllAsRead, markMessageAsRead } from '@/api/messages';
import type { Message } from '@/types';
import { useAuthStore, useMessageStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { getMobileMessageCategory } from '@/platform/message-category';
import ErrorState from '@/components/common/ErrorState';

type Filter = 'all' | 'unread' | 'workflow' | 'collaboration' | 'system';
const PAGE_SIZE = 20;
const emptyMessages: Message[] = [];
const emptyMessageIds = new Set<number>();
const BULK_READ_RECOVERY_VERSION = 1;
const BULK_READ_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredBulkReadRecovery {
  actorId: number;
  requestId: string;
}

type BulkReadRecoveryPhase = 'checking' | 'not_found' | 'unavailable' | 'submitting';
interface BulkReadRecoveryState {
  actorId: number;
  requestId: string;
  phase: BulkReadRecoveryPhase;
}

interface PendingSingleMessageReadVerification {
  message: Message;
  error: string;
}

function bulkReadRecoveryStorageKey(actorId: number) {
  return `xmt:message-read-all-pending:v${BULK_READ_RECOVERY_VERSION}:actor:${actorId}`;
}

function readBulkReadRecovery(actorId: number | null | undefined): StoredBulkReadRecovery | null {
  if (!Number.isSafeInteger(actorId) || !actorId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(bulkReadRecoveryStorageKey(actorId));
    if (!raw || raw.length > 2_048) return null;
    const value = JSON.parse(raw) as Partial<StoredBulkReadRecovery> | null;
    if (!value || value.actorId !== actorId
      || typeof value.requestId !== 'string' || !BULK_READ_REQUEST_ID_PATTERN.test(value.requestId)) return null;
    return { actorId, requestId: value.requestId.toLowerCase() };
  } catch {
    return null;
  }
}

function persistBulkReadRecovery(recovery: StoredBulkReadRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存批量已读请求编号');
  try {
    window.sessionStorage.setItem(bulkReadRecoveryStorageKey(recovery.actorId), JSON.stringify(recovery));
  } catch {
    throw new Error('当前浏览器无法安全保存批量已读请求编号');
  }
}

function removeBulkReadRecovery(actorId: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(bulkReadRecoveryStorageKey(actorId));
  } catch {
    // A stale marker is safe: the next visit only performs an actor-scoped status read.
  }
}

function createBulkReadRequestId() {
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

export default function MobileMessages() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const cacheKey = userSafeDraftKey(userId, 'messages:recent');
  const [itemsState, setItemsState] = useState<{ key: string | null; items: Message[] }>(() => ({
    key: cacheKey, items: cacheKey ? readSafeDraftValue<Message[]>(cacheKey) ?? [] : [],
  }));
  const items = itemsState.key === cacheKey ? itemsState.items : emptyMessages;
  const setItems = useCallback((update: Message[] | ((current: Message[]) => Message[])) => setItemsState((current) => {
    const previous = current.key === cacheKey ? current.items : emptyMessages;
    return { key: cacheKey, items: typeof update === 'function' ? update(previous) : update };
  }), [cacheKey]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [notice, setNotice] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadSummary, setUnreadSummary] = useState<{ actorId: number; count: number } | null>(null);
  const [markingIdsByActor, setMarkingIdsByActor] = useState<Map<number, Set<number>>>(() => new Map());
  const [singleMessageReadVerificationByActor, setSingleMessageReadVerificationByActor] = useState<Map<number, PendingSingleMessageReadVerification>>(() => new Map());
  const [verifyingSingleMessageReadActors, setVerifyingSingleMessageReadActors] = useState<Set<number>>(() => new Set());
  const [markingAllActorIds, setMarkingAllActorIds] = useState<Set<number>>(() => new Set());
  const [bulkReadRecovery, setBulkReadRecovery] = useState(() => readBulkReadRecovery(userId));
  const [bulkReadRecoveryState, setBulkReadRecoveryState] = useState<BulkReadRecoveryState | null>(() => {
    const recovery = readBulkReadRecovery(userId);
    return recovery ? { ...recovery, phase: 'checking' } : null;
  });
  const requestIdRef = useRef(0);
  const bulkReadInFlightActorIdsRef = useRef<Set<number>>(new Set());
  const setUnread = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);
  const networkState = useNetworkState();
  const markingIds = userId == null ? emptyMessageIds : markingIdsByActor.get(userId) ?? emptyMessageIds;
  const markingAll = userId != null && markingAllActorIds.has(userId);
  const currentSingleMessageReadVerification = userId == null ? null : singleMessageReadVerificationByActor.get(userId) ?? null;
  const currentBulkReadRecovery = useMemo(() => bulkReadRecovery?.actorId === userId
    ? bulkReadRecovery : readBulkReadRecovery(userId), [bulkReadRecovery, userId]);
  const currentBulkReadRecoveryState = currentBulkReadRecovery
    && bulkReadRecoveryState !== null
    && bulkReadRecoveryState.actorId === userId
    && bulkReadRecoveryState.requestId === currentBulkReadRecovery.requestId
    ? bulkReadRecoveryState : null;
  const bulkReadNeedsVerification = currentBulkReadRecovery !== null;
  const unreadCount = unreadSummary && unreadSummary.actorId === userId ? unreadSummary.count : null;
  const previousBulkReadRecoveryRef = useRef<StoredBulkReadRecovery | null>(currentBulkReadRecovery);

  const load = useCallback(async (preserveItems = false, preserveNotice = false, readFailureNotice?: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadingMore(false);
    setLoadError('');
    setLoadMoreError('');
    if (!preserveNotice) setNotice('');
    if (!preserveItems) {
      setItems([]);
      setPage(1);
      setTotal(0);
    }
    if (!cacheKey || userId == null) {
      setItems([]);
      setLoadError('登录状态已失效，请重新登录后再加载消息。');
      setLoading(false);
      return;
    }
    try {
      const result = await getMessages({
        page: 1,
        limit: PAGE_SIZE,
        ...(filter === 'unread' ? { read: 'unread' as const } : {}),
      });
      if (requestId !== requestIdRef.current || useAuthStore.getState().user?.id !== userId) return;
      setItems(result.data);
      setPage(result.page);
      setTotal(result.total);
      setUnreadSummary({ actorId: userId, count: result.summary.unread });
      setUnread(result.summary.unread);
      if (filter !== 'unread') writeSafeDraft(cacheKey, result.data);
    } catch (error) {
      if (requestId !== requestIdRef.current || useAuthStore.getState().user?.id !== userId) return;
      const cached = readSafeDraftValue<Message[]>(cacheKey);
      if (!preserveItems && cached?.length) {
        setItems(cached);
        setPage(1);
        setTotal(cached.length);
        setNotice('正在显示最近缓存的消息；恢复网络后可刷新。');
      } else if (preserveItems) {
        setNotice(readFailureNotice || (preserveNotice
          ? '已读操作已确认，但最新消息和未读数暂时无法同步；当前内容仍保留，可点刷新重试。'
          : '刷新消息失败；当前已加载内容仍保留，可重试。'));
      } else {
        setItems([]);
        setLoadError(error instanceof Error ? error.message : '加载消息失败，请重试。');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [cacheKey, filter, setItems, setUnread, userId]);

  const verifyBulkReadStatus = useCallback(async (recovery: StoredBulkReadRecovery) => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return;
    setLoading(false);
    setBulkReadRecoveryState({ ...recovery, phase: 'checking' });
    try {
      const result = await getMessageReadAllRequestStatus(recovery.requestId);
      const stored = readBulkReadRecovery(recovery.actorId);
      if (useAuthStore.getState().user?.id !== recovery.actorId
        || stored?.requestId !== recovery.requestId) return;

      if (result.state === 'processed' && Number.isSafeInteger(result.updatedCount) && result.updatedCount >= 0) {
        removeBulkReadRecovery(recovery.actorId);
        setBulkReadRecovery((current) => current?.actorId === recovery.actorId && current.requestId === recovery.requestId ? null : current);
        setBulkReadRecoveryState((current) => current?.actorId === recovery.actorId && current.requestId === recovery.requestId ? null : current);
        setUnreadSummary(null);
        setNotice(result.updatedCount > 0
          ? `已核实上次批量已读：处理了 ${result.updatedCount} 条消息，正在读取最新状态。`
          : '已核实上次批量已读：当时没有需要处理的消息，正在读取最新状态。');
        return;
      }

      if (result.state === 'not_found') {
        setBulkReadRecoveryState({ ...recovery, phase: 'not_found' });
        setUnreadSummary(null);
        setNotice('服务器尚未找到这次批量已读的完成记录。请求编号已保留；读取当前未读数后，可明确点击“确认重试全部已读”安全重试。');
        await load(true, true, '服务器尚未找到上次批量已读记录；当前消息暂时无法同步，请只读核实或稍后使用原编号安全重试。');
        return;
      }

      throw new Error('批量已读状态格式不正确');
    } catch {
      if (useAuthStore.getState().user?.id !== recovery.actorId) return;
      const stored = readBulkReadRecovery(recovery.actorId);
      if (stored?.requestId !== recovery.requestId) return;
      setBulkReadRecoveryState({ ...recovery, phase: 'unavailable' });
      setUnreadSummary(null);
      setNotice('暂时无法核实上次批量已读结果。请求编号已保留；核实前不会重发。请点击“只读核实”重试查询。');
    }
  }, [load]);

  const verifyBulkReadStatusRef = useRef(verifyBulkReadStatus);
  verifyBulkReadStatusRef.current = verifyBulkReadStatus;

  useEffect(() => {
    requestIdRef.current += 1;
    setLoadingMore(false);
    const recovery = readBulkReadRecovery(userId);
    setBulkReadRecovery(recovery);
    setBulkReadRecoveryState(recovery ? { ...recovery, phase: 'checking' } : null);
    setUnreadSummary(null);
    setNotice('');
    if (recovery) void verifyBulkReadStatusRef.current(recovery);
  }, [userId]);

  useEffect(() => {
    if (currentBulkReadRecovery) {
      previousBulkReadRecoveryRef.current = currentBulkReadRecovery;
      return;
    }
    const previous = previousBulkReadRecoveryRef.current;
    previousBulkReadRecoveryRef.current = null;
    if (previous?.actorId === userId) {
      void load(true, true, '上次批量已读已由服务器确认；最新消息暂时无法同步，当前未读数仍未知，可刷新重试。');
    } else {
      void load();
    }
  }, [currentBulkReadRecovery, load, userId]);
  useEffect(() => {
    const refreshMessages = () => {
      if (currentBulkReadRecovery) {
        if (currentBulkReadRecoveryState?.phase === 'checking' || currentBulkReadRecoveryState?.phase === 'submitting') return;
        void load(true, true);
        return;
      }
      void load(true);
    };
    window.addEventListener('xmt-messages-refresh', refreshMessages);
    return () => window.removeEventListener('xmt-messages-refresh', refreshMessages);
  }, [currentBulkReadRecovery, currentBulkReadRecoveryState?.phase, load]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !item.read;
    return getMobileMessageCategory(item) === filter;
  }), [filter, items]);
  const canLoadMore = items.length < total;

  const loadMore = async () => {
    const requestActorId = userId;
    if (!cacheKey || loadingMore || loading || !canLoadMore) return;
    if (requestActorId == null) return;
    if (networkState !== 'online') {
      setLoadMoreError('当前网络未恢复，恢复网络后可重试加载。');
      return;
    }
    setLoadingMore(true);
    setLoadMoreError('');
    const requestId = ++requestIdRef.current;
    try {
      const result = await getMessages({
        page: page + 1,
        limit: PAGE_SIZE,
        ...(filter === 'unread' ? { read: 'unread' as const } : {}),
      });
      if (requestId !== requestIdRef.current || useAuthStore.getState().user?.id !== requestActorId) return;
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const next = [...current, ...result.data.filter((item) => !existingIds.has(item.id))];
        if (filter !== 'unread') writeSafeDraft(cacheKey, next.slice(0, PAGE_SIZE));
        return next;
      });
      setPage(result.page);
      setTotal(result.total);
      setUnreadSummary({ actorId: requestActorId, count: result.summary.unread });
      setUnread(result.summary.unread);
    } catch (error) {
      if (requestId === requestIdRef.current && useAuthStore.getState().user?.id === requestActorId) setLoadMoreError(error instanceof Error ? error.message : '加载更多消息失败，请重试。');
    } finally {
      if (requestId === requestIdRef.current && useAuthStore.getState().user?.id === requestActorId) setLoadingMore(false);
    }
  };

  const setSingleMessageReadVerification = (actorId: number, recovery: PendingSingleMessageReadVerification | null) => {
    setSingleMessageReadVerificationByActor((current) => {
      const next = new Map(current);
      if (recovery) next.set(actorId, recovery);
      else next.delete(actorId);
      return next;
    });
  };

  const applyConfirmedMessageRead = (item: Message, actorId: number) => {
    if (cacheKey) {
      setItems((current) => {
        const next = current.map((candidate) => candidate.id === item.id ? { ...candidate, read: true } : candidate);
        const cached = readSafeDraftValue<Message[]>(cacheKey);
        if (cached) writeSafeDraft(cacheKey, cached.map((candidate) => candidate.id === item.id ? { ...candidate, read: true } : candidate));
        return next;
      });
    }
    setUnreadSummary((current) => {
      if (!current || current.actorId !== actorId) return current;
      return { actorId, count: Math.max(0, current.count - 1) };
    });
    markStoreMessageAsRead(item.id);
    setNotice('消息已确认标记为已读');
    if (filter === 'unread' && !item.link) void load(true);
  };

  const verifyPendingSingleMessageRead = async () => {
    const recovery = currentSingleMessageReadVerification;
    if (!recovery || userId == null || useAuthStore.getState().user?.id !== userId
      || verifyingSingleMessageReadActors.has(userId)) return;
    const actorId = userId;
    setVerifyingSingleMessageReadActors((current) => new Set(current).add(actorId));
    try {
      const status = await getMessageReadStatus(recovery.message.id);
      if (useAuthStore.getState().user?.id !== actorId) return;
      if (status.state === 'missing') {
        setSingleMessageReadVerification(actorId, null);
        setNotice('这条消息已不在当前账号的消息列表中，正在重新读取。');
        void load(true, true, '消息列表暂时无法刷新；已加载的内容仍保留。');
        return;
      }
      if (status.read) {
        setSingleMessageReadVerification(actorId, null);
        applyConfirmedMessageRead(recovery.message, actorId);
        if (recovery.message.link) navigate(recovery.message.link);
        return;
      }
      setSingleMessageReadVerification(actorId, null);
      setNotice('服务器已确认消息仍未读；没有自动重试。再次点击消息可明确重试。');
    } catch (error) {
      if (useAuthStore.getState().user?.id !== actorId) return;
      const reason = error instanceof Error ? error.message : '暂时无法核实消息状态';
      setSingleMessageReadVerification(actorId, { ...recovery, error: reason });
      setNotice('暂时无法核实这条消息；核实前不会再次提交。点击“只读核实”可重试查询。');
    } finally {
      setVerifyingSingleMessageReadActors((current) => {
        if (!current.has(actorId)) return current;
        const next = new Set(current);
        next.delete(actorId);
        return next;
      });
    }
  };

  const markRead = async (item: Message) => {
    const requestActorId = userId;
    if (!cacheKey || requestActorId == null || useAuthStore.getState().user?.id !== requestActorId) return;
    if (item.read) {
      if (item.link && useAuthStore.getState().user?.id === requestActorId) navigate(item.link);
      return;
    }
    if (markingIds.has(item.id) || (!item.read && markingIds.size > 0)
      || markingAll || bulkReadNeedsVerification || currentSingleMessageReadVerification) return;
    if (networkState !== 'online') { setNotice('当前网络未恢复，未读状态尚未同步；恢复网络后可重试。'); return; }
    setMarkingIdsByActor((current) => {
      const next = new Map(current);
      next.set(requestActorId, new Set(current.get(requestActorId) ?? []).add(item.id));
      return next;
    });
    try {
      await markMessageAsRead(item.id);
      if (useAuthStore.getState().user?.id !== requestActorId) return;
      applyConfirmedMessageRead(item, requestActorId);
      if (item.link) navigate(item.link);
    } catch {
      if (useAuthStore.getState().user?.id !== requestActorId) return;
      try {
        const status = await getMessageReadStatus(item.id);
        if (useAuthStore.getState().user?.id !== requestActorId) return;
        if (status.state === 'missing') {
          setNotice('这条消息已不在当前账号的消息列表中，正在重新读取。');
          void load(true, true, '消息列表暂时无法刷新；已加载的内容仍保留。');
          return;
        }
        if (status.read) {
          applyConfirmedMessageRead(item, requestActorId);
          if (item.link) navigate(item.link);
          return;
        }
        setNotice('标记已读失败；服务器已确认消息仍未读，没有自动重试。再次点击消息可明确重试。');
      } catch (verificationError) {
        if (useAuthStore.getState().user?.id !== requestActorId) return;
        const reason = verificationError instanceof Error ? verificationError.message : '暂时无法核实消息状态';
        setSingleMessageReadVerification(requestActorId, { message: item, error: reason });
        setNotice('暂时无法核实这条消息；核实前不会再次提交。点击“只读核实”可重试查询。');
      }
    } finally {
      setMarkingIdsByActor((current) => {
        const actorIds = current.get(requestActorId);
        if (!actorIds?.has(item.id)) return current;
        const next = new Map(current);
        const nextActorIds = new Set(actorIds);
        nextActorIds.delete(item.id);
        if (nextActorIds.size === 0) next.delete(requestActorId);
        else next.set(requestActorId, nextActorIds);
        return next;
      });
    }
  };

  const markAll = async () => {
    const requestActorId = userId;
    const safeExplicitRetry = currentBulkReadRecovery !== null && currentBulkReadRecoveryState?.phase === 'not_found';
    if (!cacheKey || requestActorId == null || loading || loadingMore || markingAll || markingIds.size > 0
      || currentSingleMessageReadVerification !== null
      || (!safeExplicitRetry && (unreadCount === null || unreadCount === 0)) || networkState !== 'online'
      || (currentBulkReadRecovery && currentBulkReadRecoveryState?.phase !== 'not_found')
      || bulkReadInFlightActorIdsRef.current.has(requestActorId)) {
      if (networkState !== 'online' && requestActorId != null) setNotice('当前网络未恢复，未读状态尚未同步。');
      return;
    }

    let recovery = currentBulkReadRecovery;
    if (!recovery) {
      try {
        recovery = {
          actorId: requestActorId,
          requestId: createBulkReadRequestId(),
        };
        // Persist first. If storage is blocked or full, never send a write that cannot be recovered.
        persistBulkReadRecovery(recovery);
        setBulkReadRecovery(recovery);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '无法安全保存批量已读请求编号，请检查浏览器会话存储后重试。');
        return;
      }
    }

    bulkReadInFlightActorIdsRef.current.add(requestActorId);
    setMarkingAllActorIds((current) => new Set(current).add(requestActorId));
    setBulkReadRecoveryState({ ...recovery, phase: 'submitting' });
    setUnreadSummary(null);
    setNotice('正在提交批量已读请求…');
    try {
      const result = await markAllAsRead(undefined, recovery.requestId);
      removeBulkReadRecovery(requestActorId);
      setBulkReadRecovery((current) => current?.actorId === requestActorId && current.requestId === recovery?.requestId ? null : current);
      setBulkReadRecoveryState((current) => current?.actorId === requestActorId && current.requestId === recovery?.requestId ? null : current);
      if (useAuthStore.getState().user?.id !== requestActorId) return;
      setNotice(result.updatedCount > 0
        ? `已确认将 ${result.updatedCount} 条未读消息标记为已读，正在同步最新状态。`
        : '已确认当前没有需要标记为已读的消息，正在同步最新状态。');
    } catch {
      if (useAuthStore.getState().user?.id !== requestActorId) return;
      await verifyBulkReadStatus(recovery);
    } finally {
      bulkReadInFlightActorIdsRef.current.delete(requestActorId);
      setMarkingAllActorIds((current) => {
        if (!current.has(requestActorId)) return current;
        const next = new Set(current);
        next.delete(requestActorId);
        return next;
      });
    }
  };

  const refreshMessages = () => {
    if (currentBulkReadRecovery) {
      if (currentBulkReadRecoveryState?.phase === 'checking' || currentBulkReadRecoveryState?.phase === 'submitting') return;
      void verifyBulkReadStatus(currentBulkReadRecovery);
      return;
    }
    void load(true);
  };

  const safeExplicitRetry = currentBulkReadRecovery !== null && currentBulkReadRecoveryState?.phase === 'not_found';
  const bulkReadLocked = bulkReadNeedsVerification && !safeExplicitRetry;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-studio-text-muted">{unreadCount === null ? '未读数暂不可用' : `未读 ${unreadCount} 条`}</p>
        <div className="flex items-center gap-3">
          <button type="button" disabled={loading || markingAll || currentBulkReadRecoveryState?.phase === 'checking' || currentBulkReadRecoveryState?.phase === 'submitting'} onClick={refreshMessages} className="min-h-11 text-sm text-studio-cyan-contrast disabled:opacity-50">{currentBulkReadRecovery ? '只读核实' : '刷新'}</button>
          <button type="button" disabled={loading || loadingMore || networkState !== 'online' || markingAll || bulkReadLocked || currentSingleMessageReadVerification !== null || markingIds.size > 0 || (!safeExplicitRetry && (unreadCount === null || unreadCount === 0))} onClick={() => void markAll()} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan-contrast disabled:opacity-50">
            <CheckCheck className="h-4 w-4" />{markingAll ? '处理中…' : currentBulkReadRecovery && currentBulkReadRecoveryState?.phase === 'not_found' ? '确认重试全部已读' : currentBulkReadRecovery ? '结果待核实' : '全部已读'}
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([['all', '全部'], ['unread', '未读'], ['workflow', '工作流'], ['collaboration', '协作'], ['system', '系统']] as const).map(([key, label]) => (
            <button type="button" key={key} disabled={markingAll} onClick={() => setFilter(key)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm disabled:opacity-50 ${filter === key ? 'bg-studio-primary-button text-white' : 'border border-studio-border-soft text-studio-text-secondary'}`}>
            {label}
          </button>
        ))}
      </div>
      {currentSingleMessageReadVerification ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-2xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-text-primary">
          <p>《{currentSingleMessageReadVerification.message.title}》的已读状态暂时无法确认。只读核实前不会再次提交。{currentSingleMessageReadVerification.error ? ` ${currentSingleMessageReadVerification.error}` : ''}</p>
          <button
            type="button"
            disabled={verifyingSingleMessageReadActors.has(userId ?? -1)}
            onClick={() => void verifyPendingSingleMessageRead()}
            className="min-h-11 self-start rounded-xl border border-studio-border-soft px-4 text-studio-text-secondary disabled:opacity-50"
          >
            {verifyingSingleMessageReadActors.has(userId ?? -1) ? '核实中…' : '只读核实'}
          </button>
        </div>
      ) : null}
      {notice ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}
      {loadError && items.length === 0 ? (
        <ErrorState className="min-h-0 py-2" title="消息加载失败" description={loadError} actionText="重试加载" onRetry={() => void load()} />
      ) : null}
      {loading && items.length === 0 ? <p role="status" aria-live="polite" className="text-sm text-studio-text-muted">正在同步消息…</p> : null}
      {!loadError && !loading && visible.length === 0 ? (
        <div className="rounded-2xl border border-studio-border-soft p-8 text-center">
          <Inbox className="mx-auto h-7 w-7 text-studio-text-muted" />
          <p className="mt-3 text-sm text-studio-text-secondary">
            {canLoadMore ? '已加载的消息中暂无符合条件的内容' : '暂无消息'}
          </p>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <div className="space-y-2">
          {visible.map((item) => (
            <button type="button" key={item.id} disabled={loading || loadingMore || markingAll || bulkReadNeedsVerification || markingIds.has(item.id) || (!item.read && (markingIds.size > 0 || currentSingleMessageReadVerification !== null))} onClick={() => void markRead(item)} className={`w-full rounded-2xl border p-4 text-left disabled:opacity-70 ${item.read ? 'border-studio-border-soft bg-studio-surface' : 'border-studio-primary/35 bg-studio-primary/[0.08]'}`}>
              <div className="flex gap-3">
                <Bell className="mt-0.5 h-5 w-5 shrink-0 text-studio-cyan" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-studio-text-secondary">{item.content}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {loadMoreError ? (
        <div className="space-y-2 text-center">
          <p role="status" className="text-sm text-studio-text-secondary">加载更多失败：{loadMoreError} 已加载的消息仍保留。</p>
          <button type="button" disabled={loadingMore || loading} onClick={() => void loadMore()} className="min-h-11 rounded-xl border border-studio-border-soft px-4 text-sm text-studio-text-secondary disabled:opacity-50">
            重试加载更多
          </button>
        </div>
      ) : canLoadMore ? (
        <button type="button" aria-busy={loadingMore} disabled={loadingMore || loading || markingAll} onClick={() => void loadMore()} className="mx-auto flex min-h-11 items-center gap-2 rounded-xl border border-studio-border-soft px-4 text-sm text-studio-text-secondary disabled:opacity-50">
          {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
          {loadingMore ? '正在加载更多消息…' : `加载更多（已显示 ${items.length} / ${total} 条）`}
        </button>
      ) : null}
    </div>
  );
}

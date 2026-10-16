import { Bell, CheckCheck, Inbox, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMessages, markAllAsRead, markMessageAsRead } from '@/api';
import type { Message } from '@/types';
import { useAuthStore, useMessageStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { getMobileMessageCategory } from '@/platform/message-category';
import ErrorState from '@/components/common/ErrorState';

type Filter = 'all' | 'unread' | 'workflow' | 'collaboration' | 'system';
const PAGE_SIZE = 20;
const emptyMessages: Message[] = [];

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
  const [unreadCount, setUnreadCountState] = useState<number | null>(null);
  const [markingIds, setMarkingIds] = useState<Set<number>>(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const requestIdRef = useRef(0);
  const setUnread = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);
  const networkState = useNetworkState();

  const load = useCallback(async (preserveItems = false) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadingMore(false);
    setLoadError('');
    setLoadMoreError('');
    setNotice('');
    if (!preserveItems) {
      setItems([]);
      setPage(1);
      setTotal(0);
    }
    if (!cacheKey) {
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
      if (requestId !== requestIdRef.current) return;
      setItems(result.data);
      setPage(result.page);
      setTotal(result.total);
      setUnreadCountState(result.summary.unread);
      setUnread(result.summary.unread);
      if (filter !== 'unread') writeSafeDraft(cacheKey, result.data);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const cached = readSafeDraftValue<Message[]>(cacheKey);
      if (!preserveItems && cached?.length) {
        setItems(cached);
        setPage(1);
        setTotal(cached.length);
        setNotice('正在显示最近缓存的消息；恢复网络后可刷新。');
      } else if (preserveItems) {
        setNotice('刷新消息失败；当前已加载内容仍保留，可重试。');
      } else {
        setItems([]);
        setLoadError(error instanceof Error ? error.message : '加载消息失败，请重试。');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [cacheKey, filter, setItems, setUnread]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refreshMessages = () => { void load(true); };
    window.addEventListener('xmt-messages-refresh', refreshMessages);
    return () => window.removeEventListener('xmt-messages-refresh', refreshMessages);
  }, [load]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !item.read;
    return getMobileMessageCategory(item) === filter;
  }), [filter, items]);
  const canLoadMore = items.length < total;

  const loadMore = async () => {
    if (!cacheKey || loadingMore || loading || !canLoadMore) return;
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
      if (requestId !== requestIdRef.current) return;
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const next = [...current, ...result.data.filter((item) => !existingIds.has(item.id))];
        if (filter !== 'unread') writeSafeDraft(cacheKey, next.slice(0, PAGE_SIZE));
        return next;
      });
      setPage(result.page);
      setTotal(result.total);
      setUnreadCountState(result.summary.unread);
      setUnread(result.summary.unread);
    } catch (error) {
      if (requestId === requestIdRef.current) setLoadMoreError(error instanceof Error ? error.message : '加载更多消息失败，请重试。');
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  };

  const markRead = async (item: Message) => {
    if (!cacheKey) return;
    if (item.read) { if (item.link) navigate(item.link); return; }
    if (markingIds.has(item.id) || markingAll) return;
    if (networkState !== 'online') { setNotice('当前网络未恢复，未读状态尚未同步；恢复网络后可重试。'); return; }
    setMarkingIds((current) => new Set(current).add(item.id));
    try {
      await markMessageAsRead(item.id);
      setItems((current) => {
        const next = current.map((candidate) => candidate.id === item.id ? { ...candidate, read: true } : candidate);
        const cached = readSafeDraftValue<Message[]>(cacheKey);
        if (cached) writeSafeDraft(cacheKey, cached.map((candidate) => candidate.id === item.id ? { ...candidate, read: true } : candidate));
        return next;
      });
      setUnreadCountState((current) => current === null ? null : Math.max(0, current - 1));
      markStoreMessageAsRead(item.id);
      setNotice('消息已标记为已读');
      if (filter === 'unread' && !item.link) void load(true);
      if (item.link) navigate(item.link);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '标记已读失败；消息仍保持未读，可重试。');
    } finally {
      setMarkingIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
    }
  };

  const markAll = async () => {
    if (!cacheKey || markingAll || markingIds.size > 0 || unreadCount === null || unreadCount === 0) return;
    if (networkState !== 'online') { setNotice('当前网络未恢复，未读状态尚未同步。'); return; }
    setMarkingAll(true);
    setNotice('');
    try {
      const result = await markAllAsRead();
      setItems((current) => {
        const next = current.map((item) => ({ ...item, read: true }));
        const cached = readSafeDraftValue<Message[]>(cacheKey);
        if (cached) writeSafeDraft(cacheKey, cached.map((item) => ({ ...item, read: true })));
        return next;
      });
      setUnreadCountState(0);
      setUnread(0);
      if (filter === 'unread') {
        setItems([]);
        setTotal(0);
        setPage(1);
      }
      setNotice(result.updatedCount > 0
        ? `已将 ${result.updatedCount} 条未读消息标记为已读`
        : '当前没有需要标记的未读消息');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '批量标记失败；未读状态未更改，可重试。');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-studio-text-muted">{unreadCount === null ? '未读数暂不可用' : `未读 ${unreadCount} 条`}</p>
        <div className="flex items-center gap-3">
          <button type="button" disabled={loading || markingAll} onClick={() => void load(true)} className="min-h-11 text-sm text-studio-cyan-contrast disabled:opacity-50">刷新</button>
          <button type="button" disabled={loading || loadingMore || networkState !== 'online' || markingAll || markingIds.size > 0 || unreadCount === null || unreadCount === 0} onClick={() => void markAll()} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan-contrast disabled:opacity-50">
            <CheckCheck className="h-4 w-4" />{markingAll ? '处理中…' : '全部已读'}
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([['all', '全部'], ['unread', '未读'], ['workflow', '工作流'], ['collaboration', '协作'], ['system', '系统']] as const).map(([key, label]) => (
          <button type="button" key={key} onClick={() => setFilter(key)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${filter === key ? 'bg-studio-primary-button text-white' : 'border border-studio-border-soft text-studio-text-secondary'}`}>
            {label}
          </button>
        ))}
      </div>
      {notice ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}
      {loadError && items.length === 0 ? (
        <ErrorState className="min-h-0 py-2" title="消息加载失败" description={loadError} actionText="重试加载" onRetry={() => void load()} />
      ) : null}
      {loading && items.length === 0 ? <p className="text-sm text-studio-text-muted">正在同步消息…</p> : null}
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
            <button type="button" key={item.id} disabled={loading || loadingMore || markingAll || markingIds.has(item.id)} onClick={() => void markRead(item)} className={`w-full rounded-2xl border p-4 text-left disabled:opacity-70 ${item.read ? 'border-studio-border-soft bg-studio-surface' : 'border-studio-primary/35 bg-studio-primary/[0.08]'}`}>
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
        <button type="button" disabled={loadingMore || loading} onClick={() => void loadMore()} className="mx-auto flex min-h-11 items-center gap-2 rounded-xl border border-studio-border-soft px-4 text-sm text-studio-text-secondary disabled:opacity-50">
          {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
          {loadingMore ? '正在加载…' : `加载更多（已显示 ${items.length} / ${total} 条）`}
        </button>
      ) : null}
    </div>
  );
}

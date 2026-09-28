import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMessages, markMessageAsRead } from '@/api';
import type { Message } from '@/types';
import { useAuthStore, useMessageStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { getMobileMessageCategory } from '@/platform/message-category';
import { markMessagesReadIndividually } from '@/platform/mobile-message-read';
import ErrorState from '@/components/common/ErrorState';

type Filter = 'all' | 'unread' | 'workflow' | 'collaboration' | 'system';
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
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [markingIds, setMarkingIds] = useState<Set<number>>(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const setUnread = useMessageStore((state) => state.setUnreadCount);
  const markStoreMessageAsRead = useMessageStore((state) => state.markAsRead);
  const networkState = useNetworkState();
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setNotice('');
    if (!cacheKey) { setItems([]); setLoadError('登录状态已失效，请重新登录后再加载消息。'); setLoading(false); return; }
    try {
      const result = await getMessages();
      setItems(result.data);
      writeSafeDraft(cacheKey, result.data);
      setUnread(result.data.filter((item) => !item.read).length);
      setNotice('');
    } catch (error) {
      const cached = readSafeDraftValue<Message[]>(cacheKey);
      if (cached) { setItems(cached); setNotice('正在显示最近缓存的消息；恢复网络后可刷新。'); }
      else { setItems([]); setLoadError(error instanceof Error ? error.message : '加载消息失败，请重试。'); }
    } finally { setLoading(false); }
  }, [cacheKey, setItems, setUnread]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !item.read;
    return getMobileMessageCategory(item) === filter;
  }), [filter, items]);
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
        writeSafeDraft(cacheKey, next); return next;
      });
      markStoreMessageAsRead(item.id);
      setNotice('消息已标记为已读');
      if (item.link) navigate(item.link);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '标记已读失败；消息仍保持未读，可重试。');
    } finally {
      setMarkingIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
    }
  };
  const markAll = async () => {
    const unreadItems = items.filter((item) => !item.read && !markingIds.has(item.id));
    if (!cacheKey || markingAll || markingIds.size > 0 || unreadItems.length === 0) return;
    if (networkState !== 'online') { setNotice('当前网络未恢复，未读状态尚未同步。'); return; }
    setMarkingAll(true);
    const result = await markMessagesReadIndividually(unreadItems.map((item) => item.id), markMessageAsRead);
    const succeededIds = new Set(result.succeededIds);
    const failed = result.failedIds.length;
    if (succeededIds.size) {
      setItems((current) => {
        const next = current.map((item) => succeededIds.has(item.id) ? { ...item, read: true } : item);
        writeSafeDraft(cacheKey, next);
        return next;
      });
      succeededIds.forEach(markStoreMessageAsRead);
    }
    setNotice(failed
      ? `${succeededIds.size} 条已标记为已读，${failed} 条仍未读，可重试。`
      : '所有消息已标记为已读');
    setMarkingAll(false);
  };
  return <div className="space-y-4"><div className="flex items-center justify-between"><p className="text-sm text-studio-text-muted">未读 {items.filter((item) => !item.read).length} 条</p><div className="flex items-center gap-3"><button type="button" disabled={loading || markingAll} onClick={() => void load()} className="min-h-11 text-sm text-studio-cyan disabled:opacity-50">刷新</button><button type="button" disabled={loading || networkState !== 'online' || markingAll || markingIds.size > 0 || items.every((item) => item.read)} onClick={() => void markAll()} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan disabled:opacity-50"><CheckCheck className="h-4 w-4" />{markingAll ? '处理中…' : '全部已读'}</button></div></div><div className="flex gap-2 overflow-x-auto pb-1">{([['all','全部'],['unread','未读'],['workflow','工作流'],['collaboration','协作'],['system','系统']] as const).map(([key,label]) => <button type="button" key={key} onClick={() => setFilter(key)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${filter === key ? 'bg-studio-primary text-white' : 'border border-studio-border-soft text-studio-text-secondary'}`}>{label}</button>)}</div>{notice ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}{loading ? <p className="text-sm text-studio-text-muted">正在同步消息…</p> : loadError ? <ErrorState className="min-h-0 py-2" title="消息加载失败" description={loadError} actionText="重试加载" onRetry={() => void load()} /> : visible.length === 0 ? <div className="rounded-2xl border border-studio-border-soft p-8 text-center"><Inbox className="mx-auto h-7 w-7 text-studio-text-muted" /><p className="mt-3 text-sm text-studio-text-secondary">暂无消息</p></div> : <div className="space-y-2">{visible.map((item) => <button type="button" key={item.id} disabled={loading || markingAll || markingIds.has(item.id)} onClick={() => void markRead(item)} className={`w-full rounded-2xl border p-4 text-left disabled:opacity-70 ${item.read ? 'border-studio-border-soft bg-studio-surface' : 'border-studio-primary/35 bg-studio-primary/[0.08]'}`}><div className="flex gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-studio-cyan" /><div className="min-w-0"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-studio-text-secondary">{item.content}</p></div></div></button>)}</div>}</div>;
}

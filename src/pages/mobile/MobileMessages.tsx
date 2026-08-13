import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMessages, markAllAsRead, markMessageAsRead } from '@/api';
import type { Message } from '@/types';
import { useMessageStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { readSafeDraftValue, writeSafeDraft } from '@/platform/safe-draft';
import { getMobileMessageCategory } from '@/platform/message-category';

type Filter = 'all' | 'unread' | 'workflow' | 'collaboration' | 'system';
const cacheKey = 'messages:recent';

export default function MobileMessages() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Message[]>(() => readSafeDraftValue<Message[]>(cacheKey) ?? []);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const setUnread = useMessageStore((state) => state.setUnreadCount);
  const networkState = useNetworkState();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMessages();
      setItems(result.data);
      writeSafeDraft(cacheKey, result.data);
      setUnread(result.data.filter((item) => !item.read).length);
      setNotice('');
    } catch (error) {
      const cached = readSafeDraftValue<Message[]>(cacheKey);
      if (cached) { setItems(cached); setNotice('正在显示最近缓存的消息；恢复网络后可刷新。'); }
      else setNotice(error instanceof Error ? error.message : '加载消息失败');
    } finally { setLoading(false); }
  }, [setUnread]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !item.read;
    return getMobileMessageCategory(item) === filter;
  }), [filter, items]);
  const markRead = async (item: Message) => {
    if (!item.read) {
      if (networkState !== 'online') { setNotice('当前网络未恢复，未读状态尚未同步。'); }
      else {
        try {
          await markMessageAsRead(item.id);
          setItems((current) => {
            const next = current.map((candidate) => candidate.id === item.id ? { ...candidate, read: true } : candidate);
            writeSafeDraft(cacheKey, next); return next;
          });
          setUnread(Math.max(0, items.filter((candidate) => !candidate.read).length - 1));
        } catch (error) { setNotice(error instanceof Error ? error.message : '标记已读失败'); }
      }
    }
    if (item.link) navigate(item.link);
  };
  const markAll = async () => {
    if (networkState !== 'online') { setNotice('当前网络未恢复，未读状态尚未同步。'); return; }
    try {
      await markAllAsRead();
      setItems((current) => { const next = current.map((item) => ({ ...item, read: true })); writeSafeDraft(cacheKey, next); return next; });
      setUnread(0);
    } catch (error) { setNotice(error instanceof Error ? error.message : '标记全部已读失败'); }
  };
  return <div className="space-y-4"><div className="flex items-center justify-between"><p className="text-sm text-studio-text-muted">未读 {items.filter((item) => !item.read).length} 条</p><div className="flex items-center gap-3"><button type="button" onClick={() => void load()} className="min-h-11 text-sm text-studio-cyan">刷新</button><button type="button" disabled={networkState !== 'online'} onClick={() => void markAll()} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan disabled:opacity-50"><CheckCheck className="h-4 w-4" />全部已读</button></div></div><div className="flex gap-2 overflow-x-auto pb-1">{([['all','全部'],['unread','未读'],['workflow','工作流'],['collaboration','协作'],['system','系统']] as const).map(([key,label]) => <button type="button" key={key} onClick={() => setFilter(key)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${filter === key ? 'bg-studio-primary text-white' : 'border border-studio-border-soft text-studio-text-secondary'}`}>{label}</button>)}</div>{notice ? <p role="status" className="text-sm text-studio-text-secondary">{notice}</p> : null}{loading ? <p className="text-sm text-studio-text-muted">正在同步消息…</p> : visible.length === 0 ? <div className="rounded-2xl border border-studio-border-soft p-8 text-center"><Inbox className="mx-auto h-7 w-7 text-studio-text-muted" /><p className="mt-3 text-sm text-studio-text-secondary">暂无消息</p></div> : <div className="space-y-2">{visible.map((item) => <button type="button" key={item.id} onClick={() => void markRead(item)} className={`w-full rounded-2xl border p-4 text-left ${item.read ? 'border-studio-border-soft bg-studio-surface' : 'border-studio-primary/35 bg-studio-primary/[0.08]'}`}><div className="flex gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-studio-cyan" /><div className="min-w-0"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-studio-text-secondary">{item.content}</p></div></div></button>)}</div>}</div>;
}

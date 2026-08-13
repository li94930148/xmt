import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMessages, markAllAsRead, markMessageAsRead } from '@/api';
import type { Message } from '@/types';
import { useMessageStore } from '@/store';

type Filter = 'all' | 'unread' | 'work' | 'system';
export default function MobileMessages() {
  const navigate = useNavigate(); const [items, setItems] = useState<Message[]>([]); const [filter, setFilter] = useState<Filter>('all'); const [loading, setLoading] = useState(true);
  const setUnread = useMessageStore((state) => state.setUnreadCount);
  useEffect(() => { void getMessages().then((result) => { setItems(result.data); setUnread(result.data.filter((item) => !item.read).length); }).finally(() => setLoading(false)); }, [setUnread]);
  const visible = useMemo(() => items.filter((item) => filter === 'unread' ? !item.read : filter === 'work' ? Boolean(item.link) : filter === 'system' ? !item.link : true), [filter, items]);
  const markRead = async (item: Message) => { if (!item.read) { await markMessageAsRead(item.id); setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, read: true } : candidate)); setUnread(Math.max(0, items.filter((candidate) => !candidate.read).length - 1)); } if (item.link) navigate(item.link); };
  const markAll = async () => { await markAllAsRead(); setItems((current) => current.map((item) => ({ ...item, read: true }))); setUnread(0); };
  return <div className="space-y-4"><div className="flex items-center justify-between"><p className="text-sm text-studio-text-muted">未读 {items.filter((item) => !item.read).length} 条</p><button onClick={() => void markAll()} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan"><CheckCheck className="h-4 w-4" />全部已读</button></div><div className="flex gap-2 overflow-x-auto pb-1">{([['all','全部'],['unread','未读'],['work','工作流'],['system','系统']] as const).map(([key,label]) => <button key={key} onClick={() => setFilter(key)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${filter === key ? 'bg-studio-primary text-white' : 'border border-studio-border-soft text-studio-text-secondary'}`}>{label}</button>)}</div>{loading ? <p className="text-sm text-studio-text-muted">正在同步消息…</p> : visible.length === 0 ? <div className="rounded-2xl border border-studio-border-soft p-8 text-center"><Inbox className="mx-auto h-7 w-7 text-studio-text-muted" /><p className="mt-3 text-sm text-studio-text-secondary">暂无消息</p></div> : <div className="space-y-2">{visible.map((item) => <button key={item.id} onClick={() => void markRead(item)} className={`w-full rounded-2xl border p-4 text-left ${item.read ? 'border-studio-border-soft bg-studio-surface' : 'border-studio-primary/35 bg-studio-primary/[0.08]'}`}><div className="flex gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-studio-cyan" /><div className="min-w-0"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-studio-text-secondary">{item.content}</p></div></div></button>)}</div>}</div>;
}

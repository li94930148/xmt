import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTopics } from '@/hooks/useTopics';
import { useAuthStore } from '@/store';

type Filter = 'all' | 'mine' | 'pending' | 'active';
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' }, { id: 'mine', label: '我的' }, { id: 'pending', label: '待审核' }, { id: 'active', label: '进行中' },
];
const activeStatuses = new Set(['approved', 'production', 'shooting', 'publishing']);

export default function MobileTopics() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const status = filter === 'pending' ? 'pending' : undefined;
  const { data, isLoading, refetch, isFetching } = useTopics({ status, search: deferredSearch || undefined, page, limit: 20 });
  const visibleTopics = useMemo(() => (data?.data ?? []).filter((topic) => {
    if (filter === 'mine') return topic.assignee_id === user?.id || topic.creator_id === user?.id;
    return filter !== 'active' || activeStatuses.has(topic.status);
  }), [data?.data, filter, user?.id]);
  const canLoadMore = (data?.total ?? 0) > page * (data?.limit ?? 20);
  const chooseFilter = (next: Filter) => { setFilter(next); setPage(1); };

  return <div className="space-y-4">
    <div className="flex gap-2"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-studio-border-soft bg-studio-surface px-3"><Search className="h-4 w-4 text-studio-text-muted" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索选题" /></label><button type="button" onClick={() => navigate('/topics/add')} aria-label="新建选题" className="flex h-11 w-11 items-center justify-center rounded-xl bg-studio-primary text-white"><Plus className="h-5 w-5" /></button></div>
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{filters.map((item) => <button type="button" key={item.id} onClick={() => chooseFilter(item.id)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${filter === item.id ? 'bg-studio-primary text-white' : 'border border-studio-border-soft bg-studio-surface text-studio-text-secondary'}`}>{item.label}</button>)}</div>
    <div className="flex items-center justify-between"><p className="text-sm text-studio-text-muted">{data?.total ?? 0} 个选题</p><button type="button" onClick={() => void refetch()} className="min-h-11 text-sm text-studio-cyan">{isFetching ? '刷新中…' : '刷新列表'}</button></div>
    {isLoading ? <p className="text-sm text-studio-text-muted">正在加载选题…</p> : visibleTopics.length ? <div className="space-y-3">{visibleTopics.map((topic) => <button type="button" key={topic.id} onClick={() => navigate(`/topics/${topic.id}`)} className="w-full rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><div className="flex items-start justify-between gap-3"><h2 className="line-clamp-2 text-base font-semibold">{topic.title}</h2><span className="shrink-0 rounded-full bg-studio-primary/15 px-2 py-1 text-xs text-studio-cyan">{topic.status}</span></div><p className="mt-2 line-clamp-2 text-sm text-studio-text-secondary">{topic.description || '暂无选题说明'}</p><div className="mt-3 flex items-center justify-between text-xs text-studio-text-muted"><span>{topic.assignee_name ?? '未分配负责人'}</span><span>{topic.deadline || '未设置截止日期'}</span></div></button>)}</div> : <div className="rounded-2xl border border-dashed border-studio-border-soft p-8 text-center text-sm text-studio-text-muted">没有符合条件的选题</div>}
    <div className="flex items-center justify-center gap-3"><button type="button" disabled={page === 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-11 rounded-xl border border-studio-border-soft px-4 text-sm disabled:opacity-40">上一页</button><span className="text-sm text-studio-text-muted">第 {page} 页</span><button type="button" disabled={!canLoadMore || isFetching} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-xl border border-studio-border-soft px-4 text-sm disabled:opacity-40">下一页</button></div>
  </div>;
}

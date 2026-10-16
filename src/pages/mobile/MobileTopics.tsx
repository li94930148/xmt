import { ArrowLeft, Plus, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { auditTopic, getPublishing, getShooting, updateTopicStatus } from '@/api';
import { useTopics } from '@/hooks/useTopics';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore, useAppStore } from '@/store';
import { formatBeijingDate } from '@/lib/utils';
import { STATUS_COLORS, STATUS_TEXT } from '@/constants';
import type { Topic } from '@/types';
import TopicsBoardView from '@/components/topics/TopicsBoardView';
import { getKanbanTopicDestination } from '@/platform/kanban-navigation';

type Filter = 'all' | 'mine' | 'pending' | 'active';
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' }, { id: 'mine', label: '我的' }, { id: 'pending', label: '待审核' }, { id: 'active', label: '进行中' },
];
const activeStatuses = new Set(['approved', 'production', 'shooting', 'publishing']);
const topicStatusClassNames = (status: string) => {
  const color = STATUS_COLORS[status];
  return color
    ? `border ${color.bg} ${color.text} ${color.border}`
    : 'border border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary';
};

export default function MobileTopics() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const appStore = useAppStore();
  const { hasPermission } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'board' ? 'board' : 'list';
  const mobileReturnTo = (location.state as { mobileReturnTo?: unknown } | null)?.mobileReturnTo;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const status = filter === 'pending' ? 'pending' : undefined;
  const limit = view === 'board' ? 200 : 20;
  const { data, error: topicsError, isError, isLoading, refetch, isFetching } = useTopics({ status, search: deferredSearch || undefined, page: view === 'board' ? 1 : page, limit });
  const visibleTopics = useMemo(() => (data?.data ?? []).filter((topic) => {
    if (filter === 'mine') return topic.assignee_id === user?.id || topic.creator_id === user?.id;
    return filter !== 'active' || activeStatuses.has(topic.status);
  }), [data?.data, filter, user?.id]);
  const canLoadMore = (data?.total ?? 0) > page * (data?.limit ?? 20);
  const chooseFilter = (next: Filter) => { setFilter(next); setPage(1); };
  const setTopicsView = (nextView: 'list' | 'board') => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextView === 'board') next.set('view', 'board');
      else next.delete('view');
      return next;
    });
  };

  const openBoardTopic = async (topic: Topic) => {
    try {
      const path = await getKanbanTopicDestination(topic, {
        getShooting: (topicId) => getShooting({ topic_id: topicId, page: 1, limit: 1 }),
        getPublishing: (topicId) => getPublishing({ topic_id: topicId, page: 1, limit: 1 }),
      });
      if (!path) {
        appStore.addNotification({ title: '暂时无法打开流程详情', message: '该选题还没有对应的流程记录，请从选题详情查看状态。', type: 'warning' });
        navigate(`/topics/${topic.id}`, { state: { mobileReturnTo: '/topics?view=board' } });
        return;
      }
      navigate(path, { state: { mobileReturnTo: '/topics?view=board' } });
    } catch (error) {
      appStore.addNotification({ title: '流程详情加载失败', message: error instanceof Error ? error.message : '暂时无法打开流程详情', type: 'error' });
      navigate(`/topics/${topic.id}`, { state: { mobileReturnTo: '/topics?view=board' } });
    }
  };

  const transitionTopic = async (topic: Topic, nextStatus: Topic['status']) => {
    try {
      if (topic.status === 'pending' && ['approved', 'rejected'].includes(nextStatus)) {
        await auditTopic(topic.id, { status: nextStatus as 'approved' | 'rejected', comment: '' });
      } else {
        await updateTopicStatus(topic.id, nextStatus);
      }
      await queryClient.invalidateQueries({ queryKey: ['topics'] });
      const statusText = STATUS_TEXT[nextStatus] || '最新阶段';
      appStore.addNotification({ title: '状态已更新', message: `《${topic.title}》已更新为${statusText}`, type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '状态更新失败', message: error instanceof Error ? error.message : '请检查权限或当前阶段后重试', type: 'error' });
    }
  };

  return <div className="space-y-4">
    {mobileReturnTo === '/production' ? <button type="button" onClick={() => navigate('/production')} className="inline-flex min-h-11 items-center gap-2 text-sm text-studio-cyan-contrast"><ArrowLeft className="h-4 w-4" />返回工作</button> : null}
    <div className="flex gap-2"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-studio-border-soft bg-studio-surface px-3"><Search className="h-4 w-4 text-studio-text-muted" /><input id="mobile-topics-search" name="mobileTopicsSearch" aria-label="搜索选题" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索选题" /></label><button type="button" onClick={() => navigate('/topics/add')} aria-label="新建选题" className="flex h-11 w-11 items-center justify-center rounded-xl bg-studio-primary-button text-white"><Plus className="h-5 w-5" /></button></div>
    <div className="flex gap-2" aria-label="选题视图切换"><button type="button" aria-pressed={view === 'list'} onClick={() => setTopicsView('list')} className={`min-h-10 flex-1 rounded-xl px-3 text-sm ${view === 'list' ? 'bg-studio-primary-button text-white' : 'border border-studio-border-soft bg-studio-surface text-studio-text-secondary'}`}>列表</button><button type="button" aria-pressed={view === 'board'} onClick={() => setTopicsView('board')} className={`min-h-10 flex-1 rounded-xl px-3 text-sm ${view === 'board' ? 'bg-studio-primary-button text-white' : 'border border-studio-border-soft bg-studio-surface text-studio-text-secondary'}`}>看板</button></div>
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{filters.map((item) => <button type="button" key={item.id} onClick={() => chooseFilter(item.id)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${filter === item.id ? 'bg-studio-primary-button text-white' : 'border border-studio-border-soft bg-studio-surface text-studio-text-secondary'}`}>{item.label}</button>)}</div>
    <div className="flex items-center justify-between"><p className="text-sm text-studio-text-muted">{isError && !data ? '选题数量暂不可用' : `${data?.total ?? 0} 个选题`}</p><button type="button" disabled={isFetching} aria-busy={isFetching} onClick={() => void refetch()} className="xmt-btn xmt-btn-secondary inline-flex min-h-11 items-center px-3 text-sm disabled:opacity-50">{isFetching ? '正在刷新…' : isError ? '重试加载选题' : '刷新列表'}</button></div>
    {isError ? <div className="space-y-2 rounded-xl border border-studio-coral/30 bg-studio-coral/10 p-3">
      <p role="alert" className="text-sm text-studio-coral-contrast">选题列表读取失败：{topicsError instanceof Error ? topicsError.message : '请稍后重试。'}</p>
      {data ? <p role="status" className="text-sm text-studio-text-secondary">仍显示上次成功读取的列表，当前结果可能不是最新。</p> : <p className="text-sm text-studio-text-secondary">暂时无法确认符合条件的选题，请重试。</p>}
    </div> : null}
    {isError && !data ? null : view === 'board' ? <TopicsBoardView
      topics={visibleTopics}
      total={data?.total ?? 0}
      statusFilter={filter === 'pending' ? 'pending' : ''}
      loading={isLoading}
      canUpdate={hasPermission('topic:update')}
      canAudit={hasPermission('topic:audit')}
      onOpenTopic={(topic) => { void openBoardTopic(topic); }}
      onTransition={transitionTopic}
    /> : <>
      {isLoading ? <p className="text-sm text-studio-text-muted">正在加载选题…</p> : visibleTopics.length ? <div className="space-y-3">{visibleTopics.map((topic) => <button type="button" key={topic.id} onClick={() => navigate(`/topics/${topic.id}`)} className="w-full rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><div className="flex items-start justify-between gap-3"><h2 className="line-clamp-2 text-base font-semibold">{topic.title}</h2><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${topicStatusClassNames(topic.status)}`}>{STATUS_TEXT[topic.status] || '状态待确认'}</span></div><p className="mt-2 line-clamp-2 text-sm text-studio-text-secondary">{topic.description || '暂无选题说明'}</p><div className="mt-3 flex items-center justify-between text-xs text-studio-text-muted"><span>{topic.assignee_name ?? '未分配负责人'}</span><span>{topic.deadline ? formatBeijingDate(topic.deadline) : '未设置截止日期'}</span></div></button>)}</div> : <div className="rounded-2xl border border-dashed border-studio-border-soft p-8 text-center text-sm text-studio-text-muted">没有符合条件的选题</div>}
      <div className="flex items-center justify-center gap-3"><button type="button" disabled={page === 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-11 rounded-xl border border-studio-border-soft px-4 text-sm disabled:opacity-40">上一页</button><span className="text-sm text-studio-text-muted">第 {page} 页</span><button type="button" disabled={!canLoadMore || isFetching} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-xl border border-studio-border-soft px-4 text-sm disabled:opacity-40">下一页</button></div>
    </>}
  </div>;
}

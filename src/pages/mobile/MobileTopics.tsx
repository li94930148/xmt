import { ArrowLeft, Plus, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { auditTopic, getPublishing, getShooting, getTopic, TopicApiError, updateTopicStatus } from '@/api';
import { useTopics } from '@/hooks/useTopics';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore, useAppStore } from '@/store';
import { formatBeijingDate } from '@/lib/utils';
import { STATUS_COLORS, STATUS_TEXT } from '@/constants';
import type { Topic } from '@/types';
import TopicsBoardView from '@/components/topics/TopicsBoardView';
import { getKanbanTopicDestination } from '@/platform/kanban-navigation';

type Filter = 'all' | 'mine' | 'pending' | 'creation' | 'active';
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' }, { id: 'mine', label: '我的' }, { id: 'pending', label: '待审核' }, { id: 'creation', label: '创作阶段' }, { id: 'active', label: '进行中' },
];
const activeStatuses = new Set(['approved', 'production', 'shooting', 'publishing']);
const topicStatusClassNames = (status: string) => {
  const color = STATUS_COLORS[status];
  return color
    ? `border ${color.bg} ${color.text} ${color.border}`
    : 'border border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary';
};

type PendingStatusWrite = { before: Topic['status']; target: Topic['status']; title: string };

export default function MobileTopics() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const appStore = useAppStore();
  const { hasPermission } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFromUrl = searchParams.get('status');
  const topicFilterFromUrl = searchParams.get('topic_filter');
  const filterFromUrl: Filter = statusFromUrl === 'pending' || statusFromUrl === 'creation'
    ? statusFromUrl
    : topicFilterFromUrl === 'mine' || topicFilterFromUrl === 'active' ? topicFilterFromUrl : 'all';
  const view = searchParams.get('view') === 'board' ? 'board' : 'list';
  const mobileReturnTo = (location.state as { mobileReturnTo?: unknown } | null)?.mobileReturnTo;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>(filterFromUrl);
  const [page, setPage] = useState(1);
  const [statusVerificationIds, setStatusVerificationIds] = useState<ReadonlySet<number>>(() => new Set());
  const pendingStatusWritesRef = useRef(new Map<number, PendingStatusWrite>());
  const statusWritesInFlightRef = useRef(new Set<number>());
  const deferredSearch = useDeferredValue(search);
  const status = filter === 'pending' || filter === 'creation' ? filter : undefined;
  const limit = view === 'board' ? 200 : 20;
  const { data, error: topicsError, isError, isLoading, refetch, isFetching } = useTopics({ status, search: deferredSearch || undefined, page: view === 'board' ? 1 : page, limit });
  const isInitialListLoading = isLoading && !data;
  const topicCountLabel = isError && !data
    ? '选题数量暂不可用'
    : isInitialListLoading
      ? '正在读取选题数量…'
      : `${data?.total ?? 0} 个选题`;
  const refreshListLabel = isInitialListLoading
    ? '正在加载…'
    : isFetching
      ? '正在刷新…'
      : isError
        ? '重试加载选题'
        : '刷新列表';
  useEffect(() => {
    setFilter(filterFromUrl);
    setPage(1);
  }, [filterFromUrl]);
  const visibleTopics = useMemo(() => (data?.data ?? []).filter((topic) => {
    if (filter === 'mine') return topic.assignee_id === user?.id || topic.creator_id === user?.id;
    if (filter === 'creation') return topic.status === 'approved' || topic.status === 'production';
    return filter !== 'active' || activeStatuses.has(topic.status);
  }), [data?.data, filter, user?.id]);
  const canLoadMore = (data?.total ?? 0) > page * (data?.limit ?? 20);
  const chooseFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === 'pending' || next === 'creation') {
        updated.set('status', next);
        updated.delete('topic_filter');
      } else {
        updated.delete('status');
        if (next === 'all') updated.delete('topic_filter');
        else updated.set('topic_filter', next);
      }
      return updated;
    }, { replace: true });
  };
  const setTopicsView = (nextView: 'list' | 'board') => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextView === 'board') next.set('view', 'board');
      else next.delete('view');
      return next;
    });
  };

  const setPendingStatusWrite = (topicId: number, pendingWrite: PendingStatusWrite | null) => {
    if (pendingWrite) pendingStatusWritesRef.current.set(topicId, pendingWrite);
    else pendingStatusWritesRef.current.delete(topicId);
    setStatusVerificationIds(new Set(pendingStatusWritesRef.current.keys()));
  };

  const verifyTopicStatusWrite = async (topicId: number, pendingWrite = pendingStatusWritesRef.current.get(topicId)) => {
    if (!pendingWrite) return;
    try {
      const latest = await getTopic(topicId);
      setPendingStatusWrite(topicId, null);
      await queryClient.invalidateQueries({ queryKey: ['topics'] });
      if (latest.status === pendingWrite.target) {
        appStore.addNotification({ title: '状态更新已确认', message: `《${pendingWrite.title}》已更新为${STATUS_TEXT[pendingWrite.target] || '目标阶段'}；没有重复提交。`, type: 'success' });
      } else if (latest.status === pendingWrite.before) {
        appStore.addNotification({ title: '状态尚未改变', message: `只读核实确认《${pendingWrite.title}》仍为${STATUS_TEXT[latest.status] || '原阶段'}；如需重试，请再次明确点击。`, type: 'warning' });
      } else {
        appStore.addNotification({ title: '选题已由最新状态更新', message: `《${pendingWrite.title}》当前为${STATUS_TEXT[latest.status] || '其它阶段'}；已同步服务端结果，没有重试写入。`, type: 'warning' });
      }
    } catch (error) {
      if (error instanceof TopicApiError && error.status === 404) {
        setPendingStatusWrite(topicId, null);
        await queryClient.invalidateQueries({ queryKey: ['topics'] });
        appStore.addNotification({ title: '选题已不存在', message: `《${pendingWrite.title}》已从服务端移除；没有重复提交。`, type: 'warning' });
        return;
      }
      appStore.addNotification({ title: '状态结果仍待核实', message: `暂时无法读取《${pendingWrite.title}》的最新状态。该选题的状态操作会继续锁定；只读核实不会重新提交。`, type: 'warning' });
    }
  };

  const verifyPendingTopicStatuses = async () => {
    for (const topicId of pendingStatusWritesRef.current.keys()) {
      await verifyTopicStatusWrite(topicId);
    }
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
    if (statusWritesInFlightRef.current.has(topic.id) || pendingStatusWritesRef.current.has(topic.id)) return;
    statusWritesInFlightRef.current.add(topic.id);
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
      const definiteRejection = error instanceof TopicApiError
        && error.status >= 400
        && error.status < 500
        && ![408, 425, 429].includes(error.status);
      if (definiteRejection) {
        appStore.addNotification({ title: '状态更新失败', message: error.message || '请检查权限或当前阶段后重试', type: 'error' });
        return;
      }
      const pendingWrite = { before: topic.status, target: nextStatus, title: topic.title };
      setPendingStatusWrite(topic.id, pendingWrite);
      await verifyTopicStatusWrite(topic.id, pendingWrite);
    } finally {
      statusWritesInFlightRef.current.delete(topic.id);
    }
  };

  return <div className="space-y-4">
    {mobileReturnTo === '/production' ? <button type="button" onClick={() => navigate('/production')} className="xmt-btn xmt-btn-ghost min-h-11 px-3 py-2 text-sm"><ArrowLeft className="h-4 w-4" />返回工作</button> : null}
    <div className="flex gap-2"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-studio-border-soft bg-studio-surface px-3"><Search className="h-4 w-4 text-studio-text-muted" /><input id="mobile-topics-search" name="mobileTopicsSearch" aria-label="搜索选题" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索选题" /></label><button type="button" onClick={() => navigate('/topics/add')} aria-label="新建选题" className="xmt-btn xmt-btn-primary h-11 w-11 shrink-0 p-0"><Plus className="h-5 w-5" /></button></div>
    <div className="flex gap-2" aria-label="选题视图切换"><button type="button" aria-pressed={view === 'list'} onClick={() => setTopicsView('list')} className={`xmt-btn ${view === 'list' ? 'xmt-btn-primary' : 'xmt-btn-secondary'} min-h-10 flex-1 rounded-xl px-3 text-sm`}>列表</button><button type="button" aria-pressed={view === 'board'} onClick={() => setTopicsView('board')} className={`xmt-btn ${view === 'board' ? 'xmt-btn-primary' : 'xmt-btn-secondary'} min-h-10 flex-1 rounded-xl px-3 text-sm`}>看板</button></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="选题筛选">{filters.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => chooseFilter(item.id)} className={`xmt-btn ${filter === item.id ? 'xmt-btn-primary' : 'xmt-btn-secondary'} min-h-10 rounded-full px-4 text-sm`}>{item.label}</button>)}</div>
    <div className="flex items-center justify-between"><p className="text-sm text-studio-text-muted">{topicCountLabel}</p><button type="button" disabled={isFetching} aria-busy={isFetching} onClick={() => void refetch()} className="xmt-btn xmt-btn-secondary inline-flex min-h-11 items-center px-3 text-sm disabled:opacity-50">{refreshListLabel}</button></div>
    {isError ? <div className="space-y-2 rounded-xl border border-studio-coral/30 bg-studio-coral/10 p-3">
      <p role="alert" className="text-sm text-studio-coral-contrast">选题列表读取失败：{topicsError instanceof Error ? topicsError.message : '请稍后重试。'}</p>
      {data ? <p role="status" className="text-sm text-studio-text-secondary">仍显示上次成功读取的列表，当前结果可能不是最新。</p> : <p className="text-sm text-studio-text-secondary">暂时无法确认符合条件的选题，请重试。</p>}
    </div> : null}
    {statusVerificationIds.size > 0 ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-3 text-sm text-studio-amber-contrast">
      <p>有 {statusVerificationIds.size} 个选题的状态更新结果暂时无法确认。只读核实前会暂停这些选题的再次审核或状态更新，不会自动重发。</p>
      <button type="button" disabled={statusVerificationIds.size === 0} onClick={() => { void verifyPendingTopicStatuses(); }} className="xmt-btn xmt-btn-secondary inline-flex min-h-11 items-center justify-center px-3 text-sm">只读核实</button>
    </div> : null}
    {isError && !data ? null : view === 'board' ? <TopicsBoardView
      topics={visibleTopics}
      total={data?.total ?? 0}
      statusFilter={filter === 'pending' || filter === 'creation' ? filter : ''}
      loading={isLoading}
      canUpdate={hasPermission('topic:update')}
      canAudit={hasPermission('topic:audit')}
      statusVerificationIds={statusVerificationIds}
      onOpenTopic={(topic) => { void openBoardTopic(topic); }}
      onTransition={transitionTopic}
    /> : <>
      {isLoading ? <p role="status" aria-live="polite" className="text-sm text-studio-text-secondary">正在加载选题…</p> : visibleTopics.length ? <div className="space-y-3">{visibleTopics.map((topic) => <button type="button" key={topic.id} onClick={() => navigate(`/topics/${topic.id}`)} className="xmt-card w-full bg-studio-surface p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary"><div className="flex items-start justify-between gap-3"><h2 className="line-clamp-2 text-base font-semibold">{topic.title}</h2><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${topicStatusClassNames(topic.status)}`}>{STATUS_TEXT[topic.status] || '状态待确认'}</span></div><p className="mt-2 line-clamp-2 text-sm text-studio-text-secondary">{topic.description || '暂无选题说明'}</p><div className="mt-3 flex items-center justify-between text-xs text-studio-text-secondary"><span>{topic.assignee_name ?? '未分配负责人'}</span><span>{topic.deadline ? formatBeijingDate(topic.deadline) : '未设置截止日期'}</span></div></button>)}</div> : <div className="rounded-2xl border border-dashed border-studio-border-soft p-8 text-center text-sm text-studio-text-secondary">没有符合条件的选题</div>}
      <div className="flex items-center justify-center gap-3"><button type="button" disabled={page === 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} className="xmt-btn xmt-btn-secondary min-h-11 rounded-xl px-4 text-sm disabled:opacity-40">上一页</button><span className="text-sm text-studio-text-muted">第 {page} 页</span><button type="button" disabled={!canLoadMore || isFetching} onClick={() => setPage((current) => current + 1)} className="xmt-btn xmt-btn-secondary min-h-11 rounded-xl px-4 text-sm disabled:opacity-40">下一页</button></div>
    </>}
  </div>;
}

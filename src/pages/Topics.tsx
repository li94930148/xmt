import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  CheckSquare,
  Eye,
  FileText,
  Filter,
  Plus,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import { auditTopic, deleteTopic, getTopics, getPublishing, getShooting, updateTopicStatus } from '../api';
import { ConfirmModal } from '../components/common';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  PageHeader,
  PageShell,
  ResponsiveTableShell,
  SearchBar,
  StageProgress,
  StatusPill,
  StudioSkeletonCard,
} from '../components/studio';
import { showRealtimeToast } from '../components/RealtimeToast';
import { useDebounce } from '../hooks/useDebounce';
import { usePermission } from '../hooks/usePermission';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useSocket } from '../hooks/useSocket';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore } from '../store';
import { createListFetchController, listErrorKey } from '../utils/listFetchNotify';
import { createBatchMutationNotice } from '../utils/batch-mutation-feedback';
import { Topic } from '../types';
import Pagination from '../components/Pagination';
import TopicSpotlightCard from '../components/xmt-ui/TopicSpotlightCard';
import { ReactBitsPageScene } from '../features/reactbits-appearance/slots/ReactBitsPageScene';
import { ReactBitsHeadingSlot } from '../features/reactbits-appearance/slots/ReactBitsHeadingSlot';
import { ReactBitsCardSlot } from '../features/reactbits-appearance/ReactBitsCardSlot';
import { ReactBitsRevealSlot } from '../features/reactbits-appearance/ReactBitsRevealSlot';
import { parseStoredBjt } from '@shared/time';
import TopicsBoardView from '../components/topics/TopicsBoardView';
import { topicStatusLabel } from '../components/topics/topicStatusLabel';
import { getKanbanTopicDestination } from '../platform/kanban-navigation';
import { celebrateMilestone } from '../utils/confetti';

type SortField = 'title' | 'created_at' | 'deadline' | 'status' | 'submitted_at';
type SortDir = 'asc' | 'desc';
type StudioTone = 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success' | 'muted';

const topicStatusTone: Record<string, StudioTone> = {
  pending: 'amber',
  approved: 'success',
  rejected: 'coral',
  production: 'primary',
  shooting: 'violet',
  publishing: 'cyan',
  completed: 'muted',
};

const workflowSteps = [
  { status: 'pending', label: '审核' },
  { status: 'approved', label: '通过' },
  { status: 'production', label: '创作' },
  { status: 'shooting', label: '成片' },
  { status: 'publishing', label: '发布' },
  { status: 'completed', label: '完成' },
];

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'production', label: '创作中' },
  { value: 'shooting', label: '成片制作' },
  { value: 'publishing', label: '发布中' },
  { value: 'completed', label: '已完成' },
];

function getWorkflowStages(status: string) {
  const currentIndex = workflowSteps.findIndex((step) => step.status === status);
  const blocked = status === 'rejected';

  return workflowSteps.map((step, index) => ({
    label: step.label,
    state: blocked
      ? index === 0
        ? ('blocked' as const)
        : ('pending' as const)
      : index < currentIndex
        ? ('done' as const)
        : index === currentIndex
          ? ('active' as const)
          : ('pending' as const),
  }));
}

function getNextAction(topic: Topic) {
  switch (topic.status) {
    case 'pending':
      return { label: '去审核', path: `/topics/${topic.id}`, tone: 'amber' as StudioTone };
    case 'approved':
    case 'production':
      return { label: '进入创作', path: '/production', tone: 'primary' as StudioTone };
    case 'shooting':
      return { label: '成片制作', path: '/shooting', tone: 'violet' as StudioTone };
    case 'publishing':
      return { label: '发布管理', path: '/publishing', tone: 'cyan' as StudioTone };
    case 'completed':
      return { label: '查看详情', path: `/topics/${topic.id}`, tone: 'muted' as StudioTone };
    case 'rejected':
      return { label: '查看原因', path: `/topics/${topic.id}`, tone: 'coral' as StudioTone };
    default:
      return { label: '查看详情', path: `/topics/${topic.id}`, tone: 'muted' as StudioTone };
  }
}

export default function Topics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [batchRefreshNotice, setBatchRefreshNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const batchActionInFlightRef = useRef(false);

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFromUrl = searchParams.get('status') || '';
  const view = searchParams.get('view') === 'board' ? 'board' : 'list';
  const [statusFilter, setStatusFilter] = useState(statusFromUrl);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const socket = useSocket();
  const { hasPermission } = usePermission();
  const [newTopicIds, setNewTopicIds] = useState<Set<number>>(new Set());
  const newTopicIdsRef = useRef(new Set<number>());
  const canCreateTopic = hasPermission('topic:create');

  const sortedTopics = useMemo(() => {
    return [...topics].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '');
          break;
        case 'created_at':
          cmp = (parseStoredBjt(a.created_at)?.getTime() ?? 0) - (parseStoredBjt(b.created_at)?.getTime() ?? 0);
          break;
        case 'deadline':
          cmp = new Date(a.deadline || '9999').getTime() - new Date(b.deadline || '9999').getTime();
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
        case 'submitted_at':
          cmp = new Date(a.submitted_at || '9999').getTime() - new Date(b.submitted_at || '9999').getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [sortDir, sortField, topics]);

  const spotlightTopics = useMemo(
    () => sortedTopics.filter((topic) => topic.status === 'pending' || isOverdue(topic) || newTopicIds.has(topic.id)).slice(0, 3),
    [newTopicIds, sortedTopics],
  );

  const pendingCount = topics.filter((topic) => topic.status === 'pending').length;
  const activeCount = topics.filter((topic) => ['production', 'shooting', 'publishing'].includes(topic.status)).length;
  const overdueCount = topics.filter((topic) => isOverdue(topic)).length;

  const allSelected = sortedTopics.length > 0 && sortedTopics.every((topic) => selected.has(topic.id));

  const fetchControllerRef = useRef(createListFetchController());

  const fetchTopics = useCallback(async (options?: { resetErrorNotify?: boolean; suppressErrorNotify?: boolean }) => {
    const controller = fetchControllerRef.current;
    if (options?.resetErrorNotify) {
      controller.resetErrorNotify();
    }
    const requestId = controller.begin();
    setLoading(true);
    try {
      const result = await getTopics({
        status: statusFilter,
        search: debouncedSearch,
        page: view === 'board' ? 1 : page,
        limit: view === 'board' ? 200 : limit,
      });
      if (!controller.isCurrent(requestId)) {
        return null;
      }
      setTopics(result.data);
      setTotal(result.total);
      setLoadError(null);
      setBatchRefreshNotice(null);
      controller.markSettledSuccess();
      return true;
    } catch (error) {
      if (!controller.isCurrent(requestId)) {
        return null;
      }
      const message = error instanceof Error && error.message ? error.message : '获取选题列表失败';
      setLoadError(message);
      const key = listErrorKey('获取选题列表失败', message, 'error');
      if (!options?.suppressErrorNotify && controller.shouldNotifyError(key)) {
        addNotification({
          title: '获取选题列表失败',
          message,
          type: 'error',
        });
      }
      return false;
    } finally {
      if (controller.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [addNotification, debouncedSearch, limit, page, statusFilter, view]);

  useEffect(() => {
    setStatusFilter(statusFromUrl);
    setPage(1);
  }, [statusFromUrl]);

  useEffect(() => {
    void fetchTopics();
  }, [fetchTopics]);

  useRealtimeSync({
    room: 'topics',
    socket,
    events: {
      'topic:created': (data) => {
        setTopics((prev) => {
          if (prev.some((topic) => topic.id === data.id)) {
            return prev;
          }
          return [data, ...prev];
        });
        newTopicIdsRef.current.add(data.id);
        setNewTopicIds(new Set(newTopicIdsRef.current));
        setTimeout(() => {
          newTopicIdsRef.current.delete(data.id);
          setNewTopicIds(new Set(newTopicIdsRef.current));
        }, 2000);
        showRealtimeToast({
          title: '新选题',
          message: `《${data.title}》已提交`,
          icon: <FileText className="h-5 w-5 text-studio-cyan" />,
        });
      },
      'topic:updated': (data) => {
        setTopics((prev) => prev.map((topic) => (topic.id === data.id ? data : topic)));
      },
      'topic:deleted': (data) => {
        setTopics((prev) => prev.filter((topic) => topic.id !== data.id));
      },
      'topic:audited': (data) => {
        setTopics((prev) =>
          prev.map((topic) => (topic.id === data.id ? { ...topic, status: data.status } : topic)),
        );
      },
    },
  });

  function isOverdue(topic: Topic) {
    return Boolean(topic.deadline) && new Date(topic.deadline) < new Date() && !['completed', 'rejected'].includes(topic.status);
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    }
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-studio-cyan" /> : <ArrowDown className="h-3 w-3 text-studio-cyan" />;
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedTopics.map((topic) => topic.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = async (id: number): Promise<boolean> => {
    try {
      await deleteTopic(id);
      addNotification({
        title: '删除成功',
        message: '选题已删除',
        type: 'success',
      });
      setTopics((prev) => prev.filter((topic) => topic.id !== id));
      setTotal((count) => Math.max(0, count - 1));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return true;
    } catch (error) {
      addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
      return false;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteLoading(true);
    try {
      const deleted = await handleDelete(deleteTarget.id);
      if (deleted) setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const finishBatchAction = async (
    action: '删除' | '审核',
    selectedIds: number[],
    failedIds: number[],
    firstError: string,
    status?: 'approved' | 'rejected',
  ) => {
    const notice = createBatchMutationNotice({
      action: action === '删除' ? 'delete' : 'audit',
      selectedIds,
      failedIds,
      firstError,
      ...(status ? { status } : {}),
    });
    setSelected(new Set(notice.failedIds));
    addNotification(notice);
    if (selectedIds.length === failedIds.length) return;

    const refreshed = await fetchTopics({ suppressErrorNotify: true });
    if (refreshed === false) {
      const failedSummary = failedIds.length > 0 ? `；失败的 ${failedIds.length} 项仍保留选择，可单独重试` : '';
      setBatchRefreshNotice(`服务端已确认批量${action}成功 ${selectedIds.length - failedIds.length}/${selectedIds.length} 项${failedSummary}。选题列表刷新失败；重新加载列表只会读取数据，不会再次执行已成功的操作。`);
    }
  };

  const handleBatchDelete = async () => {
    if (batchActionInFlightRef.current || selected.size === 0) return;
    const ids = Array.from(selected);
    if (!confirm(`确定删除选中的 ${ids.length} 个选题吗？`)) {
      return;
    }
    batchActionInFlightRef.current = true;
    setBatchActionLoading(true);
    setBatchRefreshNotice(null);
    const succeededIds: number[] = [];
    const failedIds: number[] = [];
    let firstError = '';
    try {
      for (const id of ids) {
        try {
          await deleteTopic(id);
          succeededIds.push(id);
        } catch (error) {
          failedIds.push(id);
          if (!firstError) firstError = error instanceof Error ? error.message : '删除失败，请重试';
        }
      }
      const succeeded = new Set(succeededIds);
      if (succeeded.size > 0) {
        setTopics((current) => current.filter((topic) => !succeeded.has(topic.id)));
        setTotal((current) => Math.max(0, current - succeeded.size));
      }
      await finishBatchAction('删除', ids, failedIds, firstError);
    } finally {
      batchActionInFlightRef.current = false;
      setBatchActionLoading(false);
    }
  };

  const handleBatchAudit = async (status: 'approved' | 'rejected') => {
    if (batchActionInFlightRef.current || selected.size === 0) return;
    const ids = Array.from(selected);
    batchActionInFlightRef.current = true;
    setBatchActionLoading(true);
    setBatchRefreshNotice(null);
    const succeededIds: number[] = [];
    const failedIds: number[] = [];
    let firstError = '';
    try {
      for (const id of ids) {
        try {
          await auditTopic(id, { status, comment: '批量审核' });
          succeededIds.push(id);
        } catch (error) {
          failedIds.push(id);
          if (!firstError) firstError = error instanceof Error ? error.message : '审核失败，请重试';
        }
      }
      const succeeded = new Set(succeededIds);
      if (succeeded.size > 0) {
        setTopics((current) => current.map((topic) => succeeded.has(topic.id) ? { ...topic, status } : topic));
      }
      await finishBatchAction('审核', ids, failedIds, firstError, status);
    } finally {
      batchActionInFlightRef.current = false;
      setBatchActionLoading(false);
    }
  };

  const retryTopicsList = async () => {
    await fetchTopics({ resetErrorNotify: true, suppressErrorNotify: Boolean(batchRefreshNotice) });
  };

  const openBoardTopic = async (topic: Topic) => {
    try {
      const path = await getKanbanTopicDestination(topic, {
        getShooting: (topicId) => getShooting({ topic_id: topicId, page: 1, limit: 1 }),
        getPublishing: (topicId) => getPublishing({ topic_id: topicId, page: 1, limit: 1 }),
      });
      if (!path) {
        addNotification({ title: '暂时无法打开流程详情', message: '该选题还没有对应的流程记录，请从选题详情查看状态。', type: 'warning' });
        navigate(`/topics/${topic.id}`);
        return;
      }
      navigate(path);
    } catch (error) {
      addNotification({ title: '流程详情加载失败', message: error instanceof Error ? error.message : '暂时无法打开流程详情', type: 'error' });
      navigate(`/topics/${topic.id}`);
    }
  };

  const handleBoardTransition = async (topic: Topic, status: Topic['status']) => {
    try {
      if (topic.status === 'pending' && (status === 'approved' || status === 'rejected')) {
        await auditTopic(topic.id, { status, comment: '' });
      } else {
        await updateTopicStatus(topic.id, status);
      }
      setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, status } : item));
      addNotification({ title: '状态已更新', message: `《${topic.title}》已更新为${topicStatusLabel(status)}`, type: 'success' });
      if (status === 'shooting' || status === 'completed') celebrateMilestone();
    } catch (error) {
      addNotification({ title: '状态更新失败', message: error instanceof Error ? error.message : '请检查权限或当前阶段后重试', type: 'error' });
    }
  };

  const setTopicsView = (nextView: 'list' | 'board') => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextView === 'board') next.set('view', 'board');
      else next.delete('view');
      return next;
    });
  };

  return (
    <ReactBitsPageScene page="topics" fallbackClassName="bg-gradient-to-br from-studio-surface-soft/30 to-studio-primary/20"><PageShell>
      <PageHeader
        title={<ReactBitsHeadingSlot>选题管理</ReactBitsHeadingSlot>}
        description="从提报、审核到生产流转，快速判断每个内容节点卡在哪一步、谁负责、下一步做什么。"
        actions={
          canCreateTopic ? (
            <ActionButton onClick={() => navigate('/topics/add')} variant="primary">
              <Plus className="h-4 w-4" />
              提报选题
            </ActionButton>
          ) : null
        }
      />

      {batchRefreshNotice ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
        <p>{batchRefreshNotice}</p>
        <ActionButton type="button" variant="secondary" onClick={() => void retryTopicsList()} disabled={loading} className="shrink-0">{loading ? '正在重新加载…' : '重新加载列表'}</ActionButton>
      </div> : null}

      <ReactBitsRevealSlot className="block"><div className="grid gap-4 md:grid-cols-3">
        <ReactBitsCardSlot semantic="topic-card" className="p-5">
          <p className="text-xs font-semibold text-studio-text-muted">待审核选题</p>
          <p className="mt-3 text-3xl font-bold text-studio-text-primary">{pendingCount}</p>
          <p className="mt-2 text-sm text-studio-text-secondary">需要编导或管理者处理</p>
        </ReactBitsCardSlot>
        <ReactBitsCardSlot semantic="topic-card" className="p-5">
          <p className="text-xs font-semibold text-studio-text-muted">生产链路中</p>
          <p className="mt-3 text-3xl font-bold text-studio-text-primary">{activeCount}</p>
          <p className="mt-2 text-sm text-studio-text-secondary">创作、成片和发布阶段</p>
        </ReactBitsCardSlot>
        <ReactBitsCardSlot semantic="topic-card" className="p-5">
          <p className="text-xs font-semibold text-studio-text-muted">临期或逾期</p>
          <p className="mt-3 text-3xl font-bold text-studio-text-primary">{overdueCount}</p>
          <p className="mt-2 text-sm text-studio-text-secondary">优先排查交付风险</p>
        </ReactBitsCardSlot>
      </div></ReactBitsRevealSlot>

      {spotlightTopics.length > 0 ? (
        <section aria-labelledby="priority-topics-title" className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-studio-cyan-contrast">Priority focus</p>
            <h2 id="priority-topics-title" className="mt-1 text-lg font-semibold text-studio-text-primary">重点选题</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {spotlightTopics.map((topic) => (
              <TopicSpotlightCard
                key={topic.id}
                topic={topic}
                statusLabel={topicStatusLabel(topic.status)}
                formattedTime={formatBeijingTime(topic.submitted_at || topic.created_at)}
                onOpen={() => navigate(`/topics/${topic.id}`)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <GlassPanel className="flex flex-wrap items-center gap-2 p-3" aria-label="选题视图切换">
        <button type="button" aria-pressed={view === 'list'} onClick={() => setTopicsView('list')} className={`xmt-btn min-h-9 px-3 py-2 text-sm ${view === 'list' ? 'xmt-btn-primary' : 'xmt-btn-secondary'}`}>列表</button>
        <button type="button" aria-pressed={view === 'board'} onClick={() => setTopicsView('board')} className={`xmt-btn min-h-9 px-3 py-2 text-sm ${view === 'board' ? 'xmt-btn-primary' : 'xmt-btn-secondary'}`}>看板</button>
        <span className="text-xs text-studio-text-muted">列表和看板共用选题筛选；日历继续保留独立排期事件入口。</span>
      </GlassPanel>

      <GlassPanel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <SearchBar
            id="topics-search"
            name="topicsSearch"
            aria-label="搜索选题标题或描述"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
            placeholder="搜索选题标题或描述..."
          />
          <label className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-text-muted" />
            <select
              id="topics-status-filter"
              name="topicsStatusFilter"
              aria-label="按状态筛选选题"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="min-h-10 w-full appearance-none rounded-button border border-studio-border-soft bg-studio-surface-soft py-2 pl-9 pr-3 text-sm leading-snug text-studio-text-primary outline-none transition focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            >
              {statusOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value} className="bg-studio-surface text-studio-text-primary">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </GlassPanel>

      {view === 'board' ? (
        <TopicsBoardView
          topics={sortedTopics}
          total={total}
          statusFilter={statusFilter}
          loading={loading}
          canUpdate={hasPermission('topic:update')}
          canAudit={hasPermission('topic:audit')}
          onOpenTopic={openBoardTopic}
          onTransition={(topic, status) => { void handleBoardTransition(topic, status); }}
        />
      ) : <ResponsiveTableShell footer={<Pagination page={page} total={total} limit={limit} onChange={setPage} />}>
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-studio-border-soft bg-studio-surface-soft text-left text-xs font-semibold uppercase text-studio-text-muted">
                <th className="w-12 px-4 py-3">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="rounded-lg p-1.5 hover:bg-studio-surface-soft"
                    aria-label={allSelected ? '取消全选选题' : '选择全部选题'}
                    aria-pressed={allSelected}
                  >
                    {allSelected ? <CheckSquare className="h-4 w-4 text-studio-cyan" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('title')} className="flex items-center gap-1 hover:text-studio-cyan-contrast">
                    选题 <SortIcon field="title" />
                  </button>
                </th>
                <th className="px-4 py-3">负责人</th>
                <th className="px-4 py-3">平台</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('submitted_at')} className="flex items-center gap-1 hover:text-studio-cyan-contrast">
                    提交时间 <SortIcon field="submitted_at" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('deadline')} className="flex items-center gap-1 hover:text-studio-cyan-contrast">
                    截止 <SortIcon field="deadline" />
                  </button>
                </th>
                <th className="px-4 py-3">流程</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-studio-cyan-contrast">
                    状态 <SortIcon field="status" />
                  </button>
                </th>
                <th className="sticky right-0 z-10 bg-studio-surface px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-studio-border-soft">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-5">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <StudioSkeletonCard key={index} />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={9} className="p-6">
                    <EmptyState
                      icon={AlertTriangle}
                      title="获取选题列表失败"
                      description={loadError}
                      actionLabel="重试"
                      onAction={() => { void retryTopicsList(); }}
                    />
                  </td>
                </tr>
              ) : sortedTopics.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6">
                    <EmptyState
                      icon={FileText}
                      title="暂无选题"
                      description={searchTerm || statusFilter ? '没有匹配当前筛选条件的选题。' : '提报选题后会在这里进入生产链路。'}
                      actionLabel={searchTerm || statusFilter ? '清除筛选' : undefined}
                      onAction={
                        searchTerm || statusFilter
                          ? () => {
                              setSearchTerm('');
                              setStatusFilter('');
                              setPage(1);
                            }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                sortedTopics.map((topic) => {
                  const selectedRow = selected.has(topic.id);
                  const nextAction = getNextAction(topic);

                  return (
                    <tr
                      key={topic.id}
                      className={`group transition hover:bg-studio-surface-soft ${
                        selectedRow ? 'bg-studio-primary/[0.055]' : ''
                      } ${newTopicIds.has(topic.id) ? 'animate-new-item new-item-highlight' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleSelect(topic.id)}
                          className="rounded-lg p-1.5 hover:bg-studio-surface-soft"
                          aria-label={`${selectedRow ? '取消选择' : '选择'}选题：${topic.title}`}
                          aria-pressed={selectedRow}
                        >
                          {selectedRow ? <CheckSquare className="h-4 w-4 text-studio-cyan" /> : <Square className="h-4 w-4 text-studio-text-muted" />}
                        </button>
                      </td>
                      <td className="max-w-[280px] px-4 py-4">
                        <div className="flex items-center gap-2">
                          {isOverdue(topic) ? <AlertTriangle className="h-4 w-4 shrink-0 text-studio-coral" /> : null}
                          <button
                            type="button"
                            onClick={() => navigate(`/topics/${topic.id}`)}
                            className="truncate text-left text-sm font-semibold text-studio-text-primary transition hover:text-studio-cyan-contrast"
                          >
                            {topic.title}
                          </button>
                        </div>
                        <p className="mt-1 truncate text-xs text-studio-text-muted">提报：{topic.creator_name || '-'}</p>
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-[10px] font-medium text-studio-text-muted">下一步</span>
                          <button
                            type="button"
                            onClick={() => navigate(nextAction.path)}
                            className="inline-flex min-h-7 min-w-0 items-center gap-1 rounded-button border border-studio-border-soft bg-studio-surface-soft px-2.5 py-1 text-xs font-semibold leading-snug text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                          >
                            {nextAction.label}
                            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-studio-text-secondary">{topic.assignee_name || '未指派'}</td>
                      <td className="px-4 py-4 text-sm text-studio-text-secondary">{topic.platform || '-'}</td>
                      <td className="px-4 py-4 text-sm text-studio-text-secondary">{formatBeijingTime(topic.submitted_at || topic.created_at)}</td>
                      <td className={`px-4 py-4 text-sm ${isOverdue(topic) ? 'text-studio-coral' : 'text-studio-text-secondary'}`}>
                        {formatBeijingDate(topic.deadline)}
                      </td>
                      <td className="w-56 px-4 py-4">
                        <StageProgress stages={getWorkflowStages(topic.status)} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill tone={topicStatusTone[topic.status] || 'muted'}>{topicStatusLabel(topic.status)}</StatusPill>
                      </td>
                      <td className="sticky right-0 z-10 bg-studio-surface px-4 py-4">
                        <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => navigate(`/topics/${topic.id}`)}
                            className="rounded-lg p-2 text-studio-text-muted transition hover:bg-studio-surface-soft hover:text-studio-cyan-contrast"
                            title="查看"
                            aria-label={`查看选题 ${topic.title}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(topic)}
                            className="rounded-lg p-2 text-studio-text-muted transition hover:bg-studio-coral-soft hover:text-studio-coral-contrast"
                            title="删除"
                            aria-label={`删除选题 ${topic.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </ResponsiveTableShell>}

      {selected.size > 0 ? (
        <GlassPanel className="fixed bottom-6 left-1/2 z-page-overlay flex -translate-x-1/2 flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-studio-text-primary">已选 {selected.size} 个选题</span>
          <ActionButton onClick={() => handleBatchAudit('approved')} disabled={batchActionLoading} className="px-3 py-2">
            <CheckCircle className="h-4 w-4" />
            {batchActionLoading ? '正在处理…' : '通过'}
          </ActionButton>
          <ActionButton onClick={() => handleBatchAudit('rejected')} disabled={batchActionLoading} className="border-studio-coral-soft px-3 py-2 text-studio-coral-contrast hover:bg-studio-coral-soft">
            <XCircle className="h-4 w-4" />
            {batchActionLoading ? '正在处理…' : '驳回'}
          </ActionButton>
          <ActionButton onClick={handleBatchDelete} disabled={batchActionLoading} variant="danger" className="px-3 py-2">
            <Trash2 className="h-4 w-4" />
            {batchActionLoading ? '正在处理…' : '删除'}
          </ActionButton>
          <ActionButton onClick={() => setSelected(new Set())} disabled={batchActionLoading} variant="ghost" className="px-3 py-2">
            取消选择
          </ActionButton>
        </GlassPanel>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
        variant="danger"
        title="确认删除"
        confirmText="确认删除"
        cancelText="取消"
        description={deleteTarget ? `确定要删除选题“${deleteTarget.title}”吗？` : ''}
      />
    </PageShell></ReactBitsPageScene>
  );
}

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
import { auditTopic, deleteTopic, getTopics } from '../api';
import { ConfirmModal } from '../components/common';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  PageHeader,
  PageShell,
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
import { Topic } from '../types';
import Pagination from '../components/Pagination';

type SortField = 'title' | 'created_at' | 'deadline' | 'status' | 'submitted_at';
type SortDir = 'asc' | 'desc';
type StudioTone = 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success' | 'muted';

const topicStatusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '发布中',
  completed: '已完成',
};

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
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const navigate = useNavigate();
  const appStore = useAppStore();
  const [searchParams] = useSearchParams();
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
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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

  const pendingCount = topics.filter((topic) => topic.status === 'pending').length;
  const activeCount = topics.filter((topic) => ['production', 'shooting', 'publishing'].includes(topic.status)).length;
  const overdueCount = topics.filter((topic) => isOverdue(topic)).length;

  const allSelected = sortedTopics.length > 0 && sortedTopics.every((topic) => selected.has(topic.id));

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTopics({ status: statusFilter, search: debouncedSearch, page, limit });
      setTopics(result.data);
      setTotal(result.total);
    } catch (error) {
      appStore.addNotification({
        title: '获取选题列表失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [appStore, debouncedSearch, limit, page, statusFilter]);

  useEffect(() => {
    const status = searchParams.get('status') || '';
    setStatusFilter(status);
    setPage(1);
  }, [searchParams]);

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

  const handleDelete = async (id: number) => {
    try {
      await deleteTopic(id);
      appStore.addNotification({
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
    } catch (error) {
      appStore.addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteLoading(true);
    try {
      await handleDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!confirm(`确定删除选中的 ${selected.size} 个选题吗？`)) {
      return;
    }
    let success = 0;
    for (const id of selected) {
      try {
        await deleteTopic(id);
        success++;
      } catch {}
    }
    appStore.addNotification({
      title: '批量删除完成',
      message: `成功 ${success}/${selected.size}`,
      type: 'success',
    });
    setSelected(new Set());
    await fetchTopics();
  };

  const handleBatchAudit = async (status: 'approved' | 'rejected') => {
    let success = 0;
    for (const id of selected) {
      try {
        await auditTopic(id, { status, comment: '批量审核' });
        success++;
      } catch {}
    }
    appStore.addNotification({
      title: '批量审核完成',
      message: `成功 ${success}/${selected.size}`,
      type: 'success',
    });
    setSelected(new Set());
    await fetchTopics();
  };

  return (
    <PageShell>
      <PageHeader
        title="选题管理"
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

      <div className="grid gap-4 md:grid-cols-3">
        <GlassPanel className="p-5">
          <p className="text-xs font-semibold text-studio-text-muted">待审核选题</p>
          <p className="mt-3 text-3xl font-bold text-studio-text-primary">{pendingCount}</p>
          <p className="mt-2 text-sm text-studio-text-secondary">需要编导或管理者处理</p>
        </GlassPanel>
        <GlassPanel className="p-5">
          <p className="text-xs font-semibold text-studio-text-muted">生产链路中</p>
          <p className="mt-3 text-3xl font-bold text-studio-text-primary">{activeCount}</p>
          <p className="mt-2 text-sm text-studio-text-secondary">创作、成片和发布阶段</p>
        </GlassPanel>
        <GlassPanel className="p-5">
          <p className="text-xs font-semibold text-studio-text-muted">临期或逾期</p>
          <p className="mt-3 text-3xl font-bold text-studio-text-primary">{overdueCount}</p>
          <p className="mt-2 text-sm text-studio-text-secondary">优先排查交付风险</p>
        </GlassPanel>
      </div>

      <GlassPanel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <SearchBar
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
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="h-10 w-full appearance-none rounded-button border border-studio-border-soft bg-white/[0.05] pl-9 pr-3 text-sm text-studio-text-primary outline-none transition focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
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

      <GlassPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px]">
            <thead>
              <tr className="border-b border-studio-border-soft bg-white/[0.035] text-left text-xs font-semibold uppercase text-studio-text-muted">
                <th className="w-12 px-4 py-3">
                  <button type="button" onClick={toggleSelectAll} className="rounded-lg p-1.5 hover:bg-white/[0.06]">
                    {allSelected ? <CheckSquare className="h-4 w-4 text-studio-cyan" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('title')} className="flex items-center gap-1 hover:text-studio-cyan">
                    选题 <SortIcon field="title" />
                  </button>
                </th>
                <th className="px-4 py-3">负责人</th>
                <th className="px-4 py-3">平台</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('submitted_at')} className="flex items-center gap-1 hover:text-studio-cyan">
                    提交时间 <SortIcon field="submitted_at" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('deadline')} className="flex items-center gap-1 hover:text-studio-cyan">
                    截止 <SortIcon field="deadline" />
                  </button>
                </th>
                <th className="px-4 py-3">流程</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-studio-cyan">
                    状态 <SortIcon field="status" />
                  </button>
                </th>
                <th className="px-4 py-3">下一步</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-studio-border-soft">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-5">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <StudioSkeletonCard key={index} />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : sortedTopics.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6">
                    <EmptyState
                      icon={FileText}
                      title="暂无选题"
                      description={searchTerm || statusFilter ? '没有匹配当前筛选条件的选题。' : '提报选题后会在这里进入生产链路。'}
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
                      className={`group transition hover:bg-white/[0.045] ${
                        selectedRow ? 'bg-studio-primary/[0.055]' : ''
                      } ${newTopicIds.has(topic.id) ? 'animate-new-item new-item-highlight' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <button type="button" onClick={() => toggleSelect(topic.id)} className="rounded-lg p-1.5 hover:bg-white/[0.06]">
                          {selectedRow ? <CheckSquare className="h-4 w-4 text-studio-cyan" /> : <Square className="h-4 w-4 text-studio-text-muted" />}
                        </button>
                      </td>
                      <td className="max-w-[280px] px-4 py-4">
                        <div className="flex items-center gap-2">
                          {isOverdue(topic) ? <AlertTriangle className="h-4 w-4 shrink-0 text-studio-coral" /> : null}
                          <button
                            type="button"
                            onClick={() => navigate(`/topics/${topic.id}`)}
                            className="truncate text-left text-sm font-semibold text-studio-text-primary transition hover:text-studio-cyan"
                          >
                            {topic.title}
                          </button>
                        </div>
                        <p className="mt-1 truncate text-xs text-studio-text-muted">提报：{topic.creator_name || '-'}</p>
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
                        <StatusPill tone={topicStatusTone[topic.status] || 'muted'}>{topicStatusLabel[topic.status] || topic.status}</StatusPill>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => navigate(nextAction.path)}
                          className="inline-flex items-center gap-1.5 rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                        >
                          {nextAction.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => navigate(`/topics/${topic.id}`)}
                            className="rounded-lg p-2 text-studio-text-muted transition hover:bg-white/[0.06] hover:text-studio-cyan"
                            title="查看"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(topic)}
                            className="rounded-lg p-2 text-studio-text-muted transition hover:bg-studio-coral/10 hover:text-studio-coral"
                            title="删除"
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
        </div>

        <div className="border-t border-studio-border-soft bg-white/[0.025]">
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      </GlassPanel>

      {selected.size > 0 ? (
        <GlassPanel className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-studio-text-primary">已选 {selected.size} 个选题</span>
          <ActionButton onClick={() => handleBatchAudit('approved')} className="px-3 py-2">
            <CheckCircle className="h-4 w-4" />
            通过
          </ActionButton>
          <ActionButton onClick={() => handleBatchAudit('rejected')} className="px-3 py-2 border-studio-coral/35 text-[#FFC2CC] hover:bg-studio-coral/10">
            <XCircle className="h-4 w-4" />
            驳回
          </ActionButton>
          <ActionButton onClick={handleBatchDelete} className="px-3 py-2 border-studio-coral/35 text-[#FFC2CC] hover:bg-studio-coral/10">
            <Trash2 className="h-4 w-4" />
            删除
          </ActionButton>
          <ActionButton onClick={() => setSelected(new Set())} variant="ghost" className="px-3 py-2">
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
    </PageShell>
  );
}

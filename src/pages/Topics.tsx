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
import { auditTopic, deleteTopic, getTopic, getTopicDeleteStatus, getTopics, getPublishing, getShooting, updateTopicStatus, TopicApiError } from '../api';
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
import { getPlatformLabel } from '../platform/platform-labels';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useSocket } from '../hooks/useSocket';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore } from '../store';
import { createListFetchController } from '../utils/listFetchNotify';
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
  { value: 'creation', label: '创作阶段（已通过 + 创作中）' },
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
  const topicsRef = useRef(topics);
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
  const [batchDeleteConfirmationOpen, setBatchDeleteConfirmationOpen] = useState(false);
  const [batchRefreshNotice, setBatchRefreshNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteVerificationIds, setDeleteVerificationIds] = useState<Set<number>>(new Set());
  const [deleteVerificationLoading, setDeleteVerificationLoading] = useState(false);
  const [statusVerificationIds, setStatusVerificationIds] = useState<Set<number>>(new Set());
  const [statusVerificationLoading, setStatusVerificationLoading] = useState(false);
  const deleteInFlightRef = useRef(false);
  const statusVerificationInFlightRef = useRef(false);
  const pendingTopicDeleteIdsRef = useRef(new Set<number>());
  const uncertainTopicDeleteIdsRef = useRef(new Set<number>());
  const uncertainTopicStatusWritesRef = useRef(new Map<number, { before: Topic['status']; target: Topic['status'] }>());
  const realtimeDeletedTopicIdsRef = useRef(new Set<number>());
  const completedTopicDeleteIdsRef = useRef(new Set<number>());
  const batchActionInFlightRef = useRef(false);

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);

  const setTopicDeleteUncertain = (id: number, uncertain: boolean) => {
    const next = new Set(uncertainTopicDeleteIdsRef.current);
    if (uncertain) next.add(id);
    else next.delete(id);
    uncertainTopicDeleteIdsRef.current = next;
    setDeleteVerificationIds(next);
  };

  const setTopicStatusWriteUncertain = (id: number, write: { before: Topic['status']; target: Topic['status'] } | null) => {
    const next = new Map(uncertainTopicStatusWritesRef.current);
    if (write) next.set(id, write);
    else next.delete(id);
    uncertainTopicStatusWritesRef.current = next;
    setStatusVerificationIds(new Set(next.keys()));
  };

  const applyTopicSnapshot = (latest: Topic) => {
    topicsRef.current = topicsRef.current.map((topic) => topic.id === latest.id ? latest : topic);
    setTopics((current) => current.map((topic) => topic.id === latest.id ? latest : topic));
  };

  const completeTopicDelete = (id: number, notify = true) => {
    if (completedTopicDeleteIdsRef.current.has(id)) return;
    completedTopicDeleteIdsRef.current.add(id);
    setTopicDeleteUncertain(id, false);
    const wasVisible = topicsRef.current.some((topic) => topic.id === id);
    topicsRef.current = topicsRef.current.filter((topic) => topic.id !== id);
    setTopics((current) => current.filter((topic) => topic.id !== id));
    if (wasVisible) setTotal((current) => Math.max(0, current - 1));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setDeleteTarget((current) => current?.id === id ? null : current);
    if (notify) {
      addNotification({ title: '删除成功', message: '已确认选题不存在，列表已同步。', type: 'success' });
    }
  };
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

  const fetchTopics = useCallback(async () => {
    const controller = fetchControllerRef.current;
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
      topicsRef.current = result.data;
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
      return false;
    } finally {
      if (controller.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, limit, page, statusFilter, view]);

  const resolveAmbiguousTopicStatusWrite = async (
    id: number,
    before: Topic['status'],
    target: Topic['status'],
  ): Promise<'applied' | 'retryable' | 'changed' | 'missing' | 'unknown'> => {
    try {
      const latest = await getTopic(id);
      applyTopicSnapshot(latest);
      setTopicStatusWriteUncertain(id, null);
      if (latest.status === target) {
        setSelected((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        return 'applied';
      }
      if (latest.status === before) return 'retryable';
      setSelected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      return 'changed';
    } catch (error) {
      if (error instanceof TopicApiError && error.status === 404) {
        setTopicStatusWriteUncertain(id, null);
        completeTopicDelete(id, false);
        return 'missing';
      }
      setTopicStatusWriteUncertain(id, { before, target });
      return 'unknown';
    }
  };

  const verifyTopicStatusWrites = async (ids: number[]) => {
    if (statusVerificationInFlightRef.current || ids.length === 0) return;
    statusVerificationInFlightRef.current = true;
    setStatusVerificationLoading(true);
    let applied = 0;
    let unchanged = 0;
    let changed = 0;
    let missing = 0;
    let unresolved = 0;
    try {
      for (const id of ids) {
        const pendingWrite = uncertainTopicStatusWritesRef.current.get(id);
        if (!pendingWrite) continue;
        const outcome = await resolveAmbiguousTopicStatusWrite(id, pendingWrite.before, pendingWrite.target);
        if (outcome === 'applied') applied += 1;
        else if (outcome === 'retryable') unchanged += 1;
        else if (outcome === 'changed') changed += 1;
        else if (outcome === 'missing') missing += 1;
        else unresolved += 1;
      }
    } finally {
      statusVerificationInFlightRef.current = false;
      setStatusVerificationLoading(false);
      const remaining = uncertainTopicStatusWritesRef.current.size;
      if (applied > 0 || unchanged > 0 || changed > 0 || missing > 0 || unresolved > 0) {
        addNotification({
          title: remaining > 0 ? '仍有状态结果待核实' : '只读核实完成',
          message: `确认已按目标更新 ${applied} 项、仍为原状态 ${unchanged} 项、已被其他操作改为新状态 ${changed} 项、记录已不存在 ${missing} 项${remaining > 0 ? `；${remaining} 项仍无法读取` : ''}。核实不会重复发送审核或状态更新。`,
          type: remaining > 0 ? 'warning' : 'info',
        });
      }
      if (applied > 0 || changed > 0 || missing > 0) {
        await fetchTopics();
      }
    }
  };

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
          const next = [data, ...prev];
          topicsRef.current = next;
          return next;
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
        topicsRef.current = topicsRef.current.map((topic) => (topic.id === data.id ? data : topic));
        setTopics((prev) => prev.map((topic) => (topic.id === data.id ? data : topic)));
      },
      'topic:deleted': (data) => {
        if (pendingTopicDeleteIdsRef.current.has(data.id) || uncertainTopicDeleteIdsRef.current.has(data.id)) {
          realtimeDeletedTopicIdsRef.current.add(data.id);
          completeTopicDelete(data.id, deleteInFlightRef.current || uncertainTopicDeleteIdsRef.current.has(data.id));
        } else {
          completeTopicDelete(data.id, false);
        }
      },
      'topic:audited': (data) => {
        topicsRef.current = topicsRef.current.map((topic) => (topic.id === data.id ? { ...topic, status: data.status } : topic));
        setTopics((prev) => prev.map((topic) => (topic.id === data.id ? { ...topic, status: data.status } : topic)));
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

  const handleDelete = async (id: number, notify = true): Promise<'deleted' | 'present' | 'unknown'> => {
    if (uncertainTopicStatusWritesRef.current.has(id)) return 'unknown';
    if (uncertainTopicDeleteIdsRef.current.has(id)) return 'unknown';
    pendingTopicDeleteIdsRef.current.add(id);
    try {
      await deleteTopic(id);
      completeTopicDelete(id, notify);
      return 'deleted';
    } catch (error) {
      if (realtimeDeletedTopicIdsRef.current.has(id) || (error instanceof TopicApiError && error.status === 404)) {
        completeTopicDelete(id, notify);
        return 'deleted';
      }
      if (error instanceof TopicApiError && [400, 401, 403, 422].includes(error.status)) throw error;
      try {
        const status = await getTopicDeleteStatus(id);
        if (status === 'missing') {
          completeTopicDelete(id, notify);
          return 'deleted';
        }
        return 'present';
      } catch {
        if (realtimeDeletedTopicIdsRef.current.has(id)) {
          completeTopicDelete(id, false);
          return 'deleted';
        }
        setTopicDeleteUncertain(id, true);
        return 'unknown';
      }
    } finally {
      pendingTopicDeleteIdsRef.current.delete(id);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleteInFlightRef.current || batchActionInFlightRef.current) {
      return;
    }

    const requestedTopicId = deleteTarget.id;
    if (uncertainTopicStatusWritesRef.current.has(requestedTopicId)) return;
    if (uncertainTopicDeleteIdsRef.current.has(requestedTopicId)) return;
    deleteInFlightRef.current = true;
    setDeleteLoading(true);
    try {
      const outcome = await handleDelete(requestedTopicId);
      if (outcome === 'present') {
        addNotification({ title: '删除未完成', message: '核实后选题仍存在，没有重复发送删除。确认后可再次尝试。', type: 'warning' });
      } else if (outcome === 'unknown') {
        addNotification({ title: '删除结果待核实', message: '暂时无法确认选题是否已删除。已暂停再次删除，请先进行只读核实。', type: 'warning' });
      }
    } catch (error) {
      addNotification({ title: '删除失败', message: error instanceof Error ? error.message : '删除选题失败', type: 'error' });
    } finally {
      deleteInFlightRef.current = false;
      setDeleteLoading(false);
    }
  };

  const verifyTopicDeletes = async (ids: number[]) => {
    if (deleteVerificationLoading || ids.length === 0) return;
    setDeleteVerificationLoading(true);
    let missing = 0;
    let present = 0;
    let unresolved = 0;
    try {
      for (const id of ids) {
        if (!uncertainTopicDeleteIdsRef.current.has(id)) continue;
        if (realtimeDeletedTopicIdsRef.current.has(id)) {
          completeTopicDelete(id, false);
          missing += 1;
          continue;
        }
        try {
          const status = await getTopicDeleteStatus(id);
          setTopicDeleteUncertain(id, false);
          if (status === 'missing') {
            completeTopicDelete(id);
            missing += 1;
          } else {
            present += 1;
          }
        } catch {
          unresolved += 1;
        }
      }
    } finally {
      setDeleteVerificationLoading(false);
      const remaining = uncertainTopicDeleteIdsRef.current.size;
      if (missing > 0 || present > 0 || unresolved > 0) {
        addNotification({
          title: remaining > 0 ? '仍有删除结果待核实' : '只读核实完成',
          message: `已确认 ${missing} 项不存在、${present} 项仍存在${remaining > 0 ? `，${remaining} 项状态仍无法读取` : ''}。核实不会发送删除请求。`,
          type: remaining > 0 ? 'warning' : 'info',
        });
      }
    }
  };

  const finishBatchAction = async (
    action: '删除' | '审核',
    selectedIds: number[],
    failedIds: number[],
    firstError: string,
    status?: 'approved' | 'rejected',
    selectedAfter: number[] = failedIds,
  ) => {
    const notice = createBatchMutationNotice({
      action: action === '删除' ? 'delete' : 'audit',
      selectedIds,
      failedIds,
      firstError,
      ...(status ? { status } : {}),
    });
    setSelected(new Set(selectedAfter));
    addNotification(notice);
    if (selectedIds.length === failedIds.length) return;

    const refreshed = await fetchTopics();
    if (refreshed === false) {
      const failedSummary = failedIds.length > 0 ? `；失败的 ${failedIds.length} 项仍保留选择，可单独重试` : '';
      setBatchRefreshNotice(`服务端已确认批量${action}成功 ${selectedIds.length - failedIds.length}/${selectedIds.length} 项${failedSummary}。选题列表刷新失败；重新加载列表只会读取数据，不会再次执行已成功的操作。`);
    }
  };

  const handleBatchDelete = async () => {
    if (batchActionInFlightRef.current || deleteInFlightRef.current || selected.size === 0) return;
    const ids = Array.from(selected);
    if (ids.some((id) => uncertainTopicDeleteIdsRef.current.has(id))) {
      addNotification({ title: '请先核实删除状态', message: '所选项目中有删除结果待核实的选题；只读核实完成前不会再次执行批量删除。', type: 'warning' });
      return;
    }
    if (ids.some((id) => uncertainTopicStatusWritesRef.current.has(id))) {
      addNotification({ title: '请先核实状态结果', message: '所选项目中有审核或状态更新结果待核实；只读核实完成前不会删除这些记录。', type: 'warning' });
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
          const outcome = await handleDelete(id, false);
          if (outcome === 'deleted') succeededIds.push(id);
          else {
            failedIds.push(id);
            if (!firstError) firstError = outcome === 'present' ? '核实后选题仍存在，未重复发送删除' : '删除结果待核实，已暂停再次删除';
          }
        } catch (error) {
          failedIds.push(id);
          if (!firstError) firstError = error instanceof Error ? error.message : '删除失败，请重试';
        }
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
    if (ids.some((id) => uncertainTopicDeleteIdsRef.current.has(id))) {
      addNotification({ title: '请先核实删除状态', message: '所选项目中有删除结果待核实的选题；只读核实完成前不会修改这些选题。', type: 'warning' });
      return;
    }
    if (ids.some((id) => uncertainTopicStatusWritesRef.current.has(id))) {
      addNotification({ title: '请先核实状态结果', message: '所选项目中有审核或状态更新结果待核实；只读核实完成前不会再次审核。', type: 'warning' });
      return;
    }
    batchActionInFlightRef.current = true;
    setBatchActionLoading(true);
    setBatchRefreshNotice(null);
    const succeededIds: number[] = [];
    const failedIds: number[] = [];
    const selectedAfter: number[] = [];
    let firstError = '';
    try {
      for (const id of ids) {
        const current = topicsRef.current.find((topic) => topic.id === id);
        if (!current) {
          failedIds.push(id);
          if (!firstError) firstError = '选题已不在当前列表中，请刷新后确认';
          continue;
        }
        try {
          await auditTopic(id, { status, comment: '批量审核' });
          succeededIds.push(id);
        } catch (error) {
          const definiteRejection = error instanceof TopicApiError
            && error.status >= 400
            && error.status < 500
            && ![408, 425, 429].includes(error.status);
          if (definiteRejection) {
            failedIds.push(id);
            selectedAfter.push(id);
            if (!firstError) firstError = error.message || '审核失败，请检查权限或当前状态';
            continue;
          }

          const outcome = await resolveAmbiguousTopicStatusWrite(id, current.status, status);
          if (outcome === 'applied') {
            succeededIds.push(id);
          } else {
            failedIds.push(id);
            if (outcome === 'retryable' || outcome === 'unknown') selectedAfter.push(id);
            if (!firstError) {
              firstError = outcome === 'retryable'
                ? '只读核实确认状态仍未改变，可由你明确重试'
                : outcome === 'changed'
                  ? '选题状态已被其他操作更新，请刷新后确认'
                  : outcome === 'missing'
                    ? '选题已不存在'
                    : '审核结果及当前状态暂时无法读取，已暂停重试';
            }
          }
        }
      }
      const succeeded = new Set(succeededIds);
      if (succeeded.size > 0) {
        topicsRef.current = topicsRef.current.map((topic) => succeeded.has(topic.id) ? { ...topic, status } : topic);
        setTopics((current) => current.map((topic) => succeeded.has(topic.id) ? { ...topic, status } : topic));
      }
      await finishBatchAction('审核', ids, failedIds, firstError, status, selectedAfter);
    } finally {
      batchActionInFlightRef.current = false;
      setBatchActionLoading(false);
    }
  };

  const retryTopicsList = async () => {
    await fetchTopics();
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
    if (uncertainTopicDeleteIdsRef.current.has(topic.id)) {
      addNotification({ title: '请先核实删除状态', message: '该选题的删除结果尚未确认，核实前不会修改状态。', type: 'warning' });
      return;
    }
    if (uncertainTopicStatusWritesRef.current.has(topic.id)) {
      addNotification({ title: '请先核实状态结果', message: '该选题已有审核或状态更新结果待核实；只读核实完成前不会再次修改。', type: 'warning' });
      return;
    }
    try {
      if (topic.status === 'pending' && (status === 'approved' || status === 'rejected')) {
        await auditTopic(topic.id, { status, comment: '' });
      } else {
        await updateTopicStatus(topic.id, status);
      }
      topicsRef.current = topicsRef.current.map((item) => item.id === topic.id ? { ...item, status } : item);
      setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, status } : item));
      addNotification({ title: '状态已更新', message: `《${topic.title}》已更新为${topicStatusLabel(status)}`, type: 'success' });
      if (status === 'shooting' || status === 'completed') celebrateMilestone();
    } catch (error) {
      const definiteRejection = error instanceof TopicApiError
        && error.status >= 400
        && error.status < 500
        && ![408, 425, 429].includes(error.status);
      if (definiteRejection) {
        addNotification({ title: '状态更新失败', message: error.message || '请检查权限或当前阶段后重试', type: 'error' });
        return;
      }
      const outcome = await resolveAmbiguousTopicStatusWrite(topic.id, topic.status, status);
      if (outcome === 'applied') {
        addNotification({ title: '状态已更新', message: `《${topic.title}》已更新为${topicStatusLabel(status)}；服务端结果已只读确认。`, type: 'success' });
        if (status === 'shooting' || status === 'completed') celebrateMilestone();
      } else if (outcome === 'retryable') {
        addNotification({ title: '状态未更新', message: `只读核实确认《${topic.title}》仍为${topicStatusLabel(topic.status)}。没有自动重试；确认后可再次操作。`, type: 'warning' });
      } else if (outcome === 'changed') {
        addNotification({ title: '选题状态已变化', message: `《${topic.title}》已被其他操作更新为${topicStatusLabel(topicsRef.current.find((item) => item.id === topic.id)?.status)}，请先确认当前状态。`, type: 'warning' });
      } else if (outcome === 'missing') {
        addNotification({ title: '选题已不存在', message: `《${topic.title}》已从服务器移除，列表已同步。`, type: 'warning' });
      } else {
        addNotification({ title: '状态结果待核实', message: `暂时无法确认《${topic.title}》的状态；已暂停重复操作，请先使用页面提示进行只读核实。`, type: 'warning' });
      }
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

  const updateStatusFilter = (nextStatus: string) => {
    setStatusFilter(nextStatus);
    setPage(1);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextStatus) next.set('status', nextStatus);
      else next.delete('status');
      return next;
    }, { replace: true });
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

      {statusVerificationIds.size > 0 ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p>有 {statusVerificationIds.size} 个选题的审核或状态更新结果暂时无法确认。只读核实前会暂停这些记录的再次审核、看板状态更新和删除，不会自动重发。</p>
          <ActionButton type="button" variant="secondary" onClick={() => void verifyTopicStatusWrites([...statusVerificationIds])} disabled={statusVerificationLoading} className="shrink-0">
            {statusVerificationLoading ? '正在只读核实…' : '只读核实'}
          </ActionButton>
        </div>
      ) : null}

      {deleteVerificationIds.size > 0 ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p>有 {deleteVerificationIds.size} 个选题的删除结果暂时无法确认。核实前不会再次删除或批量修改这些记录。</p>
          <ActionButton type="button" variant="secondary" onClick={() => void verifyTopicDeletes([...deleteVerificationIds])} disabled={deleteVerificationLoading} className="shrink-0">
            {deleteVerificationLoading ? '正在只读核实…' : '只读核实'}
          </ActionButton>
        </div>
      ) : null}

      {batchRefreshNotice ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
        <p>{batchRefreshNotice}</p>
        <ActionButton type="button" variant="secondary" onClick={() => void retryTopicsList()} disabled={loading} className="shrink-0">{loading ? '正在重新加载…' : '重新加载列表'}</ActionButton>
      </div> : null}

      {view === 'board' && loadError ? <div role="alert" data-testid="topics-board-read-error" className="flex flex-col gap-3 rounded-xl border border-studio-coral/30 bg-studio-coral/10 p-4 text-sm text-studio-coral-contrast sm:flex-row sm:items-center sm:justify-between">
        <p>{topics.length > 0 ? '看板读取失败，仍显示上次成功读取的结果。' : '看板读取失败，当前无法确认是否有符合条件的选题。'} {loadError}</p>
        <ActionButton type="button" variant="secondary" onClick={() => void retryTopicsList()} disabled={loading} className="shrink-0">{loading ? '正在重新加载…' : '重试加载选题'}</ActionButton>
      </div> : null}

      {view === 'list' ? (
        <ReactBitsRevealSlot className="block"><div className="grid gap-4 md:grid-cols-3">
          <ReactBitsCardSlot semantic="topic-card" className="p-5">
            <p className="text-xs font-semibold text-studio-text-secondary">待审核选题</p>
            <p className="mt-3 text-3xl font-bold text-studio-text-primary">{pendingCount}</p>
            <p className="mt-2 text-sm text-studio-text-secondary">需要编导或管理者处理</p>
          </ReactBitsCardSlot>
          <ReactBitsCardSlot semantic="topic-card" className="p-5">
            <p className="text-xs font-semibold text-studio-text-secondary">生产链路中</p>
            <p className="mt-3 text-3xl font-bold text-studio-text-primary">{activeCount}</p>
            <p className="mt-2 text-sm text-studio-text-secondary">创作、成片和发布阶段</p>
          </ReactBitsCardSlot>
          <ReactBitsCardSlot semantic="topic-card" className="p-5">
            <p className="text-xs font-semibold text-studio-text-secondary">临期或逾期</p>
            <p className="mt-3 text-3xl font-bold text-studio-text-primary">{overdueCount}</p>
            <p className="mt-2 text-sm text-studio-text-secondary">优先排查交付风险</p>
          </ReactBitsCardSlot>
        </div></ReactBitsRevealSlot>
      ) : null}

      {view === 'list' && spotlightTopics.length > 0 ? (
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

      <GlassPanel role="group" aria-label="选题视图切换" className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" aria-pressed={view === 'list'} onClick={() => setTopicsView('list')} className={`xmt-btn min-h-10 px-3 py-2 text-sm ${view === 'list' ? 'xmt-btn-primary' : 'xmt-btn-secondary'}`}>列表</button>
        <button type="button" aria-pressed={view === 'board'} onClick={() => setTopicsView('board')} className={`xmt-btn min-h-10 px-3 py-2 text-sm ${view === 'board' ? 'xmt-btn-primary' : 'xmt-btn-secondary'}`}>看板</button>
        <span className="text-xs text-studio-text-secondary">列表和看板共用选题筛选；日历继续保留独立排期事件入口。</span>
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
              onChange={(event) => updateStatusFilter(event.target.value)}
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
          statusVerificationIds={statusVerificationIds}
          onOpenTopic={openBoardTopic}
          onTransition={handleBoardTransition}
        />
      ) : <ResponsiveTableShell footer={<Pagination page={page} total={total} limit={limit} onChange={setPage} />}>
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-studio-border-soft bg-studio-surface-soft text-left text-xs font-semibold uppercase text-studio-text-secondary">
                <th className="w-12 px-4 py-3">
                  <ActionButton
                    type="button"
                    variant="icon"
                    onClick={toggleSelectAll}
                    className="h-10 w-10 min-h-10 min-w-10 p-0"
                    aria-label={allSelected ? '取消全选选题' : '选择全部选题'}
                    aria-pressed={allSelected}
                  >
                    {allSelected ? <CheckSquare className="h-4 w-4 text-studio-cyan" /> : <Square className="h-4 w-4" />}
                  </ActionButton>
                </th>
                <th className="px-4 py-3">
                  <ActionButton type="button" variant="ghost" onClick={() => toggleSort('title')} className="min-h-10 min-w-10 justify-start px-1 py-2 text-xs">
                    选题 <SortIcon field="title" />
                  </ActionButton>
                </th>
                <th className="px-4 py-3">负责人</th>
                <th className="px-4 py-3">平台</th>
                <th className="px-4 py-3">
                  <ActionButton type="button" variant="ghost" onClick={() => toggleSort('submitted_at')} className="min-h-10 min-w-10 justify-start px-1 py-2 text-xs">
                    提交时间 <SortIcon field="submitted_at" />
                  </ActionButton>
                </th>
                <th className="px-4 py-3">
                  <ActionButton type="button" variant="ghost" onClick={() => toggleSort('deadline')} className="min-h-10 min-w-10 justify-start px-1 py-2 text-xs">
                    截止 <SortIcon field="deadline" />
                  </ActionButton>
                </th>
                <th className="px-4 py-3">流程</th>
                <th className="px-4 py-3">
                  <ActionButton type="button" variant="ghost" onClick={() => toggleSort('status')} className="min-h-10 min-w-10 justify-start px-1 py-2 text-xs">
                    状态 <SortIcon field="status" />
                  </ActionButton>
                </th>
                <th className="sticky right-0 z-10 bg-studio-surface px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-studio-border-soft">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-5">
                    <div role="status" aria-live="polite" aria-atomic="true">
                      <span className="sr-only">正在加载选题列表…</span>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <StudioSkeletonCard key={index} />
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={9} className="p-6">
                    <EmptyState
                      icon={AlertTriangle}
                      title="获取选题列表失败"
                      titleLevel={2}
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
                      titleLevel={2}
                      description={searchTerm || statusFilter ? '没有匹配当前筛选条件的选题。' : '提报选题后会在这里进入生产链路。'}
                      actionLabel={searchTerm || statusFilter ? '清除筛选' : undefined}
                      onAction={
                        searchTerm || statusFilter
                          ? () => {
                              setSearchTerm('');
                              updateStatusFilter('');
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
                        <ActionButton
                          type="button"
                          variant="icon"
                          onClick={() => toggleSelect(topic.id)}
                          className="h-10 w-10 min-h-10 min-w-10 p-0"
                          aria-label={`${selectedRow ? '取消选择' : '选择'}选题：${topic.title}`}
                          aria-pressed={selectedRow}
                        >
                          {selectedRow ? <CheckSquare className="h-4 w-4 text-studio-cyan" /> : <Square className="h-4 w-4 text-studio-text-muted" />}
                        </ActionButton>
                      </td>
                      <td className="max-w-[280px] px-4 py-4">
                        <div className="flex items-center gap-2">
                          {isOverdue(topic) ? <AlertTriangle className="h-4 w-4 shrink-0 text-studio-coral" /> : null}
                          <ActionButton
                            type="button"
                            variant="ghost"
                            onClick={() => navigate(`/topics/${topic.id}`)}
                            className="h-10 min-h-10 min-w-0 justify-start p-0 text-left text-sm font-semibold text-studio-text-primary transition hover:text-studio-cyan-contrast"
                          >
                            {topic.title}
                          </ActionButton>
                        </div>
                        <p className="mt-1 truncate text-xs text-studio-text-secondary">提报：{topic.creator_name || '-'}</p>
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-[10px] font-medium text-studio-text-secondary">下一步</span>
                          <ActionButton
                            type="button"
                            variant="secondary"
                            onClick={() => navigate(nextAction.path)}
                            className="min-h-10 min-w-0 gap-1 px-2.5 py-1 text-xs leading-snug text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                          >
                            {nextAction.label}
                            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                          </ActionButton>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-studio-text-secondary">{topic.assignee_name || '未指派'}</td>
                      <td className="px-4 py-4 text-sm text-studio-text-secondary">{getPlatformLabel(topic.platform) || '-'}</td>
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
                          <ActionButton
                            type="button"
                            variant="icon"
                            onClick={() => navigate(`/topics/${topic.id}`)}
                            className="h-10 w-10 min-h-10 min-w-10 p-2 text-studio-text-muted transition hover:bg-studio-surface-soft hover:text-studio-cyan-contrast"
                            title="查看"
                            aria-label={`查看选题 ${topic.title}`}
                          >
                            <Eye className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton
                            type="button"
                            variant="icon"
                            onClick={() => setDeleteTarget(topic)}
                            disabled={deleteVerificationIds.has(topic.id) || statusVerificationIds.has(topic.id)}
                            className="h-10 w-10 min-h-10 min-w-10 p-2 text-studio-text-muted transition hover:bg-studio-coral-soft hover:text-studio-coral-contrast"
                            title={deleteVerificationIds.has(topic.id) || statusVerificationIds.has(topic.id) ? '只读核实后才能删除' : '删除'}
                            aria-label={`删除选题 ${topic.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </ActionButton>
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
          <ActionButton onClick={() => handleBatchAudit('approved')} disabled={batchActionLoading || [...selected].some((id) => statusVerificationIds.has(id) || deleteVerificationIds.has(id))} className="px-3 py-2">
            <CheckCircle className="h-4 w-4" />
            {batchActionLoading ? '正在处理…' : '通过'}
          </ActionButton>
          <ActionButton onClick={() => handleBatchAudit('rejected')} disabled={batchActionLoading || [...selected].some((id) => statusVerificationIds.has(id) || deleteVerificationIds.has(id))} className="border-studio-coral-soft px-3 py-2 text-studio-coral-contrast hover:bg-studio-coral-soft">
            <XCircle className="h-4 w-4" />
            {batchActionLoading ? '正在处理…' : '驳回'}
          </ActionButton>
          <ActionButton onClick={() => setBatchDeleteConfirmationOpen(true)} disabled={batchActionLoading || [...selected].some((id) => statusVerificationIds.has(id) || deleteVerificationIds.has(id))} variant="danger" className="px-3 py-2">
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
        confirmDisabled={Boolean(deleteTarget && (deleteVerificationIds.has(deleteTarget.id) || statusVerificationIds.has(deleteTarget.id)))}
        variant="danger"
        title="确认删除"
        confirmText="确认删除"
        cancelText="取消"
        description={deleteTarget ? statusVerificationIds.has(deleteTarget.id) ? (
          <p>该选题的审核或状态更新结果待核实。页面只读核实完成前不会删除。</p>
        ) : deleteVerificationIds.has(deleteTarget.id) ? (
          <div className="space-y-3">
            <p>删除请求结果不明确，已暂停重复删除。请先只读核实服务器记录。</p>
            <ActionButton type="button" variant="secondary" onClick={() => void verifyTopicDeletes([deleteTarget.id])} disabled={deleteVerificationLoading}>
              {deleteVerificationLoading ? '正在只读核实…' : '只读核实'}
            </ActionButton>
          </div>
        ) : `确定要删除选题“${deleteTarget.title}”吗？` : ''}
      />
      <ConfirmModal
        open={batchDeleteConfirmationOpen}
        title={`确认删除选中的 ${selected.size} 个选题？`}
        description="删除选题后无法恢复。系统会逐条处理并核实结果，已成功删除的项目不会重复提交。"
        confirmText={`删除 ${selected.size} 个选题`}
        variant="danger"
        loading={batchActionLoading}
        onCancel={() => setBatchDeleteConfirmationOpen(false)}
        onConfirm={() => {
          setBatchDeleteConfirmationOpen(false);
          void handleBatchDelete();
        }}
      />
    </PageShell></ReactBitsPageScene>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, CheckCircle, Clock3, FileText, MapPin, Plus, Trash2, UserRound, Video } from 'lucide-react';
import { createShooting, deleteShooting, getShooting, getShootingCompletionStatus, getShootingCreateStatus, getShootingDeleteStatus, getTopic, getTopics, updateShooting } from '../api';
import { ConfirmModal, FormModal, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import SearchBar from '../components/studio/SearchBar';
import StageProgress, { type StageItem } from '../components/studio/StageProgress';
import StatusPill, { type StatusTone } from '../components/studio/StatusPill';
import StudioEmptyState from '../components/studio/EmptyState';
import TaskFlowCard from '../components/studio/TaskFlowCard';
import { formatBeijingDate } from '../lib/utils';
import { useAppStore, useAuthStore } from '../store';
import { Shooting as ShootingType, Topic } from '../types';
import { celebrateMilestone } from '../utils/confetti';
import { getWorkflowStatusLabel } from '../platform/workflow-status-labels';

type ConfirmAction =
  | { type: 'delete'; shootingId: number; topicTitle: string }
  | { type: 'complete'; shooting: ShootingType }
  | null;

type PendingShootingDeleteVerification = {
  id: number;
  topicTitle: string;
  page: number;
  readError: string | null;
};

type PendingShootingCompletionVerification = {
  id: number;
  topicTitle: string;
  page: number;
  readError: string | null;
};

type ShootingCreatePayload = {
  topic_id: number;
  plan_date?: string;
  location?: string;
  equipment?: string;
  status?: string;
};

type PendingShootingCreateVerification = {
  clientRequestId: string;
  userId: number;
  payload: ShootingCreatePayload;
  page: number;
  status: 'uncertain' | 'ready' | 'checking';
  readError: string | null;
};

function shootingDeleteVerificationKey(userId: number | undefined) {
  return userId ? `xmt:shooting-delete-pending:v1:user:${userId}` : null;
}

function shootingCompletionVerificationKey(userId: number | undefined) {
  return userId ? `xmt:shooting-completion-pending:v1:user:${userId}` : null;
}

function shootingCreateVerificationKey(userId: number | undefined) {
  return userId ? `xmt:shooting-create-pending:v1:user:${userId}` : null;
}

function loadPendingShootingDeleteVerification(userId: number | undefined): PendingShootingDeleteVerification | null {
  const key = shootingDeleteVerificationKey(userId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingShootingDeleteVerification> | null;
    if (!value || !Number.isSafeInteger(value.id) || Number(value.id) <= 0
      || !Number.isSafeInteger(value.page) || Number(value.page) <= 0
      || typeof value.topicTitle !== 'string') return null;
    return { id: Number(value.id), topicTitle: value.topicTitle, page: Number(value.page), readError: null };
  } catch {
    return null;
  }
}

function loadPendingShootingCompletionVerification(userId: number | undefined): PendingShootingCompletionVerification | null {
  const key = shootingCompletionVerificationKey(userId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingShootingCompletionVerification> | null;
    if (!value || !Number.isSafeInteger(value.id) || Number(value.id) <= 0
      || !Number.isSafeInteger(value.page) || Number(value.page) <= 0
      || typeof value.topicTitle !== 'string') return null;
    return { id: Number(value.id), topicTitle: value.topicTitle, page: Number(value.page), readError: null };
  } catch {
    return null;
  }
}

function loadPendingShootingCreateVerification(userId: number | undefined): PendingShootingCreateVerification | null {
  const key = shootingCreateVerificationKey(userId);
  if (!key || userId === undefined || typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Partial<PendingShootingCreateVerification> | null;
    const payload = value?.payload as Partial<ShootingCreatePayload> | undefined;
    if (!value || value.userId !== userId || typeof value.clientRequestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.clientRequestId)
      || !payload || !Number.isSafeInteger(payload.topic_id) || Number(payload.topic_id) <= 0
      || (payload.plan_date !== undefined && typeof payload.plan_date !== 'string')
      || (payload.location !== undefined && typeof payload.location !== 'string')
      || (payload.equipment !== undefined && typeof payload.equipment !== 'string')
      || (payload.status !== undefined && !['planned', 'in_progress', 'completed', 'cancelled', 'pending'].includes(payload.status))
      || !Number.isSafeInteger(value.page) || Number(value.page) <= 0) return null;
    return {
      clientRequestId: value.clientRequestId,
      userId,
      payload: {
        topic_id: Number(payload.topic_id),
        ...(payload.plan_date === undefined ? {} : { plan_date: payload.plan_date }),
        ...(payload.location === undefined ? {} : { location: payload.location }),
        ...(payload.equipment === undefined ? {} : { equipment: payload.equipment }),
        ...(payload.status === undefined ? {} : { status: payload.status }),
      },
      page: Number(value.page),
      status: value.status === 'ready' ? 'ready' : 'uncertain',
      readError: null,
    };
  } catch {
    return null;
  }
}

function persistPendingShootingCreateVerification(pending: PendingShootingCreateVerification) {
  const key = shootingCreateVerificationKey(pending.userId);
  if (!key || typeof window === 'undefined') throw new Error('当前账号尚未确认，无法安全保存恢复状态');
  sessionStorage.setItem(key, JSON.stringify({
    clientRequestId: pending.clientRequestId,
    userId: pending.userId,
    payload: pending.payload,
    page: pending.page,
    status: pending.status,
  }));
  const stored = loadPendingShootingCreateVerification(pending.userId);
  if (!stored || stored.clientRequestId !== pending.clientRequestId || stored.userId !== pending.userId) {
    throw new Error('制作计划恢复状态未能保存，本次未发送创建请求');
  }
}

function removeStoredShootingCreateVerification(userId: number, clientRequestId: string) {
  const key = shootingCreateVerificationKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { clientRequestId?: unknown } | null;
    if (stored?.clientRequestId === clientRequestId) sessionStorage.removeItem(key);
  } catch {
    // Server-side idempotency keeps a subsequent read or retry safe if storage cleanup fails.
  }
}

function isDefinitiveShootingDeleteRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![404, 408, 425, 429].includes(status);
}

function isDefinitiveShootingCompletionRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![404, 408, 425, 429].includes(status);
}

function isDefinitiveShootingCreateRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

const initialFormData = {
  topic_id: '',
  plan_date: '',
  location: '',
  equipment: '',
  status: 'planned',
};

const shootingStatusTone: Record<string, StatusTone> = {
  planned: 'amber',
  in_progress: 'cyan',
  completed: 'success',
  cancelled: 'muted',
  pending: 'amber',
};

const topicStatusText: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '发布中',
  completed: '已完成',
};

function buildStages(status: string): StageItem[] {
  const current = status === 'completed' ? 3 : status === 'in_progress' ? 2 : status === 'cancelled' ? 1 : 1;
  return [
    { label: '排期', state: current > 1 ? 'done' : 'active' },
    { label: '拍摄', state: current > 2 ? 'done' : current === 2 ? 'active' : 'pending' },
    { label: '交付', state: current >= 3 ? 'done' : 'pending' },
  ];
}

function getNextAction(status: string) {
  if (status === 'completed') {
    return '进入发布管理';
  }
  if (status === 'in_progress') {
    return '确认素材交付';
  }
  if (status === 'cancelled') {
    return '检查计划状态';
  }
  return '推进拍摄执行';
}

export default function Shooting() {
  const authUserId = useAuthStore((state) => state.user?.id);
  const [shootings, setShootings] = useState<ShootingType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const confirmInFlightRef = useRef(false);
  const [pendingDeleteVerification, setPendingDeleteVerification] = useState<PendingShootingDeleteVerification | null>(
    () => loadPendingShootingDeleteVerification(authUserId),
  );
  const [pendingCompletionVerification, setPendingCompletionVerification] = useState<PendingShootingCompletionVerification | null>(
    () => loadPendingShootingCompletionVerification(authUserId),
  );
  const [pendingCreateVerification, setPendingCreateVerification] = useState<PendingShootingCreateVerification | null>(
    () => loadPendingShootingCreateVerification(authUserId),
  );
  const [deleteVerificationLoading, setDeleteVerificationLoading] = useState(false);
  const [deleteVerificationNotice, setDeleteVerificationNotice] = useState<string | null>(null);
  const [completionVerificationLoading, setCompletionVerificationLoading] = useState(false);
  const [completionVerificationNotice, setCompletionVerificationNotice] = useState<string | null>(null);
  const [createVerificationLoading, setCreateVerificationLoading] = useState(false);
  const deleteVerificationLockRef = useRef(false);
  const restoredDeleteVerificationStartedRef = useRef(false);
  const completionVerificationLockRef = useRef(false);
  const restoredCompletionVerificationStartedRef = useRef(false);
  const createVerificationLockRef = useRef(false);
  const restoredCreateVerificationStartedRef = useRef(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const mutationLockRef = useRef(false);
  const [mutationLoading, setMutationLoading] = useState(false);
  // 页大小以服务端返回为准，避免前端写死与后端默认值脱节
  const [pageSize, setPageSize] = useState(50);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTopicIdValue = searchParams.get('topicId') || '';
  const requestedTopicId = /^\d+$/.test(requestedTopicIdValue) ? Number(requestedTopicIdValue) : Number.NaN;
  const addNotification = useAppStore((state) => state.addNotification);
  const initialPendingDeleteVerificationRef = useRef(pendingDeleteVerification);
  const initialPendingCompletionVerificationRef = useRef(pendingCompletionVerification);
  const initialPendingCreateVerificationRef = useRef(pendingCreateVerification);
  const handoffHandledRef = useRef(false);
  const handoffLookupStartedRef = useRef(false);
  const mutationWritesLocked = Boolean(pendingDeleteVerification || pendingCompletionVerification || pendingCreateVerification);

  const fetchData = useCallback(async (requestedPage: number): Promise<boolean> => {
    setLoading(true);
    setLoadError(null);
    try {
      let result = await getShooting({ page: requestedPage });
      // 删除末页最后一条后当前页会越界变空，回退到上一页避免出现空白列表
      if (result.data.length === 0 && result.page > 1) {
        result = await getShooting({ page: result.page - 1 });
      }
      setShootings(result.data);
      setPage(result.page);
      setTotal(result.total);
      setPageSize((current) => result.limit || current);

      const topicList = await getTopics();
      setTopics(
        topicList.data.filter(
          (topic) =>
            topic.status === 'approved' ||
            topic.status === 'production' ||
            topic.status === 'shooting',
        ),
      );
      setRefreshNotice(null);
      return true;
    } catch (error) {
      setLoadError((error as Error).message || '暂时无法读取制作计划');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(1);
  }, [fetchData]);

  useEffect(() => {
    if (handoffHandledRef.current || !Number.isSafeInteger(requestedTopicId) || requestedTopicId <= 0 || loading || loadError) return;
    if (initialPendingCreateVerificationRef.current) {
      handoffHandledRef.current = true;
      return;
    }
    const showCreateFormForTopic = (topic: Topic) => {
      if (!['approved', 'production', 'shooting'].includes(topic.status)) return false;
      handoffHandledRef.current = true;
      setTopics((current) => current.some((item) => Number(item.id) === Number(topic.id)) ? current : [topic, ...current]);
      setFormData({ ...initialFormData, topic_id: String(topic.id) });
      setShowCreateModal(true);
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('topicId');
      setSearchParams(nextSearchParams, { replace: true });
      return true;
    };
    const listedTopic = topics.find((item) => Number(item.id) === requestedTopicId);
    if (listedTopic) {
      showCreateFormForTopic(listedTopic);
      return;
    }
    if (handoffLookupStartedRef.current) return;
    handoffLookupStartedRef.current = true;
    void getTopic(requestedTopicId)
      .then((topic) => {
        if (showCreateFormForTopic(topic)) return;
        handoffHandledRef.current = true;
        addNotification({ title: '当前无法关联该选题', message: '选题状态暂不支持创建成片计划；请核对选题流程后再操作。', type: 'warning' });
      })
      .catch(() => {
        handoffHandledRef.current = true;
        addNotification({ title: '暂时无法预填选题', message: '选题详情读取失败；成片制作列表仍可使用，请核对权限或稍后重试。', type: 'warning' });
      });
  }, [addNotification, loadError, loading, requestedTopicId, searchParams, setSearchParams, topics]);

  const refreshAfterConfirmedMutation = useCallback(async (action: string, requestedPage: number) => {
    const refreshed = await fetchData(requestedPage);
    if (!refreshed) {
      setRefreshNotice(`服务端已确认${action}，但列表读取失败；当前页面保留已确认状态，请重新加载列表确认，不要重复操作。`);
    }
    return refreshed;
  }, [fetchData]);

  const verifyDeleteStatus = useCallback(async (
    pending: PendingShootingDeleteVerification,
    operationError?: unknown,
  ) => {
    if (deleteVerificationLockRef.current) return;
    deleteVerificationLockRef.current = true;
    setDeleteVerificationLoading(true);
    setPendingDeleteVerification({ ...pending, readError: null });
    setDeleteVerificationNotice(null);
    try {
      const status = await getShootingDeleteStatus(pending.id);
      const key = shootingDeleteVerificationKey(authUserId);
      try {
        if (key) sessionStorage.removeItem(key);
      } catch {
        // A confirmed read-back is authoritative even when this tab cannot clear its recovery marker.
      }
      setPendingDeleteVerification(null);
      setPage(pending.page);
      if (status === 'deleted') {
        setShootings((current) => current.filter((item) => item.id !== pending.id));
        setTotal((current) => Math.max(0, current - 1));
        addNotification({ title: '删除已确认', message: `服务器确认“${pending.topicTitle}”已删除；未重复发送删除请求。`, type: 'success' });
        await refreshAfterConfirmedMutation('已只读核实制作计划删除', pending.page);
      } else {
        setDeleteVerificationNotice(
          `服务器确认“${pending.topicTitle}”仍存在；本次没有重复删除。请核对列表后，再由你决定是否重新发起删除。${operationError instanceof Error ? ` ${operationError.message}` : ''}`,
        );
        const refreshed = await fetchData(pending.page);
        if (!refreshed) setDeleteVerificationNotice((current) => `${current || ''} 列表读取失败，可稍后重新加载。`);
      }
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setPendingDeleteVerification({
        ...pending,
        readError: `删除请求未获确认${operationError instanceof Error ? `（${operationError.message}）` : ''}，制作计划状态也暂时无法读取${readError ? `（${readError}）` : ''}。请只读重试核实，不要重复删除。`,
      });
    } finally {
      deleteVerificationLockRef.current = false;
      setDeleteVerificationLoading(false);
    }
  }, [addNotification, authUserId, fetchData, refreshAfterConfirmedMutation]);

  useEffect(() => {
    if (initialPendingDeleteVerificationRef.current || authUserId === undefined) return;
    const pending = loadPendingShootingDeleteVerification(authUserId);
    if (!pending) return;
    initialPendingDeleteVerificationRef.current = pending;
    setPendingDeleteVerification(pending);
  }, [authUserId]);

  useEffect(() => {
    const pending = initialPendingDeleteVerificationRef.current;
    if (restoredDeleteVerificationStartedRef.current || !pending) return;
    restoredDeleteVerificationStartedRef.current = true;
    initialPendingDeleteVerificationRef.current = null;
    setPendingDeleteVerification(pending);
    void verifyDeleteStatus(pending);
  }, [verifyDeleteStatus]);

  const verifyCompletionStatus = useCallback(async (
    pending: PendingShootingCompletionVerification,
    operationError?: unknown,
  ) => {
    if (completionVerificationLockRef.current) return;
    completionVerificationLockRef.current = true;
    setCompletionVerificationLoading(true);
    setPendingCompletionVerification({ ...pending, readError: null });
    setCompletionVerificationNotice(null);
    try {
      const status = await getShootingCompletionStatus(pending.id);
      const key = shootingCompletionVerificationKey(authUserId);
      try {
        if (key) sessionStorage.removeItem(key);
      } catch {
        // A confirmed read-back is authoritative even when this tab cannot clear its recovery marker.
      }
      setPendingCompletionVerification(null);
      setPage(pending.page);
      if (status.state === 'completed') {
        setShootings((current) => current.map((item) => item.id === pending.id ? { ...item, status: 'completed' } : item));
        addNotification({ title: '完成已确认', message: `服务器确认“${pending.topicTitle}”已完成；未重复提交完成操作。`, type: 'success' });
        celebrateMilestone();
        await refreshAfterConfirmedMutation('已只读核实成片制作完成', pending.page);
      } else if (status.state === 'missing') {
        setShootings((current) => current.filter((item) => item.id !== pending.id));
        setTotal((current) => Math.max(0, current - 1));
        setCompletionVerificationNotice(`服务器未找到“${pending.topicTitle}”这条制作计划；本次没有重复提交完成操作。列表已更新，请核对关联状态。`);
        const refreshed = await fetchData(pending.page);
        if (!refreshed) setCompletionVerificationNotice((current) => `${current || ''} 列表读取失败，可稍后重新加载。`);
      } else {
        setShootings((current) => current.map((item) => item.id === pending.id ? { ...item, status: status.status } : item));
        setCompletionVerificationNotice(
          `服务器确认“${pending.topicTitle}”当前状态为“${getWorkflowStatusLabel('shooting', status.status)}”；本次没有重复提交完成操作。请核对后，再由你决定是否重新确认。${operationError instanceof Error ? ` ${operationError.message}` : ''}`,
        );
        const refreshed = await fetchData(pending.page);
        if (!refreshed) setCompletionVerificationNotice((current) => `${current || ''} 列表读取失败，可稍后重新加载。`);
      }
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setPendingCompletionVerification({
        ...pending,
        readError: `完成操作结果未获确认${operationError instanceof Error ? `（${operationError.message}）` : ''}，制作计划状态也暂时无法读取${readError ? `（${readError}）` : ''}。请只读重试核实，不要重复提交完成操作。`,
      });
    } finally {
      completionVerificationLockRef.current = false;
      setCompletionVerificationLoading(false);
    }
  }, [addNotification, authUserId, fetchData, refreshAfterConfirmedMutation]);

  useEffect(() => {
    if (initialPendingCompletionVerificationRef.current || authUserId === undefined) return;
    const pending = loadPendingShootingCompletionVerification(authUserId);
    if (!pending) return;
    initialPendingCompletionVerificationRef.current = pending;
    setPendingCompletionVerification(pending);
  }, [authUserId]);

  useEffect(() => {
    const pending = initialPendingCompletionVerificationRef.current;
    if (restoredCompletionVerificationStartedRef.current || !pending) return;
    restoredCompletionVerificationStartedRef.current = true;
    initialPendingCompletionVerificationRef.current = null;
    setPendingCompletionVerification(pending);
    void verifyCompletionStatus(pending);
  }, [verifyCompletionStatus]);

  const finishShootingCreate = useCallback(async (
    pending: PendingShootingCreateVerification,
    shootingId: number,
    verified: boolean,
  ) => {
    removeStoredShootingCreateVerification(pending.userId, pending.clientRequestId);
    setPendingCreateVerification(null);
    setShowCreateModal(false);
    setFormData(initialFormData);
    setPage(1);
    addNotification(verified
      ? { title: '创建结果已核实', message: `服务器确认制作计划 #${shootingId} 已创建，没有重复提交。`, type: 'success' }
      : { title: '创建成功', message: '制作计划已添加，没有重复创建。', type: 'success' });
    await refreshAfterConfirmedMutation('服务端已确认制作计划创建', 1);
  }, [addNotification, refreshAfterConfirmedMutation]);

  const resolvePendingShootingCreate = useCallback(async (pending: PendingShootingCreateVerification) => {
    try {
      const status = await getShootingCreateStatus(pending.clientRequestId);
      if (status.status === 'created') {
        await finishShootingCreate(pending, status.shootingId, true);
      } else if (status.status === 'deleted') {
        removeStoredShootingCreateVerification(pending.userId, pending.clientRequestId);
        setPendingCreateVerification(null);
        setShowCreateModal(false);
        setFormData(initialFormData);
        addNotification({ title: '原请求对应计划已删除', message: '已核实原制作计划已删除，不会因重试而重新创建。', type: 'info' });
      } else {
        setPendingCreateVerification({ ...pending, status: 'ready', readError: null });
        setShowCreateModal(false);
        addNotification({
          title: '创建结果尚未确认',
          message: '服务器暂未找到这条制作计划；原表单与请求编号已保留，可使用同一编号安全重试。',
          type: 'warning',
        });
      }
    } catch (error) {
      const readError = error instanceof Error ? error.message : '读取失败';
      setPendingCreateVerification({
        ...pending,
        status: 'uncertain',
        readError: `制作计划创建结果尚未确认，状态读取失败（${readError}）。请只读核实，不要另建一条。`,
      });
      setShowCreateModal(false);
      addNotification({
        title: '创建结果待确认',
        message: '写入状态暂时无法读取。已暂停成片制作页面的其它写入，请先只读核实，避免重复创建。',
        type: 'warning',
      });
    }
  }, [addNotification, finishShootingCreate]);

  const verifyPendingShootingCreate = useCallback(async (pending: PendingShootingCreateVerification) => {
    if (createVerificationLockRef.current || mutationLockRef.current) return;
    createVerificationLockRef.current = true;
    setCreateVerificationLoading(true);
    setPendingCreateVerification({ ...pending, status: 'checking', readError: null });
    try {
      await resolvePendingShootingCreate(pending);
    } finally {
      createVerificationLockRef.current = false;
      setCreateVerificationLoading(false);
    }
  }, [resolvePendingShootingCreate]);

  const submitPendingShootingCreate = useCallback(async (pending: PendingShootingCreateVerification) => {
    if (mutationLockRef.current || createVerificationLockRef.current || authUserId !== pending.userId) return;
    mutationLockRef.current = true;
    setMutationLoading(true);
    const checking: PendingShootingCreateVerification = { ...pending, status: 'checking', readError: null };
    setPendingCreateVerification(checking);
    try {
      persistPendingShootingCreateVerification({ ...pending, status: 'uncertain' });
      try {
        const result = await createShooting(pending.payload, pending.clientRequestId);
        await finishShootingCreate(pending, Number(result.shootingId), false);
      } catch (error) {
        if (isDefinitiveShootingCreateRejection(error)) {
          removeStoredShootingCreateVerification(pending.userId, pending.clientRequestId);
          setPendingCreateVerification(null);
          setFormData({
            topic_id: String(pending.payload.topic_id),
            plan_date: pending.payload.plan_date || '',
            location: pending.payload.location || '',
            equipment: pending.payload.equipment || '',
            status: pending.payload.status || 'planned',
          });
          setShowCreateModal(true);
          addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
        } else {
          await resolvePendingShootingCreate(checking);
        }
      }
    } catch (error) {
      removeStoredShootingCreateVerification(pending.userId, pending.clientRequestId);
      setPendingCreateVerification(null);
      setShowCreateModal(true);
      addNotification({
        title: '创建未发送',
        message: error instanceof Error ? error.message : '恢复状态保存失败，请检查后重试。',
        type: 'error',
      });
    } finally {
      mutationLockRef.current = false;
      setMutationLoading(false);
    }
  }, [addNotification, authUserId, finishShootingCreate, resolvePendingShootingCreate]);

  useEffect(() => {
    if (initialPendingCreateVerificationRef.current || authUserId === undefined) return;
    const pending = loadPendingShootingCreateVerification(authUserId);
    if (!pending) return;
    initialPendingCreateVerificationRef.current = pending;
    setPendingCreateVerification(pending);
  }, [authUserId]);

  useEffect(() => {
    const pending = initialPendingCreateVerificationRef.current;
    if (restoredCreateVerificationStartedRef.current || !pending) return;
    restoredCreateVerificationStartedRef.current = true;
    initialPendingCreateVerificationRef.current = null;
    setPendingCreateVerification(pending);
    void verifyPendingShootingCreate(pending);
  }, [verifyPendingShootingCreate]);

  const handleCreate = async () => {
    if (mutationLockRef.current || mutationWritesLocked) return;
    if (!formData.topic_id) {
      addNotification({
        title: '创建失败',
        message: '请选择关联选题',
        type: 'error',
      });
      return;
    }
    if (authUserId === undefined) {
      addNotification({ title: '创建暂不可用', message: '当前登录身份尚未确认，请刷新后再试。', type: 'error' });
      return;
    }
    const pending: PendingShootingCreateVerification = {
      clientRequestId: crypto.randomUUID(),
      userId: authUserId,
      payload: {
        topic_id: Number.parseInt(formData.topic_id, 10),
        plan_date: formData.plan_date || undefined,
        location: formData.location,
        equipment: formData.equipment,
        status: formData.status,
      },
      page: 1,
      status: 'uncertain',
      readError: null,
    };
    try {
      persistPendingShootingCreateVerification(pending);
      setPendingCreateVerification(pending);
      restoredCreateVerificationStartedRef.current = true;
      await submitPendingShootingCreate(pending);
    } catch (error) {
      removeStoredShootingCreateVerification(authUserId, pending.clientRequestId);
      setPendingCreateVerification(null);
      addNotification({ title: '创建未发送', message: error instanceof Error ? error.message : '恢复状态保存失败，请检查后重试。', type: 'error' });
    }
  };

  const handleDelete = async (id: number): Promise<boolean> => {
    if (mutationLockRef.current || mutationWritesLocked) return false;
    if (authUserId === undefined) {
      addNotification({ title: '删除暂不可用', message: '当前登录身份尚未确认，请刷新后再试。', type: 'error' });
      return false;
    }
    mutationLockRef.current = true;
    setMutationLoading(true);
    try {
      await deleteShooting(id);

      addNotification({
        title: '删除成功',
        message: '服务端已确认制作计划删除',
        type: 'success',
      });

      const remaining = shootings.length === 1 && page > 1 ? page - 1 : page;
      setShootings((current) => current.filter((shooting) => shooting.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      if (remaining !== page) setPage(remaining);
      await refreshAfterConfirmedMutation('制作计划删除', remaining);
      return true;
    } catch (error) {
      if (!isDefinitiveShootingDeleteRejection(error)) {
        const pending = {
          id,
          topicTitle: shootings.find((item) => item.id === id)?.topic_title || '该制作计划',
          page,
          readError: null,
        };
        const key = shootingDeleteVerificationKey(authUserId);
        try {
          if (key) sessionStorage.setItem(key, JSON.stringify({ id: pending.id, topicTitle: pending.topicTitle, page: pending.page }));
        } catch {
          // In-memory write locking remains active when session recovery is unavailable.
        }
        restoredDeleteVerificationStartedRef.current = true;
        setConfirmAction(null);
        await verifyDeleteStatus(pending, error);
        return false;
      }
      addNotification({
        title: '删除失败',
        message: error instanceof Error ? error.message : '制作计划删除失败，请检查后重试。',
        type: 'error',
      });
      return false;
    } finally {
      mutationLockRef.current = false;
      setMutationLoading(false);
    }
  };

  const handleComplete = async (shooting: ShootingType): Promise<boolean> => {
    if (mutationLockRef.current || mutationWritesLocked) return false;
    if (authUserId === undefined) {
      addNotification({ title: '完成暂不可用', message: '当前登录身份尚未确认，请刷新后再试。', type: 'error' });
      return false;
    }
    setCompletionVerificationNotice(null);
    mutationLockRef.current = true;
    setMutationLoading(true);
    try {
      await updateShooting(shooting.id, {
        topic_id: shooting.topic_id,
        status: 'completed',
      });
      addNotification({
        title: '完成成功',
        message: '服务端已确认成片制作完成，已流转到发布管理环节',
        type: 'success',
      });
      setShootings((current) => current.map((item) => item.id === shooting.id ? { ...item, status: 'completed' } : item));
      celebrateMilestone();

      await refreshAfterConfirmedMutation('成片制作完成', page);
      return true;
    } catch (error) {
      if (!isDefinitiveShootingCompletionRejection(error)) {
        const pending = {
          id: shooting.id,
          topicTitle: shooting.topic_title || '该制作计划',
          page,
          readError: null,
        };
        const key = shootingCompletionVerificationKey(authUserId);
        try {
          if (key) sessionStorage.setItem(key, JSON.stringify({ id: pending.id, topicTitle: pending.topicTitle, page: pending.page }));
        } catch {
          // In-memory write locking remains active when session recovery is unavailable.
        }
        restoredCompletionVerificationStartedRef.current = true;
        setConfirmAction(null);
        await verifyCompletionStatus(pending, error);
        return false;
      }
      addNotification({
        title: '操作失败',
        message: (error as Error).message,
        type: 'error',
      });
      return false;
    } finally {
      mutationLockRef.current = false;
      setMutationLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction || confirmInFlightRef.current || mutationWritesLocked) return;

    confirmInFlightRef.current = true;
    setConfirmLoading(true);
    try {
      const succeeded = confirmAction.type === 'delete'
        ? await handleDelete(confirmAction.shootingId)
        : await handleComplete(confirmAction.shooting);
      if (succeeded) setConfirmAction(null);
    } finally {
      confirmInFlightRef.current = false;
      setConfirmLoading(false);
    }
  };

  const filteredShootings = useMemo(
    () =>
      shootings.filter(
        (shooting) =>
          shooting.topic_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          shooting.location?.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [searchTerm, shootings],
  );

  const todayKey = new Date().toISOString().slice(0, 10);
  const metrics = useMemo(
    () => ({
      today: shootings.filter((item) => item.plan_date?.slice(0, 10) === todayKey).length,
      active: shootings.filter((item) => item.status === 'in_progress').length,
      handoff: shootings.filter((item) => item.status === 'planned' || item.status === 'pending').length,
      done: shootings.filter((item) => item.status === 'completed').length,
    }),
    [shootings, todayKey],
  );

  const confirmTitle = confirmAction?.type === 'delete' ? '确认删除' : '确认完成';
  const confirmText = confirmAction?.type === 'delete' ? '确认删除' : '确认完成';
  const confirmDescription =
    confirmAction?.type === 'delete'
      ? `确定要删除“${confirmAction.topicTitle}”这条制作计划吗？此操作不可撤销。`
      : confirmAction?.type === 'complete'
        ? `确定要将“${confirmAction.shooting.topic_title}”标记为完成吗？完成后将自动流转到发布管理环节。`
        : '';

  return (
    <PageShell>
      <PageHeader
        title="成片制作"
        actions={
          <ActionButton type="button" variant="primary" disabled={loading || Boolean(loadError) || mutationLoading || mutationWritesLocked} onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            添加制作计划
          </ActionButton>
        }
      />

      {pendingDeleteVerification ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">
            {pendingDeleteVerification.readError || `“${pendingDeleteVerification.topicTitle}”的删除结果尚未确认；核实期间，成片制作页面的写入操作已暂停。`}
          </p>
          <ActionButton type="button" variant="secondary" className="self-start sm:self-auto" disabled={deleteVerificationLoading} onClick={() => void verifyDeleteStatus(pendingDeleteVerification)}>
            {deleteVerificationLoading ? '正在只读核实…' : '只读核实删除状态'}
          </ActionButton>
        </div>
      ) : null}

      {pendingCompletionVerification ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">
            {pendingCompletionVerification.readError || `“${pendingCompletionVerification.topicTitle}”的完成结果尚未确认；核实期间，成片制作页面的写入操作已暂停。`}
          </p>
          <ActionButton type="button" variant="secondary" className="self-start sm:self-auto" disabled={completionVerificationLoading} onClick={() => void verifyCompletionStatus(pendingCompletionVerification)}>
            {completionVerificationLoading ? '正在只读核实…' : '只读核实完成状态'}
          </ActionButton>
        </div>
      ) : null}

      {pendingCreateVerification && pendingCreateVerification.userId === authUserId ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">
            {pendingCreateVerification.status === 'ready'
              ? '服务器暂未找到这条制作计划。原表单与请求编号已保留；只能使用同一编号安全重试，不能另建新请求。'
              : pendingCreateVerification.readError || '制作计划创建结果正在核实；核实完成前，成片制作页面的写入操作已暂停。'}
          </p>
          <ActionButton
            type="button"
            variant="secondary"
            className="self-start sm:self-auto"
            disabled={mutationLoading || createVerificationLoading || pendingCreateVerification.status === 'checking'}
            onClick={() => pendingCreateVerification.status === 'ready'
              ? void submitPendingShootingCreate(pendingCreateVerification)
              : void verifyPendingShootingCreate(pendingCreateVerification)}
          >
            {mutationLoading || createVerificationLoading
              ? '正在处理…'
              : pendingCreateVerification.status === 'ready' ? '安全重试同一请求' : '只读核实创建状态'}
          </ActionButton>
        </div>
      ) : null}

      {deleteVerificationNotice ? (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">{deleteVerificationNotice}</p>
          <ActionButton type="button" variant="secondary" className="self-start sm:self-auto" disabled={loading || mutationLoading} onClick={() => void fetchData(page)}>
            {loading ? '正在重新加载…' : '重新加载列表'}
          </ActionButton>
        </div>
      ) : null}

      {completionVerificationNotice ? (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">{completionVerificationNotice}</p>
          <ActionButton type="button" variant="secondary" className="self-start sm:self-auto" disabled={loading || mutationLoading} onClick={() => void fetchData(page)}>
            {loading ? '正在重新加载…' : '重新加载列表'}
          </ActionButton>
        </div>
      ) : null}

      {refreshNotice || loadError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">{refreshNotice || `制作计划列表暂不可用：${loadError}`}</p>
          <ActionButton type="button" variant="secondary" className="self-start sm:self-auto" disabled={loading || mutationLoading} onClick={() => void fetchData(page)}>
            {loading ? '正在重新加载' : '重新加载列表'}
          </ActionButton>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="今日待拍" value={metrics.today} icon={Calendar} tone="cyan" />
        <MetricCard title="制作中" value={metrics.active} icon={Video} tone="primary" />
        <MetricCard title="待交付" value={metrics.handoff} icon={Clock3} tone="amber" />
        <MetricCard title="已完成" value={metrics.done} icon={CheckCircle} tone="success" />
      </div>

      <GlassPanel className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="搜索选题标题或拍摄地点..."
          className="max-w-xl"
        />
      </GlassPanel>

      {loading ? (
        <LoadingState type="section" text="正在加载制作计划..." />
      ) : loadError && shootings.length === 0 ? null : filteredShootings.length === 0 ? (
        <StudioEmptyState
          icon={FileText}
          title="暂无制作计划"
          description={searchTerm ? '没有匹配当前搜索条件的制作计划。' : '添加拍摄或制作任务后，会在这里形成进度控制台。'}
          actionLabel={mutationWritesLocked ? undefined : '添加制作计划'}
          onAction={mutationWritesLocked ? undefined : () => setShowCreateModal(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredShootings.map((shooting) => (
            <TaskFlowCard
              key={shooting.id}
              eyebrow={topicStatusText[shooting.topic_status || 'shooting'] || '成片制作'}
              title={shooting.topic_title || '未命名制作任务'}
              status={
                <StatusPill tone={shootingStatusTone[shooting.status] || 'muted'}>
                  {getWorkflowStatusLabel('shooting', shooting.status)}
                </StatusPill>
              }
              meta={
                <>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatBeijingDate(shooting.plan_date)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {shooting.location || '待定地点'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5" />
                    {shooting.operator_name || '未分配'}
                  </span>
                </>
              }
              progress={<StageProgress stages={buildStages(shooting.status)} />}
              action={
                <div className="flex flex-wrap justify-end gap-2">
                  <ActionButton type="button" variant="ghost" onClick={() => navigate(`/shooting/${shooting.id}`)}>
                    查看
                  </ActionButton>
                  {shooting.status !== 'completed' ? (
                    <ActionButton type="button" variant="secondary" disabled={mutationLoading || mutationWritesLocked} onClick={() => setConfirmAction({ type: 'complete', shooting })}>
                      完成
                    </ActionButton>
                  ) : null}
                  <button
                    type="button"
                    disabled={mutationLoading || mutationWritesLocked}
                    onClick={() =>
                      setConfirmAction({
                        type: 'delete',
                        shootingId: shooting.id,
                        topicTitle: shooting.topic_title || '该制作计划',
                      })
                    }
                    aria-label={`删除《${shooting.topic_title || '该制作计划'}》`}
                    className="inline-flex min-h-10 items-center justify-center rounded-button border border-studio-coral/30 bg-studio-coral/10 px-3 py-2 text-sm font-semibold text-studio-coral-contrast transition hover:bg-studio-coral/15"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              }
            >
              <div className="line-clamp-2">
                <span className="text-studio-text-muted">设备：</span>
                {shooting.equipment || '暂未填写设备清单'}
              </div>
              <div className="mt-2 text-studio-cyan-contrast">{getNextAction(shooting.status)}</div>
            </TaskFlowCard>
          ))}
        </div>
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between gap-3 text-sm text-studio-text-secondary">
          <span>共 {total} 条，第 {page} / {Math.ceil(total / pageSize)} 页</span>
          <div className="flex gap-2">
            <ActionButton type="button" variant="ghost" disabled={page <= 1} onClick={() => void fetchData(page - 1)}>上一页</ActionButton>
            <ActionButton type="button" variant="ghost" disabled={page >= Math.ceil(total / pageSize)} onClick={() => void fetchData(page + 1)}>下一页</ActionButton>
          </div>
        </div>
      ) : null}

      <FormModal
        open={showCreateModal}
        onCancel={() => { if (!mutationLockRef.current) setShowCreateModal(false); }}
        onSubmit={handleCreate}
        title="添加制作计划"
        submitText="保存"
        cancelText="取消"
        loading={mutationLoading}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">关联选题 *</label>
            <select
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            >
              <option value="">请选择选题</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">计划日期</label>
            <input
              type="date"
              value={formData.plan_date}
              onChange={(event) => setFormData({ ...formData, plan_date: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">拍摄地点</label>
            <input
              type="text"
              value={formData.location}
              onChange={(event) => setFormData({ ...formData, location: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              placeholder="请输入拍摄地点"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">设备清单</label>
            <textarea
              value={formData.equipment}
              onChange={(event) => setFormData({ ...formData, equipment: event.target.value })}
              rows={2}
              className="w-full resize-none rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              placeholder="请输入设备清单"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">状态</label>
            <select
              value={formData.status}
              onChange={(event) => setFormData({ ...formData, status: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            >
              <option value="planned">计划中</option>
              <option value="in_progress">制作中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(confirmAction)}
        onCancel={() => { if (!mutationLockRef.current) setConfirmAction(null); }}
        onConfirm={handleConfirm}
        loading={confirmLoading}
        variant={confirmAction?.type === 'delete' ? 'danger' : 'warning'}
        title={confirmTitle}
        confirmText={confirmText}
        cancelText="取消"
        description={confirmDescription}
      />
    </PageShell>
  );
}

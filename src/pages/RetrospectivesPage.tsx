import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  createRetrospective,
  getMyRetroActions,
  getRetrospectiveCreateRequestStatus,
  getRetroTemplates,
  getRetrospectives,
  type CreateRetrospectivePayload,
  type RetroAction,
  type RetroTemplate,
  type RetroTemplateCategory,
  type Retrospective,
  type RetrospectiveStatus,
} from '../api/retrospectives';
import { useAppStore, useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import MyRetroActionsPanel from '../components/retrospectives/MyRetroActionsPanel';
import RetroCreateDialog from '../components/retrospectives/RetroCreateDialog';
import RetroList from '../components/retrospectives/RetroList';
import { useRetroAssigneeDirectory } from '../components/retrospectives/useRetroAssigneeDirectory';
import { retroCategoryLabels, toFriendlyRetroError } from '../components/retrospectives/retroLabels';

const statusOptions: Array<{ value: RetrospectiveStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];

const categoryOptions: Array<{ value: RetroTemplateCategory | 'all'; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'weekly', label: retroCategoryLabels.weekly },
  { value: 'project', label: retroCategoryLabels.project },
  { value: 'channel', label: retroCategoryLabels.channel },
  { value: 'topic', label: retroCategoryLabels.topic },
  { value: 'daily', label: retroCategoryLabels.daily },
  { value: 'custom', label: retroCategoryLabels.custom },
];

type StoredCreateRequest = {
  clientRequestId: string;
  payload: CreateRetrospectivePayload;
};

type CreateRecoveryState = {
  actorId: number;
  clientRequestId: string;
  payload: CreateRetrospectivePayload;
  status: 'checking' | 'submitting' | 'uncertain' | 'not_found';
} | {
  actorId: number;
  status: 'storage_error';
  message: string;
};

function createRequestStorageKey(actorId: number) {
  return `xmt:retrospective:create-request:v1:${actorId}`;
}

function isStoredCreateRequest(value: unknown): value is StoredCreateRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredCreateRequest>;
  const payload = candidate.payload;
  return typeof candidate.clientRequestId === 'string'
    && candidate.clientRequestId.length >= 16
    && !!payload
    && typeof payload.title === 'string'
    && typeof payload.scopeType === 'string'
    && typeof payload.periodStart === 'string'
    && typeof payload.periodEnd === 'string';
}

function readStoredCreateRequest(actorId: number): StoredCreateRequest | null {
  const raw = sessionStorage.getItem(createRequestStorageKey(actorId));
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!isStoredCreateRequest(parsed)) {
    throw new Error('本地恢复信息格式不正确');
  }
  return parsed;
}

function clearStoredCreateRequest(actorId: number, clientRequestId: string) {
  try {
    const stored = readStoredCreateRequest(actorId);
    if (stored?.clientRequestId === clientRequestId) {
      sessionStorage.removeItem(createRequestStorageKey(actorId));
    }
  } catch {
    // Keep an unreadable marker rather than risking a second create request.
  }
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

export default function RetrospectivesPage() {
  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const currentUser = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const currentUserId = currentUser?.id;
  const permissionState = usePermission();
  const { hasPermission } = permissionState;
  const canCreate = currentUser?.role === 'admin' || currentUser?.role === 'director' || hasPermission('analytics:retro:create');
  const assigneeDirectory = useRetroAssigneeDirectory({
    currentUser,
    token,
    canViewUsers: hasPermission('user:view'),
    permissionsLoading: permissionState.loading,
    refreshPermissions: permissionState.refreshPermissions,
  });

  const [retrospectives, setRetrospectives] = useState<Retrospective[]>([]);
  const [myActions, setMyActions] = useState<RetroAction[]>([]);
  const [templates, setTemplates] = useState<RetroTemplate[]>([]);
  const [initialDateRange] = useState(() => ({ start: daysAgo(30), end: today() }));
  const [status, setStatus] = useState<RetrospectiveStatus | 'all'>('all');
  const [category, setCategory] = useState<RetroTemplateCategory | 'all'>('all');
  const [start, setStart] = useState(initialDateRange.start);
  const [end, setEnd] = useState(initialDateRange.end);
  const [appliedStatus, setAppliedStatus] = useState<RetrospectiveStatus | 'all'>('all');
  const [appliedCategory, setAppliedCategory] = useState<RetroTemplateCategory | 'all'>('all');
  const [appliedStart, setAppliedStart] = useState(initialDateRange.start);
  const [appliedEnd, setAppliedEnd] = useState(initialDateRange.end);
  const [loading, setLoading] = useState(true);
  const [loadingMyActions, setLoadingMyActions] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [myActionsError, setMyActionsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRecovery, setCreateRecovery] = useState<CreateRecoveryState | null>(null);
  const [createStorageError, setCreateStorageError] = useState<string | null>(null);
  const [recoveryCheckedUserId, setRecoveryCheckedUserId] = useState<number | undefined>();
  const createInFlightRef = useRef(false);
  const recoveryChecksRef = useRef(new Set<string>());
  const listRequestRef = useRef(0);
  const actionsRequestRef = useRef(0);
  const listOwnerRef = useRef(currentUserId);
  const actionsOwnerRef = useRef(currentUserId);
  const [listOwnerId, setListOwnerId] = useState(currentUserId);
  const [actionsOwnerId, setActionsOwnerId] = useState(currentUserId);
  const listScope = JSON.stringify([currentUserId, appliedStatus, appliedCategory, appliedStart, appliedEnd]);
  const latestListScopeRef = useRef(listScope);
  latestListScopeRef.current = listScope;

  const inspectCreateRequest = useCallback(async (
    actorId: number,
    stored: StoredCreateRequest,
    showFeedback: boolean,
  ): Promise<'created' | 'not_found' | 'uncertain' | 'checking'> => {
    const checkKey = `${actorId}:${stored.clientRequestId}`;
    if (recoveryChecksRef.current.has(checkKey)) return 'checking';
    recoveryChecksRef.current.add(checkKey);
    const isCurrentActor = () => useAuthStore.getState().user?.id === actorId;
    if (isCurrentActor()) {
      setCreateRecovery({ ...stored, actorId, status: 'checking' });
    }
    try {
      const result = await getRetrospectiveCreateRequestStatus(stored.clientRequestId);
      if (result.state === 'created') {
        clearStoredCreateRequest(actorId, stored.clientRequestId);
        if (isCurrentActor()) {
          setCreateRecovery(null);
          setCreateOpen(false);
          addNotification({ title: '复盘已创建', message: '已核实创建成功，正在进入详情页', type: 'success' });
          navigate(`/retrospectives/${result.retrospectiveId}`);
        }
        return 'created';
      }
      if (isCurrentActor()) {
        setCreateRecovery({ ...stored, actorId, status: 'not_found' });
        if (showFeedback) {
          addNotification({ title: '尚未确认创建', message: '可以使用原请求编号安全重试，不会重复创建。', type: 'warning' });
        }
      }
      return 'not_found';
    } catch {
      if (isCurrentActor()) {
        setCreateRecovery({ ...stored, actorId, status: 'uncertain' });
        if (showFeedback) {
          addNotification({ title: '创建结果暂时无法核实', message: '已保留原请求，请稍后重新核实；不要另建一条复盘。', type: 'warning' });
        }
      }
      return 'uncertain';
    } finally {
      recoveryChecksRef.current.delete(checkKey);
    }
  }, [addNotification, navigate]);

  useEffect(() => {
    if (!currentUserId) {
      setCreateRecovery(null);
      setRecoveryCheckedUserId(undefined);
      return;
    }
    const actorId = currentUserId;
    try {
      const stored = readStoredCreateRequest(actorId);
      if (!stored) {
        setCreateRecovery(null);
        setCreateStorageError(null);
        setRecoveryCheckedUserId(actorId);
        return;
      }
      setCreateRecovery({ ...stored, actorId, status: 'checking' });
      setCreateOpen(true);
      setRecoveryCheckedUserId(actorId);
      void inspectCreateRequest(actorId, stored, false);
    } catch (error) {
      setCreateRecovery({
        actorId,
        status: 'storage_error',
        message: error instanceof Error ? error.message : '读取本地恢复信息失败',
      });
      setCreateOpen(true);
      setRecoveryCheckedUserId(actorId);
    }
  }, [currentUserId, inspectCreateRequest]);

  const loadList = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    const isCurrent = () => requestId === listRequestRef.current
      && latestListScopeRef.current === listScope
      && useAuthStore.getState().user?.id === currentUserId;
    if (listOwnerRef.current !== currentUserId) {
      listOwnerRef.current = currentUserId;
      setListOwnerId(currentUserId);
      setRetrospectives([]);
    }
    setLoading(true);
    setListError(null);
    try {
      if (!currentUserId) return;
      const result = await getRetrospectives({
        status: appliedStatus,
        category: appliedCategory,
        start: appliedStart,
        end: appliedEnd,
      });
      if (!isCurrent()) return;
      setRetrospectives(result.retrospectives);
    } catch (error) {
      if (!isCurrent()) return;
      setListError(toFriendlyRetroError(error));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [appliedCategory, appliedEnd, appliedStart, appliedStatus, currentUserId, listScope]);

  const loadMyActions = useCallback(async () => {
    const requestId = ++actionsRequestRef.current;
    const isCurrent = () => requestId === actionsRequestRef.current && useAuthStore.getState().user?.id === currentUserId;
    if (actionsOwnerRef.current !== currentUserId) {
      actionsOwnerRef.current = currentUserId;
      setActionsOwnerId(currentUserId);
      setMyActions([]);
    }
    setLoadingMyActions(true);
    setMyActionsError(null);
    try {
      if (!currentUserId) return;
      const result = await getMyRetroActions({ status: 'open' });
      if (!isCurrent()) return;
      setMyActions(result.actions);
    } catch (error) {
      if (!isCurrent()) return;
      setMyActionsError(toFriendlyRetroError(error));
    } finally {
      if (isCurrent()) setLoadingMyActions(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadList();
    return () => { listRequestRef.current += 1; };
  }, [loadList]);

  useEffect(() => {
    void loadMyActions();
    return () => { actionsRequestRef.current += 1; };
  }, [loadMyActions]);

  useEffect(() => {
    getRetroTemplates()
      .then((result) => setTemplates(result.templates))
      .catch((error) => addNotification({ title: '加载复盘模板失败', message: toFriendlyRetroError(error), type: 'warning' }));

  }, [addNotification]);

  const handleCreate = async (payload: CreateRetrospectivePayload) => {
    const actorId = currentUserId;
    if (!actorId || recoveryCheckedUserId !== actorId) return;
    const visibleRecovery = createRecovery?.actorId === actorId ? createRecovery : null;
    if (visibleRecovery?.status === 'storage_error') return;
    if (visibleRecovery && visibleRecovery.status !== 'not_found') return;
    if (createInFlightRef.current) return;
    let storedRequest: StoredCreateRequest;
    if (visibleRecovery?.status === 'not_found') {
      storedRequest = {
        clientRequestId: visibleRecovery.clientRequestId,
        payload: visibleRecovery.payload,
      };
    } else {
      storedRequest = { clientRequestId: crypto.randomUUID(), payload };
      try {
        const key = createRequestStorageKey(actorId);
        const serialized = JSON.stringify(storedRequest);
        sessionStorage.setItem(key, serialized);
        if (sessionStorage.getItem(key) !== serialized) throw new Error('无法确认本地恢复信息已保存');
      } catch {
        setCreateStorageError('浏览器暂时无法保存创建恢复信息。为避免重复创建，本次未提交；请稍后重试。');
        return;
      }
    }
    setCreateStorageError(null);
    createInFlightRef.current = true;
    setCreating(true);
    setCreateRecovery({ ...storedRequest, actorId, status: 'submitting' });
    try {
      const detail = await createRetrospective(storedRequest.payload, storedRequest.clientRequestId);
      clearStoredCreateRequest(actorId, storedRequest.clientRequestId);
      if (useAuthStore.getState().user?.id === actorId) {
        setCreateRecovery(null);
        addNotification({ title: '复盘已创建', message: '正在进入详情页', type: 'success' });
        setCreateOpen(false);
        navigate(`/retrospectives/${detail.retrospective.id}`);
      }
    } catch {
      await inspectCreateRequest(actorId, storedRequest, true);
    } finally {
      createInFlightRef.current = false;
      setCreating(false);
    }
  };

  const currentRecovery = createRecovery?.actorId === currentUserId ? createRecovery : null;
  const recoveryLoading = currentUserId !== undefined && recoveryCheckedUserId !== currentUserId;
  const canOpenCreate = canCreate && !recoveryLoading;
  const handleVerifyCreate = () => {
    if (!currentRecovery || currentRecovery.status === 'storage_error') return;
    void inspectCreateRequest(currentRecovery.actorId, {
      clientRequestId: currentRecovery.clientRequestId,
      payload: currentRecovery.payload,
    }, true);
  };

  const handleApplyFilters = () => {
    setAppliedStatus(status);
    setAppliedCategory(category);
    setAppliedStart(start);
    setAppliedEnd(end);
  };

  return (
    <PageShell>
      <PageHeader
        title="复盘中心"
        description="复盘团队工作结果，跟进行动项。"
        actions={
          <div className="flex flex-wrap gap-3">
            {canOpenCreate ? (
              <ActionButton variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                新建复盘
              </ActionButton>
            ) : null}
          </div>
        }
      />

      {currentRecovery ? (
        <GlassPanel className="border border-studio-border-soft p-4" role="status" aria-live="polite">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-studio-text-primary">
              {currentRecovery.status === 'storage_error'
                ? `${currentRecovery.message}请勿重新提交；如需继续，请先恢复当前浏览器会话。`
                : currentRecovery.status === 'not_found'
                  ? '有一条复盘创建请求尚未完成，可继续核实或在弹窗中用原请求编号重试。'
                  : '正在核实一条复盘创建请求，请勿另建相同内容。'}
            </p>
            <div className="flex shrink-0 gap-2">
              {currentRecovery.status !== 'storage_error' ? (
                <ActionButton onClick={() => setCreateOpen(true)}>
                  {currentRecovery.status === 'not_found' ? '查看原请求' : '核实创建结果'}
                </ActionButton>
              ) : null}
              {currentRecovery.status === 'uncertain' ? <ActionButton variant="ghost" onClick={handleVerifyCreate}>重新核实</ActionButton> : null}
            </div>
          </div>
        </GlassPanel>
      ) : null}

      <MyRetroActionsPanel
        actions={actionsOwnerId === currentUserId ? myActions : []}
        loading={loadingMyActions || actionsOwnerId !== currentUserId}
        error={actionsOwnerId === currentUserId ? myActionsError : null}
        onRefresh={loadMyActions}
        onOpen={(id) => navigate(`/retrospectives/${id}`)}
      />

      <GlassPanel className="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_180px_180px_auto]">
          <select
            value={status}
            aria-label="复盘状态"
            onChange={(event) => setStatus(event.target.value as RetrospectiveStatus | 'all')}
            className="xmt-field min-h-10 text-sm"
          >
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select
            value={category}
            aria-label="复盘类型"
            onChange={(event) => setCategory(event.target.value as RetroTemplateCategory | 'all')}
            className="xmt-field min-h-10 text-sm"
          >
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input
            type="date"
            value={start}
            aria-label="开始日期"
            onChange={(event) => setStart(event.target.value)}
            className="xmt-field min-h-10 text-sm"
          />
          <input
            type="date"
            value={end}
            aria-label="结束日期"
            onChange={(event) => setEnd(event.target.value)}
            className="xmt-field min-h-10 text-sm"
          />
          <ActionButton onClick={handleApplyFilters} aria-busy={loading}>应用筛选</ActionButton>
        </div>
      </GlassPanel>

      <RetroList
        retrospectives={listOwnerId === currentUserId ? retrospectives : []}
        loading={loading || listOwnerId !== currentUserId}
        error={listOwnerId === currentUserId ? listError : null}
        canCreate={canOpenCreate}
        onCreate={() => setCreateOpen(true)}
        onRefresh={loadList}
        onOpen={(id) => navigate(`/retrospectives/${id}`)}
      />

      <RetroCreateDialog
        open={createOpen}
        templates={templates}
        users={assigneeDirectory.users}
        currentUserId={currentUser?.id}
        loading={creating}
        recovery={currentRecovery}
        createStorageError={createStorageError}
        canRetryRecovery={canCreate}
        onVerifyRecovery={handleVerifyCreate}
        usersStatus={assigneeDirectory.status}
        usersError={assigneeDirectory.error}
        onRetryUsers={assigneeDirectory.retry}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </PageShell>
  );
}

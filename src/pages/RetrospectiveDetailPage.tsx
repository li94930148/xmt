import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Download, FileText, RefreshCw, UserRound } from 'lucide-react';
import {
  archiveRetrospective,
  createRetroAction,
  exportRetrospective,
  getRetroActionUpdateRequestStatus,
  getRetrospectiveUpdateRequestStatus,
  generateRetroSnapshot,
  getRetroDailyRisks,
  getRetroActionCreateRequestStatus,
  getRetrospectiveDetail,
  publishRetrospective,
  updateRetroAction,
  updateRetrospective,
  type CreateRetroActionPayload,
  type RetroAction,
  type RetroActionUpdateRecoveryState,
  type RetroDailyRiskItem,
  type RetrospectiveDetail,
  type UpdateRetroActionPayload,
  type UpdateRetrospectivePayload,
  type RetrospectiveUpdateRecoveryState,
} from '../api/retrospectives';
import { useAppStore, useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '../hooks/useRouteNavigationGuard';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import RetroStatusPill from '../components/retrospectives/RetroStatusPill';
import RetroMetricSnapshotPanel from '../components/retrospectives/RetroMetricSnapshotPanel';
import RetroSummaryEditor from '../components/retrospectives/RetroSummaryEditor';
import RetroSummaryUpdateRecoveryNotice from '../components/retrospectives/RetroSummaryUpdateRecoveryNotice';
import RetroPublishPanel from '../components/retrospectives/RetroPublishPanel';
import RetroActionTable from '../components/retrospectives/RetroActionTable';
import RetroActionDetailDrawer from '../components/retrospectives/RetroActionDetailDrawer';
import RetroDailyRiskPanel from '../components/retrospectives/RetroDailyRiskPanel';
import RetroAssigneeDirectoryNotice from '../components/retrospectives/RetroAssigneeDirectoryNotice';
import { useRetroAssigneeDirectory } from '../components/retrospectives/useRetroAssigneeDirectory';
import {
  formatDate,
  formatDateTime,
  retroCategoryLabels,
  retroScopeLabels,
  toFriendlyRetroError,
} from '../components/retrospectives/retroLabels';

type PendingRetroActionCreate = {
  actorId: number;
  retroId: number;
  requestId: string;
  payload: CreateRetroActionPayload;
};

type PendingRetroActionUpdate = {
  actorId: number;
  actionId: number;
  retroId: number;
  requestId: string;
  payload: UpdateRetroActionPayload;
  phase: 'status' | 'processed_detail' | 'conflict_detail' | 'rejected_detail';
  resetTableDraftOnSuccess?: boolean;
};

type PendingRetroSummaryUpdate = {
  actorId: number;
  retroId: number;
  requestId: string;
  payload: { title: string; summaryMd: string; version: number };
  phase: 'status' | 'processed_detail' | 'conflict_detail' | 'rejected_detail';
};

type RetroSummaryUpdateRecoveryEntry = {
  marker: PendingRetroSummaryUpdate | null;
  state: RetrospectiveUpdateRecoveryState | null;
};

type RetroActionUpdateRecoveryEntry = {
  marker: PendingRetroActionUpdate | null;
  state: RetroActionUpdateRecoveryState;
};

type RetroActionCreateRecoveryState = 'needs_check' | 'posting' | 'checking' | 'not_found' | 'unknown' | 'forbidden' | 'created' | 'deleted' | 'storage_error' | null;

const retroActionCreateRequestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const retroActionUpdateRequestIdPattern = retroActionCreateRequestIdPattern;
const retroSummaryUpdateRequestIdPattern = retroActionCreateRequestIdPattern;

function retroSummaryUpdateStorageKey(actorId: number, retroId: number) {
  return `xmt:retro-summary-update:${actorId}:${retroId}`;
}

function parsePendingRetroSummaryUpdate(value: string, actorId: number, retroId: number): PendingRetroSummaryUpdate | null {
  try {
    const marker = JSON.parse(value) as Partial<PendingRetroSummaryUpdate>;
    const payload = marker.payload as UpdateRetrospectivePayload | undefined;
    if (Number(marker.actorId) !== actorId || Number(marker.retroId) !== retroId
      || typeof marker.requestId !== 'string' || !retroSummaryUpdateRequestIdPattern.test(marker.requestId)
      || !payload || typeof payload !== 'object' || Array.isArray(payload)
      || (marker.phase !== 'status' && marker.phase !== 'processed_detail' && marker.phase !== 'conflict_detail' && marker.phase !== 'rejected_detail')
      || typeof payload.title !== 'string' || typeof payload.summaryMd !== 'string'
      || !Number.isInteger(payload.version) || payload.version < 1) {
      return null;
    }
    return {
      actorId,
      retroId,
      requestId: marker.requestId,
      payload: { title: payload.title, summaryMd: payload.summaryMd, version: payload.version },
      phase: marker.phase,
    };
  } catch {
    return null;
  }
}

function retroActionCreateStorageKey(actorId: number, retroId: number) {
  return `xmt:retro-action-create:${actorId}:${retroId}`;
}

function parsePendingRetroActionCreate(value: string, actorId: number, retroId: number): PendingRetroActionCreate | null {
  try {
    const marker = JSON.parse(value) as Partial<PendingRetroActionCreate>;
    const payload = marker.payload as CreateRetroActionPayload | undefined;
    if (Number(marker.actorId) !== actorId || Number(marker.retroId) !== retroId
      || typeof marker.requestId !== 'string' || !retroActionCreateRequestIdPattern.test(marker.requestId)
      || !payload || typeof payload.title !== 'string' || !payload.title.trim()
      || (payload.descriptionMd !== undefined && typeof payload.descriptionMd !== 'string')
      || (payload.ownerId !== undefined && payload.ownerId !== null && !Number.isInteger(payload.ownerId))
      || (payload.dueDate !== undefined && payload.dueDate !== null && typeof payload.dueDate !== 'string')) {
      return null;
    }
    return {
      actorId,
      retroId,
      requestId: marker.requestId,
      payload: {
        title: payload.title,
        descriptionMd: payload.descriptionMd || '',
        ownerId: payload.ownerId ?? null,
        dueDate: payload.dueDate ?? null,
      },
    };
  } catch {
    return null;
  }
}

function retroActionUpdateStorageKey(actorId: number, actionId: number) {
  return `xmt:retro-action-update:${actorId}:${actionId}`;
}

function actionUpdateRecoveryToken(marker: PendingRetroActionUpdate) {
  return `${marker.actorId}:${marker.actionId}:${marker.requestId}:${marker.phase}`;
}

function parsePendingRetroActionUpdate(value: string, actorId: number, actionId: number, retroId: number): PendingRetroActionUpdate | null {
  try {
    const marker = JSON.parse(value) as Partial<PendingRetroActionUpdate>;
    const payload = marker.payload as UpdateRetroActionPayload | undefined;
    const validStatuses = ['todo', 'doing', 'done', 'cancelled'];
    if (Number(marker.actorId) !== actorId || Number(marker.actionId) !== actionId || Number(marker.retroId) !== retroId
      || typeof marker.requestId !== 'string' || !retroActionUpdateRequestIdPattern.test(marker.requestId)
      || !payload || typeof payload !== 'object' || Array.isArray(payload)
      || (marker.phase !== 'status' && marker.phase !== 'processed_detail' && marker.phase !== 'conflict_detail' && marker.phase !== 'rejected_detail')
      || (marker.resetTableDraftOnSuccess !== undefined && typeof marker.resetTableDraftOnSuccess !== 'boolean')
      || Object.keys(payload).some((key) => !['title', 'descriptionMd', 'ownerId', 'dueDate', 'status', 'resultMd'].includes(key))
      || Object.keys(payload).length === 0
      || (payload.title !== undefined && typeof payload.title !== 'string')
      || (payload.descriptionMd !== undefined && typeof payload.descriptionMd !== 'string')
      || (payload.ownerId !== undefined && payload.ownerId !== null && !Number.isInteger(payload.ownerId))
      || (payload.dueDate !== undefined && payload.dueDate !== null && typeof payload.dueDate !== 'string')
      || (payload.status !== undefined && !validStatuses.includes(payload.status))
      || (payload.resultMd !== undefined && typeof payload.resultMd !== 'string')) {
      return null;
    }
    return {
      actorId,
      actionId,
      retroId,
      requestId: marker.requestId,
      payload: { ...payload },
      phase: marker.phase,
      resetTableDraftOnSuccess: marker.resetTableDraftOnSuccess !== false,
    };
  } catch {
    return null;
  }
}

function downloadTextFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function RetrospectiveDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const currentUser = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const permissionState = usePermission();
  const assigneeDirectory = useRetroAssigneeDirectory({
    currentUser,
    token,
    canViewUsers: permissionState.hasPermission('user:view'),
    permissionsLoading: permissionState.loading,
    refreshPermissions: permissionState.refreshPermissions,
  });
  const retroId = Number(params.id);
  const currentRetroIdRef = useRef(retroId);
  currentRetroIdRef.current = retroId;

  const [detail, setDetail] = useState<RetrospectiveDetail | null>(null);
  const [summary, setSummary] = useState('');
  const [summaryUpdateRecovery, setSummaryUpdateRecoveryState] = useState<RetroSummaryUpdateRecoveryEntry | null>(null);
  const summaryUpdateRecoveryRef = useRef<RetroSummaryUpdateRecoveryEntry | null>(null);
  const summaryUpdateRecoveryScopeRef = useRef('');
  const summaryUpdateAutoRecoveryTokensRef = useRef(new Set<string>());
  const summaryBaselineRef = useRef({ retroId: 0, value: '' });
  const [summaryActionError, setSummaryActionError] = useState<string | null>(null);
  const [dailyRisks, setDailyRisks] = useState<RetroDailyRiskItem[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dailyRisksError, setDailyRisksError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<RetroAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRisks, setLoadingRisks] = useState(false);
  const [working, setWorking] = useState(false);
  const [pendingActionCreate, setPendingActionCreate] = useState<PendingRetroActionCreate | null>(null);
  const [actionCreateRecoveryState, setActionCreateRecoveryState] = useState<RetroActionCreateRecoveryState>(null);
  const [actionCreateDraftResetSequence, setActionCreateDraftResetSequence] = useState(0);
  const [actionUpdateRecoveries, setActionUpdateRecoveries] = useState<Record<number, RetroActionUpdateRecoveryEntry>>({});
  const [actionDraftResetSignal, setActionDraftResetSignal] = useState<{ actionId: number; sequence: number } | null>(null);
  const [actionDraftRestoreSignal, setActionDraftRestoreSignal] = useState<{
    actionId: number;
    sequence: number;
    payload: UpdateRetroActionPayload;
  } | null>(null);
  const mutationInFlightRef = useRef(false);
  const actionUpdateRecoveryScopeRef = useRef('');
  const actionUpdateAutoRecoveryTokensRef = useRef(new Set<string>());
  const actionDraftResetSequenceRef = useRef(0);
  const detailRequestSequenceRef = useRef(0);
  const risksRequestSequenceRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const summaryIsDirty = Boolean(detail && summary !== (detail.retrospective.summaryMd || ''));

  useEffect(() => {
    if (!summaryIsDirty && !working && !saving) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [summaryIsDirty, saving, working]);

  const handleRouteNavigationAttempt = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
    if (mutationInFlightRef.current || working || saving) {
      addNotification({
        title: '操作尚未完成',
        message: '当前复盘操作完成前不能离开，请稍候再试。',
        type: 'warning',
      });
      stay();
      return;
    }

    if (summaryIsDirty && !window.confirm('本页还有未保存的复盘结论，离开后这些修改可能无法恢复。请取消并先保存；当前已只读时请先复制保留。是否放弃未保存修改并离开？')) {
      stay();
      return;
    }

    proceed();
  }, [addNotification, saving, summaryIsDirty, working]);
  useRouteNavigationGuard(summaryIsDirty || working || saving, handleRouteNavigationAttempt);

  const handleReturnToList = () => {
    if (mutationInFlightRef.current) return;
    navigate('/retrospectives');
  };

  const applySummary = useCallback((next: RetrospectiveDetail, submittedSummary?: string) => {
    const previous = summaryBaselineRef.current;
    const nextValue = next.retrospective.summaryMd || '';
    const expectedValue = submittedSummary ?? previous.value;
    summaryBaselineRef.current = { retroId: next.retrospective.id, value: nextValue };
    setSummary((current) => previous.retroId !== next.retrospective.id || current === expectedValue ? nextValue : current);
  }, []);

  const beginMutation = () => {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    setWorking(true);
    return true;
  };

  const endMutation = () => {
    mutationInFlightRef.current = false;
    setWorking(false);
  };

  const loadDailyRisks = useCallback(async () => {
    if (!Number.isInteger(retroId) || retroId <= 0) return;
    const requestId = ++risksRequestSequenceRef.current;
    setLoadingRisks(true);
    setDailyRisksError(null);
    try {
      const result = await getRetroDailyRisks(retroId);
      if (requestId !== risksRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDailyRisks(result.risks);
    } catch (error) {
      if (requestId !== risksRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDailyRisksError(toFriendlyRetroError(error));
    } finally {
      if (requestId === risksRequestSequenceRef.current) setLoadingRisks(false);
    }
  }, [retroId]);

  const loadDetail = useCallback(async () => {
    if (!Number.isInteger(retroId) || retroId <= 0) {
      navigate('/retrospectives');
      return;
    }
    const requestId = ++detailRequestSequenceRef.current;
    setLoading(true);
    setDetailError(null);
    try {
      const result = await getRetrospectiveDetail(retroId);
      if (requestId !== detailRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDetail(result);
      applySummary(result);
    } catch (error) {
      if (requestId !== detailRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDetailError(toFriendlyRetroError(error));
    } finally {
      if (requestId === detailRequestSequenceRef.current && currentRetroIdRef.current === retroId) setLoading(false);
    }
  }, [applySummary, navigate, retroId]);

  useEffect(() => {
    setDailyRisks([]);
    setDailyRisksError(null);
    void loadDetail();
    void loadDailyRisks();
    return () => {
      detailRequestSequenceRef.current += 1;
      risksRequestSequenceRef.current += 1;
    };
  }, [loadDetail, loadDailyRisks]);

  const applyDetail = useCallback((next: RetrospectiveDetail, submittedSummary?: string) => {
    if (next.retrospective.id !== currentRetroIdRef.current) return;
    setDetail(next);
    applySummary(next, submittedSummary);
    setSelectedAction((current) => {
      if (!current) return null;
      return next.actions.find((action) => action.id === current.id) || null;
    });
  }, [applySummary]);

  const currentActorId = Number(currentUser?.id || 0);
  summaryUpdateRecoveryRef.current = summaryUpdateRecovery;
  const setSummaryUpdateRecovery = useCallback((entry: RetroSummaryUpdateRecoveryEntry | null) => {
    summaryUpdateRecoveryRef.current = entry;
    setSummaryUpdateRecoveryState(entry);
  }, []);

  const isCurrentSummaryUpdateRecovery = useCallback((marker: PendingRetroSummaryUpdate) => (
    currentRetroIdRef.current === marker.retroId
    && Number(useAuthStore.getState().user?.id || 0) === marker.actorId
  ), []);

  const setSummaryUpdateRecoveryStateForMarker = useCallback((marker: PendingRetroSummaryUpdate, state: RetrospectiveUpdateRecoveryState) => {
    const existing = summaryUpdateRecoveryRef.current;
    if (existing?.marker && existing.marker.requestId !== marker.requestId) return;
    setSummaryUpdateRecovery({ marker, state });
  }, [setSummaryUpdateRecovery]);

  const clearSummaryUpdateMarker = useCallback((
    marker: PendingRetroSummaryUpdate,
    fallbackState: RetrospectiveUpdateRecoveryState = 'processed_refresh',
  ) => {
    const existing = summaryUpdateRecoveryRef.current;
    if (existing?.marker && existing.marker.requestId !== marker.requestId) return false;
    try {
      window.sessionStorage.removeItem(retroSummaryUpdateStorageKey(marker.actorId, marker.retroId));
    } catch {
      setSummaryUpdateRecovery({ marker, state: fallbackState });
      return false;
    }
    setSummaryUpdateRecovery(null);
    return true;
  }, [setSummaryUpdateRecovery]);

  const persistSummaryUpdatePhase = useCallback((marker: PendingRetroSummaryUpdate, phase: PendingRetroSummaryUpdate['phase']) => {
    const next = { ...marker, phase };
    const state: RetrospectiveUpdateRecoveryState = phase === 'status'
      ? 'needs_check'
      : phase === 'processed_detail'
        ? 'processed_refresh'
        : phase === 'conflict_detail'
          ? 'conflict_refresh'
          : 'rejected_refresh';
    summaryUpdateAutoRecoveryTokensRef.current.add(`${next.actorId}:${next.retroId}:${next.requestId}:${next.phase}`);
    try {
      window.sessionStorage.setItem(retroSummaryUpdateStorageKey(marker.actorId, marker.retroId), JSON.stringify(next));
    } catch {
      // Keep the original request marker; a later mount will still perform only a read-only status check.
    }
    setSummaryUpdateRecovery({ marker: next, state });
    return next;
  }, [setSummaryUpdateRecovery]);

  const refreshSummaryUpdateDetail = useCallback(async (
    marker: PendingRetroSummaryUpdate,
    outcome: 'processed' | 'conflict' | 'rejected',
  ) => {
    const state: RetrospectiveUpdateRecoveryState = outcome === 'processed'
      ? 'processed_refresh'
      : outcome === 'conflict'
        ? 'conflict_refresh'
        : 'rejected_refresh';
    if (!isCurrentSummaryUpdateRecovery(marker)) return false;
    setSummaryUpdateRecoveryStateForMarker(marker, state);
    try {
      const refreshed = await getRetrospectiveDetail(marker.retroId);
      if (!isCurrentSummaryUpdateRecovery(marker)) return false;
      const submittedStillCurrent = refreshed.retrospective.title === marker.payload.title
        && (refreshed.retrospective.summaryMd || '') === marker.payload.summaryMd;
      if (outcome === 'processed' && submittedStillCurrent) {
        applyDetail(refreshed, marker.payload.summaryMd);
        if (!clearSummaryUpdateMarker(marker)) return false;
        addNotification({ title: '复盘结论已确认保存', message: '已只读核实服务器当前内容', type: 'success' });
        return true;
      }

      applyDetail(refreshed);
      setSummary(marker.payload.summaryMd);
      if (outcome === 'processed') {
        setSummaryUpdateRecoveryStateForMarker(marker, 'superseded_reedit');
        addNotification({ title: '复盘结论已保存但随后有更新', message: '本地提交内容仍保留，请对照服务器当前内容后再继续。', type: 'warning' });
        return false;
      }
      if (outcome === 'conflict') {
        setSummaryUpdateRecoveryStateForMarker(marker, 'conflict_reedit');
        addNotification({ title: '复盘结论已被并发更新', message: '服务器已刷新；本地提交内容保留供你核对，不会自动重放。', type: 'warning' });
        return false;
      }
      if (!clearSummaryUpdateMarker(marker, 'rejected_refresh')) return false;
      setSummary(marker.payload.summaryMd);
      addNotification({ title: '服务器未接受本次复盘结论', message: '已刷新当前内容；本地草稿仍保留，请核对权限和内容后重新保存。', type: 'warning' });
      return false;
    } catch {
      if (isCurrentSummaryUpdateRecovery(marker)) setSummaryUpdateRecoveryStateForMarker(marker, state);
      return false;
    }
  }, [addNotification, applyDetail, clearSummaryUpdateMarker, isCurrentSummaryUpdateRecovery, setSummaryUpdateRecoveryStateForMarker]);

  const verifyPendingSummaryUpdate = useCallback(async (marker: PendingRetroSummaryUpdate) => {
    if (!isCurrentSummaryUpdateRecovery(marker)) return false;
    if (marker.phase === 'processed_detail') return refreshSummaryUpdateDetail(marker, 'processed');
    if (marker.phase === 'conflict_detail') return refreshSummaryUpdateDetail(marker, 'conflict');
    if (marker.phase === 'rejected_detail') return refreshSummaryUpdateDetail(marker, 'rejected');

    setSummaryUpdateRecoveryStateForMarker(marker, 'checking');
    try {
      const result = await getRetrospectiveUpdateRequestStatus(marker.retroId, marker.requestId);
      if (!isCurrentSummaryUpdateRecovery(marker)) return false;
      if (result.state === 'not_found') {
        setSummary(marker.payload.summaryMd);
        setSummaryUpdateRecoveryStateForMarker(marker, 'not_found');
        return false;
      }
      if (result.state === 'conflict') {
        const conflictMarker = persistSummaryUpdatePhase(marker, 'conflict_detail');
        return refreshSummaryUpdateDetail(conflictMarker, 'conflict');
      }
      const processedMarker = persistSummaryUpdatePhase(marker, 'processed_detail');
      return refreshSummaryUpdateDetail(processedMarker, 'processed');
    } catch {
      if (isCurrentSummaryUpdateRecovery(marker)) setSummaryUpdateRecoveryStateForMarker(marker, 'unknown');
      return false;
    }
  }, [isCurrentSummaryUpdateRecovery, persistSummaryUpdatePhase, refreshSummaryUpdateDetail, setSummaryUpdateRecoveryStateForMarker]);

  const refreshPendingSummaryUpdate = useCallback(() => {
    const marker = summaryUpdateRecoveryRef.current?.marker;
    if (marker && isCurrentSummaryUpdateRecovery(marker)) void verifyPendingSummaryUpdate(marker);
  }, [isCurrentSummaryUpdateRecovery, verifyPendingSummaryUpdate]);

  const retryPendingSummaryUpdate = useCallback(async () => {
    const entry = summaryUpdateRecoveryRef.current;
    const marker = entry?.marker;
    if (!marker || entry.state !== 'not_found' || !isCurrentSummaryUpdateRecovery(marker) || !beginMutation()) return;
    setSummaryUpdateRecoveryStateForMarker(marker, 'posting');
    setSaving(true);
    try {
      const updated = await updateRetrospective(marker.retroId, marker.payload, marker.requestId);
      if (!isCurrentSummaryUpdateRecovery(marker)) return;
      applyDetail(updated, marker.payload.summaryMd);
      const processedMarker = persistSummaryUpdatePhase(marker, 'processed_detail');
      if (!clearSummaryUpdateMarker(processedMarker)) {
        await refreshSummaryUpdateDetail(processedMarker, 'processed');
        return;
      }
      addNotification({ title: '复盘结论已保存', message: '使用原请求编号重试并核实成功', type: 'success' });
    } catch (error) {
      if (!isCurrentSummaryUpdateRecovery(marker)) return;
      const status = Number((error as { status?: number } | null)?.status || 0);
      const errorCode = String((error as { code?: string } | null)?.code || '');
      if (status === 0 || status === 408 || status >= 500) {
        setSummaryUpdateRecoveryStateForMarker(marker, 'checking');
        addNotification({ title: '复盘结论结果待核实', message: '已锁定本页结论，不会自动重发保存请求。', type: 'warning' });
        await verifyPendingSummaryUpdate(marker);
      } else if (status === 409 && errorCode === 'VERSION_CONFLICT') {
        const conflictMarker = persistSummaryUpdatePhase(marker, 'conflict_detail');
        await refreshSummaryUpdateDetail(conflictMarker, 'conflict');
      } else {
        const rejectedMarker = persistSummaryUpdatePhase(marker, 'rejected_detail');
        await refreshSummaryUpdateDetail(rejectedMarker, 'rejected');
      }
    } finally {
      setSaving(false);
      endMutation();
    }
  }, [addNotification, applyDetail, clearSummaryUpdateMarker, isCurrentSummaryUpdateRecovery, persistSummaryUpdatePhase, refreshSummaryUpdateDetail, setSummaryUpdateRecoveryStateForMarker, verifyPendingSummaryUpdate]);

  const handleSummaryChange = useCallback((value: string) => {
    setSummary(value);
    const entry = summaryUpdateRecoveryRef.current;
    if (!entry?.marker || (entry.state !== 'conflict_reedit' && entry.state !== 'superseded_reedit')) return;
    const nextMarker = { ...entry.marker, payload: { ...entry.marker.payload, summaryMd: value } };
    try {
      window.sessionStorage.setItem(retroSummaryUpdateStorageKey(nextMarker.actorId, nextMarker.retroId), JSON.stringify(nextMarker));
      setSummaryUpdateRecovery({ marker: nextMarker, state: entry.state });
    } catch {
      setSummaryUpdateRecovery({ marker: nextMarker, state: 'storage_error' });
    }
  }, [setSummaryUpdateRecovery]);

  const retrySummaryUpdateRecoveryStorage = useCallback(() => {
    const entry = summaryUpdateRecoveryRef.current;
    const marker = entry?.marker;
    if (entry?.state !== 'storage_error' || !marker) return;
    try {
      window.sessionStorage.setItem(retroSummaryUpdateStorageKey(marker.actorId, marker.retroId), JSON.stringify(marker));
      const state: RetrospectiveUpdateRecoveryState = marker.phase === 'conflict_detail'
        ? 'conflict_reedit'
        : marker.phase === 'processed_detail'
          ? 'superseded_reedit'
          : 'storage_error';
      setSummaryUpdateRecovery({ marker, state });
    } catch {
      setSummaryUpdateRecovery({ marker, state: 'storage_error' });
    }
  }, [setSummaryUpdateRecovery]);

  useEffect(() => {
    if (!Number.isInteger(currentActorId) || currentActorId <= 0) {
      summaryUpdateRecoveryScopeRef.current = '';
      setSummaryUpdateRecovery(null);
      return;
    }
    if (!detail || detail.retrospective.id !== retroId) return;
    const scope = `${currentActorId}:${retroId}`;
    if (summaryUpdateRecoveryScopeRef.current === scope) return;
    summaryUpdateRecoveryScopeRef.current = scope;
    try {
      const raw = window.sessionStorage.getItem(retroSummaryUpdateStorageKey(currentActorId, retroId));
      if (!raw) {
        setSummaryUpdateRecovery(null);
        return;
      }
      const marker = parsePendingRetroSummaryUpdate(raw, currentActorId, retroId);
      if (!marker) {
        setSummaryUpdateRecovery({ marker: null, state: 'storage_error' });
        return;
      }
      setSummary(marker.payload.summaryMd);
      const state: RetrospectiveUpdateRecoveryState = marker.phase === 'status'
        ? 'needs_check'
        : marker.phase === 'processed_detail'
          ? 'processed_refresh'
          : marker.phase === 'conflict_detail'
            ? 'conflict_refresh'
            : 'rejected_refresh';
      setSummaryUpdateRecovery({ marker, state });
    } catch {
      setSummaryUpdateRecovery({ marker: null, state: 'storage_error' });
    }
  }, [currentActorId, detail, retroId, setSummaryUpdateRecovery]);

  useEffect(() => {
    const entry = summaryUpdateRecovery;
    if (!entry?.marker || !['needs_check', 'processed_refresh', 'conflict_refresh', 'rejected_refresh'].includes(entry.state || '')) return;
    const token = `${entry.marker.actorId}:${entry.marker.retroId}:${entry.marker.requestId}:${entry.marker.phase}`;
    if (summaryUpdateAutoRecoveryTokensRef.current.has(token)) return;
    summaryUpdateAutoRecoveryTokensRef.current.add(token);
    void verifyPendingSummaryUpdate(entry.marker);
  }, [summaryUpdateRecovery, verifyPendingSummaryUpdate]);

  const setActionUpdateRecovery = useCallback((marker: PendingRetroActionUpdate, state: RetroActionUpdateRecoveryState) => {
    setActionUpdateRecoveries((current) => {
      const existing = current[marker.actionId];
      if (existing?.marker && existing.marker.requestId !== marker.requestId && existing.state !== 'conflict_reedit') return current;
      return { ...current, [marker.actionId]: { marker, state } };
    });
  }, []);

  const isCurrentActionUpdateRecovery = useCallback((marker: PendingRetroActionUpdate) => (
    currentRetroIdRef.current === marker.retroId
    && Number(useAuthStore.getState().user?.id || 0) === marker.actorId
  ), []);

  const clearActionUpdateMarker = useCallback((
    marker: PendingRetroActionUpdate,
    fallbackState: 'processed_refresh' | 'conflict_refresh' | 'rejected_refresh' = 'conflict_refresh',
  ) => {
    try {
      window.sessionStorage.removeItem(retroActionUpdateStorageKey(marker.actorId, marker.actionId));
    } catch {
      setActionUpdateRecovery(marker, fallbackState);
      return false;
    }
    setActionUpdateRecoveries((current) => {
      const existing = current[marker.actionId];
      if (existing?.marker && existing.marker.requestId !== marker.requestId) return current;
      const next = { ...current };
      delete next[marker.actionId];
      return next;
    });
    return true;
  }, [setActionUpdateRecovery]);

  const persistActionUpdatePhase = useCallback((marker: PendingRetroActionUpdate, phase: PendingRetroActionUpdate['phase']) => {
    const next = { ...marker, phase };
    const state: RetroActionUpdateRecoveryState = phase === 'status'
      ? 'needs_check'
      : phase === 'processed_detail'
        ? 'processed_refresh'
        : phase === 'rejected_detail'
          ? 'rejected_refresh'
          : 'conflict_refresh';
    actionUpdateAutoRecoveryTokensRef.current.add(actionUpdateRecoveryToken(next));
    try {
      window.sessionStorage.setItem(retroActionUpdateStorageKey(marker.actorId, marker.actionId), JSON.stringify(next));
    } catch {
      // The original status marker is safe to retain: the server receipt is terminal and a reload will only read it again.
    }
    setActionUpdateRecovery(next, state);
    return next;
  }, [setActionUpdateRecovery]);

  const refreshActionUpdateDetail = useCallback(async (
    marker: PendingRetroActionUpdate,
    outcome: 'processed' | 'conflict' | 'rejected',
  ) => {
    const state: RetroActionUpdateRecoveryState = outcome === 'processed'
      ? 'processed_refresh'
      : outcome === 'rejected'
        ? 'rejected_refresh'
        : 'conflict_refresh';
    if (!isCurrentActionUpdateRecovery(marker)) return false;
    setActionUpdateRecovery(marker, state);
    try {
      const refreshed = await getRetrospectiveDetail(marker.retroId);
      if (!isCurrentActionUpdateRecovery(marker)) return false;
      applyDetail(refreshed);
      if (outcome === 'conflict') setActionDraftRestoreSignal({
        actionId: marker.actionId,
        sequence: ++actionDraftResetSequenceRef.current,
        payload: marker.payload,
      });
      if (outcome === 'conflict') {
        setActionUpdateRecovery(marker, 'conflict_reedit');
        addNotification({
          title: '行动项已变化，请核对后保存',
          message: '服务器已刷新；表单保留本次未提交内容，请对照后手动编辑/保存。',
          type: 'warning',
        });
        return false;
      }
      if (!clearActionUpdateMarker(marker, state)) return false;
      if (outcome === 'processed') {
        if (marker.resetTableDraftOnSuccess !== false) {
          setActionDraftResetSignal({ actionId: marker.actionId, sequence: ++actionDraftResetSequenceRef.current });
        }
        addNotification({ title: '行动项已确认更新', message: '已只读刷新当前复盘', type: 'success' });
        return true;
      }
      addNotification({ title: '行动项更新未被接受', message: '已刷新当前内容；请核对后重新编辑。', type: 'warning' });
      return false;
    } catch {
      if (isCurrentActionUpdateRecovery(marker)) setActionUpdateRecovery(marker, state);
      return false;
    }
  }, [addNotification, applyDetail, clearActionUpdateMarker, isCurrentActionUpdateRecovery, setActionUpdateRecovery]);

  const verifyPendingActionUpdate = useCallback(async (marker: PendingRetroActionUpdate) => {
    if (!isCurrentActionUpdateRecovery(marker)) return false;
    if (marker.phase === 'processed_detail') return refreshActionUpdateDetail(marker, 'processed');
    if (marker.phase === 'conflict_detail') return refreshActionUpdateDetail(marker, 'conflict');
    if (marker.phase === 'rejected_detail') return refreshActionUpdateDetail(marker, 'rejected');

    setActionUpdateRecovery(marker, 'checking');
    try {
      const result = await getRetroActionUpdateRequestStatus(marker.actionId, marker.requestId);
      if (!isCurrentActionUpdateRecovery(marker)) return false;
      if (result.state === 'not_found') {
        setActionUpdateRecovery(marker, 'not_found');
        return false;
      }
      if (result.state === 'conflict') {
        const conflictMarker = persistActionUpdatePhase(marker, 'conflict_detail');
        return refreshActionUpdateDetail(conflictMarker, 'conflict');
      }
      const processedMarker = persistActionUpdatePhase(marker, 'processed_detail');
      return refreshActionUpdateDetail(processedMarker, 'processed');
    } catch {
      if (isCurrentActionUpdateRecovery(marker)) setActionUpdateRecovery(marker, 'unknown');
      return false;
    }
  }, [isCurrentActionUpdateRecovery, persistActionUpdatePhase, refreshActionUpdateDetail, setActionUpdateRecovery]);

  const refreshPendingActionUpdate = useCallback(async (actionId: number) => {
    const entry = actionUpdateRecoveries[actionId];
    if (!entry?.marker || !isCurrentActionUpdateRecovery(entry.marker)) return;
    await verifyPendingActionUpdate(entry.marker);
  }, [actionUpdateRecoveries, isCurrentActionUpdateRecovery, verifyPendingActionUpdate]);

  const retryPendingActionUpdate = useCallback(async (actionId: number) => {
    const entry = actionUpdateRecoveries[actionId];
    const marker = entry?.marker;
    if (!marker || entry.state !== 'not_found' || !isCurrentActionUpdateRecovery(marker) || !beginMutation()) return;
    setActionUpdateRecovery(marker, 'posting');
    try {
      const updated = await updateRetroAction(marker.actionId, marker.payload, marker.requestId);
      if (!isCurrentActionUpdateRecovery(marker)) return;
      applyDetail(updated);
      const processedMarker = persistActionUpdatePhase(marker, 'processed_detail');
      if (clearActionUpdateMarker(processedMarker, 'processed_refresh')) {
        if (marker.resetTableDraftOnSuccess !== false) {
          setActionDraftResetSignal({ actionId: marker.actionId, sequence: ++actionDraftResetSequenceRef.current });
        }
        addNotification({ title: '行动项已更新', message: '已使用原请求编号重试并刷新内容', type: 'success' });
      } else {
        await refreshActionUpdateDetail(processedMarker, 'processed');
      }
    } catch (error) {
      if (!isCurrentActionUpdateRecovery(marker)) return;
      const status = Number((error as { status?: number } | null)?.status || 0);
      const errorCode = String((error as { code?: string } | null)?.code || '');
      if (status === 0 || status === 408 || status >= 500) {
        await verifyPendingActionUpdate(marker);
      } else if (status === 409 && errorCode === 'ACTION_CHANGED') {
        const conflictMarker = persistActionUpdatePhase(marker, 'conflict_detail');
        await refreshActionUpdateDetail(conflictMarker, 'conflict');
      } else {
        const rejectedMarker = persistActionUpdatePhase(marker, 'rejected_detail');
        await refreshActionUpdateDetail(rejectedMarker, 'rejected');
      }
    } finally {
      endMutation();
    }
  }, [actionUpdateRecoveries, addNotification, applyDetail, clearActionUpdateMarker, isCurrentActionUpdateRecovery, persistActionUpdatePhase, refreshActionUpdateDetail, setActionUpdateRecovery, verifyPendingActionUpdate]);

  useEffect(() => {
    if (!Number.isInteger(currentActorId) || currentActorId <= 0) {
      actionUpdateRecoveryScopeRef.current = '';
      setActionUpdateRecoveries({});
      return;
    }
    if (!detail || detail.retrospective.id !== retroId) return;
    const scope = `${currentActorId}:${retroId}`;
    if (actionUpdateRecoveryScopeRef.current === scope) return;
    actionUpdateRecoveryScopeRef.current = scope;
    const restored: Record<number, RetroActionUpdateRecoveryEntry> = {};
    try {
      for (const action of detail.actions) {
        const raw = window.sessionStorage.getItem(retroActionUpdateStorageKey(currentActorId, action.id));
        if (!raw) continue;
        const marker = parsePendingRetroActionUpdate(raw, currentActorId, action.id, retroId);
        if (!marker) {
          restored[action.id] = { marker: null, state: 'storage_error' };
          continue;
        }
        const state: RetroActionUpdateRecoveryState = marker.phase === 'status'
          ? 'needs_check'
          : marker.phase === 'processed_detail'
            ? 'processed_refresh'
            : marker.phase === 'rejected_detail'
              ? 'rejected_refresh'
              : 'conflict_refresh';
        restored[action.id] = { marker, state };
      }
    } catch {
      for (const action of detail.actions) restored[action.id] = { marker: null, state: 'storage_error' };
    }
    setActionUpdateRecoveries(restored);
  }, [currentActorId, detail, retroId]);

  useEffect(() => {
    for (const entry of Object.values(actionUpdateRecoveries)) {
      if (entry.marker && (entry.state === 'needs_check' || entry.state === 'processed_refresh'
        || entry.state === 'conflict_refresh' || entry.state === 'rejected_refresh')) {
        const token = actionUpdateRecoveryToken(entry.marker);
        if (actionUpdateAutoRecoveryTokensRef.current.has(token)) continue;
        actionUpdateAutoRecoveryTokensRef.current.add(token);
        void verifyPendingActionUpdate(entry.marker);
      }
    }
  }, [actionUpdateRecoveries, verifyPendingActionUpdate]);

  const clearActionCreateMarker = useCallback((marker: PendingRetroActionCreate) => {
    try {
      window.sessionStorage.removeItem(retroActionCreateStorageKey(marker.actorId, marker.retroId));
    } catch {
      setActionCreateRecoveryState('storage_error');
      return false;
    }
    setPendingActionCreate(null);
    setActionCreateRecoveryState(null);
    return true;
  }, []);

  const isCurrentActionCreateRecovery = useCallback((marker: PendingRetroActionCreate) => (
    currentRetroIdRef.current === marker.retroId
    && Number(useAuthStore.getState().user?.id || 0) === marker.actorId
  ), []);

  const verifyPendingActionCreate = useCallback(async (marker: PendingRetroActionCreate) => {
    if (!isCurrentActionCreateRecovery(marker)) return false;
    setActionCreateRecoveryState('checking');
    try {
      const result = await getRetroActionCreateRequestStatus(marker.retroId, marker.requestId);
      if (!isCurrentActionCreateRecovery(marker)) return false;
      if (result.state === 'not_found') {
        setActionCreateRecoveryState('not_found');
        return false;
      }
      if (result.state === 'deleted') {
        setActionCreateRecoveryState('deleted');
        return false;
      }
      setActionCreateRecoveryState('created');
      try {
        const refreshed = await getRetrospectiveDetail(marker.retroId);
        if (!isCurrentActionCreateRecovery(marker)) return false;
        applyDetail(refreshed);
        if (clearActionCreateMarker(marker)) {
          addNotification({ title: '行动项已确认创建', message: '已只读核实并刷新行动项列表', type: 'success' });
          return true;
        }
      } catch {
        // Keep the request marker and write lock; the user can retry this GET-only refresh.
      }
      setActionCreateRecoveryState('created');
      return false;
    } catch (error) {
      const status = Number((error as { status?: number } | null)?.status || 0);
      setActionCreateRecoveryState(status === 401 || status === 403 ? 'forbidden' : 'unknown');
      return false;
    }
  }, [addNotification, applyDetail, clearActionCreateMarker, isCurrentActionCreateRecovery]);

  const refreshConfirmedActionCreate = async (marker: PendingRetroActionCreate) => {
    if (!isCurrentActionCreateRecovery(marker)) return;
    try {
      const refreshed = await getRetrospectiveDetail(marker.retroId);
      if (!isCurrentActionCreateRecovery(marker)) return;
      applyDetail(refreshed);
      if (clearActionCreateMarker(marker)) {
        addNotification({ title: '行动项已确认创建', message: '已只读刷新行动项列表', type: 'success' });
      }
    } catch {
      setActionCreateRecoveryState('created');
      addNotification({ title: '行动项已创建', message: '列表刷新失败；仍保留恢复标记，可再次只读刷新。', type: 'warning' });
    }
  };

  useEffect(() => {
    setPendingActionCreate(null);
    setActionCreateRecoveryState(null);
    if (!Number.isInteger(currentActorId) || currentActorId <= 0 || !Number.isInteger(retroId) || retroId <= 0) return;
    try {
      const raw = window.sessionStorage.getItem(retroActionCreateStorageKey(currentActorId, retroId));
      if (!raw) return;
      const marker = parsePendingRetroActionCreate(raw, currentActorId, retroId);
      if (!marker) {
        setActionCreateRecoveryState('storage_error');
        return;
      }
      setPendingActionCreate(marker);
      setActionCreateRecoveryState('needs_check');
    } catch {
      setActionCreateRecoveryState('storage_error');
    }
  }, [currentActorId, retroId]);

  useEffect(() => {
    if (!pendingActionCreate || actionCreateRecoveryState !== 'needs_check'
      || detail?.retrospective.id !== pendingActionCreate.retroId) return;
    void verifyPendingActionCreate(pendingActionCreate);
  }, [actionCreateRecoveryState, detail?.retrospective.id, pendingActionCreate, verifyPendingActionCreate]);

  const handleGenerateSnapshot = async () => {
    if (!detail) return;
    if (detail.snapshots.length > 0) {
      const confirmed = window.confirm('刷新快照会替换当前复盘的旧快照，是否继续？');
      if (!confirmed) return;
    }
    if (!beginMutation()) return;
    try {
      applyDetail(await generateRetroSnapshot(detail.retrospective.id, { mode: 'replace' }));
      addNotification({ title: '指标快照已更新', message: '已读取 XMT 系统内部数据', type: 'success' });
    } catch (error) {
      addNotification({ title: '生成快照失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      endMutation();
    }
  };

  const handleSaveSummary = async () => {
    if (!detail || !beginMutation()) return;
    const existingRecovery = summaryUpdateRecoveryRef.current;
    if (existingRecovery && existingRecovery.state !== 'conflict_reedit' && existingRecovery.state !== 'superseded_reedit') {
      endMutation();
      return;
    }
    if (!Number.isInteger(currentActorId) || currentActorId <= 0) {
      endMutation();
      addNotification({ title: '无法更新复盘结论', message: '当前登录状态无法确认，请重新登录后再试。', type: 'error' });
      return;
    }
    let requestId = '';
    try {
      requestId = window.crypto.randomUUID();
    } catch {
      endMutation();
      addNotification({ title: '无法安全保存', message: '当前浏览器无法生成请求编号，复盘结论未提交。', type: 'error' });
      return;
    }
    const payload: PendingRetroSummaryUpdate['payload'] = {
      title: detail.retrospective.title,
      summaryMd: summary,
      version: detail.retrospective.version,
    };
    const marker: PendingRetroSummaryUpdate = {
      actorId: currentActorId,
      retroId: detail.retrospective.id,
      requestId,
      payload,
      phase: 'status',
    };
    try {
      window.sessionStorage.setItem(retroSummaryUpdateStorageKey(currentActorId, marker.retroId), JSON.stringify(marker));
    } catch {
      endMutation();
      addNotification({ title: '无法安全保存', message: '浏览器无法保存本次恢复记录，复盘结论未提交。', type: 'error' });
      return;
    }
    setSummaryUpdateRecovery({ marker, state: 'posting' });
    setSaving(true);
    try {
      const updated = await updateRetrospective(marker.retroId, marker.payload, marker.requestId);
      if (!isCurrentSummaryUpdateRecovery(marker)) return;
      applyDetail(updated, marker.payload.summaryMd);
      setSummaryActionError(null);
      const processedMarker = persistSummaryUpdatePhase(marker, 'processed_detail');
      if (clearSummaryUpdateMarker(processedMarker)) {
        addNotification({ title: '复盘结论已保存', message: '服务端已确认保存', type: 'success' });
      } else {
        await refreshSummaryUpdateDetail(processedMarker, 'processed');
      }
    } catch (error) {
      if (!isCurrentSummaryUpdateRecovery(marker)) return;
      const status = Number((error as { status?: number } | null)?.status || 0);
      const errorCode = String((error as { code?: string } | null)?.code || '');
      if (status === 0 || status === 408 || status >= 500) {
        setSummaryUpdateRecoveryStateForMarker(marker, 'checking');
        addNotification({ title: '复盘结论结果待核实', message: `${toFriendlyRetroError(error)} 不会自动重发保存请求。`, type: 'warning' });
        await verifyPendingSummaryUpdate(marker);
      } else if (status === 409 && errorCode === 'VERSION_CONFLICT') {
        const conflictMarker = persistSummaryUpdatePhase(marker, 'conflict_detail');
        await refreshSummaryUpdateDetail(conflictMarker, 'conflict');
      } else {
        const rejectedMarker = persistSummaryUpdatePhase(marker, 'rejected_detail');
        await refreshSummaryUpdateDetail(rejectedMarker, 'rejected');
      }
    } finally {
      setSaving(false);
      endMutation();
    }
  };

  const handlePublish = async () => {
    if (!detail) return;
    if (summary !== (detail.retrospective.summaryMd || '')) {
      setSummaryActionError('还有尚未保存的复盘结论，请先点击“保存结论”，再发布复盘。');
      return;
    }
    const confirmed = window.confirm('发布后基础信息和指标快照将只读，是否继续？');
    if (!confirmed) return;
    if (!beginMutation()) return;
    try {
      applyDetail(await publishRetrospective(detail.retrospective.id));
      addNotification({ title: '复盘已发布', message: '可进入归档前观察和行动项跟进', type: 'success' });
    } catch (error) {
      addNotification({ title: '发布复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      endMutation();
    }
  };

  const handleArchive = async () => {
    if (!detail) return;
    if (summary !== (detail.retrospective.summaryMd || '')) {
      setSummaryActionError(detail.retrospective.status === 'draft' && detail.permissions.canEdit
        ? '还有尚未保存的复盘结论，请先点击“保存结论”，再归档复盘。'
        : '还有尚未保存的复盘结论，当前复盘已只读。请先复制保留本页文字，再确认使用已保存结论后归档。');
      return;
    }
    const confirmed = window.confirm('归档后复盘进入只读，不再允许新增行动项，是否继续？');
    if (!confirmed) return;
    if (!beginMutation()) return;
    try {
      applyDetail(await archiveRetrospective(detail.retrospective.id));
      addNotification({ title: '复盘已归档', message: '详情已刷新为只读状态', type: 'success' });
    } catch (error) {
      addNotification({ title: '归档复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      endMutation();
    }
  };

  const handleCreateAction = async (payload: CreateRetroActionPayload) => {
    if (!detail || pendingActionCreate || actionCreateRecoveryState === 'storage_error' || !beginMutation()) return false;
    const actorId = currentActorId;
    if (!Number.isInteger(actorId) || actorId <= 0) {
      endMutation();
      addNotification({ title: '无法创建行动项', message: '当前登录状态无法确认，请重新登录后再试。', type: 'error' });
      return false;
    }
    let requestId = '';
    try {
      requestId = window.crypto.randomUUID();
    } catch {
      endMutation();
      addNotification({ title: '无法安全提交', message: '当前浏览器无法生成请求编号，未提交行动项。', type: 'error' });
      return false;
    }
    const marker: PendingRetroActionCreate = {
      actorId,
      retroId: detail.retrospective.id,
      requestId,
      payload: {
        title: payload.title,
        descriptionMd: payload.descriptionMd || '',
        ownerId: payload.ownerId ?? null,
        dueDate: payload.dueDate ?? null,
      },
    };
    try {
      window.sessionStorage.setItem(retroActionCreateStorageKey(actorId, marker.retroId), JSON.stringify(marker));
    } catch {
      endMutation();
      setActionCreateRecoveryState('storage_error');
      addNotification({ title: '无法安全提交', message: '浏览器无法保存本次恢复标记，行动项未提交。', type: 'error' });
      return false;
    }
    setPendingActionCreate(marker);
    setActionCreateRecoveryState('posting');
    try {
      applyDetail(await createRetroAction(marker.retroId, marker.payload, marker.requestId));
      if (!isCurrentActionCreateRecovery(marker)) return false;
      clearActionCreateMarker(marker);
      addNotification({ title: '行动项已创建', message: '行动项列表已刷新', type: 'success' });
      return true;
    } catch (error) {
      const recovered = await verifyPendingActionCreate(marker);
      if (!isCurrentActionCreateRecovery(marker)) return false;
      if (!recovered) {
        addNotification({
          title: '创建结果待核实',
          message: `${toFriendlyRetroError(error)} 表单已锁定；请先核实结果，只有确认“未创建”后才能重试。`,
          type: 'warning',
        });
      }
      return recovered;
    } finally {
      endMutation();
    }
  };

  const handleVerifyPendingActionCreate = async () => {
    if (!pendingActionCreate || actionCreateRecoveryState === 'checking' || actionCreateRecoveryState === 'posting') return;
    await verifyPendingActionCreate(pendingActionCreate);
  };

  const handleRetryPendingActionCreate = async () => {
    const marker = pendingActionCreate;
    if (!marker || !isCurrentActionCreateRecovery(marker) || actionCreateRecoveryState !== 'not_found' || !beginMutation()) return;
    setActionCreateRecoveryState('posting');
    try {
      applyDetail(await createRetroAction(marker.retroId, marker.payload, marker.requestId));
      if (!isCurrentActionCreateRecovery(marker)) return;
      if (clearActionCreateMarker(marker)) setActionCreateDraftResetSequence((sequence) => sequence + 1);
      addNotification({ title: '行动项已创建', message: '已使用原请求编号重试并刷新列表', type: 'success' });
    } catch (error) {
      addNotification({
        title: '重试结果待核实',
        message: `${toFriendlyRetroError(error)} 表单继续锁定，请再次只读核实。`,
        type: 'warning',
      });
      await verifyPendingActionCreate(marker);
    } finally {
      endMutation();
    }
  };

  const handleRefreshConfirmedActionCreate = async () => {
    if (!pendingActionCreate || actionCreateRecoveryState !== 'created') return;
    await refreshConfirmedActionCreate(pendingActionCreate);
  };

  const handleUpdateAction = async (actionId: number, payload: UpdateRetroActionPayload, source: 'table' | 'drawer' = 'table') => {
    const existingRecovery = actionUpdateRecoveries[actionId];
    if (!detail || (existingRecovery && existingRecovery.state !== 'conflict_reedit') || !beginMutation()) return false;
    const actorId = currentActorId;
    if (!Number.isInteger(actorId) || actorId <= 0) {
      endMutation();
      addNotification({ title: '无法更新行动项', message: '当前登录状态无法确认，请重新登录后再试。', type: 'error' });
      return false;
    }
    let requestId = '';
    try {
      requestId = window.crypto.randomUUID();
    } catch {
      endMutation();
      addNotification({ title: '无法安全提交', message: '当前浏览器无法生成请求编号，未提交行动项。', type: 'error' });
      return false;
    }
    let originalPayload: UpdateRetroActionPayload;
    try {
      originalPayload = JSON.parse(JSON.stringify(payload)) as UpdateRetroActionPayload;
    } catch {
      endMutation();
      addNotification({ title: '无法安全提交', message: '无法保存本次更新内容，行动项未提交。', type: 'error' });
      return false;
    }
    const marker: PendingRetroActionUpdate = {
      actorId,
      actionId,
      retroId: detail.retrospective.id,
      requestId,
      payload: originalPayload,
      phase: 'status',
      resetTableDraftOnSuccess: source === 'table' || existingRecovery?.state === 'conflict_reedit',
    };
    try {
      window.sessionStorage.setItem(retroActionUpdateStorageKey(actorId, actionId), JSON.stringify(marker));
    } catch {
      endMutation();
      addNotification({ title: '无法安全提交', message: '浏览器无法保存本次恢复记录，行动项未提交。', type: 'error' });
      return false;
    }
    setActionUpdateRecovery(marker, 'posting');
    try {
      const updated = await updateRetroAction(actionId, marker.payload, marker.requestId);
      if (!isCurrentActionUpdateRecovery(marker)) return false;
      applyDetail(updated);
      const processedMarker = persistActionUpdatePhase(marker, 'processed_detail');
      if (clearActionUpdateMarker(processedMarker, 'processed_refresh')) {
        if (marker.resetTableDraftOnSuccess !== false) {
          setActionDraftResetSignal({ actionId, sequence: ++actionDraftResetSequenceRef.current });
        }
        addNotification({ title: '行动项已更新', message: '状态和结果已刷新', type: 'success' });
        return true;
      }
      return refreshActionUpdateDetail(processedMarker, 'processed');
    } catch (error) {
      if (!isCurrentActionUpdateRecovery(marker)) return false;
      const status = Number((error as { status?: number } | null)?.status || 0);
      const errorCode = String((error as { code?: string } | null)?.code || '');
      if (status === 0 || status === 408 || status >= 500) {
        setActionUpdateRecovery(marker, 'checking');
        addNotification({
          title: '更新结果待核实',
          message: `${toFriendlyRetroError(error)} 当前行动项已锁定；不会重发更新请求。`,
          type: 'warning',
        });
        return verifyPendingActionUpdate(marker);
      }
      if (status === 409 && errorCode === 'ACTION_CHANGED') {
        const conflictMarker = persistActionUpdatePhase(marker, 'conflict_detail');
        return refreshActionUpdateDetail(conflictMarker, 'conflict');
      }
      const rejectedMarker = persistActionUpdatePhase(marker, 'rejected_detail');
      return refreshActionUpdateDetail(rejectedMarker, 'rejected');
    } finally {
      endMutation();
    }
  };

  const handleExport = async (type: 'markdown' | 'html') => {
    if (!detail) return;
    setExporting(true);
    try {
      const result = await exportRetrospective(detail.retrospective.id, type);
      if (type === 'html') {
        const blob = new Blob([result.content], { type: result.contentType });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        downloadTextFile(result.filename, result.content, result.contentType);
      }
      addNotification({ title: '复盘导出已生成', message: type === 'html' ? '已打开 HTML 打印页' : '已下载 Markdown 文件', type: 'success' });
    } catch (error) {
      addNotification({ title: '导出复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  if (loading || (detail && detail.retrospective.id !== retroId)) {
    return (
      <PageShell>
        <GlassPanel className="flex h-72 items-center justify-center p-8 text-studio-text-secondary">
          正在加载复盘详情...
        </GlassPanel>
      </PageShell>
    );
  }

  if (!detail) {
    return (
      <PageShell>
        <GlassPanel className="p-8 text-center">
          {detailError ? (
            <div role="alert" className="space-y-3">
              <p className="text-studio-text-primary">复盘详情暂不可用：{detailError}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <ActionButton variant="primary" onClick={() => void loadDetail()}>重新加载详情</ActionButton>
                <ActionButton onClick={() => navigate('/retrospectives')}>返回复盘列表</ActionButton>
              </div>
            </div>
          ) : (
            <>
              <p className="text-studio-text-primary">复盘不存在或当前账号不可访问。</p>
              <ActionButton className="mt-4" onClick={() => navigate('/retrospectives')}>返回列表</ActionButton>
            </>
          )}
        </GlassPanel>
      </PageShell>
    );
  }

  const { retrospective, template, snapshots, actions, permissions } = detail;
  const categoryLabel = retrospective.templateCategory ? retroCategoryLabels[retrospective.templateCategory] : '-';
  const canEditSummary = retrospective.status === 'draft' && permissions.canEdit;
  const actionCreateLocked = Boolean(pendingActionCreate) || actionCreateRecoveryState === 'storage_error';
  const actionUpdateRecoveryStates = Object.fromEntries(
    Object.entries(actionUpdateRecoveries).map(([actionId, entry]) => [Number(actionId), entry.state]),
  );
  const actionUpdateConflictDrafts = Object.fromEntries(
    Object.entries(actionUpdateRecoveries)
      .filter(([, entry]) => entry.marker && (entry.state === 'conflict_refresh' || entry.state === 'conflict_reedit'))
      .map(([actionId, entry]) => [Number(actionId), entry.marker?.payload]),
  );
  const selectedActionUpdateRecoveryState = selectedAction
    ? actionUpdateRecoveries[selectedAction.id]?.state
    : undefined;
  const selectedActionUpdateConflictDraft = selectedAction
    ? actionUpdateConflictDrafts[selectedAction.id]
    : undefined;

  return (
    <PageShell>
      <PageHeader
        title={retrospective.title}
        description="结论 + 快照 + 行动项的复盘闭环页。"
        actions={
          <div className="flex flex-wrap gap-3">
            <ActionButton variant="ghost" onClick={handleReturnToList} disabled={working}><ArrowLeft className="h-4 w-4" />返回列表</ActionButton>
            <ActionButton onClick={() => handleExport('markdown')} disabled={exporting}>
              <Download className="h-4 w-4" />
              导出 Markdown
            </ActionButton>
            <ActionButton onClick={() => handleExport('html')} disabled={exporting}>
              <FileText className="h-4 w-4" />
              打印页
            </ActionButton>
            <ActionButton onClick={loadDetail} disabled={loading || working}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </ActionButton>
          </div>
        }
      />

      {detailError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p>详情刷新失败，仍显示最近一次成功读取的内容：{detailError}</p>
          <ActionButton variant="ghost" onClick={() => void loadDetail()} disabled={loading || working}>重新加载详情</ActionButton>
        </div>
      ) : null}

      <RetroAssigneeDirectoryNotice
        status={assigneeDirectory.status}
        error={assigneeDirectory.error}
        onRetry={assigneeDirectory.retry}
      />

      {actionCreateRecoveryState ? (
        <div role="alert" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary">
          <p className="font-semibold">{actionCreateRecoveryState === 'not_found'
            ? '尚未查到这次行动项创建记录'
            : actionCreateRecoveryState === 'created'
              ? '已确认创建，详情尚未刷新'
              : actionCreateRecoveryState === 'deleted'
                ? '这次请求对应的行动项已不存在'
                : actionCreateRecoveryState === 'forbidden'
                  ? '当前登录状态或权限无法核实创建结果'
                  : actionCreateRecoveryState === 'storage_error'
                    ? '本地恢复标记无法读取或清除'
                    : actionCreateRecoveryState === 'checking' || actionCreateRecoveryState === 'needs_check'
                      ? '正在只读核实行动项创建结果'
                      : actionCreateRecoveryState === 'posting'
                        ? '正在提交行动项'
                        : '行动项创建结果暂时无法核实'}</p>
          <p className="mt-1 text-studio-text-secondary">{actionCreateRecoveryState === 'not_found'
            ? '表单保持锁定。确认原内容无误后，才可使用同一请求编号显式重试。'
            : actionCreateRecoveryState === 'created'
              ? '不会重复提交；可重试只读刷新行动项列表。'
              : actionCreateRecoveryState === 'deleted'
                ? '不会自动重建已删除的行动项，请先核对复盘记录。'
                : actionCreateRecoveryState === 'forbidden'
                  ? '恢复标记与原内容仍保留；权限恢复后再重新核实。'
                  : actionCreateRecoveryState === 'storage_error'
                    ? '为避免重复创建，当前不允许新增行动项。请勿清除浏览器会话数据后重试。'
                    : '在确认结果前，行动项新增入口保持锁定，不会自动重发写入请求。'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingActionCreate && actionCreateRecoveryState === 'not_found' ? (
              <ActionButton variant="primary" onClick={() => void handleRetryPendingActionCreate()} disabled={working}>
                使用原请求编号重试
              </ActionButton>
            ) : null}
            {pendingActionCreate && ['unknown', 'forbidden'].includes(actionCreateRecoveryState) ? (
              <ActionButton onClick={() => void handleVerifyPendingActionCreate()} disabled={working}>
                重新核实结果
              </ActionButton>
            ) : null}
            {pendingActionCreate && actionCreateRecoveryState === 'created' ? (
              <ActionButton onClick={() => void handleRefreshConfirmedActionCreate()} disabled={working}>
                只读刷新行动项
              </ActionButton>
            ) : null}
          </div>
        </div>
      ) : null}

      <GlassPanel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <RetroStatusPill status={retrospective.status} />
              <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-secondary">{categoryLabel}</span>
              <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-secondary">
                {retroScopeLabels[retrospective.scopeType]}
              </span>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-studio-text-secondary">
              <CalendarDays className="h-4 w-4" />
              {formatDate(retrospective.periodStart)} 至 {formatDate(retrospective.periodEnd)}
            </p>
          </div>
          <div className="grid gap-3 text-sm text-studio-text-secondary sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="block text-xs">负责人</span><strong className="text-studio-text-primary">{retrospective.ownerName || '-'}</strong></div>
            <div><span className="block text-xs">创建人</span><strong className="text-studio-text-primary">{retrospective.creatorName || '-'}</strong></div>
            <div><span className="block text-xs">更新时间</span><strong className="text-studio-text-primary">{formatDateTime(retrospective.updatedAt)}</strong></div>
            <div><span className="block text-xs">版本</span><strong className="text-studio-text-primary">v{retrospective.version}</strong></div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
            <p className="text-xs text-studio-text-secondary">模板</p>
            <p className="mt-1 font-semibold text-studio-text-primary">{template?.name || retrospective.templateName || '-'}</p>
          </div>
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
            <p className="text-xs text-studio-text-secondary">快照指标</p>
            <p className="mt-1 font-semibold text-studio-text-primary">{snapshots.length} 项</p>
          </div>
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
            <p className="text-xs text-studio-text-secondary">行动项</p>
            <p className="mt-1 flex items-center gap-2 font-semibold text-studio-text-primary">
              <UserRound className="h-4 w-4" />
              {actions.length} 项
            </p>
          </div>
        </div>
      </GlassPanel>

      <div data-testid="retrospective-detail-columns" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <RetroMetricSnapshotPanel
            snapshots={snapshots}
            status={retrospective.status}
            canGenerate={permissions.canEdit}
            loading={working}
            onGenerate={handleGenerateSnapshot}
          />
          {summaryActionError && summaryIsDirty ? (
            <div role="alert" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary">
              {summaryActionError}
            </div>
          ) : null}
          {summaryIsDirty && canEditSummary ? (
            <p role="status" className="text-sm text-studio-text-secondary">复盘结论有未保存的修改，完成后请点击“保存结论”。</p>
          ) : null}
          {summaryIsDirty && !canEditSummary ? (
            <div role="alert" className="space-y-3 rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary">
              <p>当前复盘已只读，仍保留本页未保存的结论修改。请先复制保留下面的文字，再核对已保存结论。</p>
              <ActionButton onClick={() => {
                if (!window.confirm('确认使用已保存结论？这会替换本页尚未保存的结论修改，请先复制保留需要的文字。')) return;
                setSummary(retrospective.summaryMd || '');
                setSummaryActionError(null);
              }}>使用已保存结论</ActionButton>
            </div>
          ) : null}
          {summaryUpdateRecovery?.state ? (
            <RetroSummaryUpdateRecoveryNotice
              state={summaryUpdateRecovery.state}
              submitted={summaryUpdateRecovery.marker?.payload}
              current={detail ? {
                title: detail.retrospective.title,
                summaryMd: detail.retrospective.summaryMd || '',
              } : undefined}
              onVerify={summaryUpdateRecovery.marker ? () => void verifyPendingSummaryUpdate(summaryUpdateRecovery.marker!) : undefined}
              onRetry={() => void retryPendingSummaryUpdate()}
              onRetryStorage={summaryUpdateRecovery.marker ? retrySummaryUpdateRecoveryStorage : undefined}
              onRefresh={refreshPendingSummaryUpdate}
            />
          ) : null}
          <RetroSummaryEditor
            value={summary}
            status={retrospective.status}
            canEdit={permissions.canEdit}
            saving={saving}
            locked={working || Boolean(summaryUpdateRecovery?.state
              && summaryUpdateRecovery.state !== 'conflict_reedit'
              && summaryUpdateRecovery.state !== 'superseded_reedit')}
            onChange={handleSummaryChange}
            onSave={handleSaveSummary}
          />
          <RetroDailyRiskPanel
            risks={dailyRisks}
            users={assigneeDirectory.users}
            status={retrospective.status}
            canManageActions={permissions.canManageActions}
            loading={loadingRisks}
            locked={working || actionCreateLocked}
            resetCreateDraftSignal={actionCreateDraftResetSequence}
            error={dailyRisksError}
            onRefresh={() => void loadDailyRisks()}
            onCreateAction={handleCreateAction}
          />
          <RetroActionTable
            actions={actions}
            users={assigneeDirectory.users}
            status={retrospective.status}
            currentUserId={currentUser?.id}
            canManageActions={permissions.canManageActions}
            loading={working || actionCreateLocked}
            onCreate={handleCreateAction}
            onUpdate={handleUpdateAction}
            resetCreateDraftSignal={actionCreateDraftResetSequence}
            onOpenDetail={setSelectedAction}
            actionUpdateRecoveryStates={actionUpdateRecoveryStates}
            actionUpdateConflictDrafts={actionUpdateConflictDrafts}
            restoreActionDraftSignal={actionDraftRestoreSignal}
            onVerifyActionUpdate={(actionId) => { void refreshPendingActionUpdate(actionId); }}
            onRetryActionUpdate={(actionId) => { void retryPendingActionUpdate(actionId); }}
            onRefreshActionUpdate={(actionId) => { void refreshPendingActionUpdate(actionId); }}
            resetActionDraftSignal={actionDraftResetSignal}
          />
        </div>
        <div className="min-w-0 space-y-5">
          <RetroPublishPanel
            retrospective={retrospective}
            permissions={permissions}
            loading={working}
            onPublish={handlePublish}
            onArchive={handleArchive}
          />
          <GlassPanel className="p-5">
            <h2 className="text-lg font-bold text-studio-text-primary">权限状态</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-studio-text-secondary">可编辑</dt><dd className="text-studio-text-primary">{permissions.canEdit ? '是' : '否'}</dd></div>
              <div className="flex justify-between"><dt className="text-studio-text-secondary">可发布</dt><dd className="text-studio-text-primary">{permissions.canPublish ? '是' : '否'}</dd></div>
              <div className="flex justify-between"><dt className="text-studio-text-secondary">可归档</dt><dd className="text-studio-text-primary">{permissions.canArchive ? '是' : '否'}</dd></div>
              <div className="flex justify-between"><dt className="text-studio-text-secondary">行动项管理</dt><dd className="text-studio-text-primary">{permissions.canManageActions ? '是' : '否'}</dd></div>
            </dl>
          </GlassPanel>
        </div>
      </div>

      <RetroActionDetailDrawer
        action={selectedAction}
        users={assigneeDirectory.users}
        currentUserId={currentUser?.id}
        canManageActions={permissions.canManageActions}
        loading={working}
        updateRecoveryState={selectedActionUpdateRecoveryState}
        conflictDraft={selectedActionUpdateConflictDraft}
        restoreActionDraftSignal={actionDraftRestoreSignal}
        onClose={() => setSelectedAction(null)}
        onUpdate={handleUpdateAction}
        onVerifyActionUpdate={(actionId) => { void refreshPendingActionUpdate(actionId); }}
        onRetryActionUpdate={(actionId) => { void retryPendingActionUpdate(actionId); }}
        onRefreshActionUpdate={(actionId) => { void refreshPendingActionUpdate(actionId); }}
      />
    </PageShell>
  );
}

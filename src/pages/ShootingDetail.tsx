import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import PageHeading from '@/components/common/PageHeading';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { getShootingById, getShootingScriptVersions, syncShootingPublishedArchive, updateShooting } from '../api';
import type { WorkflowDocumentVersion } from '../api';
import { Shooting as ShootingType } from '../types';
import { ChevronLeft, Calendar, MapPin, Camera, User as UserIcon, CheckCircle, Clock, FileText, ArrowRight, PanelRight, PanelRightClose } from 'lucide-react';
import ContentEditor from '../components/ContentEditor';
import EditorLeaveFailureDialog from '../components/editor/EditorLeaveFailureDialog';
import { getCollaborationRoomId } from '../collaboration/core/events';
import { createShootingEditorAdapter } from '../editor/adapters/shootingEditorAdapter';
import { getTimelineView, recordTimelineEvent } from '../editor/timeline/unifiedContentTimeline';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import { editorStateLabel, useEditorEventState } from '../editor/state/editorStateManager';
import type { ContentEditorRuntimeHandle } from '../editor/contracts/contentEditorAdapter';
import { useEditorLeaveGuard } from '../hooks/useEditorLeaveGuard';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '../hooks/useRouteNavigationGuard';
import { celebrateMilestone } from '../utils/confetti';
import { useCompactEditorToolbar } from '../hooks/useCompactEditorToolbar';
import { getWorkflowStatusLabel } from '../platform/workflow-status-labels';
import { workflowScriptSourceLabel, workflowScriptSourceReference, workflowScriptSourceTimestamp } from '../utils/workflow-script-source';
import { productionSourceSnapshotHref } from '../lib/productionSourceSnapshot';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import { usePermission } from '../hooks/usePermission';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import LoadingState from '../components/common/LoadingState';

interface ShootingDetailData extends ShootingType {
  production: {
    id: number;
    version: string;
    content: string;
    content_markdown: string;
    status: string;
    created_at?: string;
    version_timestamp?: string;
    operator_name: string;
  } | null;
  script_content?: string | null;
  published_archive_script_sync_pending?: boolean | null;
  can_sync_published_archive?: boolean;
}

type PendingShootingStatusVerification = {
  id: number;
  userId: number;
  requestId: string;
  topicTitle: string;
  previousStatus: string;
  targetStatus: string;
  status: 'uncertain' | 'ready' | 'checking';
  readError: string | null;
};

type ShootingScriptVersionAction = 'minor' | 'major';

type PendingShootingScriptSaveVerification = {
  shootingId: number;
  userId: number;
  requestId: string;
  topicTitle: string;
  scriptContent: string;
  sourceProductionId: number | null;
  sourceVersion: string | null;
  originalScriptContent: string | null;
  originalSourceProductionId: number | null;
  originalSourceVersion: string | null;
  expectedContent: string;
  versionAction: ShootingScriptVersionAction;
  baselineMaxVersionId: number;
  status: 'uncertain' | 'checking';
  readError: string | null;
};

type RecoveryMarkerRead<T> =
  | { kind: 'missing' }
  | { kind: 'ready'; value: T }
  | { kind: 'blocked' };

class ShootingRecoveryMarkerError extends Error {
  constructor(message: string, readonly recoveryStateUnknown: boolean) {
    super(message);
    this.name = 'ShootingRecoveryMarkerError';
  }
}

function shootingRecoveryFingerprint(marker: object) {
  const serialized = JSON.stringify(marker) ?? '';
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function hasValidShootingRecoveryFingerprint(marker: object) {
  const record = marker as Record<string, unknown>;
  if (record.integrity === undefined) return true; // Accept recovery records written by earlier app versions.
  const { integrity, ...payload } = record;
  return integrity === shootingRecoveryFingerprint(payload);
}

function serializeShootingRecoveryMarker<T extends object>(marker: T) {
  return JSON.stringify({ ...marker, integrity: shootingRecoveryFingerprint(marker) });
}

function clearShootingRecoveryAttemptIfOwned(key: string, requestId: string) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return true;
    const marker = JSON.parse(raw) as { requestId?: unknown } | null;
    if (marker?.requestId !== requestId) return false;
    sessionStorage.removeItem(key);
    return sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

function shootingStatusVerificationKey(userId: number | undefined, shootingId: number | undefined) {
  return userId && shootingId ? `xmt:shooting-status-pending:v1:user:${userId}:shooting:${shootingId}` : null;
}

function loadPendingShootingStatusVerification(userId: number | undefined, shootingId: number | undefined): RecoveryMarkerRead<PendingShootingStatusVerification> {
  const key = shootingStatusVerificationKey(userId, shootingId);
  if (!key || typeof window === 'undefined') return { kind: 'missing' };
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return { kind: 'missing' };
    const value = JSON.parse(raw) as Partial<PendingShootingStatusVerification> | null;
    if (!value || typeof value !== 'object' || !hasValidShootingRecoveryFingerprint(value)
      || value.userId !== userId || Number(value.id) !== shootingId
      || typeof value.requestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)
      || typeof value.topicTitle !== 'string' || typeof value.previousStatus !== 'string'
      || typeof value.targetStatus !== 'string') return { kind: 'blocked' };
    return { kind: 'ready', value: {
      id: Number(value.id),
      userId: Number(value.userId),
      requestId: value.requestId,
      topicTitle: value.topicTitle,
      previousStatus: value.previousStatus,
      targetStatus: value.targetStatus,
      status: value.status === 'ready' ? 'ready' : 'uncertain',
      readError: null,
    } };
  } catch {
    return { kind: 'blocked' };
  }
}

function persistPendingShootingStatusVerification(pending: PendingShootingStatusVerification) {
  const key = shootingStatusVerificationKey(pending.userId, pending.id);
  if (!key || typeof window === 'undefined') throw new Error('当前账号与成片记录尚未确认，无法安全保存恢复状态');
  const marker = { ...pending, status: pending.status === 'ready' ? 'ready' : 'uncertain' };
  const serialized = serializeShootingRecoveryMarker(marker);
  try {
    sessionStorage.setItem(key, serialized);
    if (sessionStorage.getItem(key) !== serialized) throw new Error('read-back mismatch');
  } catch {
    const cleared = clearShootingRecoveryAttemptIfOwned(key, pending.requestId);
    throw new ShootingRecoveryMarkerError(
      `成片状态恢复信息未能${cleared ? '完整保存' : '完整保存或安全清理'}，本次未发送更新`,
      !cleared,
    );
  }
}

function removeStoredShootingStatusVerification(pending: PendingShootingStatusVerification) {
  const key = shootingStatusVerificationKey(pending.userId, pending.id);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { requestId?: unknown } | null;
    if (stored?.requestId === pending.requestId) sessionStorage.removeItem(key);
  } catch {
    // The server read-back is authoritative even when this tab cannot clear its recovery marker.
  }
}

function isDefinitiveShootingStatusRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![404, 408, 425, 429].includes(status);
}

function shootingScriptSaveVerificationKey(userId: number | undefined, shootingId: number | undefined) {
  return userId && Number.isInteger(shootingId) && Number(shootingId) > 0
    ? `xmt:shooting-script-save-pending:v1:user:${userId}:shooting:${shootingId}`
    : null;
}

function loadPendingShootingScriptSaveVerification(userId: number | undefined, shootingId: number | undefined): RecoveryMarkerRead<PendingShootingScriptSaveVerification> {
  const key = shootingScriptSaveVerificationKey(userId, shootingId);
  if (!key || typeof window === 'undefined') return { kind: 'missing' };
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return { kind: 'missing' };
    const value = JSON.parse(raw) as Partial<PendingShootingScriptSaveVerification> | null;
    const isNullableString = (candidate: unknown) => candidate === null || typeof candidate === 'string';
    const isNullableNumber = (candidate: unknown) => candidate === null || (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0);
    if (!value || typeof value !== 'object' || !hasValidShootingRecoveryFingerprint(value)
      || value.userId !== userId || value.shootingId !== shootingId
      || typeof value.requestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)
      || typeof value.topicTitle !== 'string' || typeof value.scriptContent !== 'string' || typeof value.expectedContent !== 'string'
      || !isNullableString(value.originalScriptContent) || !Number.isInteger(value.baselineMaxVersionId) || Number(value.baselineMaxVersionId) < 0
      || !['minor', 'major'].includes(value.versionAction ?? '')
      || !isNullableNumber(value.sourceProductionId) || !isNullableString(value.sourceVersion)
      || !isNullableNumber(value.originalSourceProductionId) || !isNullableString(value.originalSourceVersion)) return { kind: 'blocked' };
    return { kind: 'ready', value: { ...value, status: 'uncertain', readError: null } as PendingShootingScriptSaveVerification };
  } catch {
    return { kind: 'blocked' };
  }
}

function persistPendingShootingScriptSaveVerification(pending: PendingShootingScriptSaveVerification) {
  const key = shootingScriptSaveVerificationKey(pending.userId, pending.shootingId);
  if (!key || typeof window === 'undefined') throw new Error('无法保存剧本版本操作的异常恢复信息；本次没有发送版本请求。');
  const serialized = serializeShootingRecoveryMarker(pending);
  try {
    sessionStorage.setItem(key, serialized);
    if (sessionStorage.getItem(key) !== serialized) throw new Error('read-back mismatch');
  } catch {
    const cleared = clearShootingRecoveryAttemptIfOwned(key, pending.requestId);
    throw new ShootingRecoveryMarkerError(
      `剧本版本恢复信息未能${cleared ? '完整保存' : '完整保存或安全清理'}；本次没有发送版本请求。`,
      !cleared,
    );
  }
}

function removeStoredShootingScriptSaveVerification(pending: PendingShootingScriptSaveVerification) {
  const key = shootingScriptSaveVerificationKey(pending.userId, pending.shootingId);
  if (!key || typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as { requestId?: unknown } | null;
    if (stored?.requestId === pending.requestId) sessionStorage.removeItem(key);
  } catch {
    // Server read-back remains authoritative even if session cleanup is unavailable.
  }
}

function shootingScriptContentValue(value: unknown) {
  return sanitizeHtml(typeof value === 'string' ? value : '');
}

function nullableShootingScriptContentValue(value: unknown) {
  return value === null || value === undefined ? null : shootingScriptContentValue(value);
}

function shootingScriptSourceId(value: unknown) {
  const id = value == null || value === '' ? null : Number(value);
  return Number.isInteger(id) && Number(id) > 0 ? Number(id) : null;
}

function isDefinitiveShootingScriptSaveRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

const WORKFLOW_STEPS = [
  { key: 'topic', label: '选题提交', icon: FileText },
  { key: 'production', label: '创作审核', icon: FileText },
  { key: 'shooting', label: '成片制作', icon: Camera },
  { key: 'publishing', label: '发布管理', icon: ArrowRight },
];

export default function ShootingDetail() {
  const { id } = useParams();
  const currentShootingIdRef = useRef(id);
  currentShootingIdRef.current = id;
  const navigate = useNavigate();
  const appStore = useAppStore();
  const addNotification = useAppStore((state) => state.addNotification);
  const authUserId = useAuthStore((state) => state.user?.id);
  const styles = useThemeStyles();
  const compactEditorToolbar = useCompactEditorToolbar();
  const { hasPermission } = usePermission();

  const [shooting, setShooting] = useState<ShootingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const detailRequestSequenceRef = useRef(0);
  const scriptVersionRequestSequenceRef = useRef(0);
  const hasLocalScript = shooting?.script_content !== null && shooting?.script_content !== undefined;
  const sourceProductionId = shooting
    ? hasLocalScript ? shooting.script_source_production_id : shooting.production?.id
    : null;
  const sourceVersion = shooting
    ? hasLocalScript ? shooting.script_source_version : shooting.production?.version
    : null;
  const sourceProduction = shooting
    ? hasLocalScript ? shooting.script_source_production : shooting.production
    : null;
  const sourceSnapshotHref = productionSourceSnapshotHref(sourceProductionId, sourceVersion);
  const sourceProductionTimestamp = workflowScriptSourceTimestamp(sourceProduction);

  // 剧本编辑状态
  const [scriptContent, setScriptContent] = useState('');
  const [scriptVersions, setScriptVersions] = useState<WorkflowDocumentVersion[]>([]);
  const [scriptVersionsLoading, setScriptVersionsLoading] = useState(false);
  const [scriptVersionsLoadError, setScriptVersionsLoadError] = useState(false);
  const [savingScriptVersion, setSavingScriptVersion] = useState(false);
  const saveScriptVersionInFlightRef = useRef(false);
  const scriptSaveVerificationInFlightRef = useRef(false);
  const [initialScriptSaveRecovery] = useState(() => loadPendingShootingScriptSaveVerification(authUserId, Number(id)));
  const [pendingScriptSaveVerification, setPendingScriptSaveVerification] = useState<PendingShootingScriptSaveVerification | null>(
    () => initialScriptSaveRecovery.kind === 'ready' ? initialScriptSaveRecovery.value : null,
  );
  const [scriptSaveRecoveryReadBlocked, setScriptSaveRecoveryReadBlocked] = useState(initialScriptSaveRecovery.kind === 'blocked');
  const [scriptSaveVerificationLoading, setScriptSaveVerificationLoading] = useState(false);
  const initialPendingScriptSaveRef = useRef(pendingScriptSaveVerification);
  const restoredPendingScriptSaveStartedRef = useRef(false);
  const [statusChangePending, setStatusChangePending] = useState(false);
  const statusChangeInFlightRef = useRef(false);
  const [pendingStatusVerification, setPendingStatusVerification] = useState<PendingShootingStatusVerification | null>(null);
  const [statusRecoveryReadBlocked, setStatusRecoveryReadBlocked] = useState(false);
  const [statusVerificationLoading, setStatusVerificationLoading] = useState(false);
  const statusVerificationInFlightRef = useRef(false);
  const [archiveSyncPending, setArchiveSyncPending] = useState(false);
  const [archiveSyncRetrying, setArchiveSyncRetrying] = useState(false);
  const archiveSyncRetryInFlightRef = useRef(false);
  const archiveSyncSaveSequenceRef = useRef(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [leaveFailureDialogDismissed, setLeaveFailureDialogDismissed] = useState(false);
  const activeDocId = shooting ? getCollaborationRoomId('shooting', shooting.id) : undefined;
  const syncStatus = useEditorEventState(activeDocId);
  const runtimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
  const hasPendingScriptSaveForCurrentRecord = Boolean(
    pendingScriptSaveVerification
    && pendingScriptSaveVerification.userId === authUserId
    && pendingScriptSaveVerification.shootingId === Number(id),
  );
  const recoveryStorageReadBlocked = scriptSaveRecoveryReadBlocked || statusRecoveryReadBlocked;
  const loadScriptVersions = useCallback(async (recordId: number, detailRequestId?: number) => {
    const requestId = ++scriptVersionRequestSequenceRef.current;
    const isCurrent = () => requestId === scriptVersionRequestSequenceRef.current
      && Number(currentShootingIdRef.current) === recordId
      && (detailRequestId === undefined || detailRequestId === detailRequestSequenceRef.current);
    setScriptVersionsLoading(true);
    setScriptVersionsLoadError(false);
    try {
      const versions = await getShootingScriptVersions(recordId);
      if (!isCurrent()) return null;
      setScriptVersions(versions);
      return versions;
    } catch {
      if (isCurrent()) {
        setScriptVersionsLoadError(true);
        setScriptVersions([]);
      }
      return null;
    } finally {
      if (isCurrent()) setScriptVersionsLoading(false);
    }
  }, []);
  const verifyPendingShootingScriptSave = useCallback(async (pending: PendingShootingScriptSaveVerification): Promise<boolean> => {
    if (scriptSaveVerificationInFlightRef.current) return false;
    scriptSaveVerificationInFlightRef.current = true;
    setScriptSaveVerificationLoading(true);
    setPendingScriptSaveVerification({ ...pending, status: 'checking', readError: null });
    try {
      const [current, versions] = await Promise.all([
        getShootingById(pending.shootingId) as Promise<ShootingDetailData>,
        getShootingScriptVersions(pending.shootingId),
      ]);
      if (Number(currentShootingIdRef.current) !== pending.shootingId) return false;
      if (!current || Number(current.id) !== pending.shootingId) throw new Error('服务器返回的成片记录与本次保存不一致');

      const currentContent = nullableShootingScriptContentValue(current.script_content);
      const expectedContent = shootingScriptContentValue(pending.scriptContent);
      const originalContent = nullableShootingScriptContentValue(pending.originalScriptContent);
      const currentSourceId = shootingScriptSourceId(current.script_source_production_id);
      const currentSourceVersion = current.script_source_version ?? null;
      const matchesTarget = currentContent !== null && currentContent === expectedContent
        && currentSourceId === pending.sourceProductionId
        && currentSourceVersion === pending.sourceVersion;
      const matchesOriginal = currentContent === originalContent
        && currentSourceId === pending.originalSourceProductionId
        && currentSourceVersion === pending.originalSourceVersion;
      const matchingVersion = versions.some((version) => Number(version.id) > pending.baselineMaxVersionId
        && Number(version.is_baseline) !== 1
        && version.change_type === pending.versionAction
        && shootingScriptContentValue(version.content) === expectedContent
        && shootingScriptSourceId(version.source_production_id) === pending.sourceProductionId
        && (version.source_production_version ?? null) === pending.sourceVersion);
      const hasNewVersion = versions.some((version) => Number(version.id) > pending.baselineMaxVersionId && Number(version.is_baseline) !== 1);
      const applied = matchesTarget && matchingVersion;
      const unchanged = matchesOriginal && !hasNewVersion;

      removeStoredShootingScriptSaveVerification(pending);
      setPendingScriptSaveVerification(null);
      setShooting(current);
      setArchiveSyncPending(current.published_archive_script_sync_pending === true);
      setScriptVersions(versions);
      setScriptVersionsLoadError(false);
      if (applied) {
        setScriptContent(current.script_content ?? current.production?.content ?? current.production?.content_markdown ?? '');
        addNotification({
          title: '版本保存结果已核实',
          message: '服务器已确认本次剧本版本保存，没有重复提交。',
          type: 'success',
        });
      } else if (unchanged) {
        setScriptContent(pending.scriptContent);
        addNotification({
          title: '剧本版本尚未保存',
          message: '服务器仍是请求前内容，编辑草稿已恢复；核对后请由你明确点击小版本或大版本保存重试。',
          type: 'warning',
        });
      } else {
        setScriptContent(pending.scriptContent);
        addNotification({
          title: '剧本版本状态已变化',
          message: '已读取最新剧本和版本历史，并保留当前编辑草稿；请核对后再明确保存，不会自动重试。',
          type: 'warning',
        });
      }
      return applied;
    } catch (error) {
      if (Number(currentShootingIdRef.current) !== pending.shootingId) return false;
      const readError = getUserFacingErrorMessage(error, '');
      const uncertain = {
        ...pending,
        status: 'uncertain' as const,
        readError: `剧本版本保存结果尚未确认，详情或版本历史暂时无法读取${readError ? `（${readError}）` : ''}。请只读核实，不要重复保存。`,
      };
      try { persistPendingShootingScriptSaveVerification(uncertain); } catch { /* Keep the in-memory lock even if storage is unavailable. */ }
      setPendingScriptSaveVerification(uncertain);
      setScriptContent(pending.scriptContent);
      addNotification({
        title: '剧本版本结果待核实',
        message: '服务器详情或版本历史暂时无法读取；当前成片详情已锁定写入，请先只读核实。',
        type: 'warning',
      });
      return false;
    } finally {
      scriptSaveVerificationInFlightRef.current = false;
      setScriptSaveVerificationLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    const recovery = loadPendingShootingScriptSaveVerification(authUserId, Number(id));
    const pending = recovery.kind === 'ready' ? recovery.value : null;
    setPendingScriptSaveVerification(pending);
    setScriptSaveRecoveryReadBlocked(recovery.kind === 'blocked');
    initialPendingScriptSaveRef.current = pending;
    restoredPendingScriptSaveStartedRef.current = false;
  }, [authUserId, id]);

  useEffect(() => {
    const pending = initialPendingScriptSaveRef.current;
    if (restoredPendingScriptSaveStartedRef.current || !pending
      || pending.userId !== authUserId || pending.shootingId !== Number(id)) return;
    restoredPendingScriptSaveStartedRef.current = true;
    initialPendingScriptSaveRef.current = null;
    void verifyPendingShootingScriptSave(pending);
  }, [authUserId, id, verifyPendingShootingScriptSave]);

  const {
    requestLeave,
    retry: retryLeave,
    discardAndLeave,
    state: leaveGuardState,
    result: leaveGuardResult,
  } = useEditorLeaveGuard({ runtimeHandleRef });

  const handleRuntimeHandleChange = useCallback((handle: ContentEditorRuntimeHandle | null) => {
    runtimeHandleRef.current = handle;
  }, []);

  const pendingRouteStayRef = useRef<(() => void) | null>(null);
  const handleContinueEditing = useCallback(() => {
    pendingRouteStayRef.current?.();
    pendingRouteStayRef.current = null;
    setLeaveFailureDialogDismissed(true);
  }, []);

  const handleRetryLeave = useCallback(() => retryLeave(), [retryLeave]);

  const handleDiscardAndLeave = useCallback(() => discardAndLeave(), [discardAndLeave]);

  const handleRouteNavigationAttempt = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
    if (hasPendingScriptSaveForCurrentRecord) {
      appStore.addNotification({ title: '剧本版本结果待核实', message: '请先只读核实服务器详情和版本历史；核实完成前不能离开当前成片记录。', type: 'warning' });
      stay();
      return;
    }
    if (savingScriptVersion) {
      appStore.addNotification({ title: '剧本版本保存尚未完成', message: '版本保存完成前不能离开当前成片记录，请稍候。', type: 'warning' });
      stay();
      return;
    }
    let continued = false;
    const continueOnce = () => {
      if (continued) return;
      continued = true;
      pendingRouteStayRef.current = null;
      proceed();
    };
    pendingRouteStayRef.current = stay;
    setLeaveFailureDialogDismissed(false);
    void requestLeave({ reason: 'route_transition', continuation: continueOnce })
      .then((leaveResult) => {
        if (leaveResult.decision === 'proceeded') continueOnce();
        if (leaveResult.warning === 'collaboration_unconfirmed') {
          appStore.addNotification({
            title: '内容已保存',
            message: '协作交接尚未确认，已按安全保存结果继续导航。',
            type: 'warning',
          });
        }
      })
      .catch(stay);
  }, [appStore, hasPendingScriptSaveForCurrentRecord, requestLeave, savingScriptVersion]);
  useRouteNavigationGuard(Boolean(shooting || hasPendingScriptSaveForCurrentRecord || savingScriptVersion), handleRouteNavigationAttempt);

  useEffect(() => {
    if (!hasPendingScriptSaveForCurrentRecord && !savingScriptVersion) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasPendingScriptSaveForCurrentRecord, savingScriptVersion]);

  const applyShootingStatusReadback = useCallback((pending: PendingShootingStatusVerification, updated: ShootingDetailData) => {
    if (!updated || Number(updated.id) !== pending.id || typeof updated.status !== 'string') {
      throw new Error('服务器返回的成片记录与本次操作不一致');
    }
    const isCurrentPage = Number(currentShootingIdRef.current) === pending.id;
    if (isCurrentPage) setShooting(updated);

    if (updated.status === pending.targetStatus) {
      removeStoredShootingStatusVerification(pending);
      if (isCurrentPage) setPendingStatusVerification(null);
      addNotification({
        title: '服务器已确认状态更新',
        message: `${pending.topicTitle}已更新为${getWorkflowStatusLabel('shooting', pending.targetStatus)}；没有重复提交。`,
        type: 'success',
      });
      if (pending.targetStatus === 'completed') celebrateMilestone();
      return 'applied' as const;
    }

    if (updated.status === pending.previousStatus) {
      const ready = { ...pending, status: 'ready' as const, readError: null };
      try { persistPendingShootingStatusVerification(ready); } catch { /* The original uncertain marker remains safe for reload recovery. */ }
      if (isCurrentPage) setPendingStatusVerification(ready);
      addNotification({
        title: '状态尚未更新',
        message: '服务器仍是原状态。核实结果已显示在页面；如仍需更新，请在页面明确确认后重试。',
        type: 'warning',
      });
      return 'unchanged' as const;
    }

    removeStoredShootingStatusVerification(pending);
    if (isCurrentPage) setPendingStatusVerification(null);
    addNotification({
      title: '服务器状态已变化',
      message: `服务器当前状态为“${getWorkflowStatusLabel('shooting', updated.status)}”，与本次请求前后均不同；已采用服务器状态，请勿重复操作。`,
      type: 'warning',
    });
    return 'changed' as const;
  }, [addNotification]);

  const verifyPendingShootingStatus = useCallback(async (pending: PendingShootingStatusVerification) => {
    if (statusVerificationInFlightRef.current) return;
    statusVerificationInFlightRef.current = true;
    setStatusVerificationLoading(true);
    const checking = { ...pending, status: 'checking' as const, readError: null };
    setPendingStatusVerification(checking);
    try {
      const updated = await getShootingById(pending.id) as ShootingDetailData;
      applyShootingStatusReadback(pending, updated);
    } catch (error) {
      const uncertain = { ...pending, status: 'uncertain' as const, readError: getUserFacingErrorMessage(error, '状态暂时无法核实，请稍后重试。') };
      try { persistPendingShootingStatusVerification(uncertain); } catch { /* Keep the in-memory lock even if storage is unavailable. */ }
      if (Number(currentShootingIdRef.current) === pending.id) setPendingStatusVerification(uncertain);
      addNotification({
        title: '状态仍待核实',
        message: '只读查询暂不可用。页面已锁定相关写入；可以重新核实，期间不会自动重发状态更新。',
        type: 'warning',
      });
    } finally {
      statusVerificationInFlightRef.current = false;
      setStatusVerificationLoading(false);
    }
  }, [addNotification, applyShootingStatusReadback]);

  const navigateFromShooting = useCallback((to: string) => {
    navigate(to, { state: { mobileReturnTo: `/shooting/${id}` } });
  }, [id, navigate]);

  useEffect(() => {
    const requestId = ++detailRequestSequenceRef.current;
    scriptVersionRequestSequenceRef.current += 1;
    const fetchData = async () => {
      setLoading(true);
      setShooting(null);
      setScriptVersions([]);
      setScriptVersionsLoading(false);
      setScriptVersionsLoadError(false);
      try {
        const result = await getShootingById(parseInt(id!));
        if (requestId !== detailRequestSequenceRef.current || Number(currentShootingIdRef.current) !== Number(id)) return;
        setShooting(result);
        const statusRecovery = loadPendingShootingStatusVerification(authUserId, result.id);
        const pendingStatus = statusRecovery.kind === 'ready' ? statusRecovery.value : null;
        setStatusRecoveryReadBlocked(statusRecovery.kind === 'blocked');
        if (pendingStatus) {
          setPendingStatusVerification(pendingStatus);
          applyShootingStatusReadback(pendingStatus, result);
        } else {
          setPendingStatusVerification(null);
        }
        const scriptRecovery = loadPendingShootingScriptSaveVerification(authUserId, result.id);
        const pendingScriptSave = scriptRecovery.kind === 'ready' ? scriptRecovery.value : null;
        setScriptSaveRecoveryReadBlocked(scriptRecovery.kind === 'blocked');
        if (pendingScriptSave) {
          setPendingScriptSaveVerification(pendingScriptSave);
          setScriptContent(pendingScriptSave.scriptContent);
        } else {
          void loadScriptVersions(result.id, requestId);
        }
        setArchiveSyncPending(result.published_archive_script_sync_pending === true);
        setCurrentContentDocument(
          getCollaborationRoomId('shooting', result.id),
          result.topic_title || `成片 ${result.id}`,
        );

        // 初始化剧本内容：优先使用本地编辑版，其次使用创作管理审核通过的内容
        const content = result.script_content ?? result.production?.content ?? result.production?.content_markdown ?? '';
        if (!pendingScriptSave) setScriptContent(content);
      } catch (error) {
        if (requestId === detailRequestSequenceRef.current && Number(currentShootingIdRef.current) === Number(id)) {
          const statusRecovery = loadPendingShootingStatusVerification(authUserId, Number(id));
          const scriptRecovery = loadPendingShootingScriptSaveVerification(authUserId, Number(id));
          const pendingStatus = statusRecovery.kind === 'ready' ? statusRecovery.value : null;
          const pendingScriptSave = scriptRecovery.kind === 'ready' ? scriptRecovery.value : null;
          setStatusRecoveryReadBlocked(statusRecovery.kind === 'blocked');
          setScriptSaveRecoveryReadBlocked(scriptRecovery.kind === 'blocked');
          if (pendingStatus) {
            setPendingStatusVerification({ ...pendingStatus, status: 'uncertain', readError: getUserFacingErrorMessage(error, '详情暂时无法读取，请重新核实状态。') });
            addNotification({ title: '状态仍待核实', message: '详情读取失败；状态更新未重发。请通过页面中的只读操作重新核实。', type: 'warning' });
          } else if (pendingScriptSave) {
            setPendingScriptSaveVerification({ ...pendingScriptSave, status: 'uncertain', readError: getUserFacingErrorMessage(error, '详情暂时无法读取，请重新核实剧本保存结果。') });
          } else {
            addNotification({ title: '获取数据失败', message: getUserFacingErrorMessage(error, '暂时无法读取成片详情，请稍后重试。'), type: 'error' });
          }
        }
      } finally {
        if (requestId === detailRequestSequenceRef.current && Number(currentShootingIdRef.current) === Number(id)) setLoading(false);
      }
    };

    void fetchData();
    return () => {
      detailRequestSequenceRef.current += 1;
      scriptVersionRequestSequenceRef.current += 1;
    };
  }, [addNotification, applyShootingStatusReadback, authUserId, id, loadScriptVersions]);

  const shootingEditorAdapter = useMemo(() => {
    if (!shooting) return undefined;
    const room = getCollaborationRoomId('shooting', shooting.id);
    return createShootingEditorAdapter({
      documentId: room,
      collaborationRoom: room,
      initialContent: scriptContent,
      readonly: Boolean(recoveryStorageReadBlocked || pendingStatusVerification || hasPendingScriptSaveForCurrentRecord || savingScriptVersion),
      capabilities: {
        collaboration: true,
        manualSave: false,
        immersive: true,
        pageScroll: false,
      },
      persist: (content) => {
        if (recoveryStorageReadBlocked) return Promise.reject(new Error('成片恢复记录暂时无法读取，请重新核对后再保存剧本。'));
        if (pendingStatusVerification) return Promise.reject(new Error('成片状态仍待核实，确认服务器状态前不能保存剧本。'));
        if (hasPendingScriptSaveForCurrentRecord) return Promise.reject(new Error('剧本版本结果仍待核实，确认服务器状态前不能保存剧本。'));
        const saveSequence = ++archiveSyncSaveSequenceRef.current;
        const source = workflowScriptSourceReference(
          shooting.script_content,
          { id: shooting.script_source_production_id, version: shooting.script_source_version },
          shooting.production,
        );
        return updateShooting(shooting.id, { script_content: content, ...source }).then((result) => {
          if (saveSequence === archiveSyncSaveSequenceRef.current) {
            setArchiveSyncPending(result.archiveSync === 'pending');
          }
        });
      },
    });
  }, [hasPendingScriptSaveForCurrentRecord, pendingStatusVerification, recoveryStorageReadBlocked, savingScriptVersion, scriptContent, shooting]);

  const handleRetryPublishedArchiveSync = async () => {
    if (!shooting || recoveryStorageReadBlocked || pendingStatusVerification || hasPendingScriptSaveForCurrentRecord || archiveSyncRetryInFlightRef.current || syncStatus === 'saving') return;
    archiveSyncRetryInFlightRef.current = true;
    setArchiveSyncRetrying(true);
    try {
      const result = await syncShootingPublishedArchive(shooting.id);
      setArchiveSyncPending(false);
      appStore.addNotification({
        title: result.archiveSync === 'skipped' ? '归档无需更新' : '归档已同步',
        message: result.message,
        type: 'success',
      });
    } catch (error) {
      appStore.addNotification({ title: '归档仍待同步', message: getUserFacingErrorMessage(error, '发布归档暂时无法同步，请稍后重试。'), type: 'warning' });
    } finally {
      archiveSyncRetryInFlightRef.current = false;
      setArchiveSyncRetrying(false);
    }
  };

  const handleSaveScriptVersion = async (versionAction: 'minor' | 'major') => {
    if (!shooting || recoveryStorageReadBlocked || pendingStatusVerification || hasPendingScriptSaveForCurrentRecord || saveScriptVersionInFlightRef.current) return;
    const requestedShootingId = shooting.id;
    if (!authUserId || !Number.isInteger(authUserId)) {
      appStore.addNotification({ title: '版本未提交', message: '登录状态尚未确认；为保证异常恢复安全，本次没有发送版本请求。', type: 'warning' });
      return;
    }
    const requestedScriptContent = scriptContent;
    saveScriptVersionInFlightRef.current = true;
    setSavingScriptVersion(true);
    let requestStarted = false;
    let serverConfirmed = false;
    try {
      const flushResult = await runtimeHandleRef.current?.flush({ timeoutMs: 8000 });
      if (flushResult && flushResult.status !== 'synced') {
        throw new Error('当前修改尚未完成保存，请处理保存状态后重试。');
      }
      const [currentBeforeSave, baselineVersions] = await Promise.all([
        getShootingById(requestedShootingId) as Promise<ShootingDetailData>,
        getShootingScriptVersions(requestedShootingId),
      ]);
      if (Number(currentShootingIdRef.current) !== requestedShootingId) return;
      if (!currentBeforeSave || Number(currentBeforeSave.id) !== requestedShootingId) {
        throw new Error('成片记录与本次版本保存不一致；本次没有提交版本。');
      }
      const source = workflowScriptSourceReference(
        currentBeforeSave.script_content,
        { id: currentBeforeSave.script_source_production_id, version: currentBeforeSave.script_source_version },
        currentBeforeSave.production,
      );
      const expectedContent = currentBeforeSave.script_content ?? currentBeforeSave.production?.content ?? currentBeforeSave.production?.content_markdown ?? '';
      const pending: PendingShootingScriptSaveVerification = {
        shootingId: requestedShootingId,
        userId: authUserId,
        requestId: crypto.randomUUID(),
        topicTitle: currentBeforeSave.topic_title || `成片 ${requestedShootingId}`,
        scriptContent: requestedScriptContent,
        sourceProductionId: source.script_source_production_id ?? currentBeforeSave.script_source_production_id ?? null,
        sourceVersion: source.script_source_version ?? currentBeforeSave.script_source_version ?? null,
        originalScriptContent: currentBeforeSave.script_content ?? null,
        originalSourceProductionId: currentBeforeSave.script_source_production_id ?? null,
        originalSourceVersion: currentBeforeSave.script_source_version ?? null,
        expectedContent,
        versionAction,
        baselineMaxVersionId: baselineVersions.reduce((max, version) => Math.max(max, Number(version.id) || 0), 0),
        status: 'checking',
        readError: null,
      };
      try {
        persistPendingShootingScriptSaveVerification(pending);
      } catch (error) {
        if (error instanceof ShootingRecoveryMarkerError && error.recoveryStateUnknown) setScriptSaveRecoveryReadBlocked(true);
        throw error;
      }
      setPendingScriptSaveVerification(pending);
      requestStarted = true;

      try {
        const result = await updateShooting(requestedShootingId, {
          script_content: requestedScriptContent,
          expected_content: expectedContent,
          version_action: versionAction,
          ...source,
        });
        serverConfirmed = true;
        removeStoredShootingScriptSaveVerification(pending);
        setPendingScriptSaveVerification(null);
        if (Number(currentShootingIdRef.current) !== requestedShootingId) {
          appStore.addNotification({ title: '版本已保存', message: '服务端已确认版本；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
          return;
        }
        setArchiveSyncPending(result.archiveSync === 'pending');
        setShooting((current) => current?.id === requestedShootingId ? {
          ...current,
          script_content: requestedScriptContent,
          script_source_production_id: source.script_source_production_id ?? current.script_source_production_id,
          script_source_version: source.script_source_version ?? current.script_source_version,
        } : current);
        const refreshedVersions = await loadScriptVersions(requestedShootingId);
        if (Number(currentShootingIdRef.current) !== requestedShootingId) {
          appStore.addNotification({ title: '版本已保存', message: '服务端已确认版本；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
          return;
        }
        appStore.addNotification({
          title: refreshedVersions ? '版本已保存' : '版本已保存，历史列表未刷新',
          message: refreshedVersions
            ? `成片剧本已保存为${versionAction === 'major' ? '大版本' : '小版本'}`
            : '服务端已确认版本；请重新加载查看历史，不要重复创建。',
          type: refreshedVersions ? 'success' : 'warning',
        });
      } catch (error) {
        if (isDefinitiveShootingScriptSaveRejection(error)) {
          removeStoredShootingScriptSaveVerification(pending);
          setPendingScriptSaveVerification(null);
          appStore.addNotification({ title: '版本保存未生效', message: getUserFacingErrorMessage(error, '剧本版本保存失败，请检查后重试。'), type: 'error' });
          return;
        }
        appStore.addNotification({ title: '正在核实剧本版本', message: '版本请求结果不确定，先只读核实成片详情和版本历史；不会自动重复提交。', type: 'warning' });
        await verifyPendingShootingScriptSave(pending);
      }
    } catch (error) {
      if (serverConfirmed) {
        appStore.addNotification({ title: '版本已保存', message: '服务端已确认版本，但页面状态更新未完成；请重新加载确认，不要重复创建。', type: 'warning' });
      } else {
        appStore.addNotification({
          title: requestStarted ? '版本结果待核实' : '版本未提交',
          message: getUserFacingErrorMessage(error, requestStarted ? '剧本版本结果暂时无法确认，请先只读核实。' : '剧本版本未保存，请检查后重试。'),
          type: requestStarted ? 'warning' : 'error',
        });
      }
    } finally {
      saveScriptVersionInFlightRef.current = false;
      setSavingScriptVersion(false);
    }
  };
  const handleStatusChange = async (newStatus: string, explicitRetry = false) => {
    if (!shooting || statusChangeInFlightRef.current) return;
    if (recoveryStorageReadBlocked) {
      appStore.addNotification({ title: '未发送状态更新', message: '成片恢复记录暂时无法读取；请重新核对后再更新状态。', type: 'warning' });
      return;
    }
    if (hasPendingScriptSaveForCurrentRecord) {
      appStore.addNotification({ title: '剧本版本结果待核实', message: '请先核实上次剧本版本保存结果，再更新成片状态。', type: 'warning' });
      return;
    }
    const retryingKnownUnchanged = explicitRetry
      && pendingStatusVerification?.status === 'ready'
      && pendingStatusVerification.targetStatus === newStatus
      && pendingStatusVerification.previousStatus === shooting.status;
    if (pendingStatusVerification && !retryingKnownUnchanged) return;
    statusChangeInFlightRef.current = true;
    setStatusChangePending(true);
    const requestedShootingId = shooting.id;
    const pending: PendingShootingStatusVerification = retryingKnownUnchanged && pendingStatusVerification ? pendingStatusVerification : {
      id: requestedShootingId,
      userId: Number(authUserId),
      requestId: crypto.randomUUID(),
      topicTitle: shooting.topic_title || `成片 ${requestedShootingId}`,
      previousStatus: shooting.status,
      targetStatus: newStatus,
      status: 'uncertain' as const,
      readError: null,
    };

    try {
      try {
        const flushResult = await runtimeHandleRef.current?.flush({ timeoutMs: 8000 });
        if (flushResult && flushResult.status !== 'synced') {
          throw new Error('剧本尚未保存完成；本次没有发送状态更新，请先处理剧本保存状态。');
        }
      } catch (error) {
        appStore.addNotification({ title: '状态未更新', message: getUserFacingErrorMessage(error, '剧本尚未同步完成；本次没有发送状态更新，请稍后重试。'), type: 'warning' });
        return;
      }
      try {
        persistPendingShootingStatusVerification({ ...pending, status: 'uncertain', readError: null });
      } catch (error) {
        if (error instanceof ShootingRecoveryMarkerError && error.recoveryStateUnknown) setStatusRecoveryReadBlocked(true);
        appStore.addNotification({ title: '未发送状态更新', message: getUserFacingErrorMessage(error, '无法保存状态恢复信息；本次没有发送状态更新。'), type: 'error' });
        return;
      }
      setPendingStatusVerification({ ...pending, status: 'uncertain', readError: null });
      try {
        await updateShooting(requestedShootingId, {
          topic_id: shooting.topic_id,
          plan_date: shooting.plan_date || '',
          location: shooting.location || '',
          equipment: shooting.equipment || '',
          status: newStatus
        });
      } catch (error) {
        if (isDefinitiveShootingStatusRejection(error)) {
          removeStoredShootingStatusVerification(pending);
          setPendingStatusVerification(null);
          appStore.addNotification({ title: '状态更新未生效', message: getUserFacingErrorMessage(error, '成片状态更新失败，请检查后重试。'), type: 'error' });
          return;
        }
        appStore.addNotification({ title: '正在核实状态', message: '更新响应不确定，先只读查询服务器；不会自动重复提交。', type: 'warning' });
        await verifyPendingShootingStatus(pending);
        return;
      }

      removeStoredShootingStatusVerification(pending);
      setPendingStatusVerification(null);

      if (Number(currentShootingIdRef.current) !== requestedShootingId) {
        appStore.addNotification({ title: '状态已更新', message: '服务端已确认更新；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
        if (newStatus === 'completed') celebrateMilestone();
        return;
      }

      // The write is confirmed; keep the accepted status even if the follow-up read fails.
      setShooting((current) => current?.id === requestedShootingId ? { ...current, status: newStatus } : current);

      try {
        const updated = await getShootingById(requestedShootingId);
        if (Number(currentShootingIdRef.current) !== requestedShootingId) {
          appStore.addNotification({ title: '状态已更新', message: '服务端已确认更新；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
          if (newStatus === 'completed') celebrateMilestone();
          return;
        }
        setShooting((current) => current?.id === requestedShootingId ? updated : current);
      } catch {
        if (Number(currentShootingIdRef.current) !== requestedShootingId) {
          if (newStatus === 'completed') celebrateMilestone();
          return;
        }
        const message = '服务端已确认更新，但页面刷新失败。请重新加载确认，不要重复操作。';
        if (newStatus === 'completed') {
          appStore.addNotification({ title: '制作已完成', message: `${message} 成片已自动流转到发布管理。`, type: 'warning' });
          celebrateMilestone();
        } else {
          appStore.addNotification({ title: '状态已更新', message, type: 'warning' });
        }
        return;
      }

      if (newStatus === 'completed') {
        appStore.addNotification({ title: '制作完成', message: '成片制作已完成，自动流转到发布管理', type: 'success' });
        celebrateMilestone();
      } else {
        appStore.addNotification({ title: '状态更新', message: '状态已更新', type: 'success' });
      }
    } finally {
      statusChangeInFlightRef.current = false;
      setStatusChangePending(false);
    }
  };

  const statusColors: Record<string, string> = {
    planned: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    pending: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    in_progress: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
    completed: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
    cancelled: 'bg-studio-surface-soft text-studio-text-muted border-studio-border-soft',
  };

  const getStepStatus = (stepKey: string) => {
    if (!shooting) return 'pending';
    const stepOrder = ['topic', 'production', 'shooting', 'publishing'];
    const currentIdx = stepOrder.indexOf('shooting');
    const stepIdx = stepOrder.indexOf(stepKey);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'current';
    return 'pending';
  };

  const timelineView = useMemo(() => {
    if (!shooting) {
      return getTimelineView(getCollaborationRoomId('shooting', 0), { versionEvents: [] });
    }

    return getTimelineView(getCollaborationRoomId('shooting', shooting.id), {
      versionEvents: sourceProduction && sourceProductionTimestamp !== null ? [{
        id: `production-version-${sourceProduction.id}`,
        timestamp: sourceProductionTimestamp,
        version: sourceProduction.version,
        status: sourceProduction.status,
        operatorName: sourceProduction.operator_name,
        label: '关联创作版本',
      }] : [],
    });
  }, [shooting, sourceProduction, sourceProductionTimestamp]);

  useEffect(() => {
    if (!shooting) return;
    if (!sourceProduction) return;
    if (sourceProductionTimestamp === null) return;

    recordTimelineEvent({
      id: `shooting:${shooting.id}:production-version:${sourceProduction.id}`,
      docId: getCollaborationRoomId('shooting', shooting.id),
      timestamp: sourceProductionTimestamp,
      type: 'version',
      source: 'version',
      userId: sourceProduction.operator_name || undefined,
      payload: {
        version: sourceProduction.version,
        status: sourceProduction.status,
        label: '关联创作版本',
      },
    });
  }, [shooting, sourceProduction, sourceProductionTimestamp]);

  if (loading || (shooting && shooting.id !== Number(id))) {
    return <LoadingState type="inline" text="正在加载拍摄计划…" className="flex h-64 w-full justify-center" />;
  }

  if (!shooting) {
    if (recoveryStorageReadBlocked) {
      return (
        <section role="alert" data-testid="shooting-recovery-storage-blocked" className="flex flex-col items-start gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft p-5 text-sm text-studio-amber-contrast">
          <div>
            <p className="font-medium">成片恢复记录暂时无法读取</p>
            <p className="mt-1">为避免重复提交，剧本、版本和状态写入已暂停。请重新读取恢复记录后再继续。</p>
          </div>
          <ActionButton type="button" variant="secondary" onClick={() => window.location.reload()}>重新读取恢复记录</ActionButton>
        </section>
      );
    }
    if (hasPendingScriptSaveForCurrentRecord && pendingScriptSaveVerification) {
      return (
        <section role="alert" data-testid="shooting-script-save-pending-verification" className="flex flex-col items-start gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft p-5 text-sm text-studio-amber-contrast">
          <div>
            <p className="font-medium">剧本版本结果尚未确认</p>
            <p className="mt-1">当前详情无法读取。版本、剧本和状态写入保持锁定；只读核实成功前不会重发版本请求。</p>
            {pendingScriptSaveVerification.readError && <p className="mt-1 text-xs">读取失败：{pendingScriptSaveVerification.readError}</p>}
          </div>
          <ActionButton type="button" variant="secondary" disabled={scriptSaveVerificationLoading} onClick={() => void verifyPendingShootingScriptSave(pendingScriptSaveVerification)}>
            {scriptSaveVerificationLoading ? '正在核实…' : '只读核实保存状态'}
          </ActionButton>
        </section>
      );
    }
    if (pendingStatusVerification) {
      return (
        <section role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft p-5 text-sm text-studio-amber-contrast">
          <div>
            <p className="font-medium">成片状态尚未确认</p>
            <p className="mt-1">当前详情无法读取。状态、剧本和版本写入保持锁定；只读核实成功前不会重发状态更新。</p>
            {pendingStatusVerification.readError && <p className="mt-1 text-xs">读取失败：{pendingStatusVerification.readError}</p>}
          </div>
          <ActionButton type="button" variant="secondary" disabled={statusVerificationLoading} onClick={() => void verifyPendingShootingStatus(pendingStatusVerification)}>
            {statusVerificationLoading ? '正在核实…' : '只读核实状态'}
          </ActionButton>
        </section>
      );
    }
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-studio-text-muted">成片制作记录不存在</p>
      </div>
    );
  }

  const hasLocalScriptEdit = shooting.script_content !== null && shooting.script_content !== undefined;

  return (
    <div className="flex flex-col gap-3">
      {recoveryStorageReadBlocked && (
        <section role="alert" aria-live="polite" data-testid="shooting-recovery-storage-blocked" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">成片恢复记录暂时无法读取</p>
            <p className="mt-1">为避免重复提交，剧本编辑、版本保存、状态更新和归档同步已暂停。重新读取恢复记录后再继续。</p>
          </div>
          <ActionButton type="button" variant="secondary" onClick={() => window.location.reload()} className="min-h-10 shrink-0 px-3 py-2 text-xs">重新读取恢复记录</ActionButton>
        </section>
      )}
      <div className={`shrink-0 border-b ${styles.border} px-3 py-2`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <ActionButton
              type="button"
              variant="icon"
              aria-label="返回制作列表"
              onClick={() => navigateFromShooting('/shooting')}
              className="!h-10 !w-10 !min-h-10 !min-w-10 !p-2"
            >
              <ChevronLeft className={`w-5 h-5 ${styles.textSecondary}`} />
            </ActionButton>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <PageHeading className={`truncate text-base font-semibold ${styles.textPrimary}`}>
                {shooting.topic_title || '成片制作'}
              </PageHeading>
              <span className={`text-xs ${styles.textMuted}`}>
                {workflowScriptSourceLabel(
                  shooting.script_content,
                  shooting.script_source_version,
                  shooting.production?.version,
                )}
              </span>
              {sourceProduction && (
                <span className={`text-xs ${styles.textMuted}`}>
                  {sourceProductionTimestamp === null ? '创作版本时间未记录' : `创作版本时间 ${formatBeijingTime(sourceProductionTimestamp, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                </span>
              )}
              <span className={`text-xs ${styles.textMuted}`}>{formatBeijingDate(shooting.plan_date)}</span>
              <span className={`text-xs ${styles.textMuted}`}>{formatBeijingTime(shooting.updated_at || shooting.created_at)}</span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${statusColors[shooting.status] || 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft'}`}>
                {getWorkflowStatusLabel('shooting', shooting.status)}
              </span>
              {hasLocalScriptEdit && (
                <span className="rounded-full bg-studio-primary-soft px-2 py-0.5 text-xs text-studio-primary-contrast">本地编辑版</span>
              )}
              <span className={`text-xs ${syncStatus === 'conflicted' ? 'text-studio-coral-contrast' : syncStatus === 'saving' ? 'text-studio-primary-contrast' : styles.textMuted}`}>
                {editorStateLabel(syncStatus)}
              </span>
              <span className={`text-xs ${styles.textMuted}`}>时间轴 {timelineView.timeline.length} 个节点</span>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
            {hasPermission('workflow:shooting') && (
              <>
                <ActionButton type="button" disabled={recoveryStorageReadBlocked || Boolean(pendingStatusVerification) || hasPendingScriptSaveForCurrentRecord || savingScriptVersion || syncStatus === 'conflicted'} onClick={() => void handleSaveScriptVersion('minor')} className="min-h-10 px-3 py-2 text-xs">
                  {savingScriptVersion ? '保存中…' : '小版本保存'}
                </ActionButton>
                <ActionButton type="button" variant="primary" disabled={recoveryStorageReadBlocked || Boolean(pendingStatusVerification) || hasPendingScriptSaveForCurrentRecord || savingScriptVersion || syncStatus === 'conflicted'} onClick={() => void handleSaveScriptVersion('major')} className="min-h-10 px-3 py-2 text-xs">
                  大版本保存
                </ActionButton>
              </>
            )}
            <ActionButton
              type="button"
              variant="icon"
              onClick={() => setShowSidebar((prev) => !prev)}
              className="!h-10 !w-10 !min-h-10 !min-w-10 !p-2"
              data-testid="shooting-info-toggle"
              aria-expanded={showSidebar}
              aria-controls={showSidebar ? 'shooting-info-panel' : undefined}
              aria-label={showSidebar ? '收起信息栏' : '展开信息栏'}
              title={showSidebar ? '收起信息栏' : '展开信息栏'}
            >
              {showSidebar ? (
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              ) : (
                <PanelRight className={`w-4 h-4 ${styles.textSecondary}`} />
              )}
            </ActionButton>
            {shooting.status === 'planned' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                disabled={recoveryStorageReadBlocked || statusChangePending || Boolean(pendingStatusVerification) || hasPendingScriptSaveForCurrentRecord}
                aria-busy={statusChangePending}
                className="xmt-btn xmt-btn-primary min-h-10 px-3 py-1.5 text-xs"
              >
                <Camera className="w-4 h-4" />
                {statusChangePending ? '正在开始制作…' : '开始制作'}
              </button>
            )}

            {shooting.status === 'in_progress' && (
              <button
                onClick={() => handleStatusChange('completed')}
                disabled={recoveryStorageReadBlocked || statusChangePending || Boolean(pendingStatusVerification) || hasPendingScriptSaveForCurrentRecord}
                aria-busy={statusChangePending}
                className="xmt-btn min-h-10 border border-studio-success/30 bg-studio-success-soft px-3 py-1.5 text-xs font-medium text-studio-success-contrast hover:bg-studio-success/12"
              >
                <CheckCircle className="w-4 h-4" />
                {statusChangePending ? '正在完成制作…' : '完成制作'}
              </button>
            )}

            {shooting.status === 'cancelled' && (
              <button
                onClick={() => handleStatusChange('planned')}
                disabled={recoveryStorageReadBlocked || statusChangePending || Boolean(pendingStatusVerification) || hasPendingScriptSaveForCurrentRecord}
                aria-busy={statusChangePending}
                className="xmt-btn xmt-btn-primary min-h-10 px-3 py-1.5 text-xs"
              >
                <Clock className="w-4 h-4" />
                {statusChangePending ? '正在重新计划…' : '重新计划'}
              </button>
            )}

            {shooting.status === 'completed' && (
              <span className="flex items-center gap-1.5 rounded-lg border border-studio-border-soft bg-studio-success-soft px-3 py-1.5 text-xs text-studio-success-contrast">
                <CheckCircle className="w-4 h-4" />
                已完成
              </span>
            )}
          </div>
        </div>
      </div>

      {pendingStatusVerification && (
        <section
          role="alert"
          aria-live="polite"
          data-testid="shooting-status-pending-verification"
          className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">成片状态尚未确认</p>
            <p className="mt-1">
              {pendingStatusVerification.status === 'ready'
                ? `服务器仍为“${getWorkflowStatusLabel('shooting', pendingStatusVerification.previousStatus)}”。请明确确认后重试，系统不会自动重复提交。`
                : statusVerificationLoading
                  ? '正在只读核实服务器状态；此期间状态、剧本和版本写入均已锁定。'
                  : '上次更新结果不确定。请只读核实服务器状态；此期间状态、剧本和版本写入均已锁定。'}
            </p>
            {pendingStatusVerification.readError && <p className="mt-1 text-xs">上次核实未成功：{pendingStatusVerification.readError}</p>}
          </div>
          {pendingStatusVerification.status === 'ready' ? (
            <ActionButton
              type="button"
              variant="secondary"
              disabled={statusChangePending || statusVerificationLoading}
              onClick={() => void handleStatusChange(pendingStatusVerification.targetStatus, true)}
              className="min-h-10 shrink-0 px-3 py-2 text-xs"
            >
              {statusChangePending ? '正在重试…' : `确认后重试：${getWorkflowStatusLabel('shooting', pendingStatusVerification.targetStatus)}`}
            </ActionButton>
          ) : (
            <ActionButton
              type="button"
              variant="secondary"
              disabled={statusVerificationLoading || statusChangePending}
              onClick={() => void verifyPendingShootingStatus(pendingStatusVerification)}
              className="min-h-10 shrink-0 px-3 py-2 text-xs"
            >
              {statusVerificationLoading ? '正在核实…' : '只读核实状态'}
            </ActionButton>
          )}
        </section>
      )}

      {hasPendingScriptSaveForCurrentRecord && pendingScriptSaveVerification && (
        <section
          role="alert"
          aria-live="polite"
          data-testid="shooting-script-save-pending-verification"
          className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">剧本版本结果尚未确认</p>
            <p className="mt-1">
              {pendingScriptSaveVerification.readError || (scriptSaveVerificationLoading
                ? `正在只读核实「${pendingScriptSaveVerification.topicTitle}」的剧本详情和版本历史；核实期间已暂停编辑、版本保存、状态更新和离开。`
                : `「${pendingScriptSaveVerification.topicTitle}」的剧本版本保存结果尚未确认；请先只读核实，系统不会自动重发。`)}
            </p>
          </div>
          <ActionButton
            type="button"
            variant="secondary"
            disabled={savingScriptVersion || scriptSaveVerificationLoading}
            onClick={() => void verifyPendingShootingScriptSave(pendingScriptSaveVerification)}
            className="min-h-10 shrink-0 px-3 py-2 text-xs"
          >
            {scriptSaveVerificationLoading ? '正在核实…' : '只读核实保存状态'}
          </ActionButton>
        </section>
      )}

      {archiveSyncPending && (
        <section
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"
        >
          <p>成片剧本已保存，但发布归档尚未更新。重试只会同步已保存内容，不会改写剧本。</p>
          {shooting.can_sync_published_archive ? (
            <button
              type="button"
              onClick={() => void handleRetryPublishedArchiveSync()}
              disabled={recoveryStorageReadBlocked || Boolean(pendingStatusVerification) || hasPendingScriptSaveForCurrentRecord || archiveSyncRetrying || syncStatus === 'saving'}
              className="xmt-btn xmt-btn-warning min-h-10 shrink-0 px-3 py-2 text-xs disabled:opacity-50"
            >
              {archiveSyncRetrying ? '同步中...' : syncStatus === 'saving' ? '等待剧本保存...' : '重试同步归档'}
            </button>
          ) : (
            <p className="text-xs text-studio-text-muted">请联系有成片制作权限的成员重试归档同步。</p>
          )}
        </section>
      )}

      {hasPermission('production:view') && sourceSnapshotHref && sourceProductionId && sourceVersion ? (
        <GlassPanel
          role="region"
          aria-label="创作来源版本"
          className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between xl:hidden"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-studio-text-secondary">创作来源版本</p>
            <p className="mt-1 truncate text-sm text-studio-text-primary">当前成片剧本引用创作 {sourceVersion}</p>
          </div>
          <ActionButton
            type="button"
            variant="secondary"
            className="min-h-10 w-full shrink-0 px-3 py-2 text-xs sm:w-auto"
            onClick={() => navigateFromShooting(sourceSnapshotHref)}
          >
            查看创作版本 {sourceVersion}
          </ActionButton>
        </GlassPanel>
      ) : null}

      <div className="flex flex-col gap-3 xl:flex-row">
        {showSidebar && (
          <aside id="shooting-info-panel" aria-label="成片制作信息" className={`${styles.bgSecondary} border ${styles.border} w-full shrink-0 rounded-2xl xl:order-last xl:w-80`}>
            <div className={`flex items-center justify-between border-b ${styles.border} px-5 py-4`}>
              <div>
                <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>信息栏</p>
                <h2 className={`mt-1 text-sm font-semibold ${styles.textPrimary}`}>成片制作状态</h2>
              </div>
              <ActionButton
                type="button"
                variant="icon"
                aria-label="收起信息栏"
                title="收起信息栏"
                onClick={() => setShowSidebar(false)}
                className="!h-10 !w-10 !min-h-10 !min-w-10 !p-2"
              >
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              </ActionButton>
            </div>
            <div className="space-y-5 p-5">
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>版本入口</p>
                <div className={`rounded-xl ${styles.bgTertiary} p-3`}>
                  <p className={`text-sm font-medium ${styles.textPrimary}`}>
                    剧本来源版本：{shooting.script_source_version || shooting.production?.version || '-'}
                  </p>
                  <p className={`mt-1 text-xs ${styles.textMuted}`}>版本已纳入统一时间轴，当前页保留本地剧本编辑版。</p>
                </div>
                {hasPermission('production:view') && sourceSnapshotHref ? <button
                  onClick={() => navigateFromShooting(sourceSnapshotHref)}
                  className={`w-full rounded-lg px-3 py-2 text-xs ${styles.buttonSecondary}`}
                >查看创作版本 {sourceVersion}</button> : null}
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>选题关联</p>
                <p className={`text-sm ${styles.textPrimary}`}>{shooting.topic_title || '-'}</p>
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>制作信息</p>
                <p className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                  <Calendar className="h-4 w-4" />
                  {formatBeijingDate(shooting.plan_date)}
                </p>
                <p className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                  <MapPin className="h-4 w-4" />
                  {shooting.location || '-'}
                </p>
                <p className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                  <UserIcon className="h-4 w-4" />
                  {shooting.operator_name || '-'}
                </p>
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>审核流程状态</p>
                <div className="space-y-2">
                  {WORKFLOW_STEPS.map((step) => {
                    const stepStatus = getStepStatus(step.key);
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${styles.bgTertiary}`}>
                        <Icon className={`h-4 w-4 ${stepStatus === 'current' ? 'text-studio-primary' : styles.textMuted}`} />
                        <span className={stepStatus === 'current' ? 'text-studio-primary-contrast' : styles.textSecondary}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="space-y-2">
                <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>设备清单</p>
                <p className={`whitespace-pre-wrap text-sm ${styles.textSecondary}`}>{shooting.equipment || '-'}</p>
              </section>
            </div>
          </aside>
        )}

        <div className="min-w-0 flex-1">
          <ContentEditor
            ariaLabel="拍摄剧本正文"
            value={scriptContent}
            onChange={setScriptContent}
            mode="rich"
            collaborationKey={getCollaborationRoomId('shooting', shooting.id)}
            persistenceStatus={syncStatus}
            immersive
            toolbarVariant={compactEditorToolbar ? 'basic' : 'full'}
            className="h-full"
            adapter={shootingEditorAdapter}
            onRuntimeHandleChange={handleRuntimeHandleChange}
            placeholder="开始编写剧本..."
          />
        </div>
      </div>

      <GlassPanel role="region" aria-label="剧本版本历史" className="p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-studio-text-primary">剧本版本历史</h2>
          <p className="mt-1 text-xs text-studio-text-secondary">自动保存更新当前稿；仅小版本和大版本操作会留档。</p>
        </div>
        {scriptVersionsLoadError ? (
          <div role="alert" data-testid="shooting-script-history-error" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-studio-danger/30 bg-studio-danger/10 p-3 text-sm text-studio-coral-contrast">
            <span>版本历史读取失败，列表可能不完整；已保存的剧本仍可正常使用，请重试读取。</span>
            <ActionButton type="button" disabled={scriptVersionsLoading || savingScriptVersion || hasPendingScriptSaveForCurrentRecord} onClick={() => shooting && void loadScriptVersions(shooting.id)} className="px-3 py-2">重新加载版本历史</ActionButton>
          </div>
        ) : scriptVersionsLoading ? (
          <p role="status" className="mt-3 text-sm text-studio-text-secondary">正在加载版本历史…</p>
        ) : scriptVersions.length > 0 ? (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {scriptVersions.map((version) => (
              <li key={version.id} className="rounded-xl border border-studio-border-soft bg-studio-surface-soft/60 p-3">
                <p className="text-sm font-medium text-studio-text-primary">{version.is_baseline ? '历史原稿（时间未记录）' : `${version.version} · ${version.change_type === 'major' ? '大版本' : '小版本'}`}</p>
                <p className="mt-1 text-xs text-studio-text-secondary">{version.is_baseline ? '旧内容未记录操作人和时间' : `${version.operator_name || '系统记录'} · ${version.created_at || '时间未记录'}`}</p>
                {hasPermission('production:view') && productionSourceSnapshotHref(version.source_production_id, version.source_production_version) ? (
                  <button
                    type="button"
                    onClick={() => navigateFromShooting(productionSourceSnapshotHref(version.source_production_id, version.source_production_version)!)}
                    className="mt-2 inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-studio-cyan-contrast hover:bg-studio-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring"
                  >
                    来源创作稿：{version.source_production_version} · 查看
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-studio-text-secondary">该版本的创作来源未记录</p>
                )}
                <details className="mt-2">
                  <summary className="min-h-10 cursor-pointer py-1 text-xs font-medium text-studio-primary-contrast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring">查看此版本正文</summary>
                  <div className="editor-content-preview tiptap mt-2 max-h-80 overflow-auto rounded-lg border border-studio-border-soft bg-studio-surface-soft p-4 text-sm leading-relaxed text-studio-text-primary" dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(version.content)) }} />
                </details>
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft/50 p-3 text-xs text-studio-text-secondary">暂无已保存版本</p>}
      </GlassPanel>

      <EditorLeaveFailureDialog
        open={leaveGuardState === 'waiting_confirmation' && !leaveFailureDialogDismissed}
        state={leaveGuardState}
        result={leaveGuardResult}
        onContinueEditing={handleContinueEditing}
        onRetry={handleRetryLeave}
        onDiscardAndLeave={handleDiscardAndLeave}
      />
    </div>
  );
}

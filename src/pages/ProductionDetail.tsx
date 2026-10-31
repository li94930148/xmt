import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeading from '@/components/common/PageHeading';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  Clock,
  FileText,
  GitBranch,
  PanelRight,
  PanelRightClose,
  Save,
  Trash2,
  Users,
  Wifi,
} from 'lucide-react';
import { useAppStore, useAuthStore } from '../store';
import { deleteProduction, getProductionById, getProductionByIdForRecovery, getProductionHistory, updateProduction } from '../api';
import type { Production as ProductionType, ProductionHistory, Topic } from '../types';
import { getTopic } from '../api';
import ContentEditor, { type EditorCommandHandle } from '../components/ContentEditor';
import { useWritingFocus } from '../components/layout/WritingFocusContext';
import { buildMissingOutlineSkeleton, extractOutlineHeadings } from '../components/editor/outlineSkeleton';
import EditorLeaveFailureDialog from '../components/editor/EditorLeaveFailureDialog';
import { BaseModal, ConfirmModal, ErrorState } from '../components/common';
import { ActionButton, EmptyState, GlassPanel, PageShell, StatusPill, StudioSkeletonCard } from '../components/studio';
import { getCollaborationRoomId, getProductionVersionRoomId } from '../collaboration/core/events';
import { createProductionEditorAdapter } from '../editor/adapters/productionEditorAdapter';
import { getTimelineView } from '../editor/timeline/unifiedContentTimeline';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingTime, formatUtcToBeijingTime } from '../lib/utils';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { parseStoredBjt } from '@shared/time';
import { productionHistoryTimestamp } from '../lib/productionHistoryTime';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '../platform/safe-draft';
import { setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import { editorStateLabel, useEditorEventState } from '../editor/state/editorStateManager';
import type { ContentEditorRuntimeHandle } from '../editor/contracts/contentEditorAdapter';
import { useEditorLeaveGuard } from '../hooks/useEditorLeaveGuard';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '../hooks/useRouteNavigationGuard';
import ProductionResourcesPanel from '../components/production/ProductionResourcesPanel';
import ProductionMaterialHistorySnapshot from '../components/production/ProductionMaterialHistorySnapshot';
import ProductionOriginPanel from '../components/production/ProductionOriginPanel';
import ProductionReviewPanel from '../components/production/ProductionReviewPanel';
import { productionStatusLabel } from '../components/production/productionStatusLabel';
import type { ResourceReference } from '../components/production/resourceReference';
import { buildResourceReferenceHtml } from '../components/production/resourceReference';
import { celebrateMilestone } from '../utils/confetti';
import { useSocket } from '../hooks/useSocket';
import { COLLABORATION_EVENTS, type VersionSupersededPayload } from '../collaboration/core/events';
import {
  clearProductionAutosaveRecovery,
  createProductionAutosaveRequestId,
  persistProductionAutosaveRecovery,
  readProductionAutosaveRecovery,
  writeAndVerifyProductionAutosaveDraft,
  type ProductionAutosaveRecovery,
} from './production/productionAutosaveRecovery';

const STATUS_TONE: Record<string, 'amber' | 'cyan' | 'success' | 'coral' | 'muted'> = {
  draft: 'amber',
  review: 'cyan',
  approved: 'success',
  rejected: 'coral',
};

const NEXT_STATUSES: Record<string, string> = {
  draft: 'review',
  review: 'approved',
  approved: 'approved',
  rejected: 'draft',
};

type HistoryVersion = ProductionHistory & {
  content_markdown?: string;
  content_json?: string;
};

type VersionEntry = {
  id: string;
  version: string;
  changeType: 'minor' | 'major' | 'current';
  content: string;
  contentMarkdown: string;
  status: string;
  operatorName?: string;
  createdAt: string;
  isCurrent: boolean;
  versionState?: 'historical' | 'superseded';
  materialDraftSnapshotHtml?: string | null;
};

type ProductionTransitionOperation = 'review-submit' | 'status-update' | 'version-save' | 'delete';

type ProductionTransitionRecovery = {
  version: 1;
  userId: number;
  productionId: number;
  operation: ProductionTransitionOperation;
  previousStatus: string;
  targetStatus: string;
  contentFingerprint: string;
  previousVersion?: string;
  versionAction?: 'minor' | 'major';
  phase: 'uncertain' | 'ready' | 'checking';
};

function productionTransitionRecoveryKey(id?: string, userId?: number) {
  return id && Number.isSafeInteger(userId) && Number(userId) > 0
    ? `xmt:production-transition-recovery:v1:user:${userId}:production:${id}`
    : null;
}

function readProductionTransitionRecovery(id?: string, userId?: number): ProductionTransitionRecovery | null {
  const key = productionTransitionRecoveryKey(id, userId);
  if (!key || typeof window === 'undefined') return null;
  try {
    let raw = window.sessionStorage.getItem(key);
    let legacyKey: string | null = null;
    if (!raw && id) {
      legacyKey = `xmt:production-transition-recovery:${id}`;
      raw = window.sessionStorage.getItem(legacyKey);
    }
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ProductionTransitionRecovery>;
    const validOperation = value.operation === 'review-submit'
      ? value.previousStatus === 'draft' && value.targetStatus === 'review'
      : value.operation === 'status-update'
        ? typeof value.previousStatus === 'string'
          && NEXT_STATUSES[value.previousStatus] === value.targetStatus
          && value.previousStatus !== value.targetStatus
        : value.operation === 'version-save'
          ? typeof value.previousVersion === 'string'
            && ['minor', 'major'].includes(String(value.versionAction))
            && value.previousStatus === value.targetStatus
          : value.operation === 'delete'
            && typeof value.previousVersion === 'string'
            && typeof value.previousStatus === 'string'
            && value.targetStatus === 'deleted';
    if (value.version !== 1 || !Number.isSafeInteger(value.userId) || !Number.isSafeInteger(value.productionId)
      || Number(value.userId) < 1 || Number(value.productionId) < 1 || Number(value.userId) !== userId
      || Number(value.productionId) !== Number.parseInt(id || '', 10) || !validOperation
      || typeof value.previousStatus !== 'string' || typeof value.targetStatus !== 'string'
      || typeof value.contentFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentFingerprint)) {
      return null;
    }
    const recovery: ProductionTransitionRecovery = {
      version: 1,
      userId: Number(value.userId),
      productionId: Number(value.productionId),
      operation: value.operation as ProductionTransitionOperation,
      previousStatus: value.previousStatus,
      targetStatus: value.targetStatus,
      contentFingerprint: value.contentFingerprint,
      previousVersion: value.previousVersion,
      versionAction: value.versionAction === 'minor' || value.versionAction === 'major' ? value.versionAction : undefined,
      phase: value.phase === 'ready' ? 'ready' : 'uncertain',
    };
    if (legacyKey && raw) {
      try {
        const serialized = JSON.stringify({ ...recovery, phase: recovery.phase === 'ready' ? 'ready' : 'uncertain' });
        window.sessionStorage.setItem(key, serialized);
        if (window.sessionStorage.getItem(key) === serialized) window.sessionStorage.removeItem(legacyKey);
      } catch {
        // Keep the legacy marker available for a later read; the in-memory lock remains active.
      }
    }
    return recovery;
  } catch {
    return null;
  }
}

function writeProductionTransitionRecovery(id: string | undefined, userId: number | undefined, recovery: ProductionTransitionRecovery | null) {
  const key = productionTransitionRecoveryKey(id, userId);
  if (!key || typeof window === 'undefined') throw new Error('无法安全保存本次状态核实标记，请刷新后重试。');
  try {
    if (!recovery) {
      window.sessionStorage.removeItem(key);
      if (id) {
        const legacyKey = `xmt:production-transition-recovery:${id}`;
        const legacy = JSON.parse(window.sessionStorage.getItem(legacyKey) || 'null') as Partial<ProductionTransitionRecovery> | null;
        if (legacy?.userId === userId && legacy?.productionId === Number.parseInt(id, 10)) window.sessionStorage.removeItem(legacyKey);
      }
      return;
    }
    if (recovery.userId !== userId || recovery.productionId !== Number.parseInt(id || '', 10)) {
      throw new Error('恢复标记账号或记录不匹配。');
    }
    const serialized = JSON.stringify({ ...recovery, phase: recovery.phase === 'ready' ? 'ready' : 'uncertain' });
    window.sessionStorage.setItem(key, serialized);
    if (window.sessionStorage.getItem(key) !== serialized) {
      throw new Error('恢复标记未能完整保存；本次状态操作未发送。');
    }
  } catch {
    throw new Error('浏览器暂时无法保存本次状态核实标记，操作未发送；请检查浏览器存储空间后重试。');
  }
}

async function fingerprintProductionContent(content: string) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('当前浏览器不支持安全的正文核实，状态操作未发送。');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isAmbiguousProductionTransitionError(error: unknown) {
  const status = (error as Error & { status?: number } | null)?.status;
  return typeof status !== 'number' || status === 0 || [404, 408, 425, 429].includes(status) || status >= 500;
}

function normalizeVersionContent(contentMarkdown?: string, content?: string) {
  return contentMarkdown || content || '<p class="text-studio-text-muted">暂无内容</p>';
}

function parseVersionParts(version: string) {
  const match = String(version || 'v1.0').match(/^v?(\d+)\.(\d+)$/);

  if (!match) {
    return { major: 1, minor: 0 };
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
  };
}

function versionChangeLabel(changeType?: string) {
  if (changeType === 'major') return '另开新版';
  if (changeType === 'minor') return '小修保存';
  return '当前生效';
}

function versionSyncLabel(entry: VersionEntry, needsSwitch: boolean) {
  if (needsSwitch && entry.isCurrent) return '需切换';
  if (entry.isCurrent) return '当前生效';
  if (entry.versionState === 'superseded') return '已替代';
  return '历史版本';
}

function syncTone(syncStatus: string): 'cyan' | 'success' | 'coral' | 'muted' {
  if (syncStatus === 'saving') return 'cyan';
  if (syncStatus === 'saved') return 'success';
  if (syncStatus === 'conflicted' || syncStatus === 'error') return 'coral';
  return 'muted';
}

export default function ProductionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedVersion = searchParams.get('version')?.trim() || '';
  const requestedAction = searchParams.get('action');
  const addNotification = useAppStore((state) => state.addNotification);
  const theme = useAppStore((state) => state.theme);
  const authUser = useAuthStore((state) => state.user);
  const productionDraftKey = id && authUser?.id ? userSafeDraftKey(authUser.id, `production:${id}`) : null;
  const autosaveRecoveryIdentity = `${authUser?.id ?? 'signed-out'}:${id ?? ''}`;
  const isDark = theme === 'dark';
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const socket = useSocket();
  const { focused: writingFocused, setFocused: setWritingFocused } = useWritingFocus();
  const authUserIdRef = useRef(authUser?.id);
  authUserIdRef.current = authUser?.id;

  const [production, setProduction] = useState<ProductionType | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [history, setHistory] = useState<HistoryVersion[]>([]);
  const [linkedHistoryVersion, setLinkedHistoryVersion] = useState<HistoryVersion | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoadError, setDetailLoadError] = useState('');
  const [recoveryReadInFlight, setRecoveryReadInFlight] = useState(false);
  const [confirmedVersionRefreshPending, setConfirmedVersionRefreshPending] = useState(false);
  const [confirmedReviewRefreshPending, setConfirmedReviewRefreshPending] = useState(false);
  const [confirmedStatusRefreshPending, setConfirmedStatusRefreshPending] = useState(false);
  const [confirmedDeleteRefreshPending, setConfirmedDeleteRefreshPending] = useState(false);
  const [pendingStatusTransition, setPendingStatusTransition] = useState<ProductionTransitionRecovery | null>(() => readProductionTransitionRecovery(id, authUser?.id));
  const [statusTransitionReadError, setStatusTransitionReadError] = useState('');
  const [productionAutosaveRecovery, setProductionAutosaveRecovery] = useState<ProductionAutosaveRecovery | null>(null);
  const [productionAutosaveRecoveryReadError, setProductionAutosaveRecoveryReadError] = useState('');
  const [productionAutosaveRecoveryBlocked, setProductionAutosaveRecoveryBlocked] = useState(false);
  const [productionAutosaveRecoveryHydratedFor, setProductionAutosaveRecoveryHydratedFor] = useState('');
  const [productionAutosaveDraftBlocked, setProductionAutosaveDraftBlocked] = useState(false);
  const [productionAutosaveRetrying, setProductionAutosaveRetrying] = useState(false);
  const [productionAutosaveConflictDraft, setProductionAutosaveConflictDraft] = useState<{ content: string; serverVersion: string } | null>(null);
  const detailRequestRef = useRef(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [outlineEditorReady, setOutlineEditorReady] = useState(false);
  const [reviewEditorHandle, setReviewEditorHandle] = useState<EditorCommandHandle | null>(null);
  const [editData, setEditData] = useState({
    content: '',
    status: 'draft',
  });
  const latestEditContentRef = useRef('');
  const pendingStatusTransitionRef = useRef(pendingStatusTransition);
  const productionAutosaveRecoveryRef = useRef<ProductionAutosaveRecovery | null>(productionAutosaveRecovery);
  const productionAutosaveRecoveryCheckRef = useRef('');
  const productionAutosaveRecoveryVerifyLockRef = useRef(false);
  const productionAutosaveExplicitRetryRef = useRef('');
  const statusTransitionVerificationLockRef = useRef(false);
  const productionMutationLockRef = useRef(false);
  const confirmedRefreshLockRef = useRef(false);
  const [reviewSubmitPhase, setReviewSubmitPhase] = useState<'preparing' | 'submitting' | null>(null);
  const [reviewSuggestionAccepting, setReviewSuggestionAccepting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [versionSaving, setVersionSaving] = useState<'minor' | 'major' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const hasConfirmedRefreshPending = confirmedVersionRefreshPending || confirmedReviewRefreshPending || confirmedStatusRefreshPending || confirmedDeleteRefreshPending;
  const productionAutosaveRecoveryHydrated = productionAutosaveRecoveryHydratedFor === autosaveRecoveryIdentity
    && production?.id === Number(id);
  const hasProductionMutation = reviewSubmitPhase !== null || reviewSuggestionAccepting || statusUpdating || versionSaving !== null || deleting || hasConfirmedRefreshPending || pendingStatusTransition !== null || productionAutosaveRecovery !== null || productionAutosaveRecoveryBlocked || productionAutosaveDraftBlocked || Boolean(productionAutosaveConflictDraft) || productionAutosaveRetrying || Boolean(production && !productionAutosaveRecoveryHydrated);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current');
  const [leaveFailureDialogDismissed, setLeaveFailureDialogDismissed] = useState(false);
  const [superseded, setSuperseded] = useState<VersionSupersededPayload | null>(null);
  const displayedCurrentVersion = production?.version || 'v1.0';

  // The detail API computes this from the same topic-scope ACL used by writes.
  // Do not infer edit scope from operator/creator labels on the client.
  const canEditProduction = production?.can_edit === true;
  const requestedHistoryUnavailable = Boolean(
    production && requestedVersion && requestedVersion !== displayedCurrentVersion && !linkedHistoryVersion,
  );
  const canEditSelectedVersion = Boolean(
    canEditProduction &&
      hasPermission('production:update') &&
      !requestedHistoryUnavailable &&
      selectedVersionId === 'current' &&
      !superseded,
  );
  const canReviewProduction = Boolean(
    production?.status === 'review' &&
      production.can_edit === true &&
      hasPermission('production:update') &&
      !requestedHistoryUnavailable &&
      selectedVersionId === 'current' &&
      !superseded,
  );
  const canDelete = canEditSelectedVersion && hasPermission('production:delete');
  const activeDocId = production ? getProductionVersionRoomId(production.id, production.version) : undefined;
  const syncStatus = useEditorEventState(activeDocId);
  const runtimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
  const outlineEditorHandleRef = useRef<EditorCommandHandle | null>(null);
  const persistedContentRef = useRef('');
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
  const handleOutlineEditorChange = useCallback((handle: EditorCommandHandle | null) => {
    outlineEditorHandleRef.current = handle;
    setReviewEditorHandle(handle);
    setOutlineEditorReady(Boolean(handle));
  }, []);
  const handleReviewEditorCommandHandleChange = useCallback((handle: EditorCommandHandle | null) => {
    outlineEditorHandleRef.current = handle;
    setReviewEditorHandle(handle);
  }, []);
  const flushReviewEditor = useCallback(async () => {
    const handle = runtimeHandleRef.current;
    return handle ? handle.flush({ timeoutMs: 15_000 }) : { status: 'failed' };
  }, []);
  const getFlushedProductionEditorContent = () => {
    const content = outlineEditorHandleRef.current?.getContent();
    if (content === null || content === undefined) {
      throw new Error('编辑器尚未准备好，正文操作未发送，请稍后重试。');
    }
    if (content !== persistedContentRef.current) {
      throw new Error('正文与最近一次确认保存内容不一致，当前操作未发送；请检查保存状态后重试。');
    }
    latestEditContentRef.current = content;
    return content;
  };
  const flushProductionEditorBeforeMutation = useCallback(async () => {
    if (productionAutosaveRecoveryRef.current || productionAutosaveRecoveryBlocked || productionAutosaveDraftBlocked || productionAutosaveConflictDraft) {
      addNotification({
        title: '稿件恢复尚未完成',
        message: '请先核实服务器正文，并处理保留的本机草稿，再进行状态或版本操作。',
        type: 'warning',
      });
      return false;
    }
    const result = await flushReviewEditor();
    if (result.status === 'synced') return true;

    const message = result.status === 'timed_out'
      ? '编辑器仍在保存，当前操作未执行，请稍后重试。'
      : result.status === 'cancelled'
        ? '编辑器保存已中断，当前操作未执行，请刷新确认正文后重试。'
        : '正文保存未确认，当前操作未执行；请检查保存提示并重试。';
    addNotification({ title: '正文尚未确认保存', message, type: 'error' });
    return false;
  }, [addNotification, flushReviewEditor, productionAutosaveConflictDraft, productionAutosaveDraftBlocked, productionAutosaveRecoveryBlocked]);

  const beginReviewSuggestionAccept = useCallback(() => {
    if (productionMutationLockRef.current || confirmedRefreshLockRef.current || pendingStatusTransitionRef.current) return false;
    productionMutationLockRef.current = true;
    setReviewSuggestionAccepting(true);
    return true;
  }, []);

  const endReviewSuggestionAccept = useCallback(() => {
    productionMutationLockRef.current = false;
    setReviewSuggestionAccepting(false);
  }, []);

  useEffect(() => {
    if (!socket || !production || !authUser) return;
    const handleSuperseded = (payload: VersionSupersededPayload) => {
      if (payload.productionId !== production.id || payload.fromVersion !== production.version) return;
      if (payload.createdBy.id === authUser.id) return;
      setSuperseded(payload);
    };
    socket.on(COLLABORATION_EVENTS.VERSION_SUPERSEDED, handleSuperseded);
    return () => { socket.off(COLLABORATION_EVENTS.VERSION_SUPERSEDED, handleSuperseded); };
  }, [authUser, production, socket]);

  const pendingRouteStayRef = useRef<(() => void) | null>(null);
  const materialDraftLeaveStateRef = useRef({ pending: false, canDiscard: false });
  const materialDraftLeaveActionsRef = useRef<{ discard: () => boolean; copy: () => Promise<boolean> } | null>(null);
  const pendingMaterialDraftNavigationRef = useRef<RouteNavigationAttempt | null>(null);
  const [materialDraftLeaveState, setMaterialDraftLeaveState] = useState({ pending: false, canDiscard: false });
  const [materialDraftLeaveDialogOpen, setMaterialDraftLeaveDialogOpen] = useState(false);
  const [materialDraftCopyStatus, setMaterialDraftCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [materialDraftLeaveError, setMaterialDraftLeaveError] = useState<string | null>(null);
  const handleMaterialDraftLeaveStateChange = useCallback((state: { pending: boolean; canDiscard: boolean }) => {
    const previous = materialDraftLeaveStateRef.current;
    materialDraftLeaveStateRef.current = state;
    if (previous.pending === state.pending && previous.canDiscard === state.canDiscard) return;
    setMaterialDraftLeaveState(state);
  }, []);
  const handleRegisterMaterialDraftLeaveActions = useCallback((actions: { discard: () => boolean; copy: () => Promise<boolean> } | null) => {
    materialDraftLeaveActionsRef.current = actions;
  }, []);
  const handleSelectVersion = useCallback((versionId: string) => {
    if (versionId !== selectedVersionId && materialDraftLeaveStateRef.current.pending) {
      addNotification({
        title: '创作资料尚未保存',
        message: '请先处理本地资料草稿，再切换历史版本。',
        type: 'warning',
      });
      return;
    }
    setSelectedVersionId(versionId);
  }, [addNotification, selectedVersionId]);
  const handleContinueEditing = useCallback(() => {
    pendingRouteStayRef.current?.();
    pendingRouteStayRef.current = null;
    setLeaveFailureDialogDismissed(true);
  }, []);

  const handleRetryLeave = useCallback(() => retryLeave(), [retryLeave]);

  const handleDiscardAndLeave = useCallback(() => discardAndLeave(), [discardAndLeave]);

  const continueRouteNavigationAfterMaterialDraft = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
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
        if (leaveResult.decision === 'waiting_confirmation') {
          addNotification({
            title: '最后修改尚未保存',
            message: '已阻止离开当前页面，请留在此页后重试保存。',
            type: 'warning',
          });
          return;
        }
        continueOnce();
        if (leaveResult.warning === 'collaboration_unconfirmed') {
          addNotification({
            title: '内容已保存',
            message: '协作交接尚未确认，已按安全保存结果继续导航。',
            type: 'warning',
          });
        }
      })
      .catch(stay);
  }, [addNotification, requestLeave]);

  const handleRouteNavigationAttempt = useCallback((attempt: RouteNavigationAttempt) => {
    if (productionAutosaveRecovery || productionAutosaveRecoveryBlocked || productionAutosaveDraftBlocked || productionAutosaveConflictDraft) {
      attempt.stay();
      addNotification({
        title: '稿件恢复尚未完成',
        message: '本机正文仍有待核实或待处理的草稿，请完成只读核实和恢复后再离开。',
        type: 'warning',
      });
      return;
    }
    if (!materialDraftLeaveStateRef.current.pending) {
      continueRouteNavigationAfterMaterialDraft(attempt);
      return;
    }
    if (!materialDraftLeaveStateRef.current.canDiscard) {
      attempt.stay();
      addNotification({
        title: '创作资料正在保存',
        message: '已留在当前页面。请等资料状态更新后再离开。',
        type: 'warning',
      });
      return;
    }
    pendingMaterialDraftNavigationRef.current = attempt;
    setMaterialDraftCopyStatus('idle');
    setMaterialDraftLeaveError(null);
    setMaterialDraftLeaveDialogOpen(true);
  }, [addNotification, continueRouteNavigationAfterMaterialDraft, productionAutosaveConflictDraft, productionAutosaveDraftBlocked, productionAutosaveRecovery, productionAutosaveRecoveryBlocked]);

  const handleKeepMaterialDraftEditing = useCallback(() => {
    pendingMaterialDraftNavigationRef.current?.stay();
    pendingMaterialDraftNavigationRef.current = null;
    setMaterialDraftLeaveDialogOpen(false);
    setMaterialDraftLeaveError(null);
  }, []);

  const handleCopyMaterialDraft = useCallback(async () => {
    try {
      const copied = await materialDraftLeaveActionsRef.current?.copy();
      if (!copied) throw new Error('当前没有可复制的本地资料文字。');
      setMaterialDraftCopyStatus('copied');
      setMaterialDraftLeaveError(null);
    } catch {
      setMaterialDraftCopyStatus('failed');
      setMaterialDraftLeaveError('复制未完成。请留在此页并手动选中资料文字后复制。');
    }
  }, []);

  const handleDiscardMaterialDraftAndLeave = useCallback(() => {
    const attempt = pendingMaterialDraftNavigationRef.current;
    if (!attempt) {
      setMaterialDraftLeaveDialogOpen(false);
      return;
    }
    const discarded = materialDraftLeaveActionsRef.current?.discard() ?? false;
    if (!discarded) {
      attempt.stay();
      pendingMaterialDraftNavigationRef.current = null;
      setMaterialDraftLeaveDialogOpen(false);
      addNotification({
        title: '创作资料仍在保存',
        message: '本次离开已取消。请等保存状态确认后再操作。',
        type: 'warning',
      });
      return;
    }
    pendingMaterialDraftNavigationRef.current = null;
    setMaterialDraftLeaveDialogOpen(false);
    continueRouteNavigationAfterMaterialDraft(attempt);
  }, [addNotification, continueRouteNavigationAfterMaterialDraft]);
  useRouteNavigationGuard(Boolean(production), handleRouteNavigationAttempt);

  const fetchData = useCallback(async (options?: { notifyOnFailure?: boolean; recovery?: boolean }) => {
    if (!id) return 'stale' as const;

    const requestId = ++detailRequestRef.current;
    if (options?.recovery) setRecoveryReadInFlight(true);
    setLoading(true);
    setDetailLoadError('');
    setHistoryLoading(false);
    setLinkedHistoryVersion(null);

    try {
      const productionId = Number.parseInt(id, 10);
      const productionData = options?.recovery
        ? await getProductionByIdForRecovery(productionId)
        : await getProductionById(productionId);
      if (requestId !== detailRequestRef.current) return 'stale' as const;

      const currentVersion = productionData.version || 'v1.0';
      const exactHistoryRequest = requestedVersion && requestedVersion !== currentVersion
        ? getProductionHistory(Number.parseInt(id, 10), 1, 1, true, requestedVersion)
          .then((result) => result.data.find((entry) => entry.version === requestedVersion) || null)
          .catch(() => null)
        : Promise.resolve(null);
      const [topicData, historyData, exactHistoryVersion] = await Promise.all([
        getTopic(productionData.topic_id),
        getProductionHistory(Number.parseInt(id, 10)),
        exactHistoryRequest,
      ]);
      if (requestId !== detailRequestRef.current) return 'stale' as const;

      setDetailLoadError('');
      setProduction(productionData);
      persistedContentRef.current = productionData.content || '';
      setCurrentContentDocument(
        getCollaborationRoomId('production', productionData.id),
        productionData.topic_title || `创作 ${productionData.id}`,
      );
      setEditData({
        content: productionData.content || '',
        status: productionData.status,
      });
      latestEditContentRef.current = productionData.content || '';
      setTopic(topicData);
      setHistory(historyData.data);
      setLinkedHistoryVersion(exactHistoryVersion);
      setHistoryPage(historyData.page);
      setHistoryTotal(historyData.total);
      setSelectedVersionId(exactHistoryVersion ? `history-${exactHistoryVersion.id}` : 'current');
      setSuperseded(null);
      confirmedRefreshLockRef.current = false;
      setConfirmedVersionRefreshPending(false);
      setConfirmedReviewRefreshPending(false);
      setConfirmedStatusRefreshPending(false);
      setConfirmedDeleteRefreshPending(false);
      if (requestedVersion && requestedVersion !== currentVersion && !exactHistoryVersion) {
        addNotification({ title: '创作来源版本暂不可用', message: `没有找到 ${requestedVersion}，当前创作稿仍可正常查看。`, type: 'warning' });
      }
      return 'success' as const;
    } catch (error) {
      if (requestId !== detailRequestRef.current) return 'stale' as const;
      setDetailLoadError(getUserFacingErrorMessage(error, '暂时无法读取创作详情，请检查连接后重试。'));
      if (options?.notifyOnFailure !== false) {
        addNotification({
          title: '获取创作详情失败',
          message: getUserFacingErrorMessage(error, '暂时无法读取创作详情，请检查连接后重试。'),
          type: 'error',
        });
      }
      return 'failed' as const;
    } finally {
      if (requestId === detailRequestRef.current) setLoading(false);
      if (options?.recovery) setRecoveryReadInFlight(false);
    }
  }, [addNotification, id, requestedVersion]);

  const updatePendingStatusTransition = useCallback((recovery: ProductionTransitionRecovery | null) => {
    const ownerUserId = recovery?.userId ?? authUser?.id;
    writeProductionTransitionRecovery(id, ownerUserId, recovery);
    pendingStatusTransitionRef.current = recovery;
    setPendingStatusTransition(recovery);
  }, [authUser, id]);

  const applyProductionSnapshot = useCallback((record: ProductionType) => {
    const content = String(record.content || '');
    setProduction(record);
    persistedContentRef.current = content;
    latestEditContentRef.current = content;
    setEditData({ content, status: record.status });
    setCurrentContentDocument(
      getCollaborationRoomId('production', record.id),
      record.topic_title || `创作 ${record.id}`,
    );
  }, []);

  const applyProductionAutosaveReadback = useCallback((record: ProductionType, contentToKeep: string) => {
    const serverContent = String(record.content || '');
    setProduction(record);
    persistedContentRef.current = serverContent;
    latestEditContentRef.current = contentToKeep;
    setEditData({ content: contentToKeep, status: record.status });
    setCurrentContentDocument(
      getCollaborationRoomId('production', record.id),
      record.topic_title || `创作 ${record.id}`,
    );
  }, []);

  const persistProductionAutosaveDraft = useCallback((content: string) => {
    const persisted = writeAndVerifyProductionAutosaveDraft(
      productionDraftKey,
      content,
      (key, value) => writeSafeDraft(key, value),
      (key) => readSafeDraftValue<string>(key),
    );
    setProductionAutosaveDraftBlocked(!persisted);
    if (!persisted) {
      setProductionAutosaveRecoveryReadError('本机稿件草稿未能可靠保存；为保护正文，自动保存已暂停。请检查浏览器存储空间后重试。');
    } else if (!productionAutosaveRecoveryRef.current) {
      setProductionAutosaveRecoveryReadError('');
    }
    return persisted;
  }, [productionDraftKey]);

  const updateProductionAutosaveRecovery = useCallback((recovery: ProductionAutosaveRecovery | null) => {
    if (recovery) {
      try {
        persistProductionAutosaveRecovery(recovery);
        productionAutosaveRecoveryRef.current = recovery;
        setProductionAutosaveRecovery(recovery);
        setProductionAutosaveRecoveryBlocked(false);
        setProductionAutosaveRecoveryReadError('');
        return true;
      } catch (error) {
        productionAutosaveRecoveryRef.current = recovery;
        setProductionAutosaveRecovery(recovery);
        setProductionAutosaveRecoveryBlocked(true);
        setProductionAutosaveRecoveryReadError(getUserFacingErrorMessage(error, '恢复信息无法安全保存；稿件保持锁定。'));
        throw error;
      }
    }

    const existing = productionAutosaveRecoveryRef.current;
    if (existing && !clearProductionAutosaveRecovery(existing)) {
      const locked = { ...existing, phase: 'uncertain' as const };
      productionAutosaveRecoveryRef.current = locked;
      setProductionAutosaveRecovery(locked);
      setProductionAutosaveRecoveryBlocked(true);
      setProductionAutosaveRecoveryReadError('服务端状态已核实，但本机恢复标记未能清理。为避免重复保存，稿件仍保持锁定；请重试只读核实。');
      return false;
    }
    productionAutosaveRecoveryRef.current = null;
    setProductionAutosaveRecovery(null);
    setProductionAutosaveRecoveryBlocked(false);
    setProductionAutosaveRecoveryReadError('');
    return true;
  }, []);

  const finishProductionAutosaveRecovery = useCallback((recovery: ProductionAutosaveRecovery) => {
    if (clearProductionAutosaveRecovery(recovery)) {
      if (productionAutosaveRecoveryRef.current?.requestId === recovery.requestId) {
        productionAutosaveRecoveryRef.current = null;
        setProductionAutosaveRecovery(null);
        setProductionAutosaveRecoveryBlocked(false);
        setProductionAutosaveRecoveryReadError('');
      }
      return true;
    }
    const uncertain = { ...recovery, phase: 'uncertain' as const };
    productionAutosaveRecoveryRef.current = uncertain;
    setProductionAutosaveRecovery(uncertain);
    setProductionAutosaveRecoveryBlocked(true);
    setProductionAutosaveRecoveryReadError('服务器结果已核实，但本机恢复标记未能清除；稿件保持锁定，请重试只读核实。');
    return false;
  }, []);

  const verifyProductionAutosaveRecovery = useCallback(async (
    recovery: ProductionAutosaveRecovery,
  ): Promise<'confirmed' | 'ready' | 'conflict' | 'unknown'> => {
    if (productionAutosaveRecoveryVerifyLockRef.current
      || recovery.userId !== Number(authUser?.id)
      || recovery.productionId !== Number(id)) return 'unknown';
    productionAutosaveRecoveryVerifyLockRef.current = true;
    const checking = { ...recovery, phase: 'checking' as const };
    productionAutosaveRecoveryRef.current = checking;
    setProductionAutosaveRecovery(checking);
    setProductionAutosaveRecoveryReadError('');
    try {
      const record = await getProductionByIdForRecovery(recovery.productionId);
      if (record.id !== recovery.productionId) throw new Error('服务器返回的创作记录与当前页面不一致。');
      const serverContent = String(record.content || '');
      const serverFingerprint = await fingerprintProductionContent(serverContent);
      const sameBase = record.topic_id === recovery.topicId
        && (record.version || 'v1.0') === recovery.productionVersion
        && record.status === recovery.status
        && serverFingerprint === recovery.baselineFingerprint;
      const targetReached = record.topic_id === recovery.topicId
        && (record.version || 'v1.0') === recovery.productionVersion
        && record.status === recovery.status
        && serverFingerprint === recovery.targetFingerprint;
      const editorContent = outlineEditorHandleRef.current?.getContent();
      const storedDraft = productionDraftKey ? readSafeDraftValue<string>(productionDraftKey) : null;
      const localDraft = typeof editorContent === 'string' && editorContent !== persistedContentRef.current
        ? editorContent
        : storedDraft ?? editorContent ?? latestEditContentRef.current;
      const safeLocalDraft = typeof localDraft === 'string' ? localDraft : '';

      if (targetReached) {
        applyProductionAutosaveReadback(record, safeLocalDraft);
        if (safeLocalDraft === serverContent) {
          if (productionDraftKey && !clearSafeDraft(productionDraftKey)) {
            throw new Error('服务器已保存正文，但本机草稿未能清理；请重试只读核实。');
          }
          if (!updateProductionAutosaveRecovery(null)) return 'unknown';
          runtimeHandleRef.current?.confirmPersistedContent?.(serverContent);
          addNotification({ title: '自动保存已确认', message: '服务器已保存这次稿件修改，没有重复提交。', type: 'success' });
          return 'confirmed';
        }

        if (!persistProductionAutosaveDraft(safeLocalDraft)) {
          throw new Error('较新的本机正文无法可靠保存；服务器已确认上一条修改，页面保持锁定。');
        }

        const laterDraftRecovery: ProductionAutosaveRecovery = {
          ...recovery,
          baselineFingerprint: serverFingerprint,
          targetFingerprint: await fingerprintProductionContent(safeLocalDraft),
          phase: 'ready',
        };
        updateProductionAutosaveRecovery(laterDraftRecovery);
        runtimeHandleRef.current?.discardPendingSaves?.();
        runtimeHandleRef.current?.confirmPersistedContent?.(serverContent);
        addNotification({ title: '已确认上一条自动保存', message: '较新的本机正文仍保存在草稿中；确认后可继续保存，不会自动重发。', type: 'warning' });
        return 'confirmed';
      }

      if (sameBase) {
        applyProductionAutosaveReadback(record, safeLocalDraft);
        if (!persistProductionAutosaveDraft(safeLocalDraft)) {
          throw new Error('本机正文无法可靠保留；为避免丢稿，自动保存已暂停。');
        }
        const readyRecovery: ProductionAutosaveRecovery = {
          ...recovery,
          baselineFingerprint: serverFingerprint,
          targetFingerprint: await fingerprintProductionContent(safeLocalDraft),
          phase: 'ready',
        };
        updateProductionAutosaveRecovery(readyRecovery);
        runtimeHandleRef.current?.discardPendingSaves?.();
        addNotification({ title: '自动保存尚未写入', message: '服务器仍是原稿；正文已保留为本机草稿。系统没有自动重试，请确认后再保存。', type: 'warning' });
        return 'ready';
      }

      const draftDiffers = safeLocalDraft !== serverContent;
      if (draftDiffers && !persistProductionAutosaveDraft(safeLocalDraft)) {
        applyProductionAutosaveReadback(record, safeLocalDraft);
        setProductionAutosaveConflictDraft({ content: safeLocalDraft, serverVersion: record.version || 'v1.0' });
        throw new Error('服务器正文已变化；本机稿未能可靠保存，正文保留在当前页面并保持锁定。请先复制或重试本机草稿保存。');
      }
      applyProductionAutosaveReadback(record, serverContent);
      setProductionAutosaveConflictDraft(draftDiffers ? { content: safeLocalDraft, serverVersion: record.version || 'v1.0' } : null);
      if (!updateProductionAutosaveRecovery(null)) return 'unknown';
      runtimeHandleRef.current?.discardPendingSaves?.();
      addNotification({
        title: '服务器稿件已变化',
        message: draftDiffers
          ? '未覆盖其他协作者的正文；你的本机草稿已保留，可先核对再明确恢复。'
          : '服务器正文与当前恢复记录不一致；已采用服务器正文，没有重复提交。',
        type: 'warning',
      });
      return 'conflict';
    } catch (error) {
      const uncertain = { ...recovery, phase: 'uncertain' as const };
      try { updateProductionAutosaveRecovery(uncertain); } catch { /* Keep the in-memory lock if session storage is unavailable. */ }
      runtimeHandleRef.current?.discardPendingSaves?.();
      setProductionAutosaveRecoveryReadError(getUserFacingErrorMessage(error, '稿件保存结果仍无法确认；编辑和后续写入已暂停。'));
      return 'unknown';
    } finally {
      productionAutosaveRecoveryVerifyLockRef.current = false;
      const current = productionAutosaveRecoveryRef.current;
      if (current?.phase === 'checking') {
        const uncertain = { ...current, phase: 'uncertain' as const };
        productionAutosaveRecoveryRef.current = uncertain;
        setProductionAutosaveRecovery(uncertain);
      }
    }
  }, [addNotification, applyProductionAutosaveReadback, authUser?.id, id, persistProductionAutosaveDraft, productionDraftKey, updateProductionAutosaveRecovery]);

  const retryProductionAutosave = useCallback(async () => {
    const recovery = productionAutosaveRecoveryRef.current;
    const runtime = runtimeHandleRef.current;
    if (!recovery || recovery.phase !== 'ready' || !runtime || productionAutosaveRetrying) return;
    setProductionAutosaveRetrying(true);
    try {
      const verification = await verifyProductionAutosaveRecovery(recovery);
      const confirmedRecovery = productionAutosaveRecoveryRef.current;
      if (verification !== 'ready' || !confirmedRecovery || confirmedRecovery.phase !== 'ready') return;
      const editorContent = outlineEditorHandleRef.current?.getContent();
      const content = productionDraftKey
        ? readSafeDraftValue<string>(productionDraftKey) ?? editorContent ?? latestEditContentRef.current
        : editorContent ?? latestEditContentRef.current;
      if (!persistProductionAutosaveDraft(content)) return;
      const targetFingerprint = await fingerprintProductionContent(content);
      if (targetFingerprint !== confirmedRecovery.targetFingerprint) {
        const updatedRecovery = { ...confirmedRecovery, targetFingerprint, phase: 'ready' as const };
        updateProductionAutosaveRecovery(updatedRecovery);
        addNotification({ title: '本机草稿已更新', message: '检测到较新的正文；请再次确认后重试保存。', type: 'warning' });
        return;
      }
      const revisions = runtime.getRevisions?.() ?? { latestRevision: 0 };
      productionAutosaveExplicitRetryRef.current = confirmedRecovery.requestId;
      runtime.scheduleSave(content, Math.max(Date.now(), revisions.latestRevision + 1));
      const result = await runtime.flush({ timeoutMs: 30_000 });
      if (result.status !== 'synced' && productionAutosaveRecoveryRef.current?.phase === 'ready') {
        addNotification({ title: '稿件仍待保存', message: '本机草稿仍已保留；请先只读核实服务器，再决定是否重试。', type: 'warning' });
      }
    } catch (error) {
      addNotification({ title: '未能重试保存', message: getUserFacingErrorMessage(error, '本机草稿仍已保留；请检查后重试。'), type: 'error' });
    } finally {
      productionAutosaveExplicitRetryRef.current = '';
      setProductionAutosaveRetrying(false);
    }
  }, [addNotification, persistProductionAutosaveDraft, productionAutosaveRetrying, productionDraftKey, updateProductionAutosaveRecovery, verifyProductionAutosaveRecovery]);

  const restoreProductionAutosaveConflictDraft = useCallback(async () => {
    const conflict = productionAutosaveConflictDraft;
    const userId = Number(authUser?.id);
    if (!conflict || !production || !productionDraftKey || !Number.isSafeInteger(userId) || userId <= 0
      || !canEditSelectedVersion || productionAutosaveRetrying) return;
    setProductionAutosaveRetrying(true);
    try {
      if (!persistProductionAutosaveDraft(conflict.content)) return;
      const record = await getProductionByIdForRecovery(production.id);
      const currentContent = String(record.content || '');
      if (record.id !== production.id || record.topic_id !== production.topic_id
        || (record.version || 'v1.0') !== (production.version || 'v1.0')
        || record.status !== production.status || currentContent !== String(production.content || '')) {
        applyProductionAutosaveReadback(record, currentContent);
        setProductionAutosaveConflictDraft({ content: conflict.content, serverVersion: record.version || 'v1.0' });
        addNotification({ title: '服务器稿件又有更新', message: '已重新读取服务器正文并保留本机草稿；请核对后再次明确恢复。', type: 'warning' });
        return;
      }
      const recovery: ProductionAutosaveRecovery = {
        version: 1,
        userId,
        productionId: record.id,
        topicId: record.topic_id,
        productionVersion: record.version || 'v1.0',
        status: record.status,
        baselineFingerprint: await fingerprintProductionContent(currentContent),
        targetFingerprint: await fingerprintProductionContent(conflict.content),
        requestId: createProductionAutosaveRequestId(),
        phase: 'ready',
      };
      if (!updateProductionAutosaveRecovery(recovery)) return;
      persistedContentRef.current = currentContent;
      latestEditContentRef.current = conflict.content;
      setProductionAutosaveConflictDraft(null);
      setEditData({ content: conflict.content, status: record.status });
      const runtime = runtimeHandleRef.current;
      if (!runtime) throw new Error('编辑器尚未准备好；本机草稿已保留，请稍后重试。');
      const revisions = runtime.getRevisions?.() ?? { latestRevision: 0 };
      productionAutosaveExplicitRetryRef.current = recovery.requestId;
      runtime.scheduleSave(conflict.content, Math.max(Date.now(), revisions.latestRevision + 1));
      const result = await runtime.flush({ timeoutMs: 30_000 });
      if (result.status !== 'synced' && productionAutosaveRecoveryRef.current?.phase === 'ready') {
        addNotification({ title: '本机草稿仍待保存', message: '恢复操作没有自动重试；正文仍保存在本机，请核对服务器后再决定。', type: 'warning' });
      }
    } catch (error) {
      addNotification({ title: '未能恢复本机草稿', message: getUserFacingErrorMessage(error, '本机稿仍已保留；请核对服务器后重试。'), type: 'error' });
    } finally {
      productionAutosaveExplicitRetryRef.current = '';
      setProductionAutosaveRetrying(false);
    }
  }, [addNotification, applyProductionAutosaveReadback, authUser?.id, canEditSelectedVersion, persistProductionAutosaveDraft, production, productionAutosaveConflictDraft, productionAutosaveRetrying, productionDraftKey, updateProductionAutosaveRecovery]);

  const retryProductionAutosaveDraftStorage = useCallback(() => {
    const content = outlineEditorHandleRef.current?.getContent();
    if (content === null || content === undefined || !persistProductionAutosaveDraft(content)) return;
    setProductionAutosaveDraftBlocked(false);
    if (!productionAutosaveRecoveryRef.current) setProductionAutosaveRecoveryReadError('');
    addNotification({ title: '本机草稿已保存', message: '自动保存已恢复；后续服务器写入仍会先核实保存结果。', type: 'success' });
  }, [addNotification, persistProductionAutosaveDraft]);

  useEffect(() => {
    if (!production || !authUser?.id || production.id !== Number(id)) return;
    const checkKey = `${autosaveRecoveryIdentity}:${String(production.content || '')}`;
    if (productionAutosaveRecoveryCheckRef.current === checkKey) return;
    productionAutosaveRecoveryCheckRef.current = checkKey;
    setProductionAutosaveRecoveryHydratedFor('');

    const stored = readProductionAutosaveRecovery(Number(authUser.id), production.id);
    if (stored.state === 'valid') {
      productionAutosaveRecoveryRef.current = stored.recovery;
      setProductionAutosaveRecovery(stored.recovery);
      setProductionAutosaveRecoveryBlocked(false);
      void verifyProductionAutosaveRecovery(stored.recovery).finally(() => {
        setProductionAutosaveRecoveryHydratedFor(autosaveRecoveryIdentity);
      });
      return;
    }
    if (stored.state === 'invalid' || stored.state === 'unavailable') {
      productionAutosaveRecoveryRef.current = null;
      setProductionAutosaveRecovery(null);
      setProductionAutosaveRecoveryBlocked(true);
      setProductionAutosaveRecoveryReadError(stored.state === 'invalid'
        ? '本机保存结果标记无法读取；为避免重复覆盖，稿件保持只读。请重新读取恢复状态。'
        : '浏览器无法读取本机恢复状态；为避免重复覆盖，稿件保持只读。请检查浏览器存储权限后重试。');
      setProductionAutosaveRecoveryHydratedFor(autosaveRecoveryIdentity);
      return;
    }

    productionAutosaveRecoveryRef.current = null;
    setProductionAutosaveRecovery(null);
    setProductionAutosaveRecoveryBlocked(false);
    const localDraft = productionDraftKey ? readSafeDraftValue<string>(productionDraftKey) : null;
    const serverContent = String(production.content || '');
    if (typeof localDraft === 'string' && localDraft !== serverContent) {
      setProductionAutosaveConflictDraft({ content: localDraft, serverVersion: production.version || 'v1.0' });
    } else {
      setProductionAutosaveConflictDraft(null);
      if (localDraft === serverContent && productionDraftKey) clearSafeDraft(productionDraftKey);
    }
    setProductionAutosaveRecoveryReadError('');
    setProductionAutosaveRecoveryHydratedFor(autosaveRecoveryIdentity);
  }, [authUser?.id, autosaveRecoveryIdentity, id, production, productionAutosaveRecoveryHydratedFor, productionDraftKey, verifyProductionAutosaveRecovery]);

  const prepareStatusTransition = useCallback(async (
    operation: ProductionTransitionOperation,
    previousStatus: string,
    targetStatus: string,
    content: string,
    existing?: ProductionTransitionRecovery,
    version?: { previousVersion: string; versionAction?: 'minor' | 'major' },
  ) => {
    if (!id || !production || !Number.isSafeInteger(authUser?.id)) {
      throw new Error('当前账号或创作记录尚未确认，状态操作未发送。');
    }
    const validTransition = operation === 'review-submit'
      ? previousStatus === 'draft' && targetStatus === 'review'
      : operation === 'version-save'
        ? Boolean(version?.versionAction && previousStatus === targetStatus)
        : operation === 'delete'
          ? Boolean(version && !version.versionAction && targetStatus === 'deleted')
          : NEXT_STATUSES[previousStatus] === targetStatus && previousStatus !== targetStatus;
    if (!validTransition) throw new Error('本次状态变更与当前流程不匹配，操作未发送。');
    const contentFingerprint = await fingerprintProductionContent(content);
    if (existing && (existing.userId !== authUser?.id || existing.productionId !== production.id
      || existing.operation !== operation || existing.previousStatus !== previousStatus
      || existing.targetStatus !== targetStatus || existing.contentFingerprint !== contentFingerprint
      || existing.previousVersion !== version?.previousVersion || existing.versionAction !== version?.versionAction)) {
      throw new Error('待重试内容或状态已变化；请先只读核实服务器状态。');
    }
    const recovery: ProductionTransitionRecovery = existing
      ? { ...existing, phase: 'uncertain' }
      : {
        version: 1,
        userId: authUser!.id,
        productionId: production.id,
        operation,
        previousStatus,
        targetStatus,
        contentFingerprint,
        previousVersion: version?.previousVersion,
        versionAction: version?.versionAction,
        phase: 'uncertain',
      };
    updatePendingStatusTransition(recovery);
    return recovery;
  }, [authUser, id, production, updatePendingStatusTransition]);

  const verifyPendingStatusTransition = useCallback(async () => {
    const recovery = pendingStatusTransitionRef.current;
    if (!id || !recovery || recovery.phase === 'checking' || statusTransitionVerificationLockRef.current
      || Number(recovery.productionId) !== Number.parseInt(id, 10) || !authUser) return;
    if (authUserIdRef.current !== authUser.id) return;
    if (recovery.userId !== authUser.id) {
      pendingStatusTransitionRef.current = null;
      setPendingStatusTransition(null);
      setStatusTransitionReadError('当前登录账号与发起操作的账号不同；原账号的核实标记已保留，请重新读取创作详情。');
      await fetchData({ notifyOnFailure: false, recovery: true });
      return;
    }

    statusTransitionVerificationLockRef.current = true;
    setStatusTransitionReadError('');
    setRecoveryReadInFlight(true);
    pendingStatusTransitionRef.current = { ...recovery, phase: 'checking' };
    setPendingStatusTransition({ ...recovery, phase: 'checking' });
    try {
      const serverRecord = await getProductionByIdForRecovery(Number.parseInt(id, 10));
      if (authUserIdRef.current !== recovery.userId) return;
      if (serverRecord.id !== recovery.productionId) throw new Error('服务器返回的创作记录与当前页面不一致。');
      const serverContent = String(serverRecord.content || '');
      const serverFingerprint = await fingerprintProductionContent(serverContent);
      applyProductionSnapshot(serverRecord);

      if (recovery.operation === 'delete') {
        const currentVersion = serverRecord.version || 'v1.0';
        if (serverRecord.status === recovery.previousStatus
          && currentVersion === recovery.previousVersion
          && serverFingerprint === recovery.contentFingerprint) {
          updatePendingStatusTransition({ ...recovery, phase: 'ready' });
          setShowDeleteModal(false);
          addNotification({
            title: '服务器仍保留该创作记录',
            message: '版本、状态和正文已核实未变化；系统没有自动重试删除。确认后才会再次删除。',
            type: 'warning',
          });
          await fetchData({ notifyOnFailure: false, recovery: true });
          return;
        }

        updatePendingStatusTransition(null);
        confirmedRefreshLockRef.current = true;
        setConfirmedDeleteRefreshPending(true);
        addNotification({
          title: '创作记录内容已变化',
          message: '回查发现服务器上的版本、状态或正文已变化，本次删除不会自动重试；请检查最新记录后再决定。',
          type: 'warning',
        });
        const refreshed = await fetchData({ notifyOnFailure: false, recovery: true });
        if (refreshed === 'failed') {
          addNotification({ title: '详情尚未刷新', message: '已读取到创作记录仍存在；请检查当前稿件后再决定是否删除。', type: 'warning' });
        }
        return;
      }

      if (recovery.operation === 'version-save') {
        const currentVersion = serverRecord.version || 'v1.0';
        if (currentVersion !== recovery.previousVersion) {
          updatePendingStatusTransition(null);
          confirmedRefreshLockRef.current = true;
          setConfirmedVersionRefreshPending(true);
          addNotification({
            title: '服务器已有新版本',
            message: serverFingerprint === recovery.contentFingerprint
              ? `已读取到 ${currentVersion}，正文与本次保存一致；不会重复创建版本。`
              : `版本已从 ${recovery.previousVersion} 变化为 ${currentVersion}，已采用服务器当前稿件，不会重复创建版本。`,
            type: 'success',
          });
          const refreshed = await fetchData({ notifyOnFailure: false, recovery: true });
          if (refreshed === 'failed') {
            setConfirmedVersionRefreshPending(true);
            addNotification({ title: '新版本已确认，历史未刷新', message: '服务器当前版本已核实；请只重新读取详情，不要再次创建版本。', type: 'warning' });
          }
          return;
        }

        if (serverRecord.status === recovery.previousStatus && serverFingerprint === recovery.contentFingerprint) {
          updatePendingStatusTransition({ ...recovery, phase: 'ready' });
          addNotification({
            title: '服务器仍为原版本',
            message: '当前版本和正文已核实，尚未创建新版本；系统没有自动重试。确认后才会再次保存。',
            type: 'warning',
          });
          await fetchData({ notifyOnFailure: false, recovery: true });
          return;
        }

        updatePendingStatusTransition(null);
        confirmedRefreshLockRef.current = false;
        setConfirmedVersionRefreshPending(false);
        addNotification({
          title: '服务器内容已变化',
          message: '回查发现当前版本或正文与本次保存不一致，已采用服务器最新稿件并取消重试。',
          type: 'warning',
        });
        await fetchData({ notifyOnFailure: false, recovery: true });
        return;
      }

      if (serverRecord.status === recovery.targetStatus && serverFingerprint === recovery.contentFingerprint) {
        updatePendingStatusTransition(null);
        confirmedRefreshLockRef.current = true;
        setConfirmedStatusRefreshPending(true);
        if (recovery.targetStatus === 'approved') celebrateMilestone();
        addNotification({
          title: '服务器已完成状态更新',
          message: `只读回查确认状态为“${productionStatusLabel(recovery.targetStatus)}”，没有重复发送写入。`,
          type: 'success',
        });
        const refreshed = await fetchData({ notifyOnFailure: false, recovery: true });
        if (refreshed === 'failed') {
          setConfirmedStatusRefreshPending(true);
          addNotification({ title: '状态已确认，详情尚未刷新', message: '服务器状态与正文已核实；请只重试读取详情，不要再次提交状态操作。', type: 'warning' });
        }
        return;
      }

      if (serverRecord.status === recovery.previousStatus && serverFingerprint === recovery.contentFingerprint) {
        const readyRecovery = { ...recovery, phase: 'ready' as const };
        updatePendingStatusTransition(readyRecovery);
        addNotification({
          title: '服务器仍是原状态',
          message: `正文已核实，但状态仍为“${productionStatusLabel(recovery.previousStatus)}”。系统没有自动重试；如确认继续，请使用页面中的明确重试按钮。`,
          type: 'warning',
        });
        await fetchData({ notifyOnFailure: false, recovery: true });
        return;
      }

      updatePendingStatusTransition(null);
      confirmedRefreshLockRef.current = false;
      setConfirmedStatusRefreshPending(false);
      addNotification({
        title: '服务器内容已变化',
        message: '回查发现状态或正文与本次操作不一致，已采用服务器当前内容并取消自动重试；请检查后再决定下一步。',
        type: 'warning',
      });
      await fetchData({ notifyOnFailure: false, recovery: true });
    } catch (error) {
      if (authUserIdRef.current !== recovery.userId) return;
      if (recovery.operation === 'delete' && (error as Error & { status?: number }).status === 404) {
        updatePendingStatusTransition(null);
        setShowDeleteModal(false);
        addNotification({ title: '删除成功', message: '只读核实确认创作记录已删除，没有重复发送删除请求。', type: 'success' });
        navigate('/production');
        return;
      }
      const uncertainRecovery = { ...recovery, phase: 'uncertain' as const };
      try { updatePendingStatusTransition(uncertainRecovery); } catch { /* Keep the in-memory write lock even if browser storage is unavailable. */ }
      setStatusTransitionReadError(getUserFacingErrorMessage(error, '暂时无法只读核实服务器状态，请稍后重试。'));
      addNotification({
        title: recovery.operation === 'delete' ? '删除结果仍待核实' : '状态仍待核实',
        message: recovery.operation === 'delete'
          ? '服务器上的记录暂时无法确认，页面已锁定后续写入；请稍后只读核实删除结果。'
          : '服务器状态暂时无法确认，页面已锁定后续写入；请稍后使用“只读核实状态”重试。',
        type: 'warning',
      });
    } finally {
      setLoading(false);
      setRecoveryReadInFlight(false);
      statusTransitionVerificationLockRef.current = false;
      const current = pendingStatusTransitionRef.current;
      if (current?.phase === 'checking') {
        const uncertainRecovery = { ...current, phase: 'uncertain' as const };
        pendingStatusTransitionRef.current = uncertainRecovery;
        setPendingStatusTransition(uncertainRecovery);
      }
    }
  }, [addNotification, applyProductionSnapshot, authUser, fetchData, id, navigate, updatePendingStatusTransition]);

  const loadMoreHistory = useCallback(async () => {
    if (!id || historyLoading || history.length >= historyTotal) return;
    const requestId = detailRequestRef.current;
    setHistoryLoading(true);
    try {
      const next = await getProductionHistory(Number.parseInt(id, 10), historyPage + 1);
      if (requestId !== detailRequestRef.current) return;
      setHistory((existing) => [...existing, ...next.data]);
      setHistoryPage(next.page);
      setHistoryTotal(next.total);
    } catch {
      if (requestId === detailRequestRef.current) addNotification({ title: '加载历史版本失败', message: '请稍后重试', type: 'error' });
    } finally {
      if (requestId === detailRequestRef.current) setHistoryLoading(false);
    }
  }, [addNotification, history.length, historyLoading, historyPage, historyTotal, id]);

  useEffect(() => {
    if (!readProductionTransitionRecovery(id, authUser?.id)) void fetchData({ notifyOnFailure: false });
    return () => {
      detailRequestRef.current += 1;
    };
  }, [authUser?.id, fetchData, id]);

  useEffect(() => {
    const stored = readProductionTransitionRecovery(id, authUser?.id);
    if (statusTransitionVerificationLockRef.current) return;
    pendingStatusTransitionRef.current = stored;
    setPendingStatusTransition(stored);
    setStatusTransitionReadError('');
    if (!stored) return;
    if (authUser && stored.userId !== authUser.id) {
      pendingStatusTransitionRef.current = null;
      setPendingStatusTransition(null);
      void fetchData({ notifyOnFailure: false, recovery: true });
      return;
    }
    if (authUser) void verifyPendingStatusTransition();
  }, [authUser, fetchData, id, updatePendingStatusTransition, verifyPendingStatusTransition]);

  useEffect(() => {
    if (requestedAction !== 'review' || loading || permissionsLoading) return;

    if (canReviewProduction) {
      const approvalAction = document.querySelector<HTMLButtonElement>('[data-testid="production-review-approve"]');
      approvalAction?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      });
      approvalAction?.focus({ preventScroll: true });
    }

    setSearchParams((current) => {
      if (current.get('action') !== 'review') return current;
      const next = new URLSearchParams(current);
      next.delete('action');
      return next;
    }, { replace: true });
  }, [canReviewProduction, loading, permissionsLoading, requestedAction, setSearchParams]);

  const versionEntries = useMemo<VersionEntry[]>(() => {
    if (!production) {
      return [];
    }

    const currentEntry: VersionEntry = {
      id: 'current',
      version: production.version || 'v1.0',
      changeType: 'current',
      content: production.content || '',
      contentMarkdown: normalizeVersionContent(
        (production as ProductionType & { contentMarkdown?: string; content_markdown?: string }).contentMarkdown ||
          (production as ProductionType & { content_markdown?: string }).content_markdown,
        production.content,
      ),
      status: production.status,
      operatorName: production.operator_name,
      createdAt: production.updated_at || production.created_at,
      isCurrent: true,
    };

      const historyById = new Map<number, HistoryVersion>(history.map((record) => [record.id, record]));
      if (linkedHistoryVersion) historyById.set(linkedHistoryVersion.id, linkedHistoryVersion);
      const historyEntries: VersionEntry[] = Array.from(historyById.values()).map((record) => ({
      id: `history-${record.id}`,
      version: record.version || 'v1.0',
      changeType: record.change_type === 'major' ? 'major' : 'minor',
      content: record.content || '',
      contentMarkdown: normalizeVersionContent(record.content_markdown, record.content),
      status: record.status,
      operatorName: record.operator_name,
      createdAt: record.created_at,
      isCurrent: false,
      versionState: record.version_state,
      materialDraftSnapshotHtml: record.material_draft_snapshot_html,
    }));

    return [currentEntry, ...historyEntries];
  }, [history, linkedHistoryVersion, production]);

  const selectedVersion = versionEntries.find((entry) => entry.id === selectedVersionId) || versionEntries[0] || null;
  const canFocusWrite = Boolean(selectedVersion?.isCurrent && canEditSelectedVersion && !superseded && !hasProductionMutation);
  const outlineHeadings = useMemo(() => extractOutlineHeadings(topic?.outline || ''), [topic?.outline]);

  useEffect(() => {
    if (writingFocused && !canFocusWrite) setWritingFocused(false);
  }, [canFocusWrite, setWritingFocused, writingFocused]);

  const timelineView = useMemo(() => {
    if (!production) return getTimelineView('production:unknown');
    return getTimelineView(getCollaborationRoomId('production', production.id), {
      versionEvents: versionEntries.filter((entry) => !entry.isCurrent).map((entry) => ({
        id: entry.id,
        timestamp: productionHistoryTimestamp(entry.createdAt),
        type: 'snapshot',
        version: entry.version,
        changeType: entry.changeType,
        operatorName: entry.operatorName,
        status: entry.status,
        label: '历史版本快照',
      })),
      saveEvents: [{ id: `current-${production.id}`, timestamp: parseStoredBjt(production.updated_at || production.created_at)?.getTime(), operatorName: production.operator_name }],
    });
  }, [production, versionEntries]);

  const sidebarVersionEntries = useMemo(() => {
    const latestByMajor = new Map<number, VersionEntry>();

    for (const entry of versionEntries) {
      const { major, minor } = parseVersionParts(entry.version);
      const existing = latestByMajor.get(major);

      if (!existing) {
        latestByMajor.set(major, entry);
        continue;
      }

      const existingParts = parseVersionParts(existing.version);
      const isHigherMinor = minor > existingParts.minor;
      const isSameMinorButCurrentPreferred = minor === existingParts.minor && entry.isCurrent && !existing.isCurrent;

      if (isHigherMinor || isSameMinorButCurrentPreferred) {
        latestByMajor.set(major, entry);
      }
    }

    const visibleEntries = Array.from(latestByMajor.values());
    const selectedEntry = versionEntries.find((entry) => entry.id === selectedVersionId);
    if (selectedEntry && !visibleEntries.some((entry) => entry.id === selectedEntry.id)) visibleEntries.push(selectedEntry);
    return visibleEntries.sort((a, b) => {
      const aParts = parseVersionParts(a.version);
      const bParts = parseVersionParts(b.version);

      if (aParts.major !== bParts.major) {
        return bParts.major - aParts.major;
      }

      return bParts.minor - aParts.minor;
    });
  }, [selectedVersionId, versionEntries]);

  const persistProductionEditorAutosave = useCallback(async (content: string) => {
    if (!production || !id || !authUser?.id || production.id !== Number(id)) {
      throw new Error('当前账号或创作记录尚未确认；自动保存未发送。');
    }
    if (!productionAutosaveRecoveryHydrated || productionAutosaveRecoveryBlocked || productionAutosaveDraftBlocked) {
      throw new Error(productionAutosaveRecoveryReadError || '本机稿件恢复状态尚未确认；自动保存未发送。');
    }
    if (pendingStatusTransitionRef.current || confirmedRefreshLockRef.current) {
      throw new Error('创作状态仍待核实；自动保存未发送。');
    }

    const userId = Number(authUser.id);
    const existingRecovery = productionAutosaveRecoveryRef.current;
    const stored = readProductionAutosaveRecovery(userId, production.id);
    if (stored.state === 'invalid' || stored.state === 'unavailable') {
      setProductionAutosaveRecoveryBlocked(true);
      setProductionAutosaveRecoveryReadError('本机保存结果标记无法安全读取；稿件已锁定。请先只读核实恢复状态。');
      throw new Error('本机保存结果标记无法安全读取；自动保存未发送。');
    }
    if (stored.state === 'valid' && stored.recovery.requestId !== existingRecovery?.requestId) {
      productionAutosaveRecoveryRef.current = stored.recovery;
      setProductionAutosaveRecovery(stored.recovery);
      throw new Error('已有一次稿件保存结果待核实；自动保存未发送。');
    }
    if (existingRecovery && (existingRecovery.userId !== userId || existingRecovery.productionId !== production.id)) {
      throw new Error('本机恢复记录与当前账号或稿件不一致；自动保存未发送。');
    }
    if (existingRecovery && (existingRecovery.phase !== 'ready'
      || productionAutosaveExplicitRetryRef.current !== existingRecovery.requestId)) {
      throw new Error('上次稿件保存仍待只读核实；系统没有自动重试。');
    }
    if (!persistProductionAutosaveDraft(content)) {
      throw new Error('本机草稿未能可靠保存；自动保存未发送。');
    }

    const baselineContent = persistedContentRef.current;
    const baselineFingerprint = await fingerprintProductionContent(baselineContent);
    const targetFingerprint = await fingerprintProductionContent(content);
    if (existingRecovery && (existingRecovery.baselineFingerprint !== baselineFingerprint
      || existingRecovery.targetFingerprint !== targetFingerprint)) {
      const updatedRecovery = { ...existingRecovery, targetFingerprint, phase: 'ready' as const };
      updateProductionAutosaveRecovery(updatedRecovery);
      productionAutosaveExplicitRetryRef.current = '';
      runtimeHandleRef.current?.discardPendingSaves?.();
      throw new Error('本机正文或服务端基准已变化；请先只读核实，再明确确认重试。');
    }

    const recovery: ProductionAutosaveRecovery = existingRecovery
      ? { ...existingRecovery, baselineFingerprint, targetFingerprint, phase: 'uncertain' }
      : {
        version: 1,
        userId,
        productionId: production.id,
        topicId: production.topic_id,
        productionVersion: production.version || 'v1.0',
        status: editData.status,
        baselineFingerprint,
        targetFingerprint,
        requestId: createProductionAutosaveRequestId(),
        phase: 'uncertain',
      };
    let writeStarted = false;
    try {
      persistProductionAutosaveRecovery(recovery);
      productionAutosaveRecoveryRef.current = recovery;
      productionAutosaveExplicitRetryRef.current = '';
      writeStarted = true;
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content,
        expected_content: baselineContent,
        status: editData.status,
        version_action: 'none',
      });
      persistedContentRef.current = content;
      setProduction((current) => current?.id === production.id ? {
        ...current,
        content,
        content_markdown: content,
        content_json: content,
      } : current);
      if (productionDraftKey && readSafeDraftValue<string>(productionDraftKey) === content) clearSafeDraft(productionDraftKey);
      if (!finishProductionAutosaveRecovery(recovery)) runtimeHandleRef.current?.discardPendingSaves?.();
    } catch (error) {
      if (writeStarted) {
        const resolution = await verifyProductionAutosaveRecovery(recovery);
        if (resolution === 'confirmed') return;
        throw error;
      }

      addNotification({
        title: '本次修改尚未保存',
        message: getUserFacingErrorMessage(error, '创作内容保存失败；本机草稿已保留，请检查后重试。'),
        type: 'error',
      });
      throw error;
    }
  }, [addNotification, authUser?.id, editData.status, finishProductionAutosaveRecovery, id, persistProductionAutosaveDraft, production, productionAutosaveDraftBlocked, productionAutosaveRecoveryBlocked, productionAutosaveRecoveryHydrated, productionAutosaveRecoveryReadError, productionDraftKey, updateProductionAutosaveRecovery, verifyProductionAutosaveRecovery]);

  const startEditing = () => {
    if (!production || pendingStatusTransitionRef.current) return;
    setSelectedVersionId('current');
    latestEditContentRef.current = production.content || editData.content || '';
    setEditData({
      content: latestEditContentRef.current,
      status: production.status,
    });
  };

  const continueFromOutline = () => {
    if (!canFocusWrite || outlineHeadings.length === 0) return;
    const skeleton = buildMissingOutlineSkeleton(outlineHeadings, editData.content);
    if (skeleton.count === 0) {
      addNotification({ title: '大纲小节已在正文中', message: '没有需要补入的新标题', type: 'info' });
      return;
    }
    if (!outlineEditorHandleRef.current?.appendHtml(skeleton.html)) {
      addNotification({ title: '插入失败', message: '编辑器尚未准备好，请稍后重试', type: 'error' });
      return;
    }
    addNotification({ title: '已按大纲补入小节', message: `新增 ${skeleton.count} 个小节，可在正文中继续写`, type: 'success' });
  };

  const productionEditorAdapter = useMemo(() => {
    if (!production) return undefined;
    const room = getProductionVersionRoomId(production.id, production.version);
    return createProductionEditorAdapter({
      documentId: room,
      collaborationRoom: room,
      initialContent: editData.content,
      readonly: !canEditSelectedVersion || selectedVersionId !== 'current' || Boolean(superseded) || hasProductionMutation,
      capabilities: {
        collaboration: true,
        manualSave: false,
        immersive: true,
        pageScroll: true,
      },
      persist: async (content) => persistProductionEditorAutosave(content),
    });
  }, [canEditSelectedVersion, editData.content, hasProductionMutation, persistProductionEditorAutosave, production, selectedVersionId, superseded]);

  const handleVersionedSave = async (versionAction: 'minor' | 'major', confirmedRetry = false) => {
    const pendingRecovery = pendingStatusTransitionRef.current;
    const retryingRecovery = confirmedRetry && pendingRecovery?.phase === 'ready'
      && pendingRecovery.operation === 'version-save' && pendingRecovery.versionAction === versionAction;
    if (pendingRecovery && !retryingRecovery) return;
    if (!production || !canEditSelectedVersion || superseded || productionMutationLockRef.current || confirmedRefreshLockRef.current) return;
    if (retryingRecovery && ((production.version || 'v1.0') !== pendingRecovery.previousVersion
      || production.status !== pendingRecovery.previousStatus || authUser?.id !== pendingRecovery.userId)) {
      await verifyPendingStatusTransition();
      return;
    }

    productionMutationLockRef.current = true;
    setVersionSaving(versionAction);
    let transitionWriteStarted = false;
    try {
      if (!await flushProductionEditorBeforeMutation()) return;
      const versionedContent = getFlushedProductionEditorContent();
      const baseVersion = production.version || 'v1.0';
      await prepareStatusTransition(
        'version-save',
        production.status,
        production.status,
        versionedContent,
        retryingRecovery ? pendingRecovery : undefined,
        { previousVersion: baseVersion, versionAction },
      );
      transitionWriteStarted = true;
      const result = await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: versionedContent,
        expected_content: persistedContentRef.current,
        status: editData.status,
        change_type: versionAction,
        version_action: versionAction,
      });

      updatePendingStatusTransition(null);
      const savedVersion = result.version || production.version || 'v1.0';
      confirmedRefreshLockRef.current = true;
      setConfirmedVersionRefreshPending(true);
      setProduction((current) => current?.id === production.id ? {
        ...current,
        version: savedVersion,
        content: versionedContent,
        content_markdown: versionedContent,
        content_json: versionedContent,
        status: editData.status,
      } : current);
      setEditData((current) => ({ ...current, content: versionedContent, status: editData.status }));
      persistedContentRef.current = versionedContent;
      latestEditContentRef.current = versionedContent;
      setCurrentContentDocument(
        getCollaborationRoomId('production', production.id),
        production.topic_title || `创作 ${production.id}`,
      );
      setSelectedVersionId('current');
      setSuperseded(null);

      const refreshed = await fetchData({ notifyOnFailure: false });
      if (refreshed === 'stale') return;
      if (refreshed === 'failed') {
        setConfirmedVersionRefreshPending(true);
        addNotification({
          title: '版本已保存，详情未刷新',
          message: `服务端已确认版本 ${savedVersion}；当前正文已保留。请只重试读取详情，不要重复保存或创建版本。`,
          type: 'warning',
        });
        return;
      }

      addNotification({
        title: versionAction === 'major' ? '已另开新版' : '小修已保存',
        message: `当前版本已更新为 ${savedVersion}`,
        type: 'success',
      });
    } catch (error) {
      if (transitionWriteStarted && isAmbiguousProductionTransitionError(error)) {
        await verifyPendingStatusTransition();
        return;
      }
      if (transitionWriteStarted) updatePendingStatusTransition(null);
      addNotification({
        title: '保存失败',
        message: getUserFacingErrorMessage(error, '创作版本保存失败，请检查后重试。'),
        type: 'error',
      });
    } finally {
      productionMutationLockRef.current = false;
      setVersionSaving(null);
    }
  };

  const handleSubmitReview = async (confirmedRetry = false) => {
    const pendingRecovery = pendingStatusTransitionRef.current;
    const retryingRecovery = confirmedRetry && pendingRecovery?.phase === 'ready'
      && pendingRecovery.operation === 'review-submit' && pendingRecovery.targetStatus === 'review';
    if (pendingRecovery && !retryingRecovery) return;
    if (!production || !canEditSelectedVersion || superseded || productionMutationLockRef.current || confirmedRefreshLockRef.current) return;
    if (retryingRecovery && (production.status !== pendingRecovery.previousStatus || authUser?.id !== pendingRecovery.userId)) {
      await verifyPendingStatusTransition();
      return;
    }

    productionMutationLockRef.current = true;
    setReviewSubmitPhase('preparing');
    let transitionWriteStarted = false;
    try {
      const flushResult = await flushReviewEditor();
      if (flushResult.status !== 'synced') {
        const message = flushResult.status === 'timed_out'
          ? '编辑器仍在保存，请稍后重试提交审核。'
          : flushResult.status === 'cancelled'
            ? '编辑器保存已中断，请刷新确认正文后再提交审核。'
            : '正文保存未确认，请检查编辑器提示并重试后再提交审核。';
        addNotification({ title: '正文尚未确认保存', message, type: 'error' });
        return;
      }

      const submittedContent = getFlushedProductionEditorContent();
      await prepareStatusTransition(
        'review-submit',
        production.status,
        'review',
        submittedContent,
        retryingRecovery ? pendingRecovery : undefined,
      );
      setReviewSubmitPhase('submitting');
      transitionWriteStarted = true;
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: submittedContent,
        expected_content: persistedContentRef.current,
        status: 'review',
        version_action: 'none',
      });

      updatePendingStatusTransition(null);
      persistedContentRef.current = submittedContent;
      latestEditContentRef.current = submittedContent;
      setProduction((current) => current?.id === production.id ? {
        ...current,
        content: submittedContent,
        content_markdown: submittedContent,
        content_json: submittedContent,
        status: 'review',
      } : current);
      setEditData((current) => ({ ...current, content: submittedContent, status: 'review' }));

      confirmedRefreshLockRef.current = true;
      setConfirmedReviewRefreshPending(true);
      const refreshed = await fetchData({ notifyOnFailure: false });
      if (refreshed === 'stale') return;
      if (refreshed === 'failed') {
        setConfirmedReviewRefreshPending(true);
        addNotification({
          title: '审核已提交，详情未刷新',
          message: '服务端已确认提交审核，创作状态和正文已保留；详情或历史暂未刷新。请只重新读取确认，不要重复提交审核。',
          type: 'warning',
        });
        return;
      }

      addNotification({
        title: '提交成功',
        message: '创作内容已提交审核',
        type: 'success',
      });
    } catch (error) {
      if (transitionWriteStarted && isAmbiguousProductionTransitionError(error)) {
        await verifyPendingStatusTransition();
        return;
      }
      if (transitionWriteStarted) updatePendingStatusTransition(null);
      addNotification({
        title: '提交失败',
        message: getUserFacingErrorMessage(error, '创作内容提交失败，请检查后重试。'),
        type: 'error',
      });
    } finally {
      productionMutationLockRef.current = false;
      setReviewSubmitPhase(null);
    }
  };

  const handleStatusUpdate = async (status: string, confirmedRetry = false) => {
    const canUpdateStatus = canEditSelectedVersion || (status === 'approved' && canReviewProduction);
    const pendingRecovery = pendingStatusTransitionRef.current;
    const retryingRecovery = confirmedRetry && pendingRecovery?.phase === 'ready'
      && pendingRecovery.operation === 'status-update' && pendingRecovery.targetStatus === status;
    if (pendingRecovery && !retryingRecovery) return;
    if (!production || !canUpdateStatus || superseded || productionMutationLockRef.current || confirmedRefreshLockRef.current) return;
    if (retryingRecovery && (production.status !== pendingRecovery.previousStatus || authUser?.id !== pendingRecovery.userId)) {
      await verifyPendingStatusTransition();
      return;
    }

    productionMutationLockRef.current = true;
    setStatusUpdating(true);
    let transitionWriteStarted = false;
    try {
      const reviewOnlyApproval = status === 'approved' && canReviewProduction && !canEditSelectedVersion;
      let statusUpdateContent = production.content || '';
      if (!reviewOnlyApproval) {
        if (!await flushProductionEditorBeforeMutation()) return;
        statusUpdateContent = getFlushedProductionEditorContent();
      }
      await prepareStatusTransition(
        'status-update',
        production.status,
        status,
        statusUpdateContent,
        retryingRecovery ? pendingRecovery : undefined,
      );
      transitionWriteStarted = true;
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: statusUpdateContent,
        expected_content: persistedContentRef.current,
        status,
        version_action: 'none',
      });

      updatePendingStatusTransition(null);
      confirmedRefreshLockRef.current = true;
      setConfirmedStatusRefreshPending(true);
      persistedContentRef.current = statusUpdateContent;
      latestEditContentRef.current = statusUpdateContent;
      setProduction((current) => current?.id === production.id ? {
        ...current,
        content: statusUpdateContent,
        content_markdown: statusUpdateContent,
        content_json: statusUpdateContent,
        status,
      } : current);
      setEditData((current) => ({ ...current, content: statusUpdateContent, status }));

      if (status === 'approved') celebrateMilestone();

      const refreshed = await fetchData({ notifyOnFailure: false });
      if (refreshed === 'stale') return;
      if (refreshed === 'failed') {
        setConfirmedStatusRefreshPending(true);
        addNotification({
          title: '状态已更新，详情未刷新',
          message: `服务端已确认状态更新为“${productionStatusLabel(status)}”；正文已保留。请只重新读取详情，不要重复更新状态。`,
          type: 'warning',
        });
        return;
      }
      addNotification({
        title: '状态更新成功',
        message: '创作状态已同步',
        type: 'success',
      });
    } catch (error) {
      if (transitionWriteStarted && isAmbiguousProductionTransitionError(error)) {
        await verifyPendingStatusTransition();
        return;
      }
      if (transitionWriteStarted) updatePendingStatusTransition(null);
      addNotification({
        title: '更新失败',
        message: getUserFacingErrorMessage(error, '创作状态更新失败，请检查后重试。'),
        type: 'error',
      });
    } finally {
      productionMutationLockRef.current = false;
      setStatusUpdating(false);
    }
  };

  const handleDelete = async (confirmedRetry = false) => {
    const pendingRecovery = pendingStatusTransitionRef.current;
    const retryingRecovery = confirmedRetry && pendingRecovery?.phase === 'ready' && pendingRecovery.operation === 'delete';
    if (pendingRecovery && !retryingRecovery) return;
    if (!production || productionMutationLockRef.current || confirmedRefreshLockRef.current) return;
    if (retryingRecovery && ((production.version || 'v1.0') !== pendingRecovery.previousVersion
      || production.status !== pendingRecovery.previousStatus || authUser?.id !== pendingRecovery.userId)) {
      await verifyPendingStatusTransition();
      return;
    }

    productionMutationLockRef.current = true;
    setDeleting(true);
    let transitionWriteStarted = false;
    try {
      if (!await flushProductionEditorBeforeMutation()) return;
      await prepareStatusTransition(
        'delete',
        production.status,
        'deleted',
        getFlushedProductionEditorContent(),
        retryingRecovery ? pendingRecovery : undefined,
        { previousVersion: production.version || 'v1.0' },
      );
      setShowDeleteModal(false);
      transitionWriteStarted = true;
      await deleteProduction(production.id);
      updatePendingStatusTransition(null);
      addNotification({ title: '删除成功', message: '创作记录已删除', type: 'success' });
      navigate('/production');
    } catch (error) {
      if (transitionWriteStarted && isAmbiguousProductionTransitionError(error)) {
        await verifyPendingStatusTransition();
        return;
      }
      if (transitionWriteStarted) updatePendingStatusTransition(null);
      addNotification({ title: '删除失败', message: getUserFacingErrorMessage(error, '创作记录删除失败，请检查后重试。'), type: 'error' });
    } finally {
      productionMutationLockRef.current = false;
      setDeleting(false);
    }
  };

  if (loading && !recoveryReadInFlight) {
    return (
      <PageShell>
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">正在加载创作稿件…</span>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <StudioSkeletonCard />
          <StudioSkeletonCard />
        </div>
        <StudioSkeletonCard />
      </PageShell>
    );
  }

  if (!production) {
    if (pendingStatusTransition) {
      return (
        <PageShell>
          <GlassPanel className="flex flex-wrap items-center justify-between gap-3 border-studio-amber/30 bg-studio-amber/10 p-4" role="alert">
            <div className="min-w-0">
              <p className="font-semibold text-studio-amber-contrast">{pendingStatusTransition.operation === 'delete' ? '删除结果仍待核实' : '上次写入仍待核实'}</p>
              <p className="mt-1 text-sm text-studio-text-secondary">{statusTransitionReadError || (pendingStatusTransition.operation === 'delete' ? '服务器记录状态尚未读取；为避免重复删除，当前页面保持只读。' : '服务器详情尚未读取；为避免重复提交，当前页面保持只读。')}</p>
            </div>
            <ActionButton onClick={() => void verifyPendingStatusTransition()} disabled={pendingStatusTransition.phase === 'checking'} aria-busy={pendingStatusTransition.phase === 'checking'} variant="primary" className="shrink-0">
              {pendingStatusTransition.phase === 'checking' ? '正在只读核实…' : pendingStatusTransition.operation === 'delete' ? '只读核实删除结果' : '只读核实状态'}
            </ActionButton>
          </GlassPanel>
        </PageShell>
      );
    }
    if (detailLoadError) {
      return (
        <PageShell>
          <ErrorState
            title="暂时无法读取创作详情"
            description={detailLoadError}
            actionText={loading ? '正在重新读取…' : '重新读取创作详情'}
            onRetry={() => void fetchData({ notifyOnFailure: false })}
          />
        </PageShell>
      );
    }
    return (
      <PageShell>
        <EmptyState icon={FileText} title="创作记录不存在" description="该稿件可能已被删除或你暂时没有访问权限。" />
      </PageShell>
    );
  }

  const statusTone = STATUS_TONE[production.status] || 'muted';
  const statusLabel = productionStatusLabel(production.status);
  const syncLabel = editorStateLabel(syncStatus);
  const editorLocked = Boolean(superseded);
  const readOnlyReason = requestedHistoryUnavailable
    ? `引用的历史版本 ${requestedVersion} 暂不可用，本页不会用当前正文替代它。`
    : selectedVersion && !selectedVersion.isCurrent
      ? '当前显示的是历史版本，仅供查看。返回当前版本后，页面会重新按编辑权限判断是否可修改。'
      : editorLocked
        ? null
        : permissionsLoading
          ? '正在确认创作更新权限；确认前只开放正文与版本信息查看。'
          : !hasPermission('production:update')
            ? '当前账号缺少创作更新权限；可以查看正文和版本信息，保存需由具备更新权限且有权操作关联选题的协作者完成。'
            : production.can_edit === false
              ? '当前账号不在这篇稿件的编辑范围内；可以查看正文和版本信息，需由有权操作关联选题的协作者保存。'
              : !canEditProduction
                ? '暂未确认这篇稿件的编辑范围；当前仅开放查看，请稍后重新读取详情。'
                : null;
  const saveMethodLabel = requestedHistoryUnavailable
    ? '引用版本不可用'
    : selectedVersion?.isCurrent
      ? editorLocked
        ? '当前版本已被替代，仅可查看'
        : hasProductionMutation
          ? '保存或状态处理中'
          : permissionsLoading
            ? '正在确认编辑权限'
            : canEditSelectedVersion
              ? '正文自动保存'
              : '只读查看'
      : '历史只读预览';
  const canManageProductionResources = canEditSelectedVersion
    && production?.status !== 'approved'
    && selectedVersionId === 'current'
    && !editorLocked
    && !hasProductionMutation
    && hasPermission('production:update')
    && hasPermission('resource:view');

  const insertResourceReference = (resource: ResourceReference, excerpt?: string): boolean => {
    if (!canManageProductionResources || !selectedVersion?.isCurrent || !outlineEditorHandleRef.current) return false;
    const html = buildResourceReferenceHtml(resource, excerpt);
    return Boolean(html && outlineEditorHandleRef.current.appendHtml(html));
  };

  return (
    <PageShell className={writingFocused ? 'space-y-3' : ''}>
      <style>{`
        .production-preview mark {
          border-radius: 2px;
          padding: 0 2px;
        }
        .production-preview mark[data-color="yellow"],
        .production-preview mark:not([data-color]) { background-color: rgba(248, 184, 78, 0.35); }
        .production-preview mark[data-color="green"] { background-color: rgba(32, 214, 155, 0.3); }
        .production-preview mark[data-color="blue"] { background-color: rgba(79, 124, 255, 0.32); }
        .production-preview mark[data-color="red"] { background-color: rgba(255, 95, 122, 0.3); }
        .production-preview mark[data-color="purple"] { background-color: rgba(139, 92, 246, 0.32); }
        .production-preview mark[data-color="orange"] { background-color: rgba(248, 184, 78, 0.28); }
        .production-preview mark[data-color="gray"] { background-color: rgba(148, 163, 184, 0.22); }
        .production-preview mark[data-color="cyan"] { background-color: rgba(34, 211, 238, 0.28); }
        .production-preview em,
        .production-preview i { font-style: italic; }
        .production-preview p[style*="text-indent"] { text-indent: 2em; }
      `}</style>

      <GlassPanel className={writingFocused ? 'hidden' : 'overflow-hidden'}>
        <div className="flex flex-col gap-4 border-b border-studio-border-soft bg-[var(--xmt-overlay-tint)] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ActionButton
              type="button"
              variant="icon"
              onClick={() => navigate('/production')}
              aria-label="返回创作管理"
              className="mt-1 !h-10 !w-10 !min-h-10 !min-w-10 !p-2"
              title="返回创作管理"
            >
              <ChevronLeft className="h-5 w-5" />
            </ActionButton>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <PageHeading className="max-w-[48rem] text-xl font-bold leading-snug text-studio-text-primary">
                  {production.topic_title || '稿件创作工作台'}
                </PageHeading>
                <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                <StatusPill tone={syncTone(syncStatus)}>
                  <Wifi className="h-3.5 w-3.5" />
                  {syncLabel}
                </StatusPill>
                <StatusPill tone={editorLocked ? 'coral' : 'success'}>{editorLocked ? `检测到新大版本 ${superseded?.toVersion}` : `${canEditSelectedVersion && !hasProductionMutation ? '正在编辑' : '正在查看'}当前最新版本 ${production.version || 'v1.0'}`}</StatusPill>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                <span>{production.version || 'v1.0'}</span>
                <ActionButton type="button" variant="ghost" onClick={() => navigate(`/topics/${production.topic_id}`)} className="min-h-10 !justify-start !px-0 text-xs font-normal text-studio-cyan-contrast hover:text-studio-primary-contrast">
                  {topic?.title || production.topic_title || '关联选题'}
                </ActionButton>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatBeijingTime(production.updated_at)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="h-3.5 w-3.5" />
                  {timelineView.timeline.length} 个时间轴节点
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {production.operator_name || '当前协作者'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canFocusWrite && (
              <ActionButton onClick={continueFromOutline} disabled={outlineHeadings.length === 0 || !outlineEditorReady || hasProductionMutation} className="px-3 py-2" title={outlineHeadings.length === 0 ? '请先在选题大纲中设置标题' : `补入 ${outlineHeadings.length} 个大纲标题中尚未写入正文的小节`}>
                按大纲续写
              </ActionButton>
            )}
            {canFocusWrite && (
              <ActionButton onClick={() => setWritingFocused(true)} disabled={hasProductionMutation} className="px-3 py-2">
                专注写作
              </ActionButton>
            )}
            <ActionButton onClick={() => setShowSidebar((prev) => !prev)} aria-expanded={showSidebar} className="px-3 py-2" title={showSidebar ? '收起版本历史' : '展开版本历史'}>
              {showSidebar ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
              版本历史
            </ActionButton>
            {!requestedHistoryUnavailable && selectedVersion && !selectedVersion.isCurrent ? <ActionButton onClick={() => setSelectedVersionId('current')} disabled={hasProductionMutation} className="px-3 py-2">
              <FileText className="h-4 w-4" />
              返回当前版本
            </ActionButton> : null}
            {(canEditSelectedVersion && production.status !== 'approved') || canReviewProduction ? (
              <ActionButton
                onClick={() => production.status === 'draft' ? void handleSubmitReview() : void handleStatusUpdate(NEXT_STATUSES[production.status])}
                variant="primary"
                className="px-3 py-2"
                data-testid={production.status === 'review' ? 'production-review-approve' : undefined}
                disabled={hasProductionMutation}
                aria-busy={hasProductionMutation}
              >
                <ArrowRight className="h-4 w-4" />
                {production.status === 'draft'
                  ? reviewSubmitPhase === 'preparing' ? '正在确认正文保存…' : reviewSubmitPhase === 'submitting' ? '正在提交审核…' : '提交审核'
                  : statusUpdating ? '状态处理中…' : versionSaving ? '版本保存中…' : deleting ? '正在删除…' : production.status === 'review' ? '审核通过' : '重新编辑'}
              </ActionButton>
            ) : production.status === 'approved' ? (
              <ActionButton onClick={() => navigate(`/shooting?topicId=${encodeURIComponent(String(production.topic_id))}`)} variant="primary" disabled={hasProductionMutation} className="px-3 py-2">
                <ArrowRight className="h-4 w-4" />
                成片制作
              </ActionButton>
            ) : null}
            {canDelete ? (
              <ActionButton
                onClick={() => setShowDeleteModal(true)}
                disabled={hasProductionMutation}
                aria-busy={deleting}
                className="border-studio-coral/35 px-3 py-2 text-studio-coral-contrast hover:bg-studio-coral/10"
                title="删除创作记录"
              >
                <Trash2 className="h-4 w-4" />
              </ActionButton>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 px-4 py-3 text-xs text-studio-text-secondary md:grid-cols-4">
          <div>
            <p className="text-studio-text-muted">当前版本</p>
            <p className="mt-1 font-semibold text-studio-text-primary">{selectedVersion?.version || production.version}</p>
          </div>
          <div>
            <p className="text-studio-text-muted">版本状态</p>
            <p className="mt-1 font-semibold text-studio-text-primary">{versionChangeLabel(selectedVersion?.changeType)}</p>
          </div>
          <div>
            <p className="text-studio-text-muted">保存方式</p>
            <p className="mt-1 font-semibold text-studio-text-primary" data-testid="production-save-method">{saveMethodLabel}</p>
          </div>
          <div>
            <p className="text-studio-text-muted">审核状态</p>
            <p className="mt-1 font-semibold text-studio-text-primary">{statusLabel}</p>
          </div>
        </div>
      </GlassPanel>

      <div className={writingFocused ? 'hidden' : ''}>
        {selectedVersion?.isCurrent ? (
          <ProductionResourcesPanel
            key={production.id}
            productionId={production.id}
            canManage={canManageProductionResources}
            manuscriptHtml={editData.content}
            referenceReady={outlineEditorReady}
            onInsertReference={insertResourceReference}
            onLeaveStateChange={handleMaterialDraftLeaveStateChange}
            onRegisterLeaveActions={handleRegisterMaterialDraftLeaveActions}
          />
        ) : selectedVersion ? (
          <ProductionMaterialHistorySnapshot
            key={selectedVersion.id}
            version={selectedVersion.version}
            snapshotHtml={selectedVersion.materialDraftSnapshotHtml}
          />
        ) : null}
      </div>

      <div className={`grid items-start gap-6 ${writingFocused ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
        <div className="min-w-0 space-y-5">
        <GlassPanel className="min-w-0 overflow-visible">
          {pendingStatusTransition ? (
            <div data-testid="production-status-transition-recovery" role="alert" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-studio-amber-contrast">
                  {pendingStatusTransition.phase === 'ready'
                    ? pendingStatusTransition.operation === 'version-save'
                      ? `服务器仍为版本 ${pendingStatusTransition.previousVersion}`
                      : pendingStatusTransition.operation === 'delete'
                        ? '服务器仍保留该创作记录'
                        : `服务器仍为“${productionStatusLabel(pendingStatusTransition.previousStatus)}”`
                    : pendingStatusTransition.phase === 'checking'
                      ? pendingStatusTransition.operation === 'delete' ? '正在只读核实删除结果' : '正在只读核实状态'
                      : pendingStatusTransition.operation === 'delete' ? '上次删除仍待核实' : '上次状态操作仍待核实'}
                </p>
                <p className="mt-1 text-sm text-studio-text-secondary">
                  {pendingStatusTransition.phase === 'ready'
                    ? pendingStatusTransition.operation === 'version-save'
                      ? '版本和正文已核实，尚未创建新版本。系统没有自动重试；确认后才会再次保存。'
                      : pendingStatusTransition.operation === 'delete'
                        ? '版本、状态和正文已核实未变化；系统没有自动重试删除。确认后才会再次删除。'
                        : '正文已核实，系统没有自动重试。确认后才会再次发送状态操作。'
                    : statusTransitionReadError || '为避免重复提交，编辑、保存和其他状态操作已锁定。'}
                </p>
              </div>
              {pendingStatusTransition.phase === 'ready' ? (
                <ActionButton
                  data-testid="production-status-transition-confirm-retry"
                  onClick={() => pendingStatusTransition.operation === 'review-submit'
                    ? void handleSubmitReview(true)
                    : pendingStatusTransition.operation === 'version-save'
                      ? pendingStatusTransition.versionAction ? void handleVersionedSave(pendingStatusTransition.versionAction, true) : undefined
                      : pendingStatusTransition.operation === 'delete'
                        ? void handleDelete(true)
                        : void handleStatusUpdate(pendingStatusTransition.targetStatus, true)}
                  disabled={productionMutationLockRef.current || statusUpdating || reviewSubmitPhase !== null}
                  variant="primary"
                  className="shrink-0"
                >
                  {reviewSubmitPhase !== null
                    ? reviewSubmitPhase === 'submitting' ? '正在提交审核…' : '正在准备提交…'
                    : statusUpdating ? '正在更新状态…'
                      : pendingStatusTransition.operation === 'review-submit'
                        ? '确认后重试提交审核'
                        : pendingStatusTransition.operation === 'version-save'
                          ? `确认后重试：${pendingStatusTransition.versionAction === 'major' ? '另开新版' : '小修保存'}`
                          : pendingStatusTransition.operation === 'delete'
                            ? '确认后重试删除'
                            : `确认后重试：${productionStatusLabel(pendingStatusTransition.targetStatus)}`}
                </ActionButton>
              ) : (
                <ActionButton
                  data-testid="production-status-transition-verify"
                  onClick={() => void verifyPendingStatusTransition()}
                  disabled={pendingStatusTransition.phase === 'checking' || statusUpdating || reviewSubmitPhase !== null || versionSaving !== null || deleting}
                  aria-busy={pendingStatusTransition.phase === 'checking' || statusUpdating || reviewSubmitPhase !== null || versionSaving !== null || deleting}
                  variant="primary"
                  className="shrink-0"
                >
                  {pendingStatusTransition.phase === 'checking' ? '正在只读核实…' : reviewSubmitPhase === 'submitting' ? '正在提交审核…' : statusUpdating ? '正在更新状态…' : versionSaving ? '正在保存版本…' : deleting ? '正在删除…' : pendingStatusTransition.operation === 'delete' ? '只读核实删除结果' : '只读核实状态'}
                </ActionButton>
              )}
            </div>
          ) : null}
          {productionAutosaveRecovery ? (
            <div data-testid="production-autosave-recovery" role="alert" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-studio-amber-contrast">
                  {productionAutosaveRecovery.phase === 'ready'
                    ? '本机草稿已保留，等待你确认保存'
                    : productionAutosaveRecovery.phase === 'checking'
                      ? '正在只读核实自动保存结果'
                      : '上次自动保存结果仍待核实'}
                </p>
                <p className="mt-1 text-sm text-studio-text-secondary">
                  {productionAutosaveRecoveryReadError || (productionAutosaveRecovery.phase === 'ready'
                    ? '已确认服务器正文未被覆盖；系统没有自动重试。确认后才会再次保存本机草稿。'
                    : '为避免重复覆盖，正文编辑、状态和版本操作已暂停。只读核实不会写入服务器。')}
                </p>
              </div>
              {productionAutosaveRecovery.phase === 'ready' ? (
                <ActionButton
                  data-testid="production-autosave-confirm-retry"
                  onClick={() => void retryProductionAutosave()}
                  disabled={!canEditSelectedVersion || productionAutosaveRetrying}
                  aria-busy={productionAutosaveRetrying}
                  variant="primary"
                  className="shrink-0"
                >
                  {productionAutosaveRetrying ? '正在核实并保存…' : '确认后重试保存本机草稿'}
                </ActionButton>
              ) : (
                <ActionButton
                  data-testid="production-autosave-verify"
                  onClick={() => void verifyProductionAutosaveRecovery(productionAutosaveRecovery)}
                  disabled={productionAutosaveRecovery.phase === 'checking'}
                  aria-busy={productionAutosaveRecovery.phase === 'checking'}
                  variant="primary"
                  className="shrink-0"
                >
                  {productionAutosaveRecovery.phase === 'checking' ? '正在只读核实…' : '只读核实服务器正文'}
                </ActionButton>
              )}
            </div>
          ) : null}
          {productionAutosaveRecoveryBlocked && !productionAutosaveRecovery ? (
            <div data-testid="production-autosave-recovery-blocked" role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-coral/30 bg-studio-coral/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-studio-coral-contrast">本机保存状态无法读取</p>
                <p className="mt-1 text-sm text-studio-text-secondary">{productionAutosaveRecoveryReadError || '为避免覆盖正文，当前稿件保持只读。'}</p>
              </div>
              <ActionButton
                data-testid="production-autosave-recovery-reread"
                onClick={() => {
                  productionAutosaveRecoveryCheckRef.current = '';
                  setProductionAutosaveRecoveryHydratedFor('');
                  setProductionAutosaveRecoveryBlocked(false);
                }}
                className="shrink-0 px-3 py-2"
              >
                重新读取恢复状态
              </ActionButton>
            </div>
          ) : null}
          {productionAutosaveDraftBlocked ? (
            <div data-testid="production-autosave-draft-storage-error" role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-coral/30 bg-studio-coral/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-studio-coral-contrast">本机草稿暂未保存</p>
                <p className="mt-1 text-sm text-studio-text-secondary">{productionAutosaveRecoveryReadError || '请检查浏览器存储空间。保存恢复前，正文和状态操作会暂停。'}</p>
              </div>
              <ActionButton data-testid="production-autosave-draft-storage-retry" onClick={retryProductionAutosaveDraftStorage} className="shrink-0 px-3 py-2">
                重试保存本机草稿
              </ActionButton>
            </div>
          ) : null}
          {productionAutosaveConflictDraft ? (
            <div data-testid="production-autosave-conflict" role="alert" aria-live="polite" className="space-y-3 border-b border-studio-coral/30 bg-studio-coral/10 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-studio-coral-contrast">服务器稿件已由其他操作更新</p>
                  <p className="mt-1 text-sm text-studio-text-secondary">当前正文显示服务器版本；你的本机草稿已单独保留。请核对草稿后再明确恢复，不会自动覆盖协作者内容。</p>
                </div>
                <ActionButton
                  data-testid="production-autosave-restore-conflict"
                  onClick={() => void restoreProductionAutosaveConflictDraft()}
                  disabled={!canEditSelectedVersion || productionAutosaveRetrying}
                  aria-busy={productionAutosaveRetrying}
                  variant="primary"
                  className="shrink-0"
                >
                  {productionAutosaveRetrying ? '正在核对服务器…' : '核对后恢复本机草稿并保存'}
                </ActionButton>
              </div>
              <details className="rounded-xl border border-studio-border-soft bg-studio-surface/70 p-3">
                <summary className="cursor-pointer text-sm font-medium text-studio-text-primary">查看本机保留的草稿（服务器版本 {productionAutosaveConflictDraft.serverVersion}）</summary>
                <div className="editor-content-preview tiptap prose mt-3 max-w-none break-words text-sm text-studio-text-primary" dangerouslySetInnerHTML={{ __html: sanitizeHtml(productionAutosaveConflictDraft.content) }} />
              </details>
            </div>
          ) : null}
          {superseded ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-coral/30 bg-studio-coral/10 px-4 py-3" role="status" aria-live="polite">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-studio-coral-contrast">这份稿件已有更新版本</p>
                <p className="mt-1 text-sm text-studio-text-secondary">
                  {superseded.createdBy.name} 已创建 {superseded.toVersion}。当前 {superseded.fromVersion} 已转为只读；可进入最新版本查看，并按该版本权限继续操作。
                </p>
              </div>
              <ActionButton onClick={() => void fetchData()} variant="primary" className="shrink-0">
                查看最新版本
              </ActionButton>
            </div>
          ) : null}
          {confirmedVersionRefreshPending && production ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-4 py-3">
              <p className="min-w-0 text-sm text-studio-amber-contrast">
                服务端已确认版本 {production.version}，正文已保留；版本历史暂未刷新。请只重新读取详情，不要重复保存或创建版本。
              </p>
              <ActionButton onClick={() => void fetchData({ notifyOnFailure: false, recovery: true })} disabled={loading} aria-busy={loading} variant="primary" className="shrink-0">
                {loading ? '正在重新读取…' : '只重试读取详情'}
              </ActionButton>
            </div>
          ) : null}
          {confirmedReviewRefreshPending && production ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-4 py-3">
              <p className="min-w-0 text-sm text-studio-amber-contrast">
                服务端已确认提交审核，当前状态为审核中，正文已保留；详情或历史暂未刷新。请只重新读取确认，不要重复提交审核。
              </p>
              <ActionButton onClick={() => void fetchData({ notifyOnFailure: false, recovery: true })} disabled={loading} aria-busy={loading} variant="primary" className="shrink-0">
                {loading ? '正在重新读取…' : '只重试读取详情'}
              </ActionButton>
            </div>
          ) : null}
          {confirmedStatusRefreshPending && production ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-4 py-3">
              <p className="min-w-0 text-sm text-studio-amber-contrast">
                服务端已确认状态更新为“{statusLabel}”，正文已保留；详情暂未刷新。请只重新读取详情，不要重复更新状态。
              </p>
              <ActionButton onClick={() => void fetchData({ notifyOnFailure: false, recovery: true })} disabled={loading} aria-busy={loading} variant="primary" className="shrink-0">
                {loading ? '正在重新读取…' : '只重试读取详情'}
              </ActionButton>
            </div>
          ) : null}
          {confirmedDeleteRefreshPending && production ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-4 py-3">
              <p className="min-w-0 text-sm text-studio-amber-contrast">
                服务器确认创作记录仍存在，但版本、状态或正文已变化；本次删除没有重试。请只重新读取详情，检查后再决定是否删除。
              </p>
              <ActionButton onClick={() => void fetchData({ notifyOnFailure: false, recovery: true })} disabled={loading} aria-busy={loading} variant="primary" className="shrink-0">
                {loading ? '正在重新读取…' : '只重试读取详情'}
              </ActionButton>
            </div>
          ) : null}
          {readOnlyReason ? (
            <div data-testid="production-readonly-reason" role="status" aria-live="polite" className="border-b border-studio-border-soft bg-studio-surface-soft px-4 py-3">
              <p className="text-sm font-semibold text-studio-text-primary">仅查看</p>
              <p className="mt-1 text-sm text-studio-text-secondary">{readOnlyReason}</p>
            </div>
          ) : null}
          {writingFocused && (
            <div className="sticky top-0 z-sticky flex flex-wrap items-center justify-between gap-2 border-b border-studio-border-soft bg-[var(--editor-panel)] px-4 py-2">
              <div className="flex min-w-0 items-center gap-2 text-xs text-studio-text-secondary">
                <span className="truncate font-semibold text-studio-text-primary">{production.topic_title || '当前稿件'}</span>
                <StatusPill tone={syncTone(syncStatus)}>{syncLabel}</StatusPill>
              </div>
              <ActionButton onClick={() => setWritingFocused(false)} className="px-3 py-1.5 text-xs">退出专注</ActionButton>
            </div>
          )}
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft bg-[var(--xmt-overlay-tint)] px-5 py-3 ${writingFocused ? 'hidden' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-studio-text-primary">{selectedVersion?.version || production.version}</span>
              <StatusPill tone={selectedVersion?.changeType === 'major' ? 'violet' : selectedVersion?.changeType === 'minor' ? 'primary' : 'success'}>
                {versionChangeLabel(selectedVersion?.changeType)}
              </StatusPill>
              {!selectedVersion?.isCurrent ? <span className="text-xs text-studio-text-muted">历史版本只读预览</span> : null}
            </div>
            {!selectedVersion?.isCurrent ? (
              <ActionButton onClick={() => setSelectedVersionId('current')} className="px-3 py-2">
                回到当前版本
              </ActionButton>
            ) : null}
          </div>

          {requestedHistoryUnavailable ? (
            <div role="alert" className="flex min-h-[300px] flex-col items-start justify-center gap-4 bg-studio-surface-soft p-6 lg:p-8">
              <div>
                <p className="text-sm font-semibold text-studio-coral-contrast">引用的历史版本 {requestedVersion} 暂不可用</p>
                <p className="mt-2 text-sm text-studio-text-secondary">为避免把当前稿误当作来源，本页不会替换显示当前正文。</p>
              </div>
              <ActionButton onClick={() => navigate(`/production/${production.id}`)} variant="primary" className="px-3 py-2">
                返回当前版本
              </ActionButton>
            </div>
          ) : selectedVersion?.isCurrent && canEditSelectedVersion && !editorLocked && !productionAutosaveConflictDraft ? (
            <div className="min-h-[300px] bg-[var(--editor-bg)]">
              <ContentEditor
                ariaLabel="成片正文编辑区"
                value={editData.content}
                onChange={(content) => {
                  latestEditContentRef.current = content;
                  persistProductionAutosaveDraft(content);
                  setEditData((prev) => ({ ...prev, content }));
                }}
                mode="rich"
                collaborationKey={getProductionVersionRoomId(production.id, production.version)}
                persistenceStatus={syncStatus}
                immersive
                focusMode={writingFocused}
                pageScroll
                adapter={productionEditorAdapter}
              readOnly={hasProductionMutation}
                onRuntimeHandleChange={handleRuntimeHandleChange}
                onEditorCommandHandleChange={handleOutlineEditorChange}
              />
            </div>
          ) : (
            <div className="min-h-[300px] bg-[var(--editor-bg)] p-6 lg:p-8">
              <ContentEditor
                ariaLabel="成片正文历史预览"
                value={sanitizeHtml(normalizeLegacyEditorHtmlTheme(
                  selectedVersion?.contentMarkdown ||
                    normalizeVersionContent(
                      (production as ProductionType & {
                        contentMarkdown?: string;
                        content_markdown?: string;
                      }).contentMarkdown ||
                        (production as ProductionType & { content_markdown?: string }).content_markdown,
                      production.content,
                    ),
                ))}
                mode="readonly"
                minHeight={300}
                className={`editor-content-preview production-preview tiptap prose max-w-none leading-relaxed text-studio-text-primary ${isDark ? 'prose-invert' : ''}`}
                onEditorCommandHandleChange={handleReviewEditorCommandHandleChange}
              />
            </div>
          )}
        </GlassPanel>
        <ProductionReviewPanel
          productionId={production.id}
          version={selectedVersion?.version || production.version}
          currentVersion={Boolean(selectedVersion?.isCurrent && !requestedHistoryUnavailable && !editorLocked)}
          canComment={Boolean(selectedVersion?.isCurrent && !requestedHistoryUnavailable && !editorLocked && hasPermission('workflow:comment'))}
          canAccept={Boolean(selectedVersion?.isCurrent && !requestedHistoryUnavailable && !editorLocked && !hasProductionMutation && canEditSelectedVersion && hasPermission('production:update'))}
          canModerate={hasPermission('comment:delete')}
          currentUserId={authUser?.id ?? null}
          editorHandle={reviewEditorHandle}
          flushEditor={flushReviewEditor}
          mutationsLocked={hasProductionMutation}
          beginAcceptingSuggestion={beginReviewSuggestionAccept}
          endAcceptingSuggestion={endReviewSuggestionAccept}
          onNotice={(title, message, type) => addNotification({ title, message, type })}
        />
        </div>

        <GlassPanel className={`flex flex-col self-start overflow-visible ${writingFocused ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between border-b border-studio-border-soft px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-studio-text-muted">版本历史</p>
              <h2 id="production-version-history-heading" className="mt-1 text-sm font-semibold text-studio-text-primary">版本记录</h2>
            </div>
            <ActionButton
              type="button"
              variant="icon"
              onClick={() => setShowSidebar((prev) => !prev)}
              className="!h-10 !w-10 !min-h-10 !min-w-10 !p-2"
              aria-expanded={showSidebar}
              aria-label={showSidebar ? '收起版本历史' : '展开版本历史'}
              title={showSidebar ? '收起版本历史' : '展开版本历史'}
            >
              {showSidebar ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
            </ActionButton>
          </div>

          <div className="space-y-5 p-5">
            <div className={`space-y-2 ${showSidebar ? '' : 'hidden'}`}>
              {sidebarVersionEntries.length > 0 ? (
                <div role="group" aria-labelledby="production-version-history-heading" className="space-y-2">
                  {sidebarVersionEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={selectedVersionId === entry.id}
                      onClick={() => handleSelectVersion(entry.id)}
                      disabled={requestedHistoryUnavailable || hasProductionMutation}
                      className={`w-full rounded-card border px-4 py-3 text-left transition ${
                        selectedVersionId === entry.id
                          ? 'border-studio-border-active bg-studio-primary/12 shadow-glow-primary'
                          : 'border-studio-border-soft bg-studio-surface-soft/70 hover:border-studio-border-active hover:bg-studio-surface-elevated/70'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-studio-text-primary">{entry.version}</span>
                        <StatusPill tone={selectedVersionId === entry.id && editorLocked ? 'coral' : entry.isCurrent ? 'success' : entry.versionState === 'superseded' ? 'coral' : 'muted'} className="px-2 py-0.5 text-[10px]">
                          {versionSyncLabel(entry, selectedVersionId === entry.id && editorLocked)}
                        </StatusPill>
                      </div>
                      <p className="mt-2 text-xs text-studio-text-muted">{entry.isCurrent ? formatBeijingTime(entry.createdAt) : formatUtcToBeijingTime(entry.createdAt)}</p>
                      <p className="mt-1 text-xs text-studio-text-secondary">{entry.operatorName || '系统记录'}</p>
                    </button>
                  ))}
                </div>
              ) : <EmptyState title="暂无版本历史" description="保存版本后会在这里形成时间线。" />}
              {history.length < historyTotal && <ActionButton type="button" variant="secondary" aria-busy={historyLoading} disabled={historyLoading || hasProductionMutation} onClick={() => void loadMoreHistory()} className="min-h-10 w-full px-3 py-2 text-sm">{historyLoading ? '正在加载历史版本…' : '查看更多历史版本'}</ActionButton>}
            </div>

            <ProductionOriginPanel
              sourceType={production.origin_source_type}
              sourceSnapshot={production.origin_source_content_snapshot}
              sourceOutlineVersion={production.origin_source_outline_version}
              sourceTopicId={production.origin_source_topic_id}
            />

            <div className="space-y-3 border-t border-studio-border-soft pt-5">
              <p className="text-xs font-semibold uppercase text-studio-text-muted">版本操作</p>
              {canEditSelectedVersion && !editorLocked && !requestedHistoryUnavailable && <ActionButton onClick={startEditing} disabled={hasProductionMutation} className="w-full">
                当前版本查看 / 编辑
              </ActionButton>}
              {canEditSelectedVersion && !editorLocked && !requestedHistoryUnavailable && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => handleVersionedSave('minor')} disabled={hasProductionMutation} aria-busy={versionSaving === 'minor'} className="min-w-0 flex-1 px-3 py-2">
                    <Save className="h-4 w-4" />
                    {versionSaving === 'minor' ? '正在保存…' : '小修保存'}
                  </ActionButton>
                  <ActionButton onClick={() => handleVersionedSave('major')} disabled={hasProductionMutation} aria-busy={versionSaving === 'major'} className="min-w-0 flex-1 px-3 py-2" variant="primary">
                    <Save className="h-4 w-4" />
                    {versionSaving === 'major' ? '正在保存…' : '另开新版'}
                  </ActionButton>
                </div>
              )}
              {canEditSelectedVersion && !editorLocked && !requestedHistoryUnavailable && editData.status === 'draft' ? (
                <ActionButton
                  onClick={() => void handleSubmitReview()}
                  variant="primary"
                  className="w-full"
                  disabled={hasProductionMutation}
                  aria-busy={hasProductionMutation}
                >
                  <ArrowRight className="h-4 w-4" />
                  {reviewSubmitPhase === 'preparing' ? '正在确认正文保存…' : reviewSubmitPhase === 'submitting' ? '正在提交审核…' : '提交审核'}
                </ActionButton>
              ) : null}
            </div>

            <div className="border-t border-studio-border-soft pt-5">
              <p className="text-xs font-semibold uppercase text-studio-text-muted">关联选题</p>
              <ActionButton type="button" variant="ghost" onClick={() => navigate(`/topics/${production.topic_id}`)} className="mt-2 min-h-10 !justify-start !px-0 text-left text-sm font-semibold text-studio-cyan-contrast hover:text-studio-primary-contrast">
                {topic?.title || production.topic_title || '-'}
              </ActionButton>
            </div>
          </div>
        </GlassPanel>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        title="确认删除"
        description="确定要删除这条创作记录吗？该操作不会改变选题数据，但创作记录将被移除。"
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        loading={deleting}
      />

      <BaseModal
        open={materialDraftLeaveDialogOpen}
        onClose={handleKeepMaterialDraftEditing}
        title="创作资料尚有本地修改"
        description="离开会放弃尚未确认的本地资料文字，不会自动覆盖服务器版本。需要保留时，请先复制文字。"
        size="sm"
        closeOnOverlayClick={false}
        closeOnEscape
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={handleKeepMaterialDraftEditing} className="xmt-btn xmt-btn-ghost min-h-10">继续留在此页</button>
            <button type="button" onClick={() => void handleCopyMaterialDraft()} className="xmt-btn xmt-btn-secondary min-h-10">复制本地文字</button>
            <button type="button" onClick={handleDiscardMaterialDraftAndLeave} disabled={!materialDraftLeaveState.canDiscard} className="xmt-btn xmt-btn-danger min-h-10">放弃资料并离开</button>
          </div>
        )}
      >
        <p className="text-sm leading-6 text-studio-text-secondary">
          {materialDraftCopyStatus === 'copied'
            ? '文字已复制到剪贴板。你可以继续留在此页，或确认放弃本地修改后离开。'
            : '如果服务器保存结果未确认或出现并发修改，离开后本地内容无法自动恢复。先复制可保留一份文字。'}
        </p>
        {materialDraftLeaveError ? <p role="alert" className="mt-3 text-sm text-studio-coral-contrast">{materialDraftLeaveError}</p> : null}
      </BaseModal>

      <EditorLeaveFailureDialog
        open={leaveGuardState === 'waiting_confirmation' && !leaveFailureDialogDismissed}
        state={leaveGuardState}
        result={leaveGuardResult}
        onContinueEditing={handleContinueEditing}
        onRetry={handleRetryLeave}
        onDiscardAndLeave={handleDiscardAndLeave}
      />
    </PageShell>
  );
}

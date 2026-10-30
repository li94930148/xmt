import { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import PageHeading from '@/components/common/PageHeading';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, useAppStore } from '../store';
import { getTopic, getTopicOutlineVersions, repairCurrentTopicStageRecord, auditTopic, updateTopicStatus, updateTopic, getProduction, createProduction, getProductionCreateStatus, getProductionById, TopicApiError } from '../api';
import { celebrateMilestone } from '../utils/confetti';
import { getUsers } from '../api';
import { Topic, User } from '../types';
import type { WorkflowDocumentVersion } from '../api';
import { ChevronLeft, Clock, User as UserIcon, Calendar, FileText, CheckCircle, XCircle, ArrowRight, Save, AlertTriangle, Camera, Scissors, Send, List, FileText as FileIcon } from 'lucide-react';
import ContentEditor from '../components/ContentEditor';
import BaseModal from '../components/common/BaseModal';
import ConfirmModal from '../components/common/ConfirmModal';
import LoadingState from '../components/common/LoadingState';
import { useModalLifecycle } from '../components/common/useModalLifecycle';
import { createTopicDetailManualAdapter } from '../editor/adapters/topicDetailManualAdapter';
import type { ContentEditorRuntimeHandle, ContentEditorSaveContext } from '../editor/contracts/contentEditorAdapter';
import { getCurrentTopicEditorModePolicy } from '../editor/topic/topicEditorModePolicy';
import { useTopicDetailLeaveGuard } from '../hooks/useTopicDetailLeaveGuard';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '../hooks/useRouteNavigationGuard';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { usePermission } from '../hooks/usePermission';
import { STATUS_COLORS, STATUS_TEXT } from '../constants';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';
import { getPlatformLabel } from '../platform/platform-labels';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import {
  TopicDetailAggregateSaveGate,
  buildTopicDetailDescription,
  buildTopicDetailUpdatePayload,
  cloneTopicDetailDraft,
  createTopicDetailDraft,
  topicDetailDraftEquals,
  type TopicDetailAggregateDraft,
  type TopicDetailFields,
  type TopicDetailParsedFields,
} from './topicDetailAggregateDraft';
import {
  clearInvalidTopicDetailSaveRecovery,
  markTopicDetailSaveRecoveryUncertain,
  persistTopicDetailSaveRecovery,
  readTopicDetailSaveRecovery,
  removeTopicDetailSaveRecovery,
  topicMatchesDetailSaveTarget,
  type TopicDetailSaveRecovery,
} from './topicDetailSaveRecovery';
import { canSaveTopicDetailDraft, resolveTopicDetailEditorBranch, type TopicDetailEditorBranch } from './topicDetailEditorBranch';
import TopicResourcesPanel from '../components/topic/TopicResourcesPanel';
import TopicAssetDimensionsPanel from '../components/topics/TopicAssetDimensionsPanel';
import {
  readTopicProductionCreateRecovery,
  startOrResumeTopicProduction,
  type TopicProductionCreateRecoveryRead,
  type TopicProductionHandoffAction,
} from '../utils/topicProductionHandoff';
import { ActionButton } from '../components/studio';
import { completeTopicStatusRecovery, isSameTopicStatusRecovery, type TopicStatusRecoveryIdentity } from './topicStatusRecovery';
import {
  isSameTopicAuditRecovery,
  persistTopicAuditRecovery,
  readTopicAuditRecovery,
  removeTopicAuditRecovery,
  resolveTopicAuditRecovery,
  topicHistoryHighWatermark,
  type PendingTopicAuditWrite,
  type TopicAuditRecovery,
} from './topicAuditRecovery';

type PendingTopicStatusWrite = TopicStatusRecoveryIdentity & {
  kind: 'write';
  before: Topic['status'];
  target: Topic['status'];
  createdAt: number;
};

type InvalidTopicStatusRecovery = TopicStatusRecoveryIdentity & {
  kind: 'invalid';
  reason: 'expired' | 'corrupt';
};

type TopicStatusRecovery = PendingTopicStatusWrite | InvalidTopicStatusRecovery;

type PendingWriteLeaveAttempt = {
  proceed: () => void;
  stay: () => void;
  kind: 'status' | 'audit';
};

const TOPIC_STATUS_RECOVERY_PREFIX = 'xmt:topic-status-pending:v1';
const TOPIC_STATUS_RECOVERY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TOPIC_STATUSES: readonly Topic['status'][] = ['pending', 'approved', 'production', 'shooting', 'publishing', 'completed', 'rejected'];

function topicStatusRecoveryKey(userId: number, topicId: number) {
  return `${TOPIC_STATUS_RECOVERY_PREFIX}:user:${userId}:topic:${topicId}`;
}

function isTopicStatus(value: unknown): value is Topic['status'] {
  return typeof value === 'string' && TOPIC_STATUSES.includes(value as Topic['status']);
}

function loadPendingTopicStatusWrite(userId: number | undefined, topicId: number | undefined): TopicStatusRecovery | null {
  if (!userId || !topicId || typeof window === 'undefined') return null;
  const key = topicStatusRecoveryKey(userId, topicId);
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return { kind: 'invalid', topicId, userId, reason: 'corrupt' };
  }
  if (raw === null) return null;

  try {
    const value = JSON.parse(raw) as Partial<PendingTopicStatusWrite>;
    if (value.kind !== 'write' || Number(value.topicId) !== topicId || Number(value.userId) !== userId
      || !isTopicStatus(value.before) || !isTopicStatus(value.target)
      || !Number.isFinite(value.createdAt) || Number(value.createdAt) <= 0) {
      return { kind: 'invalid', topicId, userId, reason: 'corrupt' };
    }
    if (Date.now() - Number(value.createdAt) > TOPIC_STATUS_RECOVERY_MAX_AGE_MS) {
      return { kind: 'invalid', topicId, userId, reason: 'expired' };
    }
    return {
      kind: 'write',
      topicId,
      userId,
      before: value.before,
      target: value.target,
      createdAt: Number(value.createdAt),
    };
  } catch {
    return { kind: 'invalid', topicId, userId, reason: 'corrupt' };
  }
}

function persistPendingTopicStatusWrite(pending: PendingTopicStatusWrite) {
  if (typeof window === 'undefined') throw new Error('当前环境无法保存阶段核实标记');
  const key = topicStatusRecoveryKey(pending.userId, pending.topicId);
  sessionStorage.setItem(key, JSON.stringify(pending));
  const stored = loadPendingTopicStatusWrite(pending.userId, pending.topicId);
  if (!stored || stored.kind !== 'write' || stored.target !== pending.target
    || stored.before !== pending.before || stored.createdAt !== pending.createdAt) {
    throw new Error('阶段核实标记未能完整保存，本次未发送状态更新');
  }
}

function removePendingTopicStatusWrite(userId: number, topicId: number, expected?: TopicStatusRecoveryIdentity) {
  if (typeof window === 'undefined') return;
  try {
    const key = topicStatusRecoveryKey(userId, topicId);
    if (expected && !isSameTopicStatusRecovery(loadPendingTopicStatusWrite(userId, topicId), expected)) return;
    sessionStorage.removeItem(key);
  } catch {
    // A remaining marker will trigger a read-only verification after reopening.
  }
}

export default function TopicDetail() {
  const { id } = useParams<{ id: string }>();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const currentUserRole = useAuthStore((state) => state.user?.role);
  const currentAuthToken = useAuthStore((state) => state.token);
  const currentTopicIdRef = useRef(id);
  currentTopicIdRef.current = id;
  const topicEditorModePolicy = useMemo(() => getCurrentTopicEditorModePolicy(), []);
  const [topic, setTopic] = useState<Topic | null>(null);
  const detailRequestSequenceRef = useRef(0);
  const [topicLoadFailure, setTopicLoadFailure] = useState<'not-found' | 'unavailable' | null>(null);
  const [topicDetailReload, setTopicDetailReload] = useState(0);
  const userDirectoryRequestSequenceRef = useRef(0);
  const [users, setUsers] = useState<User[]>([]);
  const [userDirectoryLoadState, setUserDirectoryLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loading, setLoading] = useState(true);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [auditNeedsVerification, setAuditNeedsVerification] = useState(false);
  const [auditVerificationNotice, setAuditVerificationNotice] = useState('');
  const [verifyingAudit, setVerifyingAudit] = useState(false);
  const [pendingTopicAuditRecovery, setPendingTopicAuditRecovery] = useState<TopicAuditRecovery | null>(null);
  const [auditRecoveryOutcome, setAuditRecoveryOutcome] = useState<'unknown' | 'retryable' | 'changed' | 'applied' | 'invalid' | null>(null);
  const [auditRecoveryReadyScope, setAuditRecoveryReadyScope] = useState('');
  const [showAuditRetryConfirm, setShowAuditRetryConfirm] = useState(false);
  const auditOverlayRef = useRef<HTMLDivElement>(null);
  const auditDialogTitleId = useId();
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [pendingTopicStatusWrite, setPendingTopicStatusWrite] = useState<TopicStatusRecovery | null>(null);
  const [statusRecoveryReadyScope, setStatusRecoveryReadyScope] = useState('');
  const [pendingStatusLeaveAttempt, setPendingStatusLeaveAttempt] = useState<PendingWriteLeaveAttempt | null>(null);
  const [statusVerificationNotice, setStatusVerificationNotice] = useState('');
  const [verifyingTopicStatus, setVerifyingTopicStatus] = useState(false);
  const [startingProduction, setStartingProduction] = useState(false);
  const handoffTopicId = Number(id);
  const handoffRecoveryScope = `${Number(currentUserId) || 0}:${handoffTopicId || 0}`;
  const [handoffRecoverySnapshot, setHandoffRecoverySnapshot] = useState<{
    scope: string;
    recovery: TopicProductionCreateRecoveryRead;
  } | null>(null);
  const handoffRecoveryLoaded = handoffRecoverySnapshot?.scope === handoffRecoveryScope;
  const handoffRecovery = handoffRecoveryLoaded ? handoffRecoverySnapshot.recovery : null;
  const [repairingStageRecord, setRepairingStageRecord] = useState(false);
  const auditSubmissionInFlightRef = useRef(false);
  const auditVerificationInFlightRef = useRef(false);
  const pendingTopicAuditRecoveryRef = useRef<TopicAuditRecovery | null>(pendingTopicAuditRecovery);
  const auditRecoveryOutcomeRef = useRef(auditRecoveryOutcome);
  const statusUpdateInFlightRef = useRef(false);
  const topicStatusVerificationInFlightRef = useRef(false);
  const pendingTopicStatusWriteRef = useRef<TopicStatusRecovery | null>(pendingTopicStatusWrite);
  const startProductionInFlight = useRef(false);
  const [auditData, setAuditData] = useState({ status: 'approved' as 'approved' | 'rejected', comment: '', assignee_id: 0 });
  const auditDismissalAllowed = !auditSubmitting && !auditNeedsVerification && !verifyingAudit;
  const closeAuditModal = useCallback(() => {
    if (!auditDismissalAllowed) return;
    setShowAuditModal(false);
  }, [auditDismissalAllowed]);
  useModalLifecycle(showAuditModal, auditOverlayRef, closeAuditModal, auditDismissalAllowed);
  
  const [editTitle, setEditTitle] = useState(false);
  const [editDetails, setEditDetails] = useState(false);
  const [editDescription, setEditDescription] = useState(false);
  const [editOutline, setEditOutline] = useState(false);
  
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState<TopicDetailFields>({ assignee_id: 0, deadline: '', platform: '' });
  const [description, setDescription] = useState('');
  const [scriptContent, setScriptContent] = useState('');
  const [parsedFields, setParsedFields] = useState<TopicDetailParsedFields>({ projectBackground: '', targetAudience: '' });
  const [isTopicDirty, setIsTopicDirty] = useState(false);
  const [isAggregateSaving, setIsAggregateSaving] = useState(false);
  const [topicSaveFeedback, setTopicSaveFeedback] = useState<string | null>(null);
  const [outlineVersions, setOutlineVersions] = useState<WorkflowDocumentVersion[]>([]);
  const [outlineVersionsLoadState, setOutlineVersionsLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const requestedOutlineCardRef = useRef<HTMLLIElement | null>(null);
  const pendingTopicVersionActionRef = useRef<'minor' | 'major' | null>(null);
  const baselineDraftRef = useRef<TopicDetailAggregateDraft | null>(null);
  const draftRef = useRef<TopicDetailAggregateDraft>({
    title: '', description: '', details: { assignee_id: 0, deadline: '', platform: '' }, outline: '',
    parsedFields: { projectBackground: '', targetAudience: '' },
  });
  const aggregateRevisionRef = useRef(0);
  const aggregateSaveGateRef = useRef(new TopicDetailAggregateSaveGate());
  const topicRuntimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
  const manualSaveSnapshotsRef = useRef(new Map<number, TopicDetailAggregateDraft>());
  const aggregatePersistCommandRef = useRef<(
    snapshot: TopicDetailAggregateDraft,
    revision: number,
    versionAction?: 'minor' | 'major',
  ) => Promise<void>>(async () => {
    throw new Error('Topic aggregate save command is not ready');
  });
  const [hasTopicManualRuntimeHandle, setHasTopicManualRuntimeHandle] = useState(false);
  const [topicEditorBranch, setTopicEditorBranch] = useState<TopicDetailEditorBranch>(() => (
    resolveTopicDetailEditorBranch(0, true, topicEditorModePolicy)
  ));
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appStore = useAppStore();
  const [topicSaveRecoveryMode, setTopicSaveRecoveryModeState] = useState<'none' | 'unknown' | 'retryable' | 'conflict' | 'invalid'>('none');
  const topicSaveRecoveryModeRef = useRef<'none' | 'unknown' | 'retryable' | 'conflict' | 'invalid'>('none');
  const topicSaveRecoveryRef = useRef<TopicDetailSaveRecovery | null>(null);
  const topicSaveConflictTopicRef = useRef<Topic | null>(null);
  const topicSaveVerificationInFlightRef = useRef(false);
  const retryingTopicSaveRef = useRef(false);
  const [verifyingTopicSave, setVerifyingTopicSave] = useState(false);
  const [topicSaveRecoveryNotice, setTopicSaveRecoveryNotice] = useState('');
  const reconcileTopicSaveReadbackRef = useRef<(recovery: TopicDetailSaveRecovery, latest: Topic, saveRevision?: number) => 'confirmed' | 'retryable' | 'conflict' | 'unknown'>(() => 'conflict');
  const setTopicSaveRecovery = (recovery: TopicDetailSaveRecovery | null, mode: 'none' | 'unknown' | 'retryable' | 'conflict' | 'invalid') => {
    topicSaveRecoveryRef.current = recovery;
    topicSaveRecoveryModeRef.current = mode;
    setTopicSaveRecoveryModeState(mode);
  };
  const applyDraft = (draft: TopicDetailAggregateDraft) => {
    draftRef.current = cloneTopicDetailDraft(draft);
    setTitle(draft.title);
    setDescription(draft.description);
    setDetails(draft.details);
    setParsedFields(draft.parsedFields);
    setScriptContent(draft.outline);
  };
  const userDirectoryScope = `${id ?? ''}:${currentUserId ?? ''}:${currentUserRole ?? ''}:${currentAuthToken ?? ''}`;
  const userDirectoryScopeRef = useRef(userDirectoryScope);
  userDirectoryScopeRef.current = userDirectoryScope;
  const topicStatusRecoveryScope = `${Number(currentUserId) || 0}:${Number(id) || 0}`;
  const topicAuditRecoveryScope = topicStatusRecoveryScope;
  const statusRecoveryNeedsVerificationRef = useRef(false);
  useEffect(() => {
    const actorId = Number(currentUserId);
    const topicId = Number(id);
    let recovery: TopicAuditRecovery | null = null;
    if (Number.isSafeInteger(actorId) && actorId > 0 && Number.isSafeInteger(topicId) && topicId > 0) {
      try {
        recovery = typeof window === 'undefined' ? null : readTopicAuditRecovery(window.sessionStorage, actorId, topicId);
      } catch {
        recovery = { kind: 'invalid', userId: actorId, topicId, reason: 'unavailable' };
      }
    }
    pendingTopicAuditRecoveryRef.current = recovery;
    auditRecoveryOutcomeRef.current = recovery ? recovery.kind === 'write' ? 'unknown' : 'invalid' : null;
    setPendingTopicAuditRecovery(recovery);
    setAuditRecoveryOutcome(auditRecoveryOutcomeRef.current);
    setAuditNeedsVerification(recovery !== null);
    setAuditVerificationNotice(recovery
      ? recovery.kind === 'write'
        ? '发现上次未完成的审核记录，正在只读核实；核实前不会再次提交。'
        : '审核恢复记录无法读取。为避免重复写入，只允许只读核实。'
      : '');
    if (recovery?.kind === 'write') {
      setAuditData({ status: recovery.target, comment: recovery.comment, assignee_id: recovery.assigneeId });
      setShowAuditModal(true);
    } else if (recovery) {
      setShowAuditModal(true);
    } else if (!recovery) {
      setShowAuditModal(false);
    }
    setAuditRecoveryReadyScope(topicAuditRecoveryScope);
  }, [currentUserId, id, topicAuditRecoveryScope]);
  useEffect(() => {
    const actorId = Number(currentUserId);
    const topicId = Number(id);
    const recovery = Number.isSafeInteger(actorId) && actorId > 0 && Number.isSafeInteger(topicId) && topicId > 0
      ? loadPendingTopicStatusWrite(actorId, topicId)
      : null;
    pendingTopicStatusWriteRef.current = recovery;
    setPendingTopicStatusWrite(recovery);
    setStatusRecoveryReadyScope(topicStatusRecoveryScope);
    statusRecoveryNeedsVerificationRef.current = recovery !== null;
    setStatusVerificationNotice(recovery?.kind === 'invalid'
      ? recovery.reason === 'expired'
        ? '阶段核实记录已过期，正在只读读取当前选题状态；核实前不会再次提交。'
        : '阶段核实记录无法读取，正在只读读取当前选题状态；核实前不会再次提交。'
      : recovery
        ? '正在只读核实上次阶段更新结果；核实前不会再次提交。'
        : '');
  }, [currentUserId, id, topicStatusRecoveryScope]);
  const styles = useThemeStyles();
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const requestedOutlineVersion = searchParams.get('outlineVersion')?.trim() || '';
  const canAudit = !requestedOutlineVersion && hasPermission('topic:audit');
  const auditRequested = searchParams.get('action') === 'audit';
  const contentEditRoles = new Set(['admin', 'editor', 'copywriter', 'post_production', 'camera']);
  const persistTopicManualBridge = useCallback(async (_content: string, context: ContentEditorSaveContext) => {
    const snapshot = manualSaveSnapshotsRef.current.get(context.contentRevision);
    if (!snapshot) throw new Error('Topic manual save snapshot is unavailable');
    await aggregatePersistCommandRef.current(snapshot, context.contentRevision, pendingTopicVersionActionRef.current ?? undefined);
  }, []);
  const handleTopicRuntimeHandleChange = useCallback((handle: ContentEditorRuntimeHandle | null) => {
    topicRuntimeHandleRef.current = handle;
    setHasTopicManualRuntimeHandle(Boolean(handle?.manualSave));
  }, []);

  const loadUserDirectory = useCallback(async (requestScope: string) => {
    const requestId = ++userDirectoryRequestSequenceRef.current;
    const requestedTopicId = Number(id);
    setUserDirectoryLoadState('loading');
    try {
      const usersData = await getUsers();
      if (requestId !== userDirectoryRequestSequenceRef.current || requestScope !== userDirectoryScopeRef.current || Number(currentTopicIdRef.current) !== requestedTopicId) return;
      setUsers(usersData.data);
      setUserDirectoryLoadState('ready');
    } catch {
      if (requestId !== userDirectoryRequestSequenceRef.current || requestScope !== userDirectoryScopeRef.current || Number(currentTopicIdRef.current) !== requestedTopicId) return;
      setUserDirectoryLoadState('error');
    }
  }, [id]);

  useEffect(() => {
    setUsers([]);
    void loadUserDirectory(userDirectoryScope);
    return () => { userDirectoryRequestSequenceRef.current += 1; };
  }, [loadUserDirectory, userDirectoryScope]);

  const userDirectoryFeedback = userDirectoryLoadState === 'error' ? (
    <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-3 py-2 text-xs text-studio-amber-contrast">
      <span>负责人名单暂不可用。选题详情仍可使用，但负责人姓名或可选名单可能不完整。</span>
      <ActionButton type="button" variant="ghost" onClick={() => void loadUserDirectory(userDirectoryScope)}>重新加载负责人名单</ActionButton>
    </div>
  ) : null;

  const reconcileTopicSaveReadback = (recovery: TopicDetailSaveRecovery, latest: Topic, saveRevision?: number) => {
    if (Number(currentTopicIdRef.current) !== recovery.topicId || Number(currentUserId) !== recovery.userId) return 'conflict' as const;
    setTopic(latest);
    const latestDraft = createTopicDetailDraft(latest);
    baselineDraftRef.current = cloneTopicDetailDraft(latestDraft);
    topicSaveConflictTopicRef.current = null;

    if (topicMatchesDetailSaveTarget(latest, recovery.target)) {
      if (!removeTopicDetailSaveRecovery(recovery)) {
        setTopicSaveRecovery(recovery, 'unknown');
        setTopicSaveRecoveryNotice('只读核实已确认服务端内容与本次保存一致，但本地恢复记录未能清除；写入保持锁定，请修复浏览器存储后再次只读核实。');
        return 'unknown' as const;
      }
      setTopicSaveRecovery(null, 'none');
      setTopicSaveRecoveryNotice('');
      setTopicSaveFeedback(null);
      if (saveRevision === undefined || aggregateRevisionRef.current === saveRevision) {
        applyDraft(latestDraft);
        setIsTopicDirty(false);
        setEditTitle(false);
        setEditDetails(false);
        setEditDescription(false);
        setEditOutline(false);
      } else {
        setIsTopicDirty(!topicDetailDraftEquals(draftRef.current, latestDraft));
      }
      appStore.addNotification({
        title: recovery.versionAction ? '版本已核实保存' : '选题信息已核实保存',
        message: '只读核实已确认服务端保存成功；没有重复提交。',
        type: 'success',
      });
      return 'confirmed' as const;
    }

    applyDraft(recovery.target);
    setEditTitle(true);
    setEditDetails(true);
    setEditDescription(true);
    setEditOutline(true);
    setIsTopicDirty(true);

    if (topicMatchesDetailSaveTarget(latest, recovery.baseline)) {
      const retryable = { ...recovery, phase: 'uncertain' as const };
      markTopicDetailSaveRecoveryUncertain(retryable);
      setTopicSaveRecovery(retryable, 'retryable');
      setTopicSaveRecoveryNotice('只读核实确认服务端仍是保存前内容。本次没有自动重发；核对本地修改后，点击“按原操作重试”才会再次提交。');
      return 'retryable' as const;
    }

    topicSaveConflictTopicRef.current = latest;
    setTopicSaveRecovery(recovery, 'conflict');
    setTopicSaveRecoveryNotice('服务端内容已发生变化；本地修改已保留。请采用服务端内容，或明确保留本地修改后再决定是否保存。');
    return 'conflict' as const;
  };
  reconcileTopicSaveReadbackRef.current = reconcileTopicSaveReadback;

  useEffect(() => {
    const requestId = ++detailRequestSequenceRef.current;
    const fetchData = async () => {
      setLoading(true);
      setTopic(null);
      setTopicLoadFailure(null);
      setOutlineVersionsLoadState('loading');
      try {
        const topicData = await getTopic(parseInt(id!));
        if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== Number(id)) return;
        setTopic(topicData);
        try {
          const versions = await getTopicOutlineVersions(topicData.id);
          if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== Number(id)) return;
          setOutlineVersions(versions);
          setOutlineVersionsLoadState('ready');
        } catch {
          if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== Number(id)) return;
          setOutlineVersions([]);
          setOutlineVersionsLoadState('error');
        }
        // Resolve once per loaded Topic. The policy is static for the page
        // lifetime, so a dirty draft can never hot-switch editor renderers.
        setTopicEditorBranch(resolveTopicDetailEditorBranch(
          topicData.id,
          true,
          topicEditorModePolicy,
        ));
        const draft = createTopicDetailDraft(topicData);
        baselineDraftRef.current = cloneTopicDetailDraft(draft);
        aggregateRevisionRef.current = 0;
        const recovery = readTopicDetailSaveRecovery(currentUserId, topicData.id);
        if (recovery === 'invalid') {
          setTopicSaveRecovery(null, 'invalid');
          setTopicSaveRecoveryNotice('上次保存核实记录无法读取。当前已载入服务端内容；请先重新读取并明确采用服务端版本，之后才能继续写入。');
          applyDraft(draft);
          setIsTopicDirty(false);
        } else if (recovery) {
          setTopicSaveRecovery(recovery, 'unknown');
          setTopicSaveRecoveryNotice('正在只读核实上次选题保存结果；核实前不会再次写入。');
          reconcileTopicSaveReadbackRef.current(recovery, topicData);
        } else {
          setTopicSaveRecovery(null, 'none');
          setTopicSaveRecoveryNotice('');
          applyDraft(draft);
          setIsTopicDirty(false);
        }
      } catch (error) {
        if (requestId === detailRequestSequenceRef.current && Number(currentTopicIdRef.current) === Number(id)) {
          setTopicLoadFailure(error instanceof TopicApiError && error.status === 404 ? 'not-found' : 'unavailable');
        }
      } finally {
        if (requestId === detailRequestSequenceRef.current && Number(currentTopicIdRef.current) === Number(id)) setLoading(false);
      }
    };
    
    void fetchData();
    return () => { detailRequestSequenceRef.current += 1; };
  }, [currentUserId, id, topicDetailReload]);

  useEffect(() => {
    if (!Number.isSafeInteger(handoffTopicId) || handoffTopicId <= 0 || !currentUserId) {
      setHandoffRecoverySnapshot({ scope: handoffRecoveryScope, recovery: null });
      return;
    }
    setHandoffRecoverySnapshot({
      scope: handoffRecoveryScope,
      recovery: readTopicProductionCreateRecovery(currentUserId, handoffTopicId),
    });
  }, [currentUserId, handoffRecoveryScope, handoffTopicId]);

  const reloadOutlineVersions = async () => {
    if (!topic || outlineVersionsLoadState === 'loading') return;
    const requestedTopicId = topic.id;
    const requestId = detailRequestSequenceRef.current;
    setOutlineVersionsLoadState('loading');
    try {
      const versions = await getTopicOutlineVersions(requestedTopicId);
      if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== requestedTopicId) return;
      setOutlineVersions(versions);
      setOutlineVersionsLoadState('ready');
    } catch {
      if (requestId !== detailRequestSequenceRef.current || Number(currentTopicIdRef.current) !== requestedTopicId) return;
      setOutlineVersionsLoadState('error');
    }
  };

  const requestedOutlineVersionEntry = outlineVersions.find((version) => (
    !version.is_baseline && version.version === requestedOutlineVersion
  ));

  useEffect(() => {
    if (!requestedOutlineVersionEntry || outlineVersionsLoadState !== 'ready') return;
    requestedOutlineCardRef.current?.scrollIntoView({ block: 'center' });
  }, [outlineVersionsLoadState, requestedOutlineVersionEntry]);

  useEffect(() => {
    if (!auditRequested || loading || permissionsLoading) return;

    if (topic?.status === 'pending' && canAudit) openAuditModal();

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('action');
    setSearchParams(nextParams, { replace: true });
  }, [auditRequested, canAudit, loading, permissionsLoading, searchParams, setSearchParams, topic?.status]);

  const recordDraftChange = (nextDraft: TopicDetailAggregateDraft) => {
    draftRef.current = cloneTopicDetailDraft(nextDraft);
    aggregateRevisionRef.current += 1;
    setIsTopicDirty(!baselineDraftRef.current || !topicDetailDraftEquals(nextDraft, baselineDraftRef.current));
  };

  const isCurrentDraftDirty = useCallback(() => (
    !baselineDraftRef.current || !topicDetailDraftEquals(draftRef.current, baselineDraftRef.current)
  ), []);

  const changeTitle = (nextTitle: string) => {
    const nextDraft = { ...draftRef.current, title: nextTitle };
    setTitle(nextTitle);
    recordDraftChange(nextDraft);
  };

  const changeDetails = (nextDetails: TopicDetailFields) => {
    const nextDraft = { ...draftRef.current, details: { ...nextDetails } };
    setDetails(nextDetails);
    recordDraftChange(nextDraft);
  };

  const changeParsedFields = (nextFields: TopicDetailParsedFields) => {
    const nextDescription = buildTopicDetailDescription(nextFields);
    const nextDraft = { ...draftRef.current, description: nextDescription, parsedFields: { ...nextFields } };
    setParsedFields(nextFields);
    setDescription(nextDescription);
    recordDraftChange(nextDraft);
  };

  const changeOutline = (nextOutline: string) => {
    const nextDraft = { ...draftRef.current, outline: nextOutline };
    setScriptContent(nextOutline);
    recordDraftChange(nextDraft);
  };

  const updateAuditRecoveryState = (recovery: TopicAuditRecovery | null, outcome: typeof auditRecoveryOutcome) => {
    pendingTopicAuditRecoveryRef.current = recovery;
    auditRecoveryOutcomeRef.current = outcome;
    setPendingTopicAuditRecovery(recovery);
    setAuditRecoveryOutcome(outcome);
  };

  const clearAuditRecoveryMarker = (pending: PendingTopicAuditWrite) => {
    try {
      if (typeof window === 'undefined' || !removeTopicAuditRecovery(window.sessionStorage, pending)) return false;
      if (!isSameTopicAuditRecovery(pendingTopicAuditRecoveryRef.current, pending)) return false;
      updateAuditRecoveryState(null, null);
      return true;
    } catch {
      return false;
    }
  };

  const applyAuditReadback = (pending: TopicAuditRecovery, latest: Topic) => {
    if (!isSameTopicAuditRecovery(pendingTopicAuditRecoveryRef.current, pending)) return;
    if (Number(currentTopicIdRef.current) !== pending.topicId) return;
    setTopic(latest);

    if (pending.kind === 'invalid') {
      auditRecoveryOutcomeRef.current = 'invalid';
      setAuditRecoveryOutcome('invalid');
      setAuditNeedsVerification(false);
      setAuditVerificationNotice(`已只读读取服务器当前状态“${STATUS_TEXT[latest.status] || latest.status}”，但本地审核记录损坏，无法安全恢复原操作；不会自动重发。`);
      return;
    }

    const result = resolveTopicAuditRecovery(pending, latest);
    if (result === 'applied') {
      if (clearAuditRecoveryMarker(pending)) {
        setAuditNeedsVerification(false);
        setAuditVerificationNotice('');
        setShowAuditModal(false);
        appStore.addNotification({ title: '审核状态已核实', message: pending.target === 'approved' ? '服务器已记录通过审核。' : '服务器已记录驳回结果。', type: 'success' });
      } else {
        auditRecoveryOutcomeRef.current = 'applied';
        setAuditRecoveryOutcome('applied');
        setAuditNeedsVerification(true);
        setAuditVerificationNotice('服务端已记录本次审核，但本地恢复标记暂时无法清除；请稍后再次只读核实。');
      }
      return;
    }

    if (result === 'unchanged') {
      setAuditData({ status: pending.target, comment: pending.comment, assignee_id: pending.assigneeId });
      auditRecoveryOutcomeRef.current = 'retryable';
      setAuditRecoveryOutcome('retryable');
      setAuditNeedsVerification(false);
      setAuditVerificationNotice('服务器仍处于待审核状态，审核历史也未变化。系统不会自动重发；如需继续，请再次确认原审核操作。');
      return;
    }

    const cleared = clearAuditRecoveryMarker(pending);
    auditRecoveryOutcomeRef.current = 'changed';
    setAuditRecoveryOutcome('changed');
    setAuditNeedsVerification(!cleared);
    setAuditVerificationNotice(cleared
      ? `服务器当前状态为“${STATUS_TEXT[latest.status] || '状态待确认'}”或审核历史已有变化；本次不会重复提交审核。`
      : '服务器状态或审核历史已变化，但本地恢复标记无法清除；请只读核实，不会再次提交审核。');
    setShowAuditModal(false);
    if (cleared) appStore.addNotification({ title: '审核状态已变化', message: `服务器当前状态为“${STATUS_TEXT[latest.status] || '状态待确认'}”，未重复提交审核。`, type: 'warning' });
  };

  const verifyAuditStatus = async (pendingOverride?: TopicAuditRecovery) => {
    if (auditVerificationInFlightRef.current) return;
    const pending = pendingOverride ?? pendingTopicAuditRecoveryRef.current;
    if (!pending) return;
    auditVerificationInFlightRef.current = true;
    setVerifyingAudit(true);
    setAuditNeedsVerification(true);
    setAuditVerificationNotice('正在只读核实审核结果；核实期间不会再次提交。');
    try {
      const latest = await getTopic(pending.topicId);
      applyAuditReadback(pending, latest);
    } catch (error) {
      if (Number(currentTopicIdRef.current) === pending.topicId) {
        auditRecoveryOutcomeRef.current = pending.kind === 'invalid' ? 'invalid' : 'unknown';
        setAuditRecoveryOutcome(auditRecoveryOutcomeRef.current);
        setAuditNeedsVerification(true);
        setAuditVerificationNotice(`审核结果暂时无法确认（${getUserFacingErrorMessage(error, '服务暂不可用')}）。为避免重复提交，审核控件已锁定；请重新只读核实。`);
      }
    } finally {
      auditVerificationInFlightRef.current = false;
      setVerifyingAudit(false);
    }
  };

  const verifyAuditStatusRef = useRef(verifyAuditStatus);
  verifyAuditStatusRef.current = verifyAuditStatus;
  const auditRecoveryVerificationStartedRef = useRef('');
  useEffect(() => {
    const pending = pendingTopicAuditRecovery;
    if (auditRecoveryReadyScope !== topicAuditRecoveryScope || !topic
      || Number(topic.id) !== Number(id) || !pending) return;
    const verificationKey = `${topicAuditRecoveryScope}:${pending.kind === 'write' ? pending.requestId : pending.reason}`;
    if (auditRecoveryVerificationStartedRef.current === verificationKey) return;
    auditRecoveryVerificationStartedRef.current = verificationKey;
    void verifyAuditStatusRef.current(pending);
  }, [auditRecoveryReadyScope, id, pendingTopicAuditRecovery, topic, topicAuditRecoveryScope]);

  const openAuditModal = () => {
    if (!pendingTopicAuditRecoveryRef.current) {
      setAuditVerificationNotice('');
      setAuditNeedsVerification(false);
      updateAuditRecoveryState(null, null);
    }
    setShowAuditModal(true);
  };

  const makeAuditRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const submitAuditWrite = async (pending: PendingTopicAuditWrite, retry: boolean) => {
    if (!canAudit) return;
    auditSubmissionInFlightRef.current = true;
    setAuditSubmitting(true);
    try {
      if (retry) {
        const latest = await getTopic(pending.topicId);
        if (Number(currentTopicIdRef.current) !== pending.topicId) return;
        const result = resolveTopicAuditRecovery(pending, latest);
        if (result !== 'unchanged') {
          applyAuditReadback(pending, latest);
          return;
        }
        try {
          if (typeof window === 'undefined') throw new Error('当前环境无法读取审核恢复记录。');
          persistTopicAuditRecovery(window.sessionStorage, pending);
        } catch (error) {
          auditRecoveryOutcomeRef.current = 'unknown';
          setAuditRecoveryOutcome('unknown');
          setAuditNeedsVerification(true);
          setAuditVerificationNotice(`${getUserFacingErrorMessage(error, '审核恢复记录无法安全确认')}；本次未重试提交。`);
          return;
        }
      }

      try {
        await auditTopic(pending.topicId, { status: pending.target, comment: pending.comment, assignee_id: pending.assigneeId });
      } catch (error) {
        const status = error instanceof Error && 'status' in error ? Number((error as Error & { status?: unknown }).status) : 0;
        if (status === 0 || status === 408 || status === 429 || status >= 500) {
          auditRecoveryOutcomeRef.current = 'unknown';
          setAuditRecoveryOutcome('unknown');
          setAuditNeedsVerification(true);
          setAuditVerificationNotice('审核请求未收到明确结果，正在只读核实；核实前不会再次提交。');
          await verifyAuditStatus(pending);
          return;
        }
        const cleared = clearAuditRecoveryMarker(pending);
        setAuditNeedsVerification(!cleared);
        if (!cleared) {
          auditRecoveryOutcomeRef.current = 'unknown';
          setAuditRecoveryOutcome('unknown');
          setAuditVerificationNotice('审核请求已被服务端拒绝，但本地恢复标记无法清除；正在只读核实当前状态。');
          await verifyAuditStatus(pending);
        } else {
          setAuditVerificationNotice('');
          appStore.addNotification({ title: '审核失败', message: getUserFacingErrorMessage(error, '审核失败，请检查权限或当前状态后重试。'), type: 'error' });
        }
        return;
      }

      auditRecoveryOutcomeRef.current = 'unknown';
      setAuditRecoveryOutcome('unknown');
      setAuditNeedsVerification(true);
      setAuditVerificationNotice('审核已提交，正在只读核实审核历史；核实前不会再次提交。');
      await verifyAuditStatus(pending);
    } catch (error) {
      if (Number(currentTopicIdRef.current) === pending.topicId) {
        auditRecoveryOutcomeRef.current = 'unknown';
        setAuditRecoveryOutcome('unknown');
        setAuditNeedsVerification(true);
        setAuditVerificationNotice(`审核结果暂时无法确认（${getUserFacingErrorMessage(error, '服务暂不可用')}）；请只读核实后再继续。`);
      }
    } finally {
      auditSubmissionInFlightRef.current = false;
      setAuditSubmitting(false);
    }
  };

  const handleAudit = async () => {
    if (topicSaveRecoveryModeRef.current !== 'none') {
      setTopicSaveRecoveryNotice('请先核实上一次选题内容保存结果；核实前不会执行审核或其它写入。');
      return;
    }
    if (auditSubmissionInFlightRef.current || auditNeedsVerification || verifyingAudit || !canAudit
      || auditRecoveryReadyScope !== topicAuditRecoveryScope) return;
    const recovery = pendingTopicAuditRecoveryRef.current;
    if (recovery) {
      if (recovery.kind === 'write' && auditRecoveryOutcomeRef.current === 'retryable') setShowAuditRetryConfirm(true);
      return;
    }
    const requestedTopicId = Number(id);
    const requestedUserId = Number(currentUserId);
    if (!Number.isSafeInteger(requestedTopicId) || requestedTopicId <= 0 || !Number.isSafeInteger(requestedUserId) || requestedUserId <= 0) return;
    auditSubmissionInFlightRef.current = true;
    setAuditSubmitting(true);
    try {
      const latest = await getTopic(requestedTopicId);
      if (Number(currentTopicIdRef.current) !== requestedTopicId) return;
      setTopic(latest);
      if (latest.status !== 'pending') {
        setAuditVerificationNotice(`服务器当前状态为“${STATUS_TEXT[latest.status] || '状态待确认'}”，未提交审核。`);
        return;
      }
      const baselineHistoryId = topicHistoryHighWatermark(latest);
      if (baselineHistoryId === null) {
        setAuditVerificationNotice('暂时无法读取审核历史，无法安全保存恢复记录；本次未提交审核。');
        return;
      }
      const pending: PendingTopicAuditWrite = {
        kind: 'write',
        version: 1,
        requestId: makeAuditRequestId(),
        userId: requestedUserId,
        topicId: requestedTopicId,
        beforeStatus: 'pending',
        beforeAssigneeId: Number(latest.assignee_id) || 0,
        baselineHistoryId,
        target: auditData.status,
        comment: auditData.comment,
        assigneeId: Number(auditData.assignee_id) || 0,
        createdAt: Date.now(),
      };
      try {
        if (typeof window === 'undefined') throw new Error('当前环境无法保存审核恢复记录。');
        persistTopicAuditRecovery(window.sessionStorage, pending);
      } catch (error) {
        setAuditVerificationNotice(`${getUserFacingErrorMessage(error, '审核恢复记录无法安全保存')}；本次未提交审核。`);
        return;
      }
      updateAuditRecoveryState(pending, 'unknown');
      auditRecoveryVerificationStartedRef.current = `${topicAuditRecoveryScope}:${pending.requestId}`;
      setAuditNeedsVerification(true);
      setAuditVerificationNotice('审核恢复记录已保存，正在提交审核；核实前不会再次提交。');
      await submitAuditWrite(pending, false);
    } catch (error) {
      setAuditVerificationNotice(`审核前无法读取当前状态（${getUserFacingErrorMessage(error, '服务暂不可用')}）；本次未提交审核。`);
    } finally {
      auditSubmissionInFlightRef.current = false;
      setAuditSubmitting(false);
    }
  };

  const confirmAuditRetry = () => {
    const pending = pendingTopicAuditRecoveryRef.current;
    setShowAuditRetryConfirm(false);
    if (!pending || pending.kind !== 'write' || auditRecoveryOutcomeRef.current !== 'retryable') return;
    void submitAuditWrite(pending, true);
  };

  const rememberPendingTopicStatusWrite = (pending: TopicStatusRecovery | null) => {
    const previous = pendingTopicStatusWriteRef.current;
    if (pending?.kind === 'write') {
      try {
        persistPendingTopicStatusWrite(pending);
      } catch (error) {
        setStatusVerificationNotice(getUserFacingErrorMessage(error, '无法安全保存阶段核实标记；本次未发送状态更新。'));
        return false;
      }
    } else if (!pending && previous) {
      removePendingTopicStatusWrite(previous.userId, previous.topicId);
    }
    pendingTopicStatusWriteRef.current = pending;
    setPendingTopicStatusWrite(pending);
    if (!pending) setStatusVerificationNotice('');
    return true;
  };

  const completePendingTopicStatusWrite = (completed: TopicStatusRecovery) => completeTopicStatusRecovery(
    pendingTopicStatusWriteRef.current,
    completed,
    (recovery) => removePendingTopicStatusWrite(recovery.userId, recovery.topicId, recovery),
    () => {
      pendingTopicStatusWriteRef.current = null;
      setPendingTopicStatusWrite(null);
      setStatusVerificationNotice('');
    },
  );

  const verifyPendingTopicStatusWrite = useCallback(async (pendingOverride?: TopicStatusRecovery) => {
    const pending = pendingOverride ?? pendingTopicStatusWriteRef.current;
    if (!pending || topicStatusVerificationInFlightRef.current) return;
    if (Number(currentUserId) !== pending.userId) return;
    topicStatusVerificationInFlightRef.current = true;
    setVerifyingTopicStatus(true);
    setStatusVerificationNotice('正在只读核实选题状态；核实期间不会再次提交。');
    try {
      const latest = await getTopic(pending.topicId);
      if (pendingTopicStatusWriteRef.current !== pending) return;
      if (Number(currentTopicIdRef.current) === pending.topicId) {
        setTopic(latest);
      }
      completePendingTopicStatusWrite(pending);

      if (pending.kind === 'invalid') {
        const reason = pending.reason === 'expired' ? '已过期' : '无法读取';
        appStore.addNotification({
          title: '阶段核实记录已处理',
          message: `上次阶段核实记录${reason}；已只读读取服务器当前状态「${STATUS_TEXT[latest.status] ?? latest.status}」。请核对后再继续。`,
          type: 'warning',
        });
        return;
      }

      if (latest.status === pending.target) {
        if (pending.target === 'shooting' || pending.target === 'completed') celebrateMilestone();
        appStore.addNotification({
          title: '状态已更新',
          message: `选题状态已更新为${STATUS_TEXT[pending.target] ?? pending.target}；服务端结果已只读确认。`,
          type: 'success',
        });
      } else if (latest.status === pending.before) {
        appStore.addNotification({
          title: '状态未更新',
          message: `服务器仍显示${STATUS_TEXT[pending.before] ?? pending.before}。没有自动重发；确认后可再次明确操作。`,
          type: 'warning',
        });
      } else {
        appStore.addNotification({
          title: '选题状态已变化',
          message: `服务器当前状态为${STATUS_TEXT[latest.status] ?? latest.status}，已显示最新状态；请确认后再继续。`,
          type: 'warning',
        });
      }
    } catch (error) {
      if (pendingTopicStatusWriteRef.current !== pending) return;
      if (error instanceof TopicApiError && error.status === 404) {
        if (Number(currentTopicIdRef.current) === pending.topicId) {
          setTopic(null);
          setTopicLoadFailure('not-found');
        }
        completePendingTopicStatusWrite(pending);
        return;
      }
      const message = getUserFacingErrorMessage(error, '暂时无法读取选题状态');
      setStatusVerificationNotice(`状态更新结果暂时无法确认（${message}）；状态操作已锁定，请先只读核实。`);
    } finally {
      topicStatusVerificationInFlightRef.current = false;
      setVerifyingTopicStatus(false);
    }
  }, [appStore, currentUserId]);

  useEffect(() => {
    if (statusRecoveryReadyScope !== topicStatusRecoveryScope || !topic
      || Number(topic.id) !== Number(id) || !statusRecoveryNeedsVerificationRef.current) return;
    statusRecoveryNeedsVerificationRef.current = false;
    const pending = pendingTopicStatusWriteRef.current;
    if (pending) void verifyPendingTopicStatusWrite(pending);
  }, [id, statusRecoveryReadyScope, topic, topicStatusRecoveryScope, verifyPendingTopicStatusWrite]);

  const handleUpdateStatus = async (status: Topic['status']) => {
    if (topicSaveRecoveryModeRef.current !== 'none') {
      setTopicSaveRecoveryNotice('请先核实上一次选题内容保存结果；核实前不会推进阶段。');
      return;
    }
    if (statusRecoveryReadyScope !== topicStatusRecoveryScope) {
      appStore.addNotification({ title: '正在读取阶段状态', message: '请等待上次阶段操作核实记录加载完成后再继续。', type: 'warning' });
      return;
    }
    const currentPending = pendingTopicStatusWriteRef.current;
    if (statusUpdateInFlightRef.current || topicStatusVerificationInFlightRef.current) return;
    if (currentPending) {
      appStore.addNotification({
        title: '状态待核实',
        message: `选题 #${currentPending.topicId} 的阶段更新结果尚未确认；只读核实完成前不会提交其他阶段操作。`,
        type: 'warning',
      });
      return;
    }
    if (!topic) return;
    const requestedTopicId = topic.id;
    const actorId = Number(currentUserId);
    if (!Number.isSafeInteger(actorId) || actorId <= 0) {
      appStore.addNotification({ title: '状态更新暂不可用', message: '当前登录身份尚未确认；本次没有发送阶段更新。', type: 'error' });
      return;
    }
    const pending: PendingTopicStatusWrite = {
      kind: 'write',
      topicId: requestedTopicId,
      userId: actorId,
      before: topic.status,
      target: status,
      createdAt: Date.now(),
    };
    if (!rememberPendingTopicStatusWrite(pending)) {
      appStore.addNotification({ title: '状态更新未发送', message: '阶段核实标记未能安全保存；本次没有提交状态变更。', type: 'error' });
      return;
    }
    statusUpdateInFlightRef.current = true;
    setStatusUpdating(true);
    try {
      try {
        await updateTopicStatus(requestedTopicId, status);
      } catch (error) {
        if (Number(currentTopicIdRef.current) !== requestedTopicId) {
          const responseStatus = error instanceof TopicApiError ? error.status : 0;
          if (responseStatus >= 400 && responseStatus < 500 && ![408, 425, 429].includes(responseStatus)) return;
        }
        const responseStatus = error instanceof TopicApiError ? error.status : 0;
        const definitelyRejected = responseStatus >= 400 && responseStatus < 500
          && ![408, 425, 429].includes(responseStatus);
        if (definitelyRejected) {
          completePendingTopicStatusWrite(pending);
          if (Number(currentTopicIdRef.current) === requestedTopicId) {
            appStore.addNotification({ title: '更新失败', message: getUserFacingErrorMessage(error, '状态更新失败，请检查权限或当前阶段后重试。'), type: 'error' });
          }
          return;
        }
        setStatusVerificationNotice('状态更新响应未确认，正在只读核实；核实前不会再次提交。');
        await verifyPendingTopicStatusWrite(pending);
        return;
      }

      completePendingTopicStatusWrite(pending);
      if (Number(currentTopicIdRef.current) !== requestedTopicId) return;
      if (status === 'shooting' || status === 'completed') celebrateMilestone();
      try {
        const refreshed = await getTopic(requestedTopicId);
        if (Number(currentTopicIdRef.current) !== requestedTopicId) return;
        setTopic(refreshed);
        appStore.addNotification({ title: '状态更新成功', message: '选题状态已更新', type: 'success' });
      } catch {
        if (Number(currentTopicIdRef.current) !== requestedTopicId) return;
        setTopic((current) => current?.id === requestedTopicId ? { ...current, status } : current);
        appStore.addNotification({ title: '状态已更新', message: '状态更新已成功提交，但详情暂时未能刷新；请稍后手动刷新确认最新信息。', type: 'warning' });
      }
    } finally {
      statusUpdateInFlightRef.current = false;
      setStatusUpdating(false);
    }
  };

  const handleStartProduction = async (action: TopicProductionHandoffAction = 'start') => {
    if (topicSaveRecoveryModeRef.current !== 'none') {
      setTopicSaveRecoveryNotice('请先核实上一次选题内容保存结果；核实前不会开始创作。');
      return;
    }
    if (!handoffRecoveryLoaded) return;
    if (action === 'start' && handoffRecovery) return;
    if (!topic || startProductionInFlight.current) return;
    startProductionInFlight.current = true;
    setStartingProduction(true);
    try {
      const result = await startOrResumeTopicProduction(topic, {
        advanceTopic: updateTopicStatus,
        getTopicStatus: async (topicId) => (await getTopic(topicId)).status,
        listProductions: async (topicId) => getProduction({ topic_id: topicId }),
        createDraft: (input, requestId) => createProduction(input, requestId),
        getCreateStatus: getProductionCreateStatus,
        getProductionById,
        userId: currentUserId,
      }, action);
      if (result.advanced) setTopic((current) => current ? { ...current, status: 'production' } : current);
      if (result.kind === 'opened') {
        setHandoffRecoverySnapshot({ scope: handoffRecoveryScope, recovery: null });
        if (result.created || result.advanced) {
          appStore.addNotification({
            title: result.verified ? '创作结果已核实' : result.created ? '创作已建立' : '已进入创作',
            message: result.verified
              ? '服务端已确认创作稿存在；没有重复创建。'
              : result.created
                ? '已带入选题大纲，可以直接开始写稿。'
                : '选题阶段已同步，继续已有稿件。',
            type: 'success',
          });
        }
        navigate(`/production/${result.productionId}`);
      } else if (result.kind === 'deleted') {
        setHandoffRecoverySnapshot({ scope: handoffRecoveryScope, recovery: null });
        appStore.addNotification({
          title: '原创作稿已删除',
          message: result.message,
          type: 'warning',
        });
      } else {
        const recovery = result.kind === 'invalid-recovery' ? 'invalid' : result.recovery;
        setHandoffRecoverySnapshot({ scope: handoffRecoveryScope, recovery });
        appStore.addNotification({
          title: result.kind === 'retryable' ? '创作尚未创建' : '创作结果待确认',
          message: result.message,
          type: result.kind === 'retryable' ? 'warning' : 'error',
        });
      }
    } catch (error) {
      setHandoffRecoverySnapshot({
        scope: handoffRecoveryScope,
        recovery: readTopicProductionCreateRecovery(currentUserId, topic?.id),
      });
      appStore.addNotification({ title: '开始创作失败', message: getUserFacingErrorMessage(error, '暂时无法开始创作，请稍后重试。'), type: 'error' });
    } finally {
      startProductionInFlight.current = false;
      setStartingProduction(false);
    }
  };

  const handleRepairStageRecord = async () => {
    if (topicSaveRecoveryModeRef.current !== 'none') {
      setTopicSaveRecoveryNotice('请先核实上一次选题内容保存结果；核实前不会补齐阶段记录。');
      return;
    }
    if (!topic || !canEditTopic || repairingStageRecord) return;
    const requestedTopicId = topic.id;
    setRepairingStageRecord(true);
    let result: Awaited<ReturnType<typeof repairCurrentTopicStageRecord>>;
    try {
      result = await repairCurrentTopicStageRecord(requestedTopicId);
    } catch (error) {
      appStore.addNotification({ title: '补齐阶段记录失败', message: getUserFacingErrorMessage(error, '暂时无法补齐阶段记录，请稍后重试。'), type: 'error' });
      setRepairingStageRecord(false);
      return;
    }

    try {
      const refreshed = await getTopic(requestedTopicId);
      if (Number(currentTopicIdRef.current) === requestedTopicId) setTopic(refreshed);
      appStore.addNotification({
        title: result.created ? '阶段记录已补齐' : '阶段记录已存在',
        message: result.created ? '选题阶段保持不变，操作已记入历史记录。' : '没有重复创建记录，页面已刷新。',
        type: 'success',
      });
    } catch {
      appStore.addNotification({
        title: result.created ? '阶段记录已补齐' : '阶段记录已存在',
        message: '服务端已确认结果，但页面刷新失败；请重新加载确认当前状态，不要重复操作。',
        type: 'warning',
      });
    } finally {
      setRepairingStageRecord(false);
    }
  };

  const verifyTopicDetailSave = async (recoveryOverride?: TopicDetailSaveRecovery, saveRevision?: number) => {
    if (topicSaveVerificationInFlightRef.current) return 'unknown' as const;
    const recovery = recoveryOverride ?? topicSaveRecoveryRef.current;
    if (!recovery) return 'unknown' as const;
    topicSaveVerificationInFlightRef.current = true;
    setVerifyingTopicSave(true);
    try {
      const latest = await getTopic(recovery.topicId);
      if (Number(currentTopicIdRef.current) !== recovery.topicId || Number(currentUserId) !== recovery.userId) return 'unknown' as const;
      return reconcileTopicSaveReadbackRef.current(recovery, latest, saveRevision);
    } catch {
      if (Number(currentTopicIdRef.current) === recovery.topicId && Number(currentUserId) === recovery.userId) {
        setTopicSaveRecovery(recovery, 'unknown');
        setTopicSaveRecoveryNotice('保存结果仍暂时无法确认。当前修改已保留，选题写入已锁定；请稍后再次只读核实。');
      }
      return 'unknown' as const;
    } finally {
      topicSaveVerificationInFlightRef.current = false;
      setVerifyingTopicSave(false);
    }
  };

  const adoptServerForUnreadableTopicRecovery = async () => {
    if (topicSaveRecoveryModeRef.current !== 'invalid' || topicSaveVerificationInFlightRef.current) return;
    const requestedTopicId = Number(id);
    topicSaveVerificationInFlightRef.current = true;
    setVerifyingTopicSave(true);
    try {
      const latest = await getTopic(requestedTopicId);
      if (Number(currentTopicIdRef.current) !== requestedTopicId) return;
      const latestDraft = createTopicDetailDraft(latest);
      setTopic(latest);
      if (!clearInvalidTopicDetailSaveRecovery(currentUserId, requestedTopicId)) {
        setTopicSaveRecovery(null, 'invalid');
        setTopicSaveRecoveryNotice('服务端内容已重新读取，但本地恢复记录仍未能清除；当前修改保持不变、写入继续锁定，请修复浏览器存储后再次重新读取。');
        return;
      }
      baselineDraftRef.current = cloneTopicDetailDraft(latestDraft);
      applyDraft(latestDraft);
      aggregateRevisionRef.current = 0;
      setIsTopicDirty(false);
      setEditTitle(false);
      setEditDetails(false);
      setEditDescription(false);
      setEditOutline(false);
      setTopicSaveRecovery(null, 'none');
      setTopicSaveRecoveryNotice('已重新读取并采用服务端内容；之前无法读取的本地恢复记录已清除。');
    } catch {
      setTopicSaveRecoveryNotice('服务端内容暂时无法读取，恢复记录仍保留；核实完成前不会写入。');
    } finally {
      topicSaveVerificationInFlightRef.current = false;
      setVerifyingTopicSave(false);
    }
  };

  const adoptServerTopicSaveConflict = () => {
    const latest = topicSaveConflictTopicRef.current;
    const recovery = topicSaveRecoveryRef.current;
    if (!latest || !recovery) return;
    const latestDraft = createTopicDetailDraft(latest);
    if (!removeTopicDetailSaveRecovery(recovery)) {
      setTopicSaveRecovery(recovery, 'conflict');
      setTopicSaveRecoveryNotice('本地恢复记录未能清除；服务端内容尚未采用，写入保持锁定。请修复浏览器存储后重试。');
      return;
    }
    setTopicSaveRecovery(null, 'none');
    setTopicSaveRecoveryNotice('已采用服务端最新内容；本地修改已清除，没有发送写入。');
    baselineDraftRef.current = cloneTopicDetailDraft(latestDraft);
    applyDraft(latestDraft);
    setIsTopicDirty(false);
    setEditTitle(false);
    setEditDetails(false);
    setEditDescription(false);
    setEditOutline(false);
    topicSaveConflictTopicRef.current = null;
  };

  const continueWithLocalTopicSaveConflict = () => {
    const latest = topicSaveConflictTopicRef.current;
    const recovery = topicSaveRecoveryRef.current;
    if (!latest || !recovery) return;
    const rebased = {
      ...recovery,
      baseline: createTopicDetailDraft(latest),
      versionAction: null,
      phase: 'uncertain' as const,
    };
    try {
      persistTopicDetailSaveRecovery(rebased);
    } catch (error) {
      setTopicSaveRecoveryNotice(getUserFacingErrorMessage(error, '本地恢复记录无法安全保存；写入仍保持锁定。'));
      return;
    }
    baselineDraftRef.current = cloneTopicDetailDraft(rebased.baseline);
    applyDraft(rebased.target);
    setIsTopicDirty(true);
    setEditTitle(true);
    setEditDetails(true);
    setEditDescription(true);
    setEditOutline(true);
    topicSaveConflictTopicRef.current = null;
    setTopicSaveRecovery(rebased, 'retryable');
    setTopicSaveRecoveryNotice('已保留本地修改并以最新服务端内容为基线；只有点击“按当前本地内容保存”才会写入。');
  };

  const retryTopicDetailSaveExplicitly = async () => {
    const recovery = topicSaveRecoveryRef.current;
    if (!recovery || topicSaveRecoveryModeRef.current !== 'retryable' || isAggregateSaving) return;
    retryingTopicSaveRef.current = true;
    setTopicSaveFeedback(null);
    try {
      await persistTopicAggregate(recovery.target, aggregateRevisionRef.current, recovery.versionAction ?? undefined);
    } catch (error) {
      const detail = getUserFacingErrorMessage(error, '请稍后再次核实保存结果。');
      setTopicSaveFeedback(`保存未完成，本地修改仍保留：${detail}`);
    } finally {
      retryingTopicSaveRef.current = false;
      pendingTopicVersionActionRef.current = null;
    }
  };

  const persistTopicAggregate = (saveSnapshot: TopicDetailAggregateDraft, saveRevision: number, versionAction?: 'minor' | 'major') => {
    const requestedTopicId = Number(id);
    return (
    aggregateSaveGateRef.current.run(async () => {
      if (topicSaveRecoveryModeRef.current !== 'none' && !retryingTopicSaveRef.current) {
        const message = '请先核实上一次保存结果；核实前不会再次提交。';
        setTopicSaveRecoveryNotice(message);
        throw new Error(message);
      }
      setIsAggregateSaving(true);
      const payload = {
        ...buildTopicDetailUpdatePayload(saveSnapshot),
        ...(versionAction ? { version_action: versionAction, expected_content: topic?.outline ?? '' } : {}),
      };
      const saveBaseline = baselineDraftRef.current;
      if (!saveBaseline || !Number.isSafeInteger(currentUserId) || Number(currentUserId) <= 0) {
        setIsAggregateSaving(false);
        throw new Error('账号或选题基线尚未确认，本次没有提交。');
      }
      const recovery: TopicDetailSaveRecovery = {
        version: 2,
        userId: Number(currentUserId),
        topicId: requestedTopicId,
        baseline: cloneTopicDetailDraft(saveBaseline),
        target: cloneTopicDetailDraft(saveSnapshot),
        versionAction: versionAction ?? null,
        phase: 'sending',
      };
      try {
        persistTopicDetailSaveRecovery(recovery);
        setTopicSaveRecovery(recovery, 'unknown');
        setTopicSaveRecoveryNotice('正在保存选题内容…');
        await updateTopic(requestedTopicId, payload);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('本次选题修改未发送：')) {
          const storedRecovery = readTopicDetailSaveRecovery(currentUserId, requestedTopicId);
          if (storedRecovery === null) {
            setTopicSaveRecovery(null, 'none');
            setTopicSaveRecoveryNotice('');
          } else {
            setTopicSaveRecovery(null, 'invalid');
            setTopicSaveRecoveryNotice('恢复记录未能完整保存或读取；本次修改没有发送，当前输入已保留。请重新读取并采用服务端内容前不要再次写入。');
          }
          setIsAggregateSaving(false);
          const detail = getUserFacingErrorMessage(
            { message: error.message.slice('本次选题修改未发送：'.length) },
            '恢复记录无法安全保存；本次修改未提交。',
          );
          appStore.addNotification({ title: '保存未发送', message: `本次选题修改未发送：${detail}`, type: 'error' });
          throw error;
        }
        const status = error instanceof TopicApiError ? error.status : 0;
        const definitelyRejected = status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
        if (definitelyRejected) {
          if (!removeTopicDetailSaveRecovery(recovery)) {
            setTopicSaveRecovery(recovery, 'unknown');
            setTopicSaveRecoveryNotice('服务器已拒绝本次保存，但本地恢复记录无法清除；写入保持锁定，请先只读核实。');
            setIsAggregateSaving(false);
            appStore.addNotification({ title: '恢复记录待核实', message: '服务器已拒绝本次保存，但本地恢复记录无法清除；请先只读核实，期间不会再次写入。', type: 'warning' });
            throw error;
          }
          setTopicSaveRecovery(null, 'none');
          setTopicSaveRecoveryNotice('');
          setIsAggregateSaving(false);
          appStore.addNotification({ title: '保存失败', message: getUserFacingErrorMessage(error, '保存失败，请检查权限或当前选题状态后重试。'), type: 'error' });
          throw error;
        }
        markTopicDetailSaveRecoveryUncertain(recovery);
        setTopicSaveRecovery(recovery, 'unknown');
        setTopicSaveRecoveryNotice('保存响应未能确认，正在只读核实；核实前不会再次提交。');
        const result = await verifyTopicDetailSave(recovery, saveRevision);
        setIsAggregateSaving(false);
        if (result === 'confirmed') return;
        appStore.addNotification({ title: '保存结果待核实', message: '本地修改已保留；请查看页面提示并通过只读核实或明确重试。', type: 'warning' });
        throw error;
      }

      if (!removeTopicDetailSaveRecovery(recovery)) {
        setTopicSaveRecovery(recovery, 'unknown');
        setTopicSaveRecoveryNotice('服务器已返回保存成功，但本地恢复记录未能清除；写入保持锁定，请只读核实保存结果。');
        setIsAggregateSaving(false);
        appStore.addNotification({ title: '保存结果待核实', message: '服务器已返回保存成功，但本地恢复记录未能清除；请先只读核实，期间不会再次写入。', type: 'warning' });
        return;
      }
      setTopicSaveRecovery(null, 'none');
      setTopicSaveRecoveryNotice('');

      if (Number(currentTopicIdRef.current) !== requestedTopicId) {
        setIsAggregateSaving(false);
        appStore.addNotification({ title: '选题信息已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
        return;
      }

      const confirmedDraft = cloneTopicDetailDraft(saveSnapshot);
      baselineDraftRef.current = cloneTopicDetailDraft(confirmedDraft);
      setTopic((current) => current ? { ...current, ...payload } : current);
      if (aggregateRevisionRef.current === saveRevision) {
        applyDraft(confirmedDraft);
        setIsTopicDirty(false);
        setEditTitle(false);
        setEditDetails(false);
        setEditDescription(false);
        setEditOutline(false);
      } else {
        setIsTopicDirty(!topicDetailDraftEquals(draftRef.current, confirmedDraft));
      }

      if (versionAction) {
        setOutlineVersions([]);
        setOutlineVersionsLoadState('loading');
      }
      try {
        const topicData = await getTopic(requestedTopicId);
        if (Number(currentTopicIdRef.current) !== requestedTopicId) {
          appStore.addNotification({ title: '选题信息已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
          return;
        }
        setTopic(topicData);
        if (versionAction) {
          try {
            const versions = await getTopicOutlineVersions(topicData.id);
            if (Number(currentTopicIdRef.current) !== requestedTopicId) {
              appStore.addNotification({ title: '选题信息已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
              return;
            }
            setOutlineVersions(versions);
            setOutlineVersionsLoadState('ready');
          } catch {
            if (Number(currentTopicIdRef.current) !== requestedTopicId) {
              appStore.addNotification({ title: '选题信息已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
              return;
            }
            setOutlineVersions([]);
            setOutlineVersionsLoadState('error');
            appStore.addNotification({
              title: '版本已保存，历史读取失败',
              message: '服务端已确认大纲版本保存，但版本历史暂时无法读取。请点击“重新加载大纲历史”只读重试，不要再次保存。',
              type: 'warning',
            });
            return;
          }
        }
        if (aggregateRevisionRef.current === saveRevision) {
          const refreshedDraft = createTopicDetailDraft(topicData);
          baselineDraftRef.current = cloneTopicDetailDraft(refreshedDraft);
          applyDraft(refreshedDraft);
          setIsTopicDirty(false);
          setEditTitle(false);
          setEditDetails(false);
          setEditDescription(false);
          setEditOutline(false);
        } else {
          // Preserve the confirmed save as the baseline; edits made while the
          // request was in flight remain dirty and cannot be discarded.
          setIsTopicDirty(!topicDetailDraftEquals(draftRef.current, confirmedDraft));
        }
        appStore.addNotification({ title: versionAction ? '版本已保存' : '保存成功', message: versionAction ? `选题大纲已保存为${versionAction === 'major' ? '大版本' : '小版本'}` : '选题信息已更新', type: 'success' });
      } catch {
        const isCurrentTopic = Number(currentTopicIdRef.current) === requestedTopicId;
        if (versionAction && isCurrentTopic) {
          setOutlineVersions([]);
          setOutlineVersionsLoadState('error');
          appStore.addNotification({
            title: '版本已保存，页面刷新失败',
            message: '服务端已确认大纲版本保存，但选题详情刷新失败。可重新加载大纲历史或整页重载确认，不要再次保存。',
            type: 'warning',
          });
        } else {
          appStore.addNotification({ title: '选题信息已保存', message: isCurrentTopic
            ? '服务端已确认保存，但页面刷新失败；当前内容已保留，请稍后重新加载确认，不要重复保存。'
            : '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
        }
      } finally {
        setIsAggregateSaving(false);
      }
    })
    );
  };

  aggregatePersistCommandRef.current = persistTopicAggregate;

  const performTopicManualSave = (): Promise<void> => {
    if (topicSaveRecoveryModeRef.current !== 'none') {
      setTopicSaveRecoveryNotice('请先核实上一次选题内容保存结果；核实前不会再次提交。');
      return Promise.reject(new Error('请先核实上一次选题内容保存结果。'));
    }
    setTopicSaveFeedback(null);
    const saveRevision = aggregateRevisionRef.current;
    const saveSnapshot = cloneTopicDetailDraft(draftRef.current);

    if (!topicEditorBranch.usesRuntimeManualSave || !editOutline) {
      return persistTopicAggregate(saveSnapshot, saveRevision, pendingTopicVersionActionRef.current ?? undefined);
    }
    const runtimeHandle = topicRuntimeHandleRef.current;

    if (!runtimeHandle?.manualSave) {
      const message = '当前无法保存这次修改，请稍后重试。';
      appStore.addNotification({ title: '暂时无法保存', message, type: 'error' });
      return Promise.reject(new Error(message));
    }

    manualSaveSnapshotsRef.current.set(saveRevision, saveSnapshot);
    return runtimeHandle.manualSave(saveSnapshot.outline, saveRevision).then((result) => {
      manualSaveSnapshotsRef.current.delete(saveRevision);
      if (result.status === 'saved') return;
      if (result.status === 'failed') throw result.error;
      if (result.status === 'already_destroyed') {
        const message = '编辑器已关闭，当前修改未保存。';
        appStore.addNotification({ title: '保存未完成', message, type: 'error' });
        throw new Error(message);
      }
      throw new Error('保存已取消，当前修改仍保留。');
    });
  };

  const handleSave = () => {
    void performTopicManualSave().catch((error: unknown) => {
      const detail = getUserFacingErrorMessage(error, '请检查连接后重试。');
      setTopicSaveFeedback(`保存未完成，当前修改仍保留：${detail}`);
    });
  };

  const handleCreateOutlineVersion = async (versionAction: 'minor' | 'major') => {
    if (topicSaveRecoveryModeRef.current !== 'none') {
      setTopicSaveRecoveryNotice('请先核实上一次选题内容保存结果；核实前不会创建版本。');
      return;
    }
    if (!canEditTopic || isAggregateSaving || !editOutline) return;
    pendingTopicVersionActionRef.current = versionAction;
    try {
      await performTopicManualSave();
    } catch (error) {
      const detail = getUserFacingErrorMessage(error, '请检查连接后重试。');
      setTopicSaveFeedback(`版本未保存，当前修改仍保留：${detail}`);
    } finally {
      pendingTopicVersionActionRef.current = null;
    }
  };

  const handleCancel = () => {
    if (topicSaveRecoveryModeRef.current !== 'none') return;
    const baseline = baselineDraftRef.current;
    if (baseline) {
      applyDraft(baseline);
      setIsTopicDirty(false);
    }
    setEditTitle(false);
    setEditDetails(false);
    setEditDescription(false);
    setEditOutline(false);
  };

  const {
    state: topicLeaveState,
    requestLeave: requestTopicLeave,
    saveAndLeave: saveTopicAndLeave,
    discardAndLeave: discardTopicAndLeave,
    continueEditing: continueTopicEditing,
  } = useTopicDetailLeaveGuard({
    isDirty: isCurrentDraftDirty,
    save: performTopicManualSave,
    discard: handleCancel,
  });

  const pendingRouteStayRef = useRef<(() => void) | null>(null);
  const handleRouteNavigationAttempt = useCallback((attempt: RouteNavigationAttempt) => {
    const { proceed, stay } = attempt;
    const hasPendingAuditRecovery = auditSubmitting || pendingTopicAuditRecovery !== null
      || auditRecoveryReadyScope !== topicAuditRecoveryScope;
    if (statusUpdating || pendingTopicStatusWrite || statusRecoveryReadyScope !== topicStatusRecoveryScope || hasPendingAuditRecovery) {
      setPendingStatusLeaveAttempt({ proceed, stay, kind: hasPendingAuditRecovery ? 'audit' : 'status' });
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
    void requestTopicLeave(continueOnce)
      .then((result) => {
        if (result.decision === 'proceeded') continueOnce();
      })
      .catch(stay);
  }, [auditRecoveryReadyScope, auditSubmitting, pendingTopicAuditRecovery, pendingTopicStatusWrite, requestTopicLeave, statusRecoveryReadyScope, statusUpdating, topicAuditRecoveryScope, topicStatusRecoveryScope]);
  useRouteNavigationGuard(
    Boolean(topic && !loading && (isTopicDirty || isAggregateSaving || isCurrentDraftDirty()
      || statusUpdating || pendingTopicStatusWrite || statusRecoveryReadyScope !== topicStatusRecoveryScope
      || auditSubmitting || pendingTopicAuditRecovery || auditRecoveryReadyScope !== topicAuditRecoveryScope)),
    handleRouteNavigationAttempt,
  );

  useEffect(() => {
    const hasPendingStatusRecovery = statusUpdating || pendingTopicStatusWrite !== null
      || statusRecoveryReadyScope !== topicStatusRecoveryScope;
    const hasPendingAuditRecovery = auditSubmitting || pendingTopicAuditRecovery !== null
      || auditRecoveryReadyScope !== topicAuditRecoveryScope;
    if (!hasPendingStatusRecovery && !hasPendingAuditRecovery) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [auditRecoveryReadyScope, auditSubmitting, pendingTopicAuditRecovery, pendingTopicStatusWrite, statusRecoveryReadyScope, statusUpdating, topicAuditRecoveryScope, topicStatusRecoveryScope]);

  const leaveWithPendingStatusRecovery = useCallback(() => {
    const attempt = pendingStatusLeaveAttempt;
    setPendingStatusLeaveAttempt(null);
    if (!attempt) return;
    let continued = false;
    const continueOnce = () => {
      if (continued) return;
      continued = true;
      pendingRouteStayRef.current = null;
      attempt.proceed();
    };
    pendingRouteStayRef.current = attempt.stay;
    void requestTopicLeave(continueOnce)
      .then((result) => {
        if (result.decision === 'proceeded') continueOnce();
      })
      .catch(attempt.stay);
  }, [pendingStatusLeaveAttempt, requestTopicLeave]);

  const handleContinueTopicEditing = useCallback(() => {
    continueTopicEditing();
    pendingRouteStayRef.current?.();
    pendingRouteStayRef.current = null;
  }, [continueTopicEditing]);

  const handleReturnToTopics = useCallback(() => {
    navigate('/topics');
  }, [navigate]);

  const statusColors: Record<string, string> = {
    pending: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
    approved: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
    rejected: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
    production: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
    shooting: 'bg-studio-violet-soft text-studio-violet-contrast border-studio-border-soft',
    publishing: 'bg-studio-cyan-soft text-studio-cyan-contrast border-studio-border-soft',
    completed: 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft',
  };

  const statusText: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    production: '创作中',
    shooting: '成片制作',
    publishing: '发布中',
    completed: '已完成',
  };

  const workflowSteps = [
    { status: 'pending', label: '选题审核', icon: FileText },
    { status: 'approved', label: '审核通过', icon: CheckCircle },
    { status: 'production', label: '创作阶段', icon: FileIcon },
    { status: 'shooting', label: '成片制作', icon: Camera },
    { status: 'publishing', label: '发布阶段', icon: Send },
    { status: 'completed', label: '完成归档', icon: CheckCircle },
  ];

  const nextStatuses: Record<string, Topic['status']> = {
    pending: 'approved',
    approved: 'production',
    production: 'shooting',
    shooting: 'publishing',
    publishing: 'completed',
    completed: 'completed',
  };

  const canEditTopicPermission = hasPermission('topic:update');
  const canStartProduction = !requestedOutlineVersion && hasPermission('production:update');
  const canManageTopicResources = !requestedOutlineVersion && canEditTopicPermission && hasPermission('resource:view');
  const canEditTopic = Boolean(
    !requestedOutlineVersion && topic &&
      canEditTopicPermission &&
      (
        contentEditRoles.has(currentUserRole || '') ||
        Number(topic.creator_id) === currentUserId ||
        Number(topic.assignee_id) === currentUserId
      ),
  );
  const currentStageRecord = topic
    ? topic.status === 'approved' || topic.status === 'production'
      ? 'production'
      : topic.status === 'shooting'
        ? 'shooting'
        : topic.status === 'publishing' || topic.status === 'completed'
          ? 'publishing'
          : null
    : null;
  const currentStageRecordLabel = currentStageRecord === 'production'
    ? '创作稿'
    : currentStageRecord === 'shooting'
      ? '成片制作'
      : currentStageRecord === 'publishing'
        ? '发布'
        : '';
  const missingCurrentStageRecord = Boolean(
    topic && currentStageRecord && topic.stage_record_presence && !topic.stage_record_presence[currentStageRecord],
  );
  const topicDetailManualAdapter = useMemo(() => createTopicDetailManualAdapter({
    documentId: `topic:${topic?.id ?? id ?? 'unbound'}`,
    initialContent: baselineDraftRef.current?.outline || '',
    readonly: !canEditTopic || !editOutline || topicSaveRecoveryMode !== 'none',
    persist: persistTopicManualBridge,
  }), [canEditTopic, editOutline, id, persistTopicManualBridge, topic?.id, topicSaveRecoveryMode]);
  const isOverdue = topic?.deadline && new Date(topic.deadline) < new Date() && topic.status !== 'completed' && topic.status !== 'rejected';

  const beginEditingTopic = () => {
    if (topicSaveRecoveryModeRef.current !== 'none') {
      setTopicSaveRecoveryNotice('请先核实上一次选题内容保存结果；核实前不能开始新的编辑。');
      return;
    }
    if (!permissionsLoading && !canEditTopic) {
      appStore.addNotification({
        title: '暂不可编辑',
        message: '当前账号仅可查看此选题，如需修改请联系负责人。',
        type: 'warning',
      });
      return;
    }

    setEditTitle(true);
    setEditDetails(true);
    setEditDescription(true);
    setEditOutline(true);
  };

  if (loading || (topic && topic.id !== Number(id))) {
    return <LoadingState type="inline" text="正在加载选题详情…" className="flex h-64 w-full justify-center" />;
  }

  if (!topic) {
    if (topicLoadFailure === 'not-found') {
      return (
        <section role="status" className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-card border border-studio-border-soft bg-studio-surface p-6 text-center">
          <p className="text-base font-semibold text-studio-text-primary">选题不存在或已不可见</p>
          <p className="text-sm text-studio-text-secondary">请返回选题列表确认当前可访问的内容。</p>
          <ActionButton type="button" variant="secondary" className="min-h-11" onClick={() => navigate('/topics')}>返回选题列表</ActionButton>
        </section>
      );
    }

    if (topicLoadFailure === 'unavailable') {
      return (
        <section role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-card border border-studio-coral/30 bg-studio-coral/10 p-6 text-center">
          <p className="text-base font-semibold text-studio-coral-contrast">选题详情暂时无法读取</p>
          <p className="text-sm text-studio-text-secondary">当前无法确认该选题是否存在；读取失败不代表选题已删除。你可以重新加载，或返回列表稍后再试。</p>
          <div className="flex flex-wrap justify-center gap-2">
            <ActionButton type="button" variant="primary" className="min-h-11" onClick={() => setTopicDetailReload((current) => current + 1)}>重新加载选题详情</ActionButton>
            <ActionButton type="button" variant="secondary" className="min-h-11" onClick={() => navigate('/topics')}>返回选题列表</ActionButton>
          </div>
        </section>
      );
    }

    return <p role="status" className="py-8 text-center text-studio-text-secondary">正在读取选题详情…</p>;
  }

  const isEditing = editTitle || editDetails || editDescription || editOutline;
  const canPersistTopicDraft = canSaveTopicDetailDraft(
    topicEditorBranch,
    editOutline,
    hasTopicManualRuntimeHandle,
  );
  // Only readonly varies while this page is active. The renderer mode was
  // captured after Topic load, which prevents a dirty draft from hot-switching.
  const activeTopicEditorBranch: TopicDetailEditorBranch = {
    ...topicEditorBranch,
    readonly: !canEditTopic || !editOutline || topicSaveRecoveryMode !== 'none',
  };
  const statusWritePendingForCurrentTopic = pendingTopicStatusWrite?.topicId === topic.id;
  const statusWriteLocked = pendingTopicStatusWrite !== null || statusRecoveryReadyScope !== topicStatusRecoveryScope;
  const auditRecoveryWritePending = pendingTopicAuditRecovery !== null || auditRecoveryReadyScope !== topicAuditRecoveryScope;
  const auditFieldsDisabled = auditSubmitting || auditNeedsVerification || verifyingAudit || auditRecoveryWritePending || !canAudit;
  const auditSubmitDisabled = auditSubmitting || auditNeedsVerification || verifyingAudit || !canAudit
    || auditRecoveryReadyScope !== topicAuditRecoveryScope
    || (pendingTopicAuditRecovery !== null && (pendingTopicAuditRecovery.kind !== 'write' || auditRecoveryOutcome !== 'retryable'));

  return (
    <div
      className="space-y-6"
      data-topic-dirty={isTopicDirty ? 'true' : 'false'}
      data-topic-manual-runtime={hasTopicManualRuntimeHandle ? 'ready' : 'unavailable'}
      data-topic-leave-state={topicLeaveState}
      data-topic-status-recovery={pendingTopicStatusWrite?.kind ?? 'none'}
      data-topic-editor-mode={topicEditorBranch.topicEditorMode}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={handleReturnToTopics}
          className="flex items-center gap-2 text-studio-text-secondary transition-colors hover:text-studio-text-primary"
        >
          <ChevronLeft className="w-5 h-5" />
          返回列表
        </button>
      </div>

      <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {editTitle ? (
                <>
                  <label htmlFor="topic-title" className="sr-only">选题标题</label>
                  <input
                    id="topic-title"
                    name="topic-title"
                    type="text"
                    value={title}
                    disabled={topicSaveRecoveryMode !== 'none'}
                    onChange={(e) => changeTitle(e.target.value)}
                    className={`text-2xl font-bold ${styles.textPrimary} ${styles.bgInput} border border-studio-primary rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-studio-primary w-96`}
                    autoFocus
                  />
                </>
              ) : (
                <PageHeading
                  className={`text-2xl font-bold ${styles.textPrimary} cursor-pointer hover:text-studio-primary transition-colors`}
                  onClick={() => {
                    if (canEditTopic && topicSaveRecoveryMode === 'none') setEditTitle(true);
                  }}
                >
                  {title}
                </PageHeading>
              )}
              {isOverdue && (
                <span className="flex items-center gap-1 rounded-full border border-studio-coral/30 bg-studio-coral/15 px-2 py-1 text-xs text-studio-coral-contrast">
                  <AlertTriangle className="w-3 h-3" />
                  已逾期
                </span>
              )}
            </div>
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border ${statusColors[topic.status]}`}>
              {topic.status === 'pending' && <Clock className="w-4 h-4" />}
              {topic.status === 'approved' && <CheckCircle className="w-4 h-4" />}
              {topic.status === 'rejected' && <XCircle className="w-4 h-4" />}
              {statusText[topic.status]}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <UserIcon className="w-4 h-4" />
              <span className="text-sm">提交人</span>
            </div>
            <p className={`${styles.textPrimary} font-medium`}>{topic.creator_name}</p>
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <UserIcon className="w-4 h-4" />
              <span id="topic-assignee-label" className="text-sm">负责人</span>
            </div>
            {editDetails ? (
              <select
                id="topic-assignee"
                name="topic-assignee"
                aria-labelledby="topic-assignee-label"
                value={details.assignee_id}
                disabled={topicSaveRecoveryMode !== 'none' || userDirectoryLoadState === 'loading' || (userDirectoryLoadState === 'error' && users.length === 0)}
                onChange={(e) => changeDetails({ ...details, assignee_id: parseInt(e.target.value) })}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
              >
                <option value={0}>未分配</option>
                {details.assignee_id && !users.some((user) => user.id === details.assignee_id) ? (
                  <option value={details.assignee_id}>{topic.assignee_name || '当前负责人（暂不可确认）'}</option>
                ) : null}
                {users.filter(u => u.enabled).map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            ) : (
              <p
                className={`${styles.textPrimary} font-medium cursor-pointer hover:text-studio-primary transition-colors`}
                onClick={() => {
                  if (canEditTopic && topicSaveRecoveryMode === 'none') setEditDetails(true);
                }}
              >
                {details.assignee_id ? topic.assignee_name || users.find(u => u.id === details.assignee_id)?.name || '负责人信息暂不可用' : '未指派'}
              </p>
            )}
            {!showAuditModal ? userDirectoryFeedback : null}
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <Calendar className="w-4 h-4" />
              <span id="topic-deadline-label" className="text-sm">截止时间</span>
            </div>
            {editDetails ? (
              <input
                id="topic-deadline"
                name="topic-deadline"
                aria-labelledby="topic-deadline-label"
                type="date"
                value={details.deadline}
                disabled={topicSaveRecoveryMode !== 'none'}
                onChange={(e) => changeDetails({ ...details, deadline: e.target.value })}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
              />
            ) : (
              <button
                type="button"
                aria-label={`${formatBeijingDate(details.deadline)}，编辑截止时间`}
                disabled={!canEditTopic || topicSaveRecoveryMode !== 'none'}
                className={`font-medium cursor-pointer bg-transparent p-0 text-left transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary disabled:cursor-default disabled:opacity-100 ${isOverdue ? 'text-studio-coral-contrast' : `${styles.textPrimary} hover:text-studio-primary-contrast`}`}
                onClick={() => {
                  if (canEditTopic && topicSaveRecoveryMode === 'none') setEditDetails(true);
                }}
              >
                {formatBeijingDate(details.deadline)}
              </button>
            )}
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className={`flex items-center gap-2 ${styles.textSecondary} mb-2`}>
              <FileText className="w-4 h-4" />
              <span id="topic-platform-label" className="text-sm">发布平台</span>
            </div>
            {editDetails ? (
              <input
                id="topic-platform"
                name="topic-platform"
                aria-labelledby="topic-platform-label"
                type="text"
                value={details.platform}
                disabled={topicSaveRecoveryMode !== 'none'}
                onChange={(e) => changeDetails({ ...details, platform: e.target.value })}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary ${styles.textPlaceholder}`}
                placeholder="输入发布平台"
              />
            ) : (
              <p
                className={`${styles.textPrimary} font-medium cursor-pointer hover:text-studio-primary transition-colors`}
                onClick={() => {
                  if (canEditTopic && topicSaveRecoveryMode === 'none') setEditDetails(true);
                }}
              >
                {getPlatformLabel(details.platform) || '-'}
              </p>
            )}
          </div>
        </div>

        {/* 项目背景 + 目标受众 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-2">
              <h2 id="topic-project-background-label" className={`${styles.textSecondary} text-sm font-medium`}>项目背景</h2>
              {canEditTopic && topicSaveRecoveryMode === 'none' && isEditing && (
                <button type="button" aria-label="编辑项目背景" onClick={() => setEditDescription(true)} className="text-xs text-studio-primary hover:text-studio-primary">编辑</button>
              )}
            </div>
            {editDescription ? (
              <textarea
                id="topic-project-background"
                name="topic-project-background"
                aria-labelledby="topic-project-background-label"
                value={parsedFields.projectBackground}
                disabled={topicSaveRecoveryMode !== 'none'}
                onChange={(e) => changeParsedFields({ ...parsedFields, projectBackground: e.target.value })}
                rows={4}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary resize-none`}
                placeholder="项目背景..."
              />
            ) : (
              <p className={`${styles.textPrimary} text-sm leading-relaxed whitespace-pre-wrap`}>
                {parsedFields.projectBackground || '无'}
              </p>
            )}
          </div>
          <div className={`${styles.bgTertiary} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-2">
              <h2 id="topic-target-audience-label" className={`${styles.textSecondary} text-sm font-medium`}>目标受众</h2>
              {canEditTopic && topicSaveRecoveryMode === 'none' && isEditing && (
                <button type="button" aria-label="编辑目标受众" onClick={() => setEditDescription(true)} className="text-xs text-studio-primary hover:text-studio-primary">编辑</button>
              )}
            </div>
            {editDescription ? (
              <textarea
                id="topic-target-audience"
                name="topic-target-audience"
                aria-labelledby="topic-target-audience-label"
                value={parsedFields.targetAudience}
                disabled={topicSaveRecoveryMode !== 'none'}
                onChange={(e) => changeParsedFields({ ...parsedFields, targetAudience: e.target.value })}
                rows={4}
                className={`w-full px-3 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary resize-none`}
                placeholder="目标受众..."
              />
            ) : (
              <p className={`${styles.textPrimary} text-sm leading-relaxed whitespace-pre-wrap`}>
                {parsedFields.targetAudience || '无'}
              </p>
            )}
          </div>
        </div>

        {/* 剧本大纲 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className={`${styles.textSecondary} text-sm font-medium`}>剧本大纲</h2>
            <div className="flex items-center gap-2">
                {canEditTopic && topicSaveRecoveryMode === 'none' && !editOutline && isEditing && (
                <button onClick={() => setEditOutline(true)} className="text-xs text-studio-primary hover:text-studio-primary">编辑大纲</button>
              )}
            </div>
          </div>
          {editOutline ? (
            activeTopicEditorBranch.usesRuntimeManualSave ? (
              <ContentEditor
                writingGoalKey={`topic:${topic?.id ?? id}`}
                ariaLabel="选题剧本大纲"
                value={scriptContent}
                onChange={changeOutline}
                mode={activeTopicEditorBranch.contentEditorMode}
                readOnly={activeTopicEditorBranch.readonly}
                collaborationEnabled={false}
                adapter={topicDetailManualAdapter}
                onRuntimeHandleChange={handleTopicRuntimeHandleChange}
              />
            ) : (
              <ContentEditor
                writingGoalKey={`topic:${topic?.id ?? id}`}
                ariaLabel="选题剧本大纲"
                value={scriptContent}
                onChange={changeOutline}
                mode={activeTopicEditorBranch.contentEditorMode}
                readOnly={activeTopicEditorBranch.readonly}
                collaborationEnabled={false}
              />
            )
          ) : (
            <div className={`editor-content-preview tiptap ${styles.bgTertiary} rounded-lg p-6 ${styles.textPrimary} min-h-[200px] leading-relaxed`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(scriptContent || '暂无大纲内容')) }}></div>
          )}
          <section aria-label="大纲版本历史" className="mt-4 rounded-xl border border-studio-border-soft bg-studio-surface-soft/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-studio-text-primary">版本历史</h3>
                <p className="mt-1 text-xs text-studio-text-muted">普通保存会更新当前稿；仅小版本和大版本操作会留档。</p>
              </div>
              {canEditTopic && editOutline && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton type="button" disabled={isAggregateSaving || topicSaveRecoveryMode !== 'none' || !canPersistTopicDraft} onClick={() => void handleCreateOutlineVersion('minor')}>小版本保存</ActionButton>
                  <ActionButton type="button" variant="primary" disabled={isAggregateSaving || topicSaveRecoveryMode !== 'none' || !canPersistTopicDraft} onClick={() => void handleCreateOutlineVersion('major')}>大版本保存</ActionButton>
                </div>
              )}
            </div>
            {canEditTopic && editOutline && topicEditorBranch.usesRuntimeManualSave && !hasTopicManualRuntimeHandle ? (
              <p role="status" className="mt-2 text-xs text-studio-text-muted">编辑器正在准备，准备完成后即可保存。</p>
            ) : null}
            {requestedOutlineVersion ? (
              <p
                role={outlineVersionsLoadState === 'error' || (outlineVersionsLoadState === 'ready' && !requestedOutlineVersionEntry) ? 'alert' : 'status'}
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${outlineVersionsLoadState === 'error' || (outlineVersionsLoadState === 'ready' && !requestedOutlineVersionEntry) ? 'bg-studio-amber-soft text-studio-amber-contrast' : 'bg-studio-cyan-soft text-studio-cyan-contrast'}`}
              >
                {outlineVersionsLoadState === 'loading'
                  ? `正在读取来源大纲版本 ${requestedOutlineVersion}…`
                  : outlineVersionsLoadState === 'error'
                    ? `来源大纲版本 ${requestedOutlineVersion} 读取失败；不会用当前大纲替代。`
                    : requestedOutlineVersionEntry
                      ? `正在查看创作初稿引用的大纲版本 ${requestedOutlineVersion}。`
                      : `来源大纲版本 ${requestedOutlineVersion} 当前无法定位；没有回退到最新大纲。`}
              </p>
            ) : null}
            {!requestedOutlineVersion && outlineVersionsLoadState === 'loading' ? (
              <p role="status" className="mt-3 text-xs text-studio-text-muted">正在读取大纲版本历史…</p>
            ) : null}
            {!requestedOutlineVersion && outlineVersionsLoadState === 'error' ? (
              <p role="alert" className="mt-3 rounded-lg bg-studio-amber-soft px-3 py-2 text-sm text-studio-amber-contrast">
                大纲版本历史读取失败，请重新加载。
              </p>
            ) : null}
            {outlineVersionsLoadState === 'error' ? (
              <button type="button" onClick={() => void reloadOutlineVersions()} className="xmt-btn-secondary mt-2 min-h-10 px-3 text-xs">
                重新加载大纲历史
              </button>
            ) : null}
            {outlineVersions.length > 0 ? (
              <ol className="mt-3 space-y-2">
                {outlineVersions.map((version) => (
                  <li
                    key={version.id}
                    ref={!version.is_baseline && version.version === requestedOutlineVersion ? requestedOutlineCardRef : undefined}
                    className={`rounded-lg border border-studio-border-soft bg-studio-surface-soft px-3 py-2 text-xs ${!version.is_baseline && version.version === requestedOutlineVersion ? 'ring-2 ring-studio-focus-ring' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-studio-text-primary">{version.is_baseline ? '历史原稿（时间未记录）' : `${version.version} · ${version.change_type === 'major' ? '大版本' : '小版本'}`}</span>
                      <span className="text-studio-text-muted">{version.is_baseline ? '旧内容未记录操作人和时间' : `${version.operator_name || '系统记录'} · ${version.created_at || '时间未记录'}`}</span>
                    </div>
                    <details className="mt-2" open={!version.is_baseline && version.version === requestedOutlineVersion}>
                      <summary className="min-h-10 cursor-pointer py-1 font-medium text-studio-primary-contrast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring">查看此版本正文</summary>
                      <div className={`editor-content-preview tiptap mt-2 max-h-80 overflow-auto rounded-lg border border-studio-border-soft ${styles.bgTertiary} p-4 leading-relaxed ${styles.textPrimary}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(version.content)) }} />
                    </details>
                  </li>
                ))}
              </ol>
            ) : outlineVersionsLoadState === 'ready' ? <p className="mt-3 text-xs text-studio-text-muted">暂无已保存版本</p> : null}
          </section>
        </div>

        {isEditing && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleSave}
              disabled={isAggregateSaving || topicSaveRecoveryMode !== 'none' || !canPersistTopicDraft}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-white transition-colors xmt-btn-primary"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
            <button
              onClick={handleCancel}
              disabled={topicSaveRecoveryMode !== 'none'}
              className={`px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors flex items-center gap-2`}
            >
              取消
            </button>
          </div>
        )}
        {topicSaveFeedback ? (
          <p role="alert" className="mb-6 rounded-xl border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast">
            {topicSaveFeedback}
          </p>
        ) : null}
        {topicSaveRecoveryMode !== 'none' ? (
          <section
            role={topicSaveRecoveryMode === 'unknown' || topicSaveRecoveryMode === 'invalid' ? 'alert' : 'status'}
            data-testid="topic-save-recovery"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast"
          >
            <span>{verifyingTopicSave ? '正在只读核实上次选题保存结果…' : topicSaveRecoveryNotice}</span>
            <div className="flex flex-wrap gap-2">
              {topicSaveRecoveryMode === 'unknown' && topicSaveRecoveryRef.current ? (
                <ActionButton type="button" variant="secondary" disabled={verifyingTopicSave || isAggregateSaving} onClick={() => void verifyTopicDetailSave()}>
                  {verifyingTopicSave ? '核实中…' : '只读核实上次保存'}
                </ActionButton>
              ) : null}
              {topicSaveRecoveryMode === 'retryable' ? (
                <ActionButton type="button" variant="primary" disabled={isAggregateSaving} onClick={() => void retryTopicDetailSaveExplicitly()}>
                  {isAggregateSaving ? '正在提交…' : topicSaveRecoveryRef.current?.versionAction
                    ? `按原${topicSaveRecoveryRef.current.versionAction === 'major' ? '大版本' : '小版本'}操作重试`
                    : '按当前本地内容保存'}
                </ActionButton>
              ) : null}
              {topicSaveRecoveryMode === 'conflict' ? (
                <>
                  <ActionButton type="button" variant="secondary" onClick={adoptServerTopicSaveConflict}>采用服务端内容</ActionButton>
                  <ActionButton type="button" variant="primary" onClick={continueWithLocalTopicSaveConflict}>保留本地修改</ActionButton>
                </>
              ) : null}
              {topicSaveRecoveryMode === 'invalid' ? (
                <ActionButton type="button" variant="secondary" disabled={verifyingTopicSave} onClick={() => void adoptServerForUnreadableTopicRecovery()}>
                  {verifyingTopicSave ? '正在重新读取…' : '重新读取并采用服务端内容'}
                </ActionButton>
              ) : null}
            </div>
          </section>
        ) : null}

        <TopicResourcesPanel topicId={topic.id} canManage={canEditTopic && canManageTopicResources && topicSaveRecoveryMode === 'none'} />
        <TopicAssetDimensionsPanel key={topic.id} topicId={topic.id} canManage={canEditTopic && topicSaveRecoveryMode === 'none'} />

        <div className="mb-6">
          <h2 className={`${styles.textSecondary} text-sm mb-4`}>流程进度</h2>
          {missingCurrentStageRecord && currentStageRecord && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-studio-border-soft bg-studio-amber-soft p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber-contrast" />
                <div>
                  <p className="font-medium text-studio-amber-contrast">当前阶段缺少{currentStageRecordLabel}记录</p>
                  <p className="mt-1 text-sm text-studio-text-secondary">
                    {topic.status === 'completed'
                      ? '选题已完成，请先核对发布历史；系统不会自动补建历史发布数据。'
                      : '请先补齐当前阶段记录，再推进到下一阶段。补齐不会改变选题状态，操作会记入历史。'}
                  </p>
                </div>
              </div>
              {topic.status !== 'completed' && canEditTopic && (
                <ActionButton type="button" variant="primary" disabled={repairingStageRecord || topicSaveRecoveryMode !== 'none'} onClick={() => void handleRepairStageRecord()}>
                  {repairingStageRecord ? '正在补齐…' : `补齐${currentStageRecordLabel}记录`}
                </ActionButton>
              )}
            </div>
          )}
          <div role="group" aria-label="选题流程进度" className="flex max-w-full items-center gap-2 overflow-x-auto pb-2">
            {workflowSteps.map((step, index) => {
              const isCompleted = workflowSteps.findIndex(s => s.status === topic.status) >= index;
              const isCurrent = step.status === topic.status;
              const Icon = step.icon;
              
              return (
                <div key={step.status} className="flex items-center">
                  <div className={`flex flex-col items-center ${isCurrent ? 'scale-110' : ''}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isCurrent ? 'bg-studio-primary-button text-white' : isCompleted ? 'bg-studio-success/15 text-studio-success-contrast' : `${styles.bgTertiary} text-studio-text-muted`
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs mt-2 ${
                      isCurrent ? 'text-studio-primary-contrast font-medium' :
                      isCompleted ? 'text-studio-success-contrast' :
                      'text-studio-text-muted'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className={`w-16 h-1 mx-2 rounded-full ${isCompleted ? 'bg-studio-success' : styles.progressBg}`}></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {canStartProduction && !handoffRecoveryLoaded ? (
          <p role="status" className="mb-4 text-sm text-studio-text-secondary">正在检查本选题的创作恢复状态…</p>
        ) : null}
        {handoffRecoveryLoaded && handoffRecovery !== null ? (
          <section data-testid="topic-production-handoff-recovery" role={handoffRecovery === 'invalid' ? 'alert' : 'status'} className="mb-4 space-y-3 rounded-xl border border-studio-border-soft bg-studio-surface p-4 text-sm text-studio-text-secondary">
            <p>{handoffRecovery === 'invalid'
              ? '上次创作恢复记录无法读取。为避免重复创建，开始创作已锁定。'
              : handoffRecovery.phase === 'retryable'
                ? '服务器暂未找到这条创作稿。原请求编号已保留；只有明确确认后才会用同一编号重试。'
                : '创作结果仍无法确认。再次创建已锁定；请先只读核实。'}</p>
            {handoffRecovery !== 'invalid' ? (
              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" variant="secondary" disabled={startingProduction} onClick={() => { void handleStartProduction('verify'); }} className="min-h-10">
                  {startingProduction ? '正在核实…' : '只读核实创作结果'}
                </ActionButton>
                {handoffRecovery.phase === 'retryable' ? (
                  <ActionButton type="button" variant="primary" disabled={startingProduction} onClick={() => { void handleStartProduction('retry'); }} className="min-h-10">
                    使用同一请求编号明确重试
                  </ActionButton>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
        <div className="mb-6">
          <h2 className={`${styles.textSecondary} text-sm mb-4`}>操作</h2>
          <div className="flex flex-wrap gap-3">
            {topic.status === 'pending' && canAudit && (
              <button
                onClick={openAuditModal}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-white transition-colors xmt-btn-primary"
              >
                <CheckCircle className="w-4 h-4" />
                审核选题
              </button>
            )}
            {canStartProduction && (topic.status === 'approved' || topic.status === 'production') && (
              <button
                onClick={() => { void handleStartProduction(); }}
                disabled={startingProduction || topicSaveRecoveryMode !== 'none' || !handoffRecoveryLoaded || handoffRecovery !== null}
                className="flex items-center gap-2 rounded-lg bg-studio-primary-button px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileIcon className="h-4 w-4" />
                {startingProduction ? '正在准备…' : topic.status === 'approved' ? '开始创作' : '进入创作'}
              </button>
            )}
            {!isEditing && (
              permissionsLoading || canEditTopic ? (
                <button
                onClick={beginEditingTopic}
                disabled={topicSaveRecoveryMode !== 'none'}
                  className={`px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors flex items-center gap-2`}
                >
                  <FileText className="w-4 h-4" />
                  编辑选题
                </button>
              ) : (
                <p role="status" className="text-sm text-studio-text-muted">
                  当前账号仅可查看此选题
                </p>
              )
            )}
            {canEditTopic && !missingCurrentStageRecord && (topic.status === 'shooting' || topic.status === 'publishing') && (
              <button
                onClick={() => handleUpdateStatus(nextStatuses[topic.status])}
                disabled={statusUpdating || statusWriteLocked || verifyingTopicStatus || topicSaveRecoveryMode !== 'none'}
                aria-busy={statusUpdating}
                className="xmt-btn xmt-btn-primary"
              >
                <ArrowRight className="w-4 h-4" />
                {statusUpdating ? '阶段处理中…' : statusWriteLocked ? '先核实状态' : '推进到下一阶段'}
              </button>
            )}
          </div>
          {pendingTopicStatusWrite ? (
            <div
              role="alert"
              data-testid="topic-status-recovery"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast"
            >
              <span>
                {verifyingTopicStatus
                  ? `正在只读核实选题 #${pendingTopicStatusWrite.topicId} 的状态…`
                  : statusWritePendingForCurrentTopic
                    ? statusVerificationNotice
                    : `选题 #${pendingTopicStatusWrite.topicId} 的阶段更新结果尚未确认；状态写入已暂停。`}
              </span>
              <ActionButton type="button" variant="secondary" disabled={verifyingTopicStatus} onClick={() => void verifyPendingTopicStatusWrite()}>
                {verifyingTopicStatus ? '核实中…' : '只读核实状态'}
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
        <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4`}>历史记录</h2>
        {topic.history && topic.history.length > 0 ? (
          <div className="space-y-3">
            {topic.history.map((record) => (
              <div key={record.id} className={`${styles.bgTertiary} rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`${styles.textPrimary} font-medium`}>{record.operator_name}</span>
                  <span className={`${styles.textSecondary} text-sm`}>{formatBeijingTime(record.created_at)}</span>
                </div>
                <p className={`${styles.textPrimary}`}>{record.comment}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className={`${styles.textSecondary} text-center py-8`}>暂无历史记录</p>
        )}
      </div>

      {showAuditModal && createPortal((
        <div
          ref={auditOverlayRef}
          className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={auditDialogTitleId}
          aria-busy={auditSubmitting || verifyingAudit}
          tabIndex={-1}
        >
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 ${styles.border}`}>
            <h2 id={auditDialogTitleId} className={`text-xl font-bold ${styles.textPrimary} mb-6`}>审核选题</h2>
            {auditVerificationNotice ? <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 px-4 py-3 text-sm leading-6 text-studio-amber-contrast">
              <span>{verifyingAudit ? '正在只读核实审核状态…' : auditVerificationNotice}</span>
              {auditNeedsVerification ? <ActionButton type="button" variant="secondary" disabled={verifyingAudit} onClick={() => void verifyAuditStatus()}>{verifyingAudit ? '核实中…' : '只读核实状态'}</ActionButton> : null}
            </div> : null}
            
            <div className="space-y-4">
              <div>
                <p id="topic-audit-result-label" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>审核结果</p>
                <div role="group" aria-labelledby="topic-audit-result-label" className="flex gap-4">
                  <button
                    type="button"
                    aria-pressed={auditData.status === 'approved'}
                    disabled={auditFieldsDisabled}
                    onClick={() => setAuditData({ ...auditData, status: 'approved' })}
                    className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-60 ${
                      auditData.status === 'approved' 
                        ? 'border border-studio-success/30 bg-studio-success-soft text-studio-success-contrast'
                        : `${styles.bgTertiary} ${styles.textPrimary} ${styles.hoverBg}`
                    }`}
                  >
                    <CheckCircle className="w-5 h-5" />
                    审核通过
                  </button>
                  <button
                    type="button"
                    aria-pressed={auditData.status === 'rejected'}
                    disabled={auditFieldsDisabled}
                    onClick={() => setAuditData({ ...auditData, status: 'rejected' })}
                    className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-60 ${
                      auditData.status === 'rejected' 
                        ? 'border border-studio-coral/30 bg-studio-coral-soft text-studio-coral-contrast'
                        : `${styles.bgTertiary} ${styles.textPrimary} ${styles.hoverBg}`
                    }`}
                  >
                    <XCircle className="w-5 h-5" />
                    驳回修改
                  </button>
                </div>
              </div>
              
              {auditData.status === 'approved' && (
                <div>
                  <label htmlFor="topic-audit-assignee" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>指派负责人</label>
                  <select
                    id="topic-audit-assignee"
                    name="topic-audit-assignee"
                    value={auditData.assignee_id}
                    disabled={auditFieldsDisabled || userDirectoryLoadState === 'loading' || (userDirectoryLoadState === 'error' && users.length === 0)}
                    onChange={(e) => setAuditData({ ...auditData, assignee_id: parseInt(e.target.value) })}
                    className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
                  >
                    <option value={0}>请选择负责人</option>
                    {users.filter(u => u.enabled && u.role !== 'admin').map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                  {userDirectoryFeedback}
                </div>
              )}
              
              <div>
                <label htmlFor="topic-audit-comment" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>审核意见</label>
                <textarea
                  id="topic-audit-comment"
                  name="topic-audit-comment"
                  value={auditData.comment}
                  disabled={auditFieldsDisabled}
                  onChange={(e) => setAuditData({ ...auditData, comment: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary resize-none ${styles.textPlaceholder}`}
                  placeholder="请输入审核意见..."
                />
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  disabled={auditSubmitting || auditNeedsVerification || verifyingAudit}
                  onClick={closeAuditModal}
                  className={`flex-1 px-4 py-2 ${styles.bgTertiary} ${styles.hoverBg} ${styles.textPrimary} rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60`}
                >
                  {verifyingAudit ? '正在核实…' : auditSubmitting ? '审核处理中…' : '取消'}
                </button>
                <button
                  type="button"
                  disabled={auditSubmitDisabled}
                  aria-busy={auditSubmitting || verifyingAudit}
                  onClick={handleAudit}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60 ${
                    auditData.status === 'approved'
                      ? 'border border-studio-success/30 bg-studio-success-soft text-studio-success-contrast hover:bg-studio-success-soft'
                      : 'border border-studio-coral/30 bg-studio-coral-soft text-studio-coral-contrast hover:bg-studio-coral-soft'
                  }`}
                >
                  {auditSubmitting ? '正在提交审核…' : pendingTopicAuditRecovery?.kind === 'write' && auditRecoveryOutcome === 'retryable'
                    ? '确认再次提交审核'
                    : auditData.status === 'approved' ? '通过审核' : '驳回选题'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      <ConfirmModal
        open={showAuditRetryConfirm}
        title="确认再次提交审核"
        description={(
          <div className="space-y-2">
            <p>服务端仍处于待审核状态，审核历史也未变化。系统会再次提交此前保存的原审核结果、负责人和审核意见。</p>
            <p>本次操作：{pendingTopicAuditRecovery?.kind === 'write' && pendingTopicAuditRecovery.target === 'approved' ? '审核通过' : '驳回选题'}</p>
            {pendingTopicAuditRecovery?.kind === 'write' && pendingTopicAuditRecovery.comment ? <p>原审核意见：{pendingTopicAuditRecovery.comment}</p> : null}
          </div>
        )}
        confirmText="确认再次提交"
        cancelText="返回核实"
        variant="warning"
        loading={auditSubmitting}
        confirmDisabled={!canAudit || auditRecoveryOutcome !== 'retryable'}
        onCancel={() => setShowAuditRetryConfirm(false)}
        onConfirm={confirmAuditRetry}
      />

      <BaseModal
        open={topicLeaveState === 'dirty' || topicLeaveState === 'saving' || topicLeaveState === 'failed'}
        onClose={handleContinueTopicEditing}
        title={topicLeaveState === 'failed' ? '保存失败，无法离开' : '存在未保存的修改'}
        description={topicLeaveState === 'failed'
          ? topicSaveRecoveryMode !== 'none'
            ? '上次保存结果尚未处理；请留在此页面完成只读核实或明确处理本地草稿。'
            : '保存未完成。您可以重试保存，放弃本次修改后离开，或继续编辑。'
          : topicSaveRecoveryMode !== 'none'
            ? '上次保存结果尚未处理；请先完成只读核实或明确处理本地草稿。'
            : '离开前请选择保存当前选题修改，或明确放弃本次修改。'}
        size="sm"
        closeOnOverlayClick={topicLeaveState !== 'saving'}
        closeOnEscape={topicLeaveState !== 'saving'}
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleContinueTopicEditing}
              disabled={topicLeaveState === 'saving'}
              className={`rounded-xl px-4 py-2.5 text-sm disabled:opacity-60 ${styles.buttonSecondary}`}
            >
              继续编辑
            </button>
            <button
              type="button"
              onClick={() => { void discardTopicAndLeave(); }}
              disabled={topicLeaveState === 'saving' || topicSaveRecoveryMode !== 'none'}
              className="xmt-btn xmt-btn-danger rounded-xl disabled:opacity-60"
            >
              放弃离开
            </button>
            <button
              type="button"
              onClick={() => { void saveTopicAndLeave(); }}
              disabled={topicLeaveState === 'saving' || topicSaveRecoveryMode !== 'none'}
              className="xmt-btn xmt-btn-primary rounded-xl disabled:opacity-60"
            >
              {topicLeaveState === 'saving' ? '正在保存…' : '保存并离开'}
            </button>
          </div>
        }
      >
        <p className={`text-sm leading-6 ${styles.textSecondary}`}>
          系统检测到当前选题还有未保存的修改。保存完成后会自动前往你刚才选择的页面。
        </p>
      </BaseModal>

      <ConfirmModal
        open={pendingStatusLeaveAttempt !== null}
        title={pendingStatusLeaveAttempt?.kind === 'audit' ? '审核结果尚未核实' : '阶段更新结果尚未核实'}
        description={pendingStatusLeaveAttempt?.kind === 'audit'
          ? '离开后，系统会保留本次审核结果、审核意见和恢复记录。重新打开此选题时会先只读读取服务器状态，不会自动重发审核。'
          : '离开后，系统会保留本次阶段核实记录。重新打开此选题时会先只读读取服务器状态，不会自动重发阶段更新。'}
        confirmText="离开并保留核实记录"
        cancelText={pendingStatusLeaveAttempt?.kind === 'audit' ? '留在本页核实审核' : '留在本页核实'}
        variant="warning"
        onCancel={() => {
          pendingStatusLeaveAttempt?.stay();
          setPendingStatusLeaveAttempt(null);
        }}
        onConfirm={leaveWithPendingStatusRecovery}
      />
    </div>
  );
}

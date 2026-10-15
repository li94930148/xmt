import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { deleteProduction, getProductionById, getProductionHistory, updateProduction } from '../api';
import type { Production as ProductionType, ProductionHistory, Topic } from '../types';
import { getTopic } from '../api';
import ContentEditor, { type EditorCommandHandle } from '../components/ContentEditor';
import { useWritingFocus } from '../components/layout/WritingFocusContext';
import { buildMissingOutlineSkeleton, extractOutlineHeadings } from '../components/editor/outlineSkeleton';
import EditorLeaveFailureDialog from '../components/editor/EditorLeaveFailureDialog';
import { ConfirmModal } from '../components/common';
import { ActionButton, EmptyState, GlassPanel, PageShell, StatusPill, StudioSkeletonCard } from '../components/studio';
import { getCollaborationRoomId, getProductionVersionRoomId } from '../collaboration/core/events';
import { createProductionEditorAdapter } from '../editor/adapters/productionEditorAdapter';
import { getTimelineView } from '../editor/timeline/unifiedContentTimeline';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingTime, formatUtcToBeijingTime } from '../lib/utils';
import { parseStoredBjt } from '@shared/time';
import { productionHistoryTimestamp } from '../lib/productionHistoryTime';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import { editorStateLabel, useEditorEventState } from '../editor/state/editorStateManager';
import type { ContentEditorRuntimeHandle } from '../editor/contracts/contentEditorAdapter';
import { useEditorLeaveGuard } from '../hooks/useEditorLeaveGuard';
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

const CONTENT_EDIT_ROLES = new Set(['admin', 'editor', 'copywriter', 'post_production', 'camera']);

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
  const [searchParams] = useSearchParams();
  const requestedVersion = searchParams.get('version')?.trim() || '';
  const addNotification = useAppStore((state) => state.addNotification);
  const theme = useAppStore((state) => state.theme);
  const authUser = useAuthStore((state) => state.user);
  const isDark = theme === 'dark';
  const { hasPermission } = usePermission();
  const socket = useSocket();
  const { focused: writingFocused, setFocused: setWritingFocused } = useWritingFocus();

  const [production, setProduction] = useState<ProductionType | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [history, setHistory] = useState<HistoryVersion[]>([]);
  const [linkedHistoryVersion, setLinkedHistoryVersion] = useState<HistoryVersion | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const detailRequestRef = useRef(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [outlineEditorReady, setOutlineEditorReady] = useState(false);
  const [reviewEditorHandle, setReviewEditorHandle] = useState<EditorCommandHandle | null>(null);
  const [editData, setEditData] = useState({
    content: '',
    status: 'draft',
  });
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current');
  const [leaveFailureDialogDismissed, setLeaveFailureDialogDismissed] = useState(false);
  const [superseded, setSuperseded] = useState<VersionSupersededPayload | null>(null);
  const displayedCurrentVersion = production?.version || 'v1.0';

  const canEditProduction = Boolean(
    production &&
      (
        CONTENT_EDIT_ROLES.has(authUser?.role || '') ||
        Number(production.operator_id) === authUser?.id ||
        Number(topic?.creator_id) === authUser?.id ||
        Number(topic?.assignee_id) === authUser?.id
      ),
  );
  const requestedHistoryUnavailable = Boolean(
    production && requestedVersion && requestedVersion !== displayedCurrentVersion && !linkedHistoryVersion,
  );
  const canEditSelectedVersion = canEditProduction && !requestedHistoryUnavailable && selectedVersionId === 'current';
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

  const handleContinueEditing = useCallback(() => {
    setLeaveFailureDialogDismissed(true);
  }, []);

  const handleRetryLeave = useCallback(() => retryLeave(), [retryLeave]);

  const handleDiscardAndLeave = useCallback(() => discardAndLeave(), [discardAndLeave]);

  const handleGuardedNavigate = useCallback(async (to: string) => {
    setLeaveFailureDialogDismissed(false);
    const leaveResult = await requestLeave({
      reason: 'route_transition',
      continuation: () => navigate(to),
    });

    if (leaveResult.decision === 'waiting_confirmation') {
      addNotification({
        title: '最后修改尚未保存',
        message: '已阻止离开当前页面，请留在此页后重试保存。',
        type: 'warning',
      });
      return;
    }

    if (leaveResult.warning === 'collaboration_unconfirmed') {
      addNotification({
        title: '内容已保存',
        message: '协作交接尚未确认，已按安全保存结果继续导航。',
        type: 'warning',
      });
    }
  }, [addNotification, navigate, requestLeave]);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const requestId = ++detailRequestRef.current;
    setLoading(true);
    setHistoryLoading(false);
    setLinkedHistoryVersion(null);

    try {
      const productionData = await getProductionById(Number.parseInt(id, 10));
      if (requestId !== detailRequestRef.current) return;

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
      if (requestId !== detailRequestRef.current) return;

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
      setTopic(topicData);
      setHistory(historyData.data);
      setLinkedHistoryVersion(exactHistoryVersion);
      setHistoryPage(historyData.page);
      setHistoryTotal(historyData.total);
      setSelectedVersionId(exactHistoryVersion ? `history-${exactHistoryVersion.id}` : 'current');
      setSuperseded(null);
      if (requestedVersion && requestedVersion !== currentVersion && !exactHistoryVersion) {
        addNotification({ title: '创作来源版本暂不可用', message: `没有找到 ${requestedVersion}，当前创作稿仍可正常查看。`, type: 'warning' });
      }
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      addNotification({
        title: '获取创作详情失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      if (requestId === detailRequestRef.current) setLoading(false);
    }
  }, [addNotification, id, requestedVersion]);

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
    void fetchData();
    return () => {
      detailRequestRef.current += 1;
    };
  }, [fetchData]);

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
  const canFocusWrite = Boolean(selectedVersion?.isCurrent && canEditSelectedVersion && !superseded);
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

  const startEditing = () => {
    if (!production) return;
    setSelectedVersionId('current');
    setEditData({
      content: production.content || editData.content || '',
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
      readonly: !canEditSelectedVersion || selectedVersionId !== 'current' || Boolean(superseded),
      capabilities: {
        collaboration: true,
        manualSave: false,
        immersive: true,
        pageScroll: true,
      },
      persist: async (content) => {
        try {
          await updateProduction(production.id, {
            topic_id: production.topic_id,
            version: production.version,
            content,
            expected_content: persistedContentRef.current,
            status: editData.status,
            version_action: 'none',
          });
        } catch (error) {
          addNotification({ title: '本次修改尚未保存', message: (error as Error).message, type: 'error' });
          throw error;
        }
        persistedContentRef.current = content;
      },
    });
  }, [addNotification, canEditSelectedVersion, editData.content, editData.status, production, selectedVersionId, superseded]);

  const handleVersionedSave = async (versionAction: 'minor' | 'major') => {
    if (!production || !canEditSelectedVersion || superseded) return;

    try {
      const result = await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: editData.content,
        expected_content: persistedContentRef.current,
        status: editData.status,
        change_type: versionAction,
        version_action: versionAction,
      });

      addNotification({
        title: versionAction === 'major' ? '已另开新版' : '小修已保存',
        message: `当前版本已更新为 ${result.version || production.version}`,
        type: 'success',
      });

      await fetchData();
    } catch (error) {
      addNotification({
        title: '保存失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleSubmitReview = async () => {
    if (!production || !canEditSelectedVersion || superseded) return;

    try {
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: editData.content,
        expected_content: persistedContentRef.current,
        status: 'review',
        version_action: 'none',
      });

      addNotification({
        title: '提交成功',
        message: '创作内容已提交审核',
        type: 'success',
      });

      await fetchData();
    } catch (error) {
      addNotification({
        title: '提交失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!production || !canEditSelectedVersion || superseded) return;

    try {
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: production.content,
        expected_content: persistedContentRef.current,
        status,
        version_action: 'none',
      });

      addNotification({
        title: '状态更新成功',
        message: '创作状态已同步',
        type: 'success',
      });

      if (status === 'approved') celebrateMilestone();

      await fetchData();
    } catch (error) {
      addNotification({
        title: '更新失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleDelete = async () => {
    if (!production) return;

    try {
      await deleteProduction(production.id);
      addNotification({
        title: '删除成功',
        message: '创作记录已删除',
        type: 'success',
      });
      navigate('/production');
    } catch (error) {
      addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <StudioSkeletonCard />
          <StudioSkeletonCard />
        </div>
        <StudioSkeletonCard />
      </PageShell>
    );
  }

  if (!production) {
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
  const canManageProductionResources = canEditSelectedVersion
    && production?.status !== 'approved'
    && selectedVersionId === 'current'
    && !editorLocked
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
            <button
              type="button"
              onClick={() => void handleGuardedNavigate('/production')}
              className="mt-1 rounded-button border border-studio-border-soft bg-studio-surface-soft/70 p-2 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
              title="返回创作管理"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="max-w-[48rem] text-xl font-bold leading-snug text-studio-text-primary">
                  {production.topic_title || '稿件创作工作台'}
                </h1>
                <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                <StatusPill tone={syncTone(syncStatus)}>
                  <Wifi className="h-3.5 w-3.5" />
                  {syncLabel}
                </StatusPill>
                <StatusPill tone={editorLocked ? 'coral' : 'success'}>{editorLocked ? `检测到新大版本 ${superseded?.toVersion}` : `正在编辑当前最新版本 ${production.version || 'v1.0'}`}</StatusPill>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                <span>{production.version || 'v1.0'}</span>
                <button type="button" onClick={() => void handleGuardedNavigate(`/topics/${production.topic_id}`)} className="text-studio-cyan-contrast transition hover:text-studio-primary-contrast">
                  {topic?.title || production.topic_title || '关联选题'}
                </button>
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
              <ActionButton onClick={continueFromOutline} disabled={outlineHeadings.length === 0 || !outlineEditorReady} className="px-3 py-2" title={outlineHeadings.length === 0 ? '请先在选题大纲中设置标题' : `补入 ${outlineHeadings.length} 个大纲标题中尚未写入正文的小节`}>
                按大纲续写
              </ActionButton>
            )}
            {canFocusWrite && (
              <ActionButton onClick={() => setWritingFocused(true)} className="px-3 py-2">
                专注写作
              </ActionButton>
            )}
            <ActionButton onClick={() => setShowSidebar((prev) => !prev)} className="px-3 py-2" title={showSidebar ? '收起版本历史' : '展开版本历史'}>
              {showSidebar ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
              版本历史
            </ActionButton>
            {!requestedHistoryUnavailable ? <ActionButton onClick={startEditing} className="px-3 py-2">
              <FileText className="h-4 w-4" />
              当前稿件
            </ActionButton> : null}
            {canEditSelectedVersion && production.status !== 'approved' ? (
              <ActionButton onClick={() => handleStatusUpdate(NEXT_STATUSES[production.status])} variant="primary" className="px-3 py-2">
                <ArrowRight className="h-4 w-4" />
                {production.status === 'draft' ? '提交审核' : production.status === 'review' ? '审核通过' : '重新编辑'}
              </ActionButton>
            ) : production.status === 'approved' ? (
              <ActionButton onClick={() => void handleGuardedNavigate('/shooting')} variant="primary" className="px-3 py-2">
                <ArrowRight className="h-4 w-4" />
                成片制作
              </ActionButton>
            ) : null}
            {canDelete ? (
              <ActionButton
                onClick={() => setShowDeleteModal(true)}
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
            <p className="mt-1 font-semibold text-studio-text-primary">{selectedVersion?.isCurrent ? '协同自动同步' : '历史只读预览'}</p>
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
          {superseded && canEditProduction ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-coral/30 bg-studio-coral/10 px-4 py-3" role="status" aria-live="polite">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-studio-coral-contrast">这份稿件已有更新版本</p>
                <p className="mt-1 text-sm text-studio-text-secondary">
                  {superseded.createdBy.name} 已创建 {superseded.toVersion}。当前 {superseded.fromVersion} 已转为只读，进入最新版本后可继续协作。
                </p>
              </div>
              <ActionButton onClick={() => void fetchData()} variant="primary" className="shrink-0">
                进入最新版本
              </ActionButton>
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
              <ActionButton onClick={() => void handleGuardedNavigate(`/production/${production.id}`)} variant="primary" className="px-3 py-2">
                返回当前版本
              </ActionButton>
            </div>
          ) : selectedVersion?.isCurrent && canEditSelectedVersion && !editorLocked ? (
            <div className="min-h-[300px] bg-[var(--editor-bg)]">
              <ContentEditor
                value={editData.content}
                onChange={(content) => setEditData((prev) => ({ ...prev, content }))}
                mode="rich"
                collaborationKey={getProductionVersionRoomId(production.id, production.version)}
                persistenceStatus={syncStatus}
                immersive
                focusMode={writingFocused}
                pageScroll
                adapter={productionEditorAdapter}
                onRuntimeHandleChange={handleRuntimeHandleChange}
                onEditorCommandHandleChange={handleOutlineEditorChange}
              />
            </div>
          ) : (
            <div className="min-h-[300px] bg-[var(--editor-bg)] p-6 lg:p-8">
              <ContentEditor
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
          canAccept={Boolean(selectedVersion?.isCurrent && !requestedHistoryUnavailable && !editorLocked && canEditSelectedVersion && hasPermission('production:update'))}
          canModerate={hasPermission('comment:delete')}
          currentUserId={authUser?.id ?? null}
          editorHandle={reviewEditorHandle}
          flushEditor={flushReviewEditor}
          onNotice={(title, message, type) => addNotification({ title, message, type })}
        />
        </div>

        <GlassPanel className={`flex flex-col self-start overflow-visible ${writingFocused ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between border-b border-studio-border-soft px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-studio-text-muted">版本历史</p>
              <h2 className="mt-1 text-sm font-semibold text-studio-text-primary">版本记录</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowSidebar((prev) => !prev)}
              className="rounded-lg p-2 text-studio-text-muted transition hover:bg-studio-surface-elevated/70 hover:text-studio-text-primary"
              title={showSidebar ? '收起版本历史' : '展开版本历史'}
            >
              {showSidebar ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-5 p-5">
            <div className={`space-y-2 ${showSidebar ? '' : 'hidden'}`}>
              {sidebarVersionEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedVersionId(entry.id)}
                  disabled={requestedHistoryUnavailable}
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
              {sidebarVersionEntries.length === 0 ? <EmptyState title="暂无版本历史" description="保存版本后会在这里形成时间线。" /> : null}
              {history.length < historyTotal && <button type="button" disabled={historyLoading} onClick={() => void loadMoreHistory()} className="w-full rounded-lg border border-studio-border-soft px-3 py-2 text-sm text-studio-text-secondary disabled:opacity-50">{historyLoading ? '正在加载…' : '查看更多历史版本'}</button>}
            </div>

            <ProductionOriginPanel
              sourceType={production.origin_source_type}
              sourceSnapshot={production.origin_source_content_snapshot}
              sourceOutlineVersion={production.origin_source_outline_version}
              sourceTopicId={production.topic_id}
            />

            <div className="space-y-3 border-t border-studio-border-soft pt-5">
              <p className="text-xs font-semibold uppercase text-studio-text-muted">版本操作</p>
              {canEditSelectedVersion && !editorLocked && !requestedHistoryUnavailable && <ActionButton onClick={startEditing} className="w-full">
                当前版本查看 / 编辑
              </ActionButton>}
              {canEditSelectedVersion && !editorLocked && !requestedHistoryUnavailable && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => handleVersionedSave('minor')} className="min-w-0 flex-1 px-3 py-2">
                    <Save className="h-4 w-4" />
                    小修保存
                  </ActionButton>
                  <ActionButton onClick={() => handleVersionedSave('major')} className="min-w-0 flex-1 px-3 py-2" variant="primary">
                    <Save className="h-4 w-4" />
                    另开新版
                  </ActionButton>
                </div>
              )}
              {canEditSelectedVersion && !editorLocked && !requestedHistoryUnavailable && editData.status === 'draft' ? (
                <ActionButton onClick={handleSubmitReview} variant="primary" className="w-full">
                  <ArrowRight className="h-4 w-4" />
                  提交审核
                </ActionButton>
              ) : null}
            </div>

            <div className="border-t border-studio-border-soft pt-5">
              <p className="text-xs font-semibold uppercase text-studio-text-muted">关联选题</p>
              <button type="button" onClick={() => void handleGuardedNavigate(`/topics/${production.topic_id}`)} className="mt-2 text-left text-sm font-semibold text-studio-cyan-contrast transition hover:text-studio-primary-contrast">
                {topic?.title || production.topic_title || '-'}
              </button>
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
      />

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

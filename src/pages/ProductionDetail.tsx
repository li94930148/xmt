import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import ContentEditor from '../components/ContentEditor';
import EditorLeaveFailureDialog from '../components/editor/EditorLeaveFailureDialog';
import { ConfirmModal } from '../components/common';
import { ActionButton, EmptyState, GlassPanel, PageShell, StatusPill, StudioSkeletonCard } from '../components/studio';
import { getCollaborationRoomId } from '../collaboration/core/events';
import { createProductionEditorAdapter } from '../editor/adapters/productionEditorAdapter';
import { getTimelineView, recordTimelineEvent } from '../editor/timeline/unifiedContentTimeline';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingTime } from '../lib/utils';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import { editorStateLabel, useEditorEventState } from '../editor/state/editorStateManager';
import type { ContentEditorRuntimeHandle } from '../editor/contracts/contentEditorAdapter';
import { useEditorLeaveGuard } from '../hooks/useEditorLeaveGuard';

const STATUS_TEXT: Record<string, string> = {
  draft: '草稿',
  review: '审核中',
  approved: '已通过',
  rejected: '已驳回',
};

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

function syncTone(syncStatus: string): 'cyan' | 'success' | 'coral' | 'muted' {
  if (syncStatus === 'saving') return 'cyan';
  if (syncStatus === 'saved') return 'success';
  if (syncStatus === 'conflicted' || syncStatus === 'error') return 'coral';
  return 'muted';
}

export default function ProductionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const appStore = useAppStore();
  const authUser = useAuthStore((state) => state.user);
  const isDark = appStore.theme === 'dark';
  const { hasPermission } = usePermission();

  const [production, setProduction] = useState<ProductionType | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [history, setHistory] = useState<HistoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [editData, setEditData] = useState({
    content: '',
    status: 'draft',
  });
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current');
  const [leaveFailureDialogDismissed, setLeaveFailureDialogDismissed] = useState(false);

  const canEditProduction = Boolean(
    production &&
      (
        CONTENT_EDIT_ROLES.has(authUser?.role || '') ||
        Number(production.operator_id) === authUser?.id ||
        Number(topic?.creator_id) === authUser?.id ||
        Number(topic?.assignee_id) === authUser?.id
      ),
  );
  const canDelete = canEditProduction && hasPermission('production:delete');
  const activeDocId = production ? getCollaborationRoomId('production', production.id) : undefined;
  const syncStatus = useEditorEventState(activeDocId);
  const runtimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
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
      appStore.addNotification({
        title: '最后修改尚未保存',
        message: '已阻止离开当前页面，请留在此页后重试保存。',
        type: 'warning',
      });
      return;
    }

    if (leaveResult.warning === 'collaboration_unconfirmed') {
      appStore.addNotification({
        title: '内容已保存',
        message: '协作交接尚未确认，已按安全保存结果继续导航。',
        type: 'warning',
      });
    }
  }, [appStore, navigate, requestLeave]);

  const fetchData = async () => {
    if (!id) return;

    setLoading(true);

    try {
      const productionData = await getProductionById(Number.parseInt(id, 10));
      setProduction(productionData);
      setCurrentContentDocument(
        getCollaborationRoomId('production', productionData.id),
        productionData.topic_title || `创作 ${productionData.id}`,
      );
      setEditData({
        content: productionData.content || '',
        status: productionData.status,
      });

      const [topicData, historyData] = await Promise.all([
        getTopic(productionData.topic_id),
        getProductionHistory(Number.parseInt(id, 10)),
      ]);

      setTopic(topicData);
      setHistory(historyData);
      setSelectedVersionId('current');
    } catch (error) {
      appStore.addNotification({
        title: '获取创作详情失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [id]);

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

    const historyEntries: VersionEntry[] = history.map((record) => ({
      id: `history-${record.id}`,
      version: record.version || 'v1.0',
      changeType: record.change_type === 'major' ? 'major' : 'minor',
      content: record.content || '',
      contentMarkdown: normalizeVersionContent(record.content_markdown, record.content),
      status: record.status,
      operatorName: record.operator_name,
      createdAt: record.created_at,
      isCurrent: false,
    }));

    return [currentEntry, ...historyEntries];
  }, [history, production]);

  const selectedVersion = versionEntries.find((entry) => entry.id === selectedVersionId) || versionEntries[0] || null;

  const timelineView = useMemo(() => {
    if (!production) return getTimelineView('production:unknown');
    return getTimelineView(getCollaborationRoomId('production', production.id), {
      versionEvents: versionEntries.map((entry) => ({
        id: entry.id,
        timestamp: new Date(entry.createdAt).getTime(),
        version: entry.version,
        changeType: entry.changeType,
        operatorName: entry.operatorName,
        status: entry.status,
        label: entry.isCurrent ? '当前版本' : '历史版本',
      })),
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

    return Array.from(latestByMajor.values()).sort((a, b) => {
      const aParts = parseVersionParts(a.version);
      const bParts = parseVersionParts(b.version);

      if (aParts.major !== bParts.major) {
        return bParts.major - aParts.major;
      }

      return bParts.minor - aParts.minor;
    });
  }, [versionEntries]);

  useEffect(() => {
    if (!production) return;

    const docId = getCollaborationRoomId('production', production.id);
    for (const entry of versionEntries) {
      recordTimelineEvent({
        id: `production:${production.id}:version:${entry.id}`,
        docId,
        timestamp: new Date(entry.createdAt).getTime(),
        type: 'version',
        source: 'version',
        userId: entry.operatorName,
        payload: {
          version: entry.version,
          changeType: entry.changeType,
          status: entry.status,
          label: entry.isCurrent ? '当前版本' : '历史版本',
        },
      });
    }
  }, [production, versionEntries]);

  const startEditing = () => {
    if (!production) return;
    setSelectedVersionId('current');
    setEditData({
      content: production.content || editData.content || '',
      status: production.status,
    });
    setEditMode(true);
  };

  const productionEditorAdapter = useMemo(() => {
    if (!production) return undefined;
    const room = getCollaborationRoomId('production', production.id);
    return createProductionEditorAdapter({
      documentId: room,
      collaborationRoom: room,
      initialContent: editData.content,
      readonly: !canEditProduction || selectedVersionId !== 'current',
      capabilities: {
        collaboration: true,
        manualSave: false,
        immersive: true,
        pageScroll: true,
      },
      persist: (content) => updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content,
        status: editData.status,
        version_action: 'none',
      }).then(() => undefined),
    });
  }, [canEditProduction, editData.content, editData.status, production, selectedVersionId]);

  const handleVersionedSave = async (versionAction: 'minor' | 'major') => {
    if (!production || !canEditProduction) return;

    try {
      const result = await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: editData.content,
        status: editData.status,
        change_type: versionAction,
        version_action: versionAction,
      });

      appStore.addNotification({
        title: versionAction === 'major' ? '已另开新版' : '小修已保存',
        message: `当前版本已更新为 ${result.version || production.version}`,
        type: 'success',
      });

      setEditMode(true);
      await fetchData();
    } catch (error) {
      appStore.addNotification({
        title: '保存失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleSubmitReview = async () => {
    if (!production || !canEditProduction) return;

    try {
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: editData.content,
        status: 'review',
        version_action: 'none',
      });

      appStore.addNotification({
        title: '提交成功',
        message: '创作内容已提交审核',
        type: 'success',
      });

      setEditMode(true);
      await fetchData();
    } catch (error) {
      appStore.addNotification({
        title: '提交失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!production || !canEditProduction) return;

    try {
      await updateProduction(production.id, {
        topic_id: production.topic_id,
        version: production.version,
        content: production.content,
        status,
        version_action: 'none',
      });

      appStore.addNotification({
        title: '状态更新成功',
        message: '创作状态已同步',
        type: 'success',
      });

      await fetchData();
    } catch (error) {
      appStore.addNotification({
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
      appStore.addNotification({
        title: '删除成功',
        message: '创作记录已删除',
        type: 'success',
      });
      navigate('/production');
    } catch (error) {
      appStore.addNotification({
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
  const statusLabel = STATUS_TEXT[production.status] || production.status;
  const syncLabel = editorStateLabel(syncStatus);

  return (
    <PageShell>
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

      <GlassPanel className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-studio-border-soft bg-white/[0.025] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => void handleGuardedNavigate('/production')}
              className="mt-1 rounded-button border border-studio-border-soft bg-white/[0.04] p-2 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
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
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                <span>{production.version || 'v1.0'}</span>
                <button type="button" onClick={() => void handleGuardedNavigate(`/topics/${production.topic_id}`)} className="text-studio-cyan transition hover:text-white">
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
            <ActionButton onClick={() => setShowSidebar((prev) => !prev)} className="px-3 py-2" title={showSidebar ? '收起版本历史' : '展开版本历史'}>
              {showSidebar ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
              版本
            </ActionButton>
            <ActionButton onClick={startEditing} className="px-3 py-2">
              <FileText className="h-4 w-4" />
              当前稿件
            </ActionButton>
            {canEditProduction && production.status !== 'approved' ? (
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
                className="px-3 py-2 border-studio-coral/35 text-[#FFC2CC] hover:bg-studio-coral/10"
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GlassPanel className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft bg-white/[0.025] px-5 py-3">
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

          {selectedVersion?.isCurrent && canEditProduction ? (
            <div className="min-h-[300px] bg-[var(--editor-bg)]">
              <ContentEditor
                value={editData.content}
                onChange={(content) => setEditData((prev) => ({ ...prev, content }))}
                mode="rich"
                collaborationKey={getCollaborationRoomId('production', production.id)}
                persistenceStatus={syncStatus}
                immersive
                pageScroll
                adapter={productionEditorAdapter}
                onRuntimeHandleChange={handleRuntimeHandleChange}
              />
            </div>
          ) : (
            <div className="min-h-[300px] bg-[var(--editor-bg)] p-6 lg:p-8">
              <div
                className={`editor-content-preview production-preview tiptap prose max-w-none leading-relaxed text-studio-text-primary ${isDark ? 'prose-invert' : ''}`}
                dangerouslySetInnerHTML={{
                  __html: normalizeLegacyEditorHtmlTheme(
                    selectedVersion?.contentMarkdown ||
                      normalizeVersionContent(
                        (production as ProductionType & {
                          contentMarkdown?: string;
                          content_markdown?: string;
                        }).contentMarkdown ||
                          (production as ProductionType & { content_markdown?: string }).content_markdown,
                        production.content,
                      ),
                  ),
                }}
              />
            </div>
          )}
        </GlassPanel>

        <GlassPanel className={`${showSidebar ? 'flex' : 'hidden'} self-start flex-col xl:flex`}>
          <div className="flex items-center justify-between border-b border-studio-border-soft px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-studio-text-muted">版本历史</p>
              <h2 className="mt-1 text-sm font-semibold text-studio-text-primary">版本与审核说明</h2>
            </div>
            <button type="button" onClick={() => setShowSidebar(false)} className="rounded-lg p-2 text-studio-text-muted transition hover:bg-white/[0.06] hover:text-studio-text-primary">
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            <div className="space-y-2">
              {sidebarVersionEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedVersionId(entry.id)}
                  className={`w-full rounded-card border px-4 py-3 text-left transition ${
                    selectedVersionId === entry.id
                      ? 'border-studio-border-active bg-studio-primary/12 shadow-glow-primary'
                      : 'border-studio-border-soft bg-white/[0.04] hover:border-studio-border-active hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-studio-text-primary">{entry.version}</span>
                    <StatusPill tone={entry.changeType === 'major' ? 'violet' : entry.changeType === 'minor' ? 'primary' : 'success'} className="px-2 py-0.5 text-[10px]">
                      {versionChangeLabel(entry.changeType)}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-studio-text-muted">{formatBeijingTime(entry.createdAt)}</p>
                  <p className="mt-1 text-xs text-studio-text-secondary">{entry.operatorName || '系统记录'}</p>
                </button>
              ))}
              {sidebarVersionEntries.length === 0 ? <EmptyState title="暂无版本历史" description="保存版本后会在这里形成时间线。" /> : null}
            </div>

            <div className="space-y-3 border-t border-studio-border-soft pt-5">
              <p className="text-xs font-semibold uppercase text-studio-text-muted">版本操作</p>
              {canEditProduction && <ActionButton onClick={startEditing} className="w-full">
                当前版本查看 / 编辑
              </ActionButton>}
              {canEditProduction && <div className="grid grid-cols-2 gap-2">
                <ActionButton onClick={() => handleVersionedSave('minor')} className="px-3 py-2">
                  <Save className="h-4 w-4" />
                  小修保存
                </ActionButton>
                <ActionButton onClick={() => handleVersionedSave('major')} className="px-3 py-2" variant="primary">
                  <Save className="h-4 w-4" />
                  另开新版
                </ActionButton>
              </div>}
              {canEditProduction && editData.status === 'draft' ? (
                <ActionButton onClick={handleSubmitReview} variant="primary" className="w-full">
                  <ArrowRight className="h-4 w-4" />
                  提交审核
                </ActionButton>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-studio-border-soft pt-5">
              <div>
                <p className="text-xs font-semibold uppercase text-studio-text-muted">关联选题</p>
                <button type="button" onClick={() => void handleGuardedNavigate(`/topics/${production.topic_id}`)} className="mt-2 text-left text-sm font-semibold text-studio-cyan transition hover:text-white">
                  {topic?.title || production.topic_title || '-'}
                </button>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-studio-text-muted">审核说明</p>
                <p className="mt-2 text-sm leading-6 text-studio-text-secondary">
                  当前只调整外层工作台视觉，审核、保存、版本和协同同步仍沿用原有流程。
                </p>
              </div>
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

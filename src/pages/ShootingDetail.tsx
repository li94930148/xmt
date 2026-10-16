import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
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
import { setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import { editorStateLabel, useEditorEventState } from '../editor/state/editorStateManager';
import type { ContentEditorRuntimeHandle } from '../editor/contracts/contentEditorAdapter';
import { useEditorLeaveGuard } from '../hooks/useEditorLeaveGuard';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '../hooks/useRouteNavigationGuard';
import { celebrateMilestone } from '../utils/confetti';
import { useCompactEditorToolbar } from '../hooks/useCompactEditorToolbar';
import { getWorkflowStatusLabel } from '../platform/workflow-status-labels';
import { workflowScriptSourceLabel, workflowScriptSourceReference, workflowScriptSourceTimestamp } from '../utils/workflow-script-source';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import { usePermission } from '../hooks/usePermission';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';

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
  const sourceProductionTimestamp = workflowScriptSourceTimestamp(sourceProduction);

  // 剧本编辑状态
  const [scriptContent, setScriptContent] = useState('');
  const [scriptVersions, setScriptVersions] = useState<WorkflowDocumentVersion[]>([]);
  const [scriptVersionsLoading, setScriptVersionsLoading] = useState(false);
  const [scriptVersionsLoadError, setScriptVersionsLoadError] = useState(false);
  const [savingScriptVersion, setSavingScriptVersion] = useState(false);
  const [archiveSyncPending, setArchiveSyncPending] = useState(false);
  const [archiveSyncRetrying, setArchiveSyncRetrying] = useState(false);
  const archiveSyncSaveSequenceRef = useRef(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [leaveFailureDialogDismissed, setLeaveFailureDialogDismissed] = useState(false);
  const activeDocId = shooting ? getCollaborationRoomId('shooting', shooting.id) : undefined;
  const syncStatus = useEditorEventState(activeDocId);
  const runtimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
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
  }, [appStore, requestLeave]);
  useRouteNavigationGuard(Boolean(shooting), handleRouteNavigationAttempt);

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
        void loadScriptVersions(result.id, requestId);
        setArchiveSyncPending(result.published_archive_script_sync_pending === true);
        setCurrentContentDocument(
          getCollaborationRoomId('shooting', result.id),
          result.topic_title || `成片 ${result.id}`,
        );

        // 初始化剧本内容：优先使用本地编辑版，其次使用创作管理审核通过的内容
        const content = result.script_content ?? result.production?.content ?? result.production?.content_markdown ?? '';
        setScriptContent(content);
      } catch (error) {
        if (requestId === detailRequestSequenceRef.current && Number(currentShootingIdRef.current) === Number(id)) {
          addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
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
  }, [addNotification, id, loadScriptVersions]);

  const shootingEditorAdapter = useMemo(() => {
    if (!shooting) return undefined;
    const room = getCollaborationRoomId('shooting', shooting.id);
    return createShootingEditorAdapter({
      documentId: room,
      collaborationRoom: room,
      initialContent: scriptContent,
      readonly: false,
      capabilities: {
        collaboration: true,
        manualSave: false,
        immersive: true,
        pageScroll: false,
      },
      persist: (content) => {
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
  }, [scriptContent, shooting]);

  const handleRetryPublishedArchiveSync = async () => {
    if (!shooting || archiveSyncRetrying || syncStatus === 'saving') return;
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
      appStore.addNotification({ title: '归档仍待同步', message: (error as Error).message, type: 'warning' });
    } finally {
      setArchiveSyncRetrying(false);
    }
  };

  const handleSaveScriptVersion = async (versionAction: 'minor' | 'major') => {
    if (!shooting || savingScriptVersion) return;
    const requestedShootingId = shooting.id;
    setSavingScriptVersion(true);
    try {
      const flushResult = await runtimeHandleRef.current?.flush({ timeoutMs: 8000 });
      if (flushResult && flushResult.status !== 'synced') {
        throw new Error('当前修改尚未完成保存，请处理保存状态后重试。');
      }
      const source = workflowScriptSourceReference(
        shooting.script_content,
        { id: shooting.script_source_production_id, version: shooting.script_source_version },
        shooting.production,
      );
      const result = await updateShooting(requestedShootingId, {
        script_content: scriptContent,
        expected_content: scriptContent,
        version_action: versionAction,
        ...source,
      });
      if (Number(currentShootingIdRef.current) !== requestedShootingId) {
        appStore.addNotification({ title: '版本已保存', message: '服务端已确认版本；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
        return;
      }
      setArchiveSyncPending(result.archiveSync === 'pending');
      setShooting((current) => current?.id === requestedShootingId ? {
        ...current,
        script_content: scriptContent,
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
      appStore.addNotification({ title: '版本保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      setSavingScriptVersion(false);
    }
  };
  const handleStatusChange = async (newStatus: string) => {
    if (!shooting) return;
    const requestedShootingId = shooting.id;

    try {
      await updateShooting(requestedShootingId, {
        topic_id: shooting.topic_id,
        plan_date: shooting.plan_date || '',
        location: shooting.location || '',
        equipment: shooting.equipment || '',
        status: newStatus
      });
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
      return;
    }

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-studio-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!shooting) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-studio-text-muted">成片制作记录不存在</p>
      </div>
    );
  }

  const hasLocalScriptEdit = shooting.script_content !== null && shooting.script_content !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className={`shrink-0 border-b ${styles.border} px-3 py-2`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="返回制作列表"
              onClick={() => navigateFromShooting('/shooting')}
              className={`p-2 rounded-lg ${styles.hoverBg} transition-colors`}
            >
              <ChevronLeft className={`w-5 h-5 ${styles.textSecondary}`} />
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className={`truncate text-base font-semibold ${styles.textPrimary}`}>
                {shooting.topic_title || '成片制作'}
              </h1>
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
                <ActionButton type="button" disabled={savingScriptVersion || syncStatus === 'conflicted'} onClick={() => void handleSaveScriptVersion('minor')} className="min-h-10 px-3 py-2 text-xs">
                  {savingScriptVersion ? '保存中…' : '小版本保存'}
                </ActionButton>
                <ActionButton type="button" variant="primary" disabled={savingScriptVersion || syncStatus === 'conflicted'} onClick={() => void handleSaveScriptVersion('major')} className="min-h-10 px-3 py-2 text-xs">
                  大版本保存
                </ActionButton>
              </>
            )}
            <button
              onClick={() => setShowSidebar((prev) => !prev)}
              className={`p-2 rounded-lg ${styles.hoverBg} transition-colors`}
              aria-label={showSidebar ? '收起信息栏' : '展开信息栏'}
              title={showSidebar ? '收起信息栏' : '展开信息栏'}
            >
              {showSidebar ? (
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              ) : (
                <PanelRight className={`w-4 h-4 ${styles.textSecondary}`} />
              )}
            </button>
            {shooting.status === 'planned' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="xmt-btn xmt-btn-primary min-h-10 px-3 py-1.5 text-xs"
              >
                <Camera className="w-4 h-4" />
                开始制作
              </button>
            )}

            {shooting.status === 'in_progress' && (
              <button
                onClick={() => handleStatusChange('completed')}
                className="xmt-btn min-h-10 border border-studio-success/30 bg-studio-success-soft px-3 py-1.5 text-xs font-medium text-studio-success-contrast hover:bg-studio-success/12"
              >
                <CheckCircle className="w-4 h-4" />
                完成制作
              </button>
            )}

            {shooting.status === 'cancelled' && (
              <button
                onClick={() => handleStatusChange('planned')}
                className="xmt-btn xmt-btn-primary min-h-10 px-3 py-1.5 text-xs"
              >
                <Clock className="w-4 h-4" />
                重新计划
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
              disabled={archiveSyncRetrying || syncStatus === 'saving'}
              className="xmt-btn xmt-btn-warning min-h-10 shrink-0 px-3 py-2 text-xs disabled:opacity-50"
            >
              {archiveSyncRetrying ? '同步中...' : syncStatus === 'saving' ? '等待剧本保存...' : '重试同步归档'}
            </button>
          ) : (
            <p className="text-xs text-studio-text-muted">请联系有成片制作权限的成员重试归档同步。</p>
          )}
        </section>
      )}

      {sourceProductionId && sourceVersion ? (
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
            onClick={() => navigateFromShooting(`/production/${sourceProductionId}?version=${encodeURIComponent(sourceVersion)}`)}
          >
            查看创作版本 {sourceVersion}
          </ActionButton>
        </GlassPanel>
      ) : null}

      <div className="flex gap-3">
        <main className="min-w-0 flex-1">
          <ContentEditor
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
        </main>

        {showSidebar && (
          <aside className={`${styles.bgSecondary} border ${styles.border} hidden w-80 shrink-0 rounded-2xl xl:block`}>
            <div className={`flex items-center justify-between border-b ${styles.border} px-5 py-4`}>
              <div>
                <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>信息栏</p>
                <h2 className={`mt-1 text-sm font-semibold ${styles.textPrimary}`}>成片制作状态</h2>
              </div>
              <button onClick={() => setShowSidebar(false)} className={`rounded-lg p-2 ${styles.hoverBg}`}>
                <PanelRightClose className={`w-4 h-4 ${styles.textSecondary}`} />
              </button>
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
                <button
                  onClick={() => {
                    if (sourceProductionId && sourceVersion) {
                      navigateFromShooting(`/production/${sourceProductionId}?version=${encodeURIComponent(sourceVersion)}`);
                    }
                  }}
                  disabled={!sourceProductionId || !sourceVersion}
                  className={`w-full rounded-lg px-3 py-2 text-xs ${styles.buttonSecondary} disabled:opacity-50`}
                >
                  {sourceProductionId && sourceVersion ? `查看创作版本 ${sourceVersion}` : '创作来源版本未记录'}
                </button>
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
      </div>

      <GlassPanel role="region" aria-label="剧本版本历史" className="p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-studio-text-primary">剧本版本历史</h2>
          <p className="mt-1 text-xs text-studio-text-muted">自动保存更新当前稿；仅小版本和大版本操作会留档。</p>
        </div>
        {scriptVersionsLoadError ? (
          <div role="alert" data-testid="shooting-script-history-error" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-studio-danger/30 bg-studio-danger/10 p-3 text-sm text-studio-danger">
            <span>版本历史读取失败，列表可能不完整；已保存的剧本仍可正常使用，请重试读取。</span>
            <ActionButton type="button" disabled={scriptVersionsLoading || savingScriptVersion} onClick={() => shooting && void loadScriptVersions(shooting.id)} className="px-3 py-2">重新加载版本历史</ActionButton>
          </div>
        ) : scriptVersionsLoading ? (
          <p role="status" className="mt-3 text-sm text-studio-text-muted">正在加载版本历史…</p>
        ) : scriptVersions.length > 0 ? (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {scriptVersions.map((version) => (
              <li key={version.id} className="rounded-xl border border-studio-border-soft bg-studio-surface-soft/60 p-3">
                <p className="text-sm font-medium text-studio-text-primary">{version.is_baseline ? '历史原稿（时间未记录）' : `${version.version} · ${version.change_type === 'major' ? '大版本' : '小版本'}`}</p>
                <p className="mt-1 text-xs text-studio-text-muted">{version.is_baseline ? '旧内容未记录操作人和时间' : `${version.operator_name || '系统记录'} · ${version.created_at || '时间未记录'}`}</p>
                {Number(version.source_production_id) > 0 && version.source_production_version ? (
                  <button
                    type="button"
                    onClick={() => navigateFromShooting(`/production/${version.source_production_id}?version=${encodeURIComponent(version.source_production_version!)}`)}
                    className="mt-2 inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-medium text-studio-cyan-contrast hover:bg-studio-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring"
                  >
                    来源创作稿：{version.source_production_version} · 查看
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-studio-text-muted">该版本的创作来源未记录</p>
                )}
                <details className="mt-2">
                  <summary className="min-h-8 cursor-pointer py-1 text-xs font-medium text-studio-primary-contrast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring">查看此版本正文</summary>
                  <div className="editor-content-preview tiptap mt-2 max-h-80 overflow-auto rounded-lg border border-studio-border-soft bg-studio-surface-soft p-4 text-sm leading-relaxed text-studio-text-primary" dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(version.content)) }} />
                </details>
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft/50 p-3 text-xs text-studio-text-muted">暂无已保存版本</p>}
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

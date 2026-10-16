import { useCallback, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getPublishingById, getPublishingScriptVersions, syncPublishingPublishedArchive, updatePublishing } from '../api';
import type { WorkflowDocumentVersion } from '../api';
import { ChevronLeft, FileText, Camera, Send, Clock, Save, CheckCircle, ArrowRight, ExternalLink } from 'lucide-react';
import ContentEditor from '../components/ContentEditor';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { ActionButton, PageShell } from '../components/studio';
import { useCompactEditorToolbar } from '../hooks/useCompactEditorToolbar';
import { getWorkflowStatusLabel, isKnownWorkflowStatus } from '../platform/workflow-status-labels';
import { workflowScriptSourceLabel, workflowScriptSourceReference, workflowScriptSourceTimestamp } from '../utils/workflow-script-source';
import { usePermission } from '../hooks/usePermission';
import { useRouteNavigationGuard, type RouteNavigationAttempt } from '../hooks/useRouteNavigationGuard';

interface PublishingDetailData {
  id: number;
  topic_id: number;
  topic_title: string;
  topic_description: string;
  topic_platform: string;
  topic_deadline: string;
  topic_status: string;
  platform: string;
  url: string;
  status: string;
  publish_time: string;
  script_content: string | null;
  script_source_production_id?: number | null;
  script_source_version?: string | null;
  script_source_production?: { id: number; version: string; status: string; created_at?: string; version_timestamp?: string; operator_name?: string | null } | null;
  operator_name: string;
  created_at: string;
  updated_at: string;
  production: {
    id: number;
    version: string;
    content: string;
    content_markdown: string;
    status: string;
    created_at: string;
    updated_at?: string;
    version_timestamp?: string;
    operator_name: string;
  } | null;
  shooting: {
    id: number;
    plan_date: string;
    location: string;
    equipment: string;
    status: string;
    operator_name: string;
    created_at: string;
  } | null;
  topicHistory: Array<{
    action: string;
    comment: string;
    created_at: string;
    operator_name: string;
  }>;
  published_archive_script_sync_pending?: boolean | null;
  can_sync_published_archive?: boolean;
}

const WORKFLOW_STEPS = [
  { key: 'topic', label: '选题提交', icon: FileText },
  { key: 'production', label: '创作审核', icon: FileText },
  { key: 'shooting', label: '成片制作', icon: Camera },
  { key: 'publishing', label: '发布管理', icon: Send },
];

const PUBLISHING_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
  published: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
  failed: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
  scheduled: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
};

export default function PublishingDetail() {
  const { id } = useParams<{ id: string }>();
  const currentPublishingIdRef = useRef(id);
  currentPublishingIdRef.current = id;
  const navigate = useNavigate();
  const appStore = useAppStore();
  const addNotification = useAppStore((state) => state.addNotification);
  const styles = useThemeStyles();
  const compactEditorToolbar = useCompactEditorToolbar();
  const { hasPermission } = usePermission();

  const [data, setData] = useState<PublishingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const detailRequestSequenceRef = useRef(0);
  const scriptVersionRequestSequenceRef = useRef(0);
  const [editMode, setEditMode] = useState(false);
  const [scriptContent, setScriptContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [scriptVersions, setScriptVersions] = useState<WorkflowDocumentVersion[]>([]);
  const [scriptVersionsLoading, setScriptVersionsLoading] = useState(false);
  const [scriptVersionsLoadError, setScriptVersionsLoadError] = useState(false);
  const [archiveSyncPending, setArchiveSyncPending] = useState(false);
  const [archiveSyncRetrying, setArchiveSyncRetrying] = useState(false);
  const sourceProductionId = data
    ? data.script_content !== null ? data.script_source_production_id : data.production?.id
    : null;
  const sourceVersion = data
    ? data.script_content !== null ? data.script_source_version : data.production?.version
    : null;
  const sourceProduction = data
    ? data.script_content !== null ? data.script_source_production : data.production
    : null;
  const sourceProductionTimestamp = workflowScriptSourceTimestamp(sourceProduction);
  const savedScriptContent = data?.script_content ?? data?.production?.content ?? data?.production?.content_markdown ?? '';
  const hasUnsavedScript = Boolean(data && editMode && scriptContent !== savedScriptContent);

  const loadScriptVersions = useCallback(async (recordId: number, detailRequestId?: number) => {
    const requestId = ++scriptVersionRequestSequenceRef.current;
    const isCurrent = () => requestId === scriptVersionRequestSequenceRef.current
      && Number(currentPublishingIdRef.current) === recordId
      && (detailRequestId === undefined || detailRequestId === detailRequestSequenceRef.current);
    setScriptVersionsLoading(true);
    setScriptVersionsLoadError(false);
    try {
      const versions = await getPublishingScriptVersions(recordId);
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

  const handleRouteNavigationAttempt = useCallback(({ proceed, stay }: RouteNavigationAttempt) => {
    if (saving) {
      appStore.addNotification({ title: '剧本保存尚未完成', message: '保存完成前不能离开当前发布记录，请稍候再试。', type: 'warning' });
      stay();
      return;
    }
    if (hasUnsavedScript && !window.confirm('当前剧本还有未保存的修改，离开后可能无法恢复。是否放弃修改并离开？')) {
      stay();
      return;
    }
    proceed();
  }, [appStore, hasUnsavedScript, saving]);
  useRouteNavigationGuard(Boolean(data && (saving || hasUnsavedScript)), handleRouteNavigationAttempt);

  useEffect(() => {
    if (!hasUnsavedScript && !saving) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedScript, saving]);

  useEffect(() => {
    const requestId = ++detailRequestSequenceRef.current;
    scriptVersionRequestSequenceRef.current += 1;
    const fetchData = async () => {
      setLoading(true);
      setData(null);
      setScriptVersions([]);
      setScriptVersionsLoading(false);
      setScriptVersionsLoadError(false);
      try {
        const result = await getPublishingById(parseInt(id!));
        if (requestId !== detailRequestSequenceRef.current || Number(currentPublishingIdRef.current) !== Number(id)) return;
        setData(result);
        void loadScriptVersions(result.id, requestId);
        setArchiveSyncPending(result.published_archive_script_sync_pending === true);
        // 优先使用本地编辑的剧本，其次使用创作管理的剧本
        const content = result.script_content ?? result.production?.content ?? result.production?.content_markdown ?? '';
        setScriptContent(content);
      } catch (error) {
        if (requestId === detailRequestSequenceRef.current && Number(currentPublishingIdRef.current) === Number(id)) {
          addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
        }
      } finally {
        if (requestId === detailRequestSequenceRef.current && Number(currentPublishingIdRef.current) === Number(id)) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      detailRequestSequenceRef.current += 1;
      scriptVersionRequestSequenceRef.current += 1;
    };
  }, [addNotification, id, loadScriptVersions]);

  const handleSaveScript = async (versionAction?: 'minor' | 'major') => {
    if (!data) return;
    const requestedPublishingId = data.id;
    setSaving(true);
    try {
      const source = workflowScriptSourceReference(
        data.script_content,
        { id: data.script_source_production_id, version: data.script_source_version },
        data.production,
      );
      const result = await updatePublishing(requestedPublishingId, {
        script_content: scriptContent,
        ...source,
        ...(versionAction ? {
          version_action: versionAction,
          expected_content: data.script_content ?? data.production?.content ?? data.production?.content_markdown ?? '',
        } : {}),
      });
      if (Number(currentPublishingIdRef.current) !== requestedPublishingId) {
        appStore.addNotification({ title: versionAction ? '版本已保存' : '剧本已保存', message: '服务端已确认保存；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
        return;
      }
      setArchiveSyncPending(result.archiveSync === 'pending');
      setData({
        ...data,
        script_content: scriptContent,
        script_source_production_id: source.script_source_production_id ?? data.script_source_production_id,
        script_source_version: source.script_source_version ?? data.script_source_version,
      });
      setEditMode(false);
      const refreshedVersions = versionAction ? await loadScriptVersions(requestedPublishingId) : undefined;
      if (Number(currentPublishingIdRef.current) !== requestedPublishingId) {
        appStore.addNotification({ title: '版本已保存', message: '服务端已确认版本；页面已切换，未用旧详情覆盖当前内容。', type: 'warning' });
        return;
      }
      if (result.archiveSync === 'pending') {
        appStore.addNotification({
          title: '剧本已保存，归档待同步',
          message: '发布剧本已保存，但发布归档暂未更新；可在页面提示中安全重试归档同步。',
          type: 'warning',
        });
      } else {
        appStore.addNotification({
          title: versionAction ? refreshedVersions ? '版本已保存' : '版本已保存，历史列表未刷新' : '保存成功',
          message: versionAction
            ? refreshedVersions
              ? `发布剧本已保存为${versionAction === 'major' ? '大版本' : '小版本'}`
              : '服务端已确认版本；请重新加载查看历史，不要重复创建。'
            : '剧本内容已保存（仅在发布管理及资源库存档中生效）',
          type: versionAction && !refreshedVersions ? 'warning' : 'success',
        });
      }
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: (error as Error).message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRetryPublishedArchiveSync = async () => {
    if (!data || archiveSyncRetrying || saving || editMode) return;
    setArchiveSyncRetrying(true);
    try {
      const result = await syncPublishingPublishedArchive(data.id);
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

  const handleCancelEdit = () => {
    if (data) {
      const content = data.script_content ?? data.production?.content ?? data.production?.content_markdown ?? '';
      setScriptContent(content);
    }
    setEditMode(false);
  };

  // 判断当前流程步骤
  const getStepStatus = (stepKey: string) => {
    if (!data) return 'pending';
    const stepOrder = ['topic', 'production', 'shooting', 'publishing'];
    const currentIdx = stepOrder.indexOf('publishing'); // 当前在发布阶段
    const stepIdx = stepOrder.indexOf(stepKey);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'current';
    return 'pending';
  };

  if (loading || (data && data.id !== Number(id))) {
    return (
      <PageShell>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-studio-primary border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell>
      <div className="flex items-center justify-center h-64">
        <p className={styles.textMuted}>发布记录不存在</p>
      </div>
      </PageShell>
    );
  }

  const hasLocalEdit = data.script_content !== null && data.script_content !== undefined;
  const displayContent = scriptContent || '<p class="text-studio-text-muted">暂无剧本内容</p>';

  return (
    <PageShell className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => navigate('/publishing')}
          className={`flex items-center gap-2 ${styles.textSecondary} hover:text-studio-primary transition-colors`}
        >
          <ChevronLeft className="w-5 h-5" />
          返回发布管理
        </button>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
            PUBLISHING_STATUS_COLORS[data.status] || (isKnownWorkflowStatus('publishing', data.status)
              ? PUBLISHING_STATUS_COLORS.pending
              : 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft')
          }`}>
            {getWorkflowStatusLabel('publishing', data.status)}
          </span>
        </div>
      </div>

      {/* 标题卡片 */}
      <div className={`${styles.card} p-6`}>
        <h1 className={`text-2xl font-bold ${styles.textPrimary} flex items-center gap-2`}>
          <Send className="w-6 h-6 text-studio-primary" />
          {data.topic_title}
        </h1>
        <p className={`${styles.textSecondary} mt-1`}>发布管理详情 · 关联选题 #{data.topic_id}</p>
        <p className={`mt-1 text-xs ${styles.textMuted}`}>
          {workflowScriptSourceLabel(data.script_content, data.script_source_version, data.production?.version)}
          {sourceProduction && (
            <span>
              {sourceProductionTimestamp === null ? ' · 创作版本时间未记录' : ` · 创作版本时间 ${formatBeijingTime(sourceProductionTimestamp, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
        </p>
      </div>

      {archiveSyncPending && (
        <section
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between"
        >
          <p>发布剧本已保存，但发布归档尚未更新。重试只会同步已保存内容，不会再次写入发布记录。</p>
          {data.can_sync_published_archive ? (
            <button
              type="button"
              onClick={() => void handleRetryPublishedArchiveSync()}
              disabled={archiveSyncRetrying || saving || editMode}
              className="xmt-btn xmt-btn-warning min-h-10 shrink-0 px-3 py-2 text-xs disabled:opacity-50"
            >
              {archiveSyncRetrying ? '同步中...' : editMode ? '先保存或取消编辑' : '重试同步归档'}
            </button>
          ) : (
            <p className="text-xs text-studio-text-muted">请联系有发布管理权限的成员重试归档同步。</p>
          )}
        </section>
      )}

      {/* 流程进度条 */}
      <div className={`${styles.card} p-6`}>
        <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4`}>选题流转进度</h2>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
          {WORKFLOW_STEPS.map((step, index) => {
            const status = getStepStatus(step.key);
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex min-w-0 items-center sm:flex-1">
                <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 sm:px-3 ${
                  status === 'completed' ? 'bg-studio-success/10 border border-studio-success/30' :
                  status === 'current' ? 'bg-studio-primary/10 border border-studio-primary/30 ring-2 ring-studio-primary/20' :
                  `${styles.bgTertiary} border ${styles.border}`
                }`}>
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    status === 'completed' ? 'bg-studio-success-soft text-studio-success-contrast' :
                    status === 'current' ? 'bg-studio-primary-button text-white' :
                    'bg-studio-surface-soft text-studio-text-muted'
                  }`}>
                    {status === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`min-w-0 break-words text-xs font-medium leading-4 ${
                    status === 'current' ? 'text-studio-primary' :
                    status === 'completed' ? styles.textPrimary :
                    styles.textMuted
                  }`}>
                    {step.label}
                  </span>
                </div>
                {index < WORKFLOW_STEPS.length - 1 && (
                  <ArrowRight className={`mx-1 hidden h-4 w-4 flex-shrink-0 sm:block ${
                    getStepStatus(WORKFLOW_STEPS[index + 1].key) !== 'pending' ? 'text-studio-success' : styles.textMuted
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 详细信息网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 选题信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <FileText className="w-5 h-5 text-studio-primary" />
            选题信息
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>平台</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.topic_platform || '-'}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>截止日期</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.topic_deadline || '-'}</span>
            </div>
            {data.topic_description && (
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>描述</span>
                <span className={`text-sm ${styles.textSecondary}`}>{data.topic_description}</span>
              </div>
            )}
          </div>
        </div>

        {/* 发布信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <Send className="w-5 h-5 text-studio-success" />
            发布信息
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>平台</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.platform || '-'}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>发布时间</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.publish_time ? formatBeijingDate(data.publish_time) : '-'}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>发布链接</span>
              {data.url ? (
                <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-sm text-studio-primary hover:text-studio-primary flex items-center gap-1">
                  查看 <ExternalLink className="w-3 h-3" />
                </a>
              ) : <span className={`text-sm ${styles.textPrimary}`}>-</span>}
            </div>
            <div className="flex items-start gap-3">
              <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>操作人</span>
              <span className={`text-sm ${styles.textPrimary}`}>{data.operator_name || '-'}</span>
            </div>
          </div>
        </div>

        {/* 成片制作信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <Camera className="w-5 h-5 text-studio-violet" />
            成片制作
          </h2>
          {data.shooting ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>状态</span>
                <span className={`text-sm ${styles.textPrimary}`}>{getWorkflowStatusLabel('shooting', data.shooting.status)}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>计划日期</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.shooting.plan_date ? formatBeijingDate(data.shooting.plan_date) : '-'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>地点</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.shooting.location || '-'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>设备</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.shooting.equipment || '-'}</span>
              </div>
            </div>
          ) : (
            <p className={`text-sm ${styles.textMuted}`}>暂无成片制作记录</p>
          )}
        </div>

        {/* 创作信息 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <FileText className="w-5 h-5 text-studio-amber" />
            创作审核
          </h2>
          {data.production ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-24 shrink-0 pt-0.5`}>当前创作版本</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.production.version || '-'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>状态</span>
                <span className="text-sm text-studio-success-contrast">已通过</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`text-xs ${styles.textMuted} w-16 shrink-0 pt-0.5`}>操作人</span>
                <span className={`text-sm ${styles.textPrimary}`}>{data.production.operator_name || '-'}</span>
              </div>
              {!editMode && sourceProductionId && sourceVersion && (
                <button
                  type="button"
                  onClick={() => navigate(`/production/${sourceProductionId}?version=${encodeURIComponent(sourceVersion)}`, { state: { mobileReturnTo: `/publishing/${data.id}` } })}
                  className="xmt-btn xmt-btn-secondary min-h-10 px-3 py-2 text-xs"
                >
                  查看引用创作版本 {sourceVersion}
                </button>
              )}
              {hasLocalEdit && (
                <div className="mt-2 px-3 py-2 bg-studio-primary/10 border border-studio-primary/30 rounded-lg">
                  <p className="text-xs text-studio-primary">📝 已有本地编辑版本（不回写创作管理）</p>
                </div>
              )}
            </div>
          ) : (
            <p className={`text-sm ${styles.textMuted}`}>暂无创作记录</p>
          )}
        </div>
      </div>

      {/* 剧本内容区域 */}
      <div className={`${styles.card} overflow-hidden`}>
        <div className={`flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${styles.border}`}>
          <h2 className={`flex min-w-0 items-center gap-2 text-base font-semibold sm:text-lg ${styles.textPrimary}`}>
            <FileText className="w-5 h-5 text-studio-primary" />
            剧本内容
            {hasLocalEdit && (
              <span className="rounded-full bg-studio-primary-soft px-2 py-0.5 text-xs text-studio-primary-contrast">本地编辑版</span>
            )}
          </h2>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {editMode ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  className={`min-h-10 px-3 py-2 text-sm rounded-lg sm:px-4 ${styles.buttonSecondary} transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={() => void handleSaveScript()}
                  disabled={saving}
                  className="xmt-btn xmt-btn-primary min-h-10 px-3 py-2 text-sm disabled:opacity-50 sm:px-4"
                >
                  <Save className="w-4 h-4" />
                  {saving ? '保存中...' : '保存'}
                </button>
                {hasPermission('workflow:publishing') && (
                  <>
                    <ActionButton type="button" onClick={() => void handleSaveScript('minor')} disabled={saving} className="min-h-10 px-3 py-2 text-xs">小版本保存</ActionButton>
                    <ActionButton type="button" variant="primary" onClick={() => void handleSaveScript('major')} disabled={saving} className="min-h-10 px-3 py-2 text-xs">大版本保存</ActionButton>
                  </>
                )}
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="xmt-btn xmt-btn-primary min-h-10 px-3 py-2 text-sm sm:px-4"
              >
                <FileText className="w-4 h-4" />
                编辑剧本
              </button>
            )}
          </div>
        </div>

        <div className="p-0">
          {editMode ? (
            <div className="min-h-[calc(100vh-22rem)] overflow-hidden bg-[var(--editor-bg)]">
              <ContentEditor
                writingGoalKey={`publishing:${id}`}
                value={scriptContent}
                onChange={setScriptContent}
                onSave={() => void handleSaveScript()}
                mode="rich"
                immersive
                toolbarVariant={compactEditorToolbar ? 'basic' : 'full'}
              />
            </div>
          ) : (
            <div className="p-6">
              <div
                className={`editor-content-preview tiptap max-w-none ${styles.textPrimary} leading-relaxed prose ${styles.isDark ? 'prose-invert' : ''}`}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(displayContent)) }}
              />
              {!scriptContent && (
                <div className={`text-center py-8 ${styles.textMuted}`}>
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>暂无剧本内容</p>
                  <p className="text-xs mt-1">点击"编辑剧本"按钮添加内容</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 提示信息 */}
        <div className={`border-t px-4 py-3 sm:px-6 ${styles.border} ${styles.bgTertiary}`}>
          <p className={`text-xs ${styles.textMuted}`}>
            💡 此处编辑的剧本内容仅在发布管理及后续资源库存档的成片批注中生效，不会同步到创作管理模块。
          </p>
        </div>
      </div>

      <section aria-label="发布剧本版本历史" className="rounded-2xl border border-studio-border-soft bg-studio-surface-soft/40 p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold text-studio-text-primary">版本历史</h3>
          <p className="mt-1 text-xs text-studio-text-muted">普通保存会更新当前稿；仅小版本和大版本操作会留档。</p>
        </div>
        {scriptVersionsLoadError ? (
          <div role="alert" data-testid="publishing-script-history-error" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-studio-danger/30 bg-studio-danger/10 p-3 text-sm text-studio-danger">
            <span>版本历史读取失败，列表可能不完整；已保存的剧本仍可正常使用，请重试读取。</span>
            <ActionButton type="button" disabled={scriptVersionsLoading || saving} onClick={() => data && void loadScriptVersions(data.id)} className="px-3 py-2">重新加载版本历史</ActionButton>
          </div>
        ) : scriptVersionsLoading ? (
          <p role="status" className="mt-3 text-sm text-studio-text-muted">正在加载版本历史…</p>
        ) : scriptVersions.length > 0 ? (
          <ol className="mt-3 grid gap-2 md:grid-cols-2">
            {scriptVersions.map((version) => (
              <li key={version.id} className="rounded-xl border border-studio-border-soft bg-studio-surface-soft/60 p-3">
                <p className="text-sm font-medium text-studio-text-primary">{version.is_baseline ? '历史原稿（时间未记录）' : `${version.version} · ${version.change_type === 'major' ? '大版本' : '小版本'}`}</p>
                <p className="mt-1 text-xs text-studio-text-muted">{version.is_baseline ? '旧内容未记录操作人和时间' : `${version.operator_name || '系统记录'} · ${version.created_at || '时间未记录'}`}</p>
                {Number(version.source_production_id) > 0 && version.source_production_version ? (
                  <button
                    type="button"
                    disabled={editMode || saving}
                    onClick={() => navigate(`/production/${version.source_production_id}?version=${encodeURIComponent(version.source_production_version!)}`, { state: { mobileReturnTo: `/publishing/${data.id}` } })}
                    className="mt-2 inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-medium text-studio-cyan-contrast hover:bg-studio-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
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
      </section>

      {/* 流转历史 */}
      {data.topicHistory && data.topicHistory.length > 0 && (
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold ${styles.textPrimary} mb-4 flex items-center gap-2`}>
            <Clock className="w-5 h-5 text-studio-text-muted" />
            选题流转记录
          </h2>
          <div className="space-y-0">
            {data.topicHistory.map((h, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-studio-primary' : 'bg-studio-surface-soft'} mt-1.5`} />
                  {i < data.topicHistory.length - 1 && <div className={`w-px flex-1 ${styles.border} my-1`} />}
                </div>
                <div className="pb-4 flex-1">
                  <p className={`text-sm font-medium ${styles.textPrimary}`}>{h.comment || h.action}</p>
                  <div className={`flex items-center gap-2 text-xs ${styles.textMuted} mt-1`}>
                    <span>{h.operator_name}</span>
                    <span>{formatBeijingTime(h.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}

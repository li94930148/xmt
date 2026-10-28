import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  BarChart3,
  Calendar,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  MessageSquare,
  Package,
  Send,
  Trash2,
  User,
} from 'lucide-react';
import { deleteResource, getArchiveDetail, getArchives } from '../api';
import { ConfirmModal, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import PlatformBadge from '../components/studio/PlatformBadge';
import SearchBar from '../components/studio/SearchBar';
import StatusPill from '../components/studio/StatusPill';
import StudioEmptyState from '../components/studio/EmptyState';
import { useDebounce } from '../hooks/useDebounce';
import { usePermission } from '../hooks/usePermission';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore } from '../store';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';
import { sanitizeHtml } from '../utils/sanitizeHtml';

interface ArchiveItem {
  id: number;
  name: string;
  file_path: string;
  uploader_name: string;
  platform: string;
  publishedRecordCount: number;
  publishedPlatforms: string[];
  scriptVersion: string;
  shootingCommentCount: number;
  publishedAt: string;
  views: number;
  likes: number;
  archived_at: string;
  created_at: string;
  updated_at: string;
}

interface ArchiveDetail {
  id: number;
  name: string;
  file_path: string;
  uploader_name: string;
  created_at: string;
  updated_at: string;
  archive: {
    topic?: {
      id?: number;
      title: string;
      description: string;
      platform: string;
      deadline: string;
      created_at: string;
    };
    script?: {
      version: string;
      content: string;
      history: Array<{
        version: string;
        content: string;
        status: string;
        change_type: string;
        comment: string;
        created_at: string;
        operator_name: string;
      }>;
    };
    script_sources?: {
      shooting?: ArchiveScriptSource;
      publishing?: ArchiveScriptSource;
    };
    script_source_snapshots?: ArchiveScriptSourceSnapshot[];
    shooting?: {
      record: Record<string, unknown>;
      comments: Array<{
        content: string;
        created_at: string;
        operator_name: string;
      }>;
    };
    publishing?: Omit<PublishedRecordSnapshot, 'publishing_id' | 'analytics'>;
    published_records?: PublishedRecordSnapshot[];
    analytics?: AnalyticsSnapshot;
    topicHistory?: Array<{
      action: string;
      comment: string;
      created_at: string;
      operator_name: string;
    }>;
    archived_at?: string;
  };
}

interface ArchiveScriptSource {
  topic_id: number;
  production_id: number | null;
  version: string | null;
  state: 'none' | 'unavailable' | 'unrecorded' | 'derived' | 'inherited';
}

interface ArchiveScriptSourceSnapshot {
  topic_id: number;
  production_id: number;
  version: string;
  content: string;
  content_markdown: string | null;
}

interface AnalyticsSnapshot {
  data_date?: string | null;
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  sources?: Record<string, string>;
}

interface PublishedRecordSnapshot {
  publishing_id?: number;
  platform: string;
  url?: string | null;
  status?: string;
  publish_time?: string | null;
  analytics?: AnalyticsSnapshot | null;
}

// Older archive payloads only have singular publishing/analytics fields; normalize them for display without rewriting stored data.
const archivePlatformLabels: Record<string, string> = {
  douyin: '抖音',
  weixin: '微信视频号',
  wechat: '微信视频号',
  wechat_channels: '微信视频号',
  xiaohongshu: '小红书',
  rednote: '小红书',
  bilibili: 'B站',
  kuaishou: '快手',
};

function getArchivePlatformLabel(platform?: string) {
  const value = platform?.trim() || '';
  return archivePlatformLabels[value.toLowerCase()] || value;
}

function DetailTabEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <StudioEmptyState icon={Archive} title={title} description={description} />;
}

function ArchivedScriptSources({
  sources,
  snapshots,
  topicId,
  canViewProduction,
}: {
  sources: ArchiveDetail['archive']['script_sources'];
  snapshots: ArchiveScriptSourceSnapshot[];
  topicId?: number;
  canViewProduction: boolean;
}) {
  if (!sources) {
    return (
      <GlassPanel className="p-4" data-testid="archive-script-sources">
        <h4 className="font-semibold text-studio-text-primary">成片与发布剧本来源</h4>
        <p className="mt-2 text-sm text-studio-text-secondary">旧版归档未保存剧本来源信息，无法确认当时引用的创作稿；不根据当前稿件推断。</p>
      </GlassPanel>
    );
  }

  const items = [
    { key: 'shooting' as const, label: '成片剧本' },
    { key: 'publishing' as const, label: '发布剧本' },
  ];
  const stateLabels: Record<ArchiveScriptSource['state'], string> = {
    derived: '来源已记录',
    inherited: '沿用创作正文',
    unavailable: '来源版本当前不可用',
    unrecorded: '该版本的来源未记录；不根据当前稿件推断',
    none: '未记录独立剧本来源',
  };

  return (
    <GlassPanel className="space-y-3 p-4" data-testid="archive-script-sources">
      <div>
        <h4 className="font-semibold text-studio-text-primary">成片与发布剧本来源</h4>
        <p className="mt-1 text-xs text-studio-text-muted">以下信息来自归档时保存的来源关系，不会用当前稿件补猜。</p>
      </div>
      {items.map(({ key, label }) => {
        const source = sources[key];
        if (!source) {
          return <p key={key} className="text-sm text-studio-text-secondary">{label}：该归档未记录来源关系。</p>;
        }
        const hasRecordedReference = (source.state === 'derived' || source.state === 'inherited')
          && Number.isSafeInteger(source.production_id)
          && Number(source.production_id) > 0
          && Boolean(source.version);
        const belongsToArchiveTopic = Number.isSafeInteger(topicId) && source.topic_id === topicId;
        const validReference = hasRecordedReference && belongsToArchiveTopic;
        const snapshot = validReference
          ? snapshots.find((item) => item.topic_id === source.topic_id
            && item.production_id === source.production_id
            && item.version === source.version)
          : undefined;

        return (
          <div key={key} className="min-w-0 rounded-card border border-studio-border-soft bg-studio-surface-soft p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-sm font-medium text-studio-text-primary">{label}</span>
              <span className="text-sm text-studio-text-secondary">{stateLabels[source.state]}</span>
              {source.production_id && source.version ? (
                <span className="text-xs text-studio-text-muted">创作稿 #{source.production_id} · {source.version}</span>
              ) : null}
              {validReference && canViewProduction ? (
                <Link
                  to={`/production/${source.production_id}?version=${encodeURIComponent(source.version!)}`}
                  className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-studio-cyan-contrast"
                  aria-label={`查看${label}来源创作稿 ${source.version}`}
                >
                  查看来源创作稿 <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : validReference ? (
                <span className="text-xs text-studio-text-muted">可查看归档快照；打开原稿需要创作稿查看权限</span>
              ) : hasRecordedReference && !belongsToArchiveTopic ? (
                <span role="alert" className="text-xs text-studio-coral-contrast">来源选题与当前归档不一致，已隐藏来源内容</span>
              ) : null}
            </div>
            {validReference && snapshot ? (
              <details className="mt-2">
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-studio-text-secondary">查看归档保存的来源正文</summary>
                <div
                  className="editor-content-preview prose prose-sm mt-2 max-w-none rounded-card border border-studio-border-soft bg-studio-surface p-4 text-studio-text-secondary"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(snapshot.content)) }}
                />
              </details>
            ) : null}
          </div>
        );
      })}
    </GlassPanel>
  );
}

export default function Resources() {
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission } = usePermission();
  const canDeleteArchive = hasPermission('resource:delete');
  const canViewProduction = hasPermission('production:view');
  const canViewTopic = hasPermission('topic:view');
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [archiveListError, setArchiveListError] = useState<string | null>(null);
  const [hasLoadedArchiveList, setHasLoadedArchiveList] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'shooting' | 'publishing' | 'history'>('publishing');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteLockRef = useRef(false);

  const debouncedSearch = useDebounce(searchTerm, 400);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    setArchiveListError(null);
    try {
      const result = await getArchives({ search: debouncedSearch, page, limit: 12 });
      setArchives(result.data);
      setTotal(result.total);
      setHasLoadedArchiveList(true);
    } catch (error) {
      setArchiveListError(error instanceof Error ? error.message : '获取归档列表失败');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    void fetchArchives();
  }, [fetchArchives]);

  const handleViewDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detail = await getArchiveDetail(id);
      setSelectedArchive(detail);
      setActiveTab('publishing');
    } catch (error) {
      addNotification({
        title: '获取详情失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedArchive || deleteLockRef.current) {
      return;
    }

    const targetId = selectedArchive.id;
    deleteLockRef.current = true;
    setDeleting(true);
    try {
      await deleteResource(targetId);
      addNotification({
        title: '删除成功',
        message: '归档已删除',
        type: 'success',
      });
      setArchives((current) => current.filter((archive) => archive.id !== targetId));
      setTotal((current) => Math.max(0, current - 1));
      setSelectedArchive(null);
      setShowDeleteModal(false);
    } catch (error) {
      addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      deleteLockRef.current = false;
      setDeleting(false);
    }
  };

  if (selectedArchive) {
    const archive = selectedArchive.archive;
    const topic = archive.topic;
    const script = archive.script;
    const shooting = archive.shooting;
    const publishing = archive.publishing;
    const publishedRecords: PublishedRecordSnapshot[] = archive.published_records?.length
      ? archive.published_records
      : publishing ? [{ ...publishing, publishing_id: undefined, analytics: archive.analytics }] : [];
    const analytics = publishedRecords[0]?.analytics || archive.analytics;

    return (
      <PageShell>
        <PageHeader
          title={selectedArchive.name}
          description={`归档于 ${formatBeijingTime(archive.archived_at) || '未知时间'}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton type="button" variant="secondary" onClick={() => setSelectedArchive(null)}>
                返回发布归档
              </ActionButton>
              {canDeleteArchive ? <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex min-h-10 items-center gap-2 rounded-button border border-studio-coral/30 bg-studio-coral/10 px-4 py-2.5 text-sm font-semibold text-studio-coral-contrast transition hover:bg-studio-coral/15"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button> : null}
            </div>
          }
        />

        <GlassPanel className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <PlatformBadge platform={getArchivePlatformLabel(topic?.platform || publishing?.platform)} />
            <StatusPill tone="success">已归档</StatusPill>
            {topic?.id && canViewTopic ? (
              <Link
                to={`/topics/${topic.id}`}
                state={{ mobileReturnTo: '/asset-center/published-archives' }}
                className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-studio-cyan-contrast"
                aria-label="查看归档来源选题"
              >
                查看来源选题 <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <p className="mb-1 text-xs text-studio-text-muted">截止日期</p>
              <p className="text-sm font-medium text-studio-text-primary">{topic?.deadline || '-'}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-studio-text-muted">发布时间</p>
              <p className="text-sm font-medium text-studio-text-primary">{publishing?.publish_time || '-'}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-studio-text-muted">发布链接</p>
              {publishing?.url ? (
                <a href={publishing.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-studio-cyan-contrast">
                  查看
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="text-sm font-medium text-studio-text-primary">-</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-studio-text-muted">创建人</p>
              <p className="text-sm font-medium text-studio-text-primary">{selectedArchive.uploader_name || '-'}</p>
            </div>
          </div>
          {topic?.description ? <p className="mt-5 text-sm leading-6 text-studio-text-secondary">{topic.description}</p> : null}
        </GlassPanel>

        {analytics ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="col-span-full text-xs text-studio-text-muted">最近一条发布数据（各平台明细见“发布信息”，不跨平台相加）</div>
            <MetricCard title="播放量" value={(analytics.views || 0).toLocaleString()} icon={BarChart3} tone="cyan" />
            <MetricCard title="点赞数" value={(analytics.likes || 0).toLocaleString()} icon={BarChart3} tone="coral" />
            <MetricCard title="分享数" value={(analytics.shares || 0).toLocaleString()} icon={Send} tone="success" />
            <MetricCard title="评论数" value={(analytics.comments || 0).toLocaleString()} icon={MessageSquare} tone="violet" />
          </div>
        ) : null}

        <GlassPanel className="overflow-hidden">
          <div role="group" aria-label="归档信息视图" className="flex min-w-0 overflow-x-auto border-b border-studio-border-soft">
            {[
              { key: 'script', label: '稿件', icon: FileText },
              { key: 'shooting', label: '制作批注', icon: Package },
              { key: 'publishing', label: '发布信息', icon: Send },
              { key: 'history', label: '流程记录', icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  aria-pressed={activeTab === tab.key}
                  className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-5 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? 'border-studio-cyan bg-studio-cyan/10 text-studio-cyan-contrast'
                      : 'border-transparent text-studio-text-secondary hover:bg-studio-surface-soft hover:text-studio-text-primary'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-5">
            {activeTab === 'script' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-studio-text-primary">稿件内容</h3>
                  {script?.version ? <StatusPill tone="primary">版本 {script.version}</StatusPill> : null}
                </div>

                {script?.content ? (
                  <div
                    className="editor-content-preview prose prose-sm max-w-none rounded-card border border-studio-border-soft bg-studio-surface-soft p-5 text-studio-text-secondary"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(normalizeLegacyEditorHtmlTheme(script.content)) }}
                  />
                ) : (
                  <DetailTabEmptyState title="暂无稿件内容" description="当前归档中还没有可展示的稿件内容。" />
                )}

                <ArchivedScriptSources
                  sources={archive.script_sources}
                  snapshots={archive.script_source_snapshots || []}
                  topicId={topic?.id}
                  canViewProduction={canViewProduction}
                />

                {script?.history && script.history.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-medium text-studio-text-primary">版本历史</h4>
                    {script.history.map((history, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-3 rounded-card border border-studio-border-soft bg-studio-surface-soft p-3 text-sm">
                        <span className="font-mono text-studio-cyan-contrast">{history.version}</span>
                        <span className="text-studio-text-secondary">{history.change_type === 'major' ? '大版本' : '小版本'}</span>
                        {history.comment ? <span className="text-studio-text-muted">· {history.comment}</span> : null}
                        <span className="ml-auto text-studio-text-muted">{formatBeijingTime(history.created_at)}</span>
                        <span className="text-studio-text-muted">{history.operator_name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'shooting' ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-studio-text-primary">制作批注</h3>
                {shooting?.comments && shooting.comments.length > 0 ? (
                  <div className="space-y-3">
                    {shooting.comments.map((comment, index) => (
                      <GlassPanel key={index} className="p-4">
                        <p className="text-sm text-studio-text-primary">{comment.content}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                          <User className="h-3.5 w-3.5" />
                          <span>{comment.operator_name}</span>
                          <span>{formatBeijingTime(comment.created_at)}</span>
                        </div>
                      </GlassPanel>
                    ))}
                  </div>
                ) : (
                  <DetailTabEmptyState title="暂无制作批注" description="当前归档中还没有制作环节的批注记录。" />
                )}
              </div>
            ) : null}

            {activeTab === 'publishing' ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-studio-text-primary">发布详情</h3>
                {publishedRecords.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-studio-text-secondary">共 {publishedRecords.length} 条发布记录；每条数据仅对应自己的平台和发布记录。</p>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {publishedRecords.map((record, index) => {
                        const recordAnalytics = record.analytics;
                        const metrics: Array<{ label: string; value: number | undefined }> = [
                          { label: '播放', value: recordAnalytics?.views },
                          { label: '点赞', value: recordAnalytics?.likes },
                          { label: '分享', value: recordAnalytics?.shares },
                          { label: '评论', value: recordAnalytics?.comments },
                        ];
                        return (
                          <GlassPanel key={record.publishing_id || `${record.platform}-${record.publish_time || index}`} className="min-w-0 space-y-4 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <PlatformBadge platform={getArchivePlatformLabel(record.platform)} />
                              <StatusPill tone={record.status === 'published' ? 'success' : 'amber'}>{record.status === 'published' ? '已发布' : record.status || '-'}</StatusPill>
                            </div>
                            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                              <div><p className="text-xs text-studio-text-muted">发布时间</p><p className="mt-1 break-words font-medium text-studio-text-primary">{record.publish_time || '-'}</p></div>
                              <div><p className="text-xs text-studio-text-muted">数据日期</p><p className="mt-1 break-words font-medium text-studio-text-primary">{recordAnalytics?.data_date || '-'}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 border-t border-studio-border-soft pt-3 sm:grid-cols-4">
                              {metrics.map(({ label, value }) => (
                                <div key={label} className="min-w-0">
                                  <p className="text-xs text-studio-text-muted">{label}</p>
                                  <p className="mt-1 truncate text-sm font-semibold text-studio-text-primary">{typeof value === 'number' ? value.toLocaleString('zh-CN') : '—'}</p>
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                              {record.url ? <a href={record.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-studio-cyan-contrast">打开发布链接 <ExternalLink className="h-3.5 w-3.5" /></a> : null}
                              {record.publishing_id ? <Link to={`/publishing/${record.publishing_id}`} className="inline-flex min-h-10 items-center text-sm font-medium text-studio-cyan-contrast">查看发布记录 #{record.publishing_id}</Link> : null}
                            </div>
                          </GlassPanel>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <DetailTabEmptyState title="暂无发布信息" description="当前归档中还没有发布阶段的详细信息。" />
                )}
              </div>
            ) : null}

            {activeTab === 'history' ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-studio-text-primary">流程记录</h3>
                {archive.topicHistory && archive.topicHistory.length > 0 ? (
                  <div className="space-y-0">
                    {archive.topicHistory.map((history, index) => (
                      <div key={index} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`mt-1.5 h-3 w-3 rounded-full ${index === 0 ? 'bg-studio-cyan shadow-glow-cyan' : 'bg-studio-surface-soft'}`} />
                          {index < (archive.topicHistory?.length ?? 0) - 1 ? <div className="my-1 w-px flex-1 bg-studio-border-soft" /> : null}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="text-sm font-medium text-studio-text-primary">{history.comment || history.action}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-studio-text-muted">
                            <span>{history.operator_name}</span>
                            <span>{formatBeijingTime(history.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <DetailTabEmptyState title="暂无流程记录" description="当前归档中还没有可展示的流转记录。" />
                )}
              </div>
            ) : null}
          </div>
        </GlassPanel>

        <ConfirmModal
          open={showDeleteModal}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          loading={deleting}
          variant="danger"
          title="确认删除"
          confirmText="确认删除"
          cancelText="取消"
          description={`确定要删除发布归档“${selectedArchive.name}”吗？此操作只删除归档快照，不会删除原选题、稿件、批注或发布记录。`}
        />
      </PageShell>
    );
  }

  const linkedCount = archives.filter((item) => item.platform || item.scriptVersion || item.publishedAt).length;

  return (
    <PageShell>
      <PageHeader
        title="发布归档"
        description="按选题查看已发布平台的快照、稿件版本和制作批注；各平台数据分别展示，不会合并计算。"
        actions={
          <div className="flex items-center gap-2 rounded-button border border-studio-border-soft bg-studio-surface-soft px-3 py-2 text-sm text-studio-text-secondary">
            <Archive className="h-4 w-4 text-studio-cyan" />
            共 {hasLoadedArchiveList ? total : '—'} 个存档
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="总归档" value={hasLoadedArchiveList ? total : '—'} icon={Archive} tone="primary" />
        <MetricCard title="今日新增" value={hasLoadedArchiveList ? archives.filter((item) => item.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length : '—'} icon={Calendar} tone="cyan" />
        <MetricCard title="待整理" value={hasLoadedArchiveList ? archives.filter((item) => !item.platform && !item.scriptVersion).length : '—'} icon={Package} tone="amber" />
        <MetricCard title="已关联内容" value={hasLoadedArchiveList ? linkedCount : '—'} icon={FileText} tone="success" />
      </div>

      <GlassPanel className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setPage(1);
          }}
          placeholder="搜索资源名称..."
          className="max-w-xl"
        />
      </GlassPanel>

      {archiveListError ? <div role="alert" className="flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
        <span>{archives.length ? '归档刷新失败，仍显示最近一次成功读取的内容。' : '归档列表暂时无法读取。'} {archiveListError}</span>
        <ActionButton type="button" variant="secondary" disabled={loading} onClick={() => void fetchArchives()}>{loading ? '正在重新加载…' : '重新加载归档'}</ActionButton>
      </div> : null}

      {loading || detailLoading ? (
        <LoadingState type="section" text="正在加载资源归档..." />
      ) : archiveListError && archives.length === 0 ? null : archives.length === 0 ? (
        <StudioEmptyState
          icon={Archive}
          title="暂无资源归档"
          description="内容发布完成后会自动沉淀到这里，形成可复用的素材资产库。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {archives.map((item) => (
            <button
              key={item.id}
              type="button"
              className="group min-w-0 rounded-card border border-studio-border-soft bg-studio-surface-glass p-5 text-left shadow-card backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-studio-border-active hover:shadow-glow-primary"
              onClick={() => void handleViewDetail(item.id)}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-base font-semibold text-studio-text-primary group-hover:text-studio-cyan">{item.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(item.publishedPlatforms?.length ? item.publishedPlatforms : item.platform ? [item.platform] : []).map((platform) => <PlatformBadge key={platform} platform={getArchivePlatformLabel(platform)} />)}
                  </div>
                </div>
                <Eye className="h-4 w-4 shrink-0 text-studio-text-muted group-hover:text-studio-cyan" />
              </div>

              <div className="space-y-2 text-xs text-studio-text-secondary">
                {item.scriptVersion ? (
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-studio-text-muted" />
                    <span>稿件 {item.scriptVersion}</span>
                  </div>
                ) : null}
                {item.shootingCommentCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-studio-text-muted" />
                    <span>{item.shootingCommentCount} 条制作批注</span>
                  </div>
                ) : null}
                {item.publishedRecordCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <Send className="h-3.5 w-3.5 text-studio-text-muted" />
                    <span>{item.publishedRecordCount} 条发布记录</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-studio-text-muted" />
                  <span>更新于 {formatBeijingDate(item.updated_at)}</span>
                </div>
              </div>

              {item.views > 0 || item.likes > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-studio-border-soft pt-4 text-xs text-studio-text-muted">
                  {item.views > 0 ? <span>播放 {item.views.toLocaleString()}</span> : null}
                  {item.likes > 0 ? <span>点赞 {item.likes.toLocaleString()}</span> : null}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {total > 12 ? (
        <div className="flex items-center justify-center gap-2">
          <ActionButton type="button" variant="secondary" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page === 1}>
            上一页
          </ActionButton>
          <span className="text-sm text-studio-text-secondary">
            {page} / {Math.ceil(total / 12)}
          </span>
          <ActionButton type="button" variant="secondary" onClick={() => setPage((currentPage) => currentPage + 1)} disabled={page >= Math.ceil(total / 12)}>
            下一页
          </ActionButton>
        </div>
      ) : null}
    </PageShell>
  );
}

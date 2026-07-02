import { useEffect, useState } from 'react';
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
  Search,
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
import ResourceTypeBadge from '../components/studio/ResourceTypeBadge';
import SearchBar from '../components/studio/SearchBar';
import StatusPill from '../components/studio/StatusPill';
import StudioEmptyState from '../components/studio/EmptyState';
import { useDebounce } from '../hooks/useDebounce';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore } from '../store';
import { normalizeLegacyEditorHtmlTheme } from '../utils/editorTheme';

interface ArchiveItem {
  id: number;
  name: string;
  file_path: string;
  uploader_name: string;
  platform: string;
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
    shooting?: {
      record: Record<string, unknown>;
      comments: Array<{
        content: string;
        created_at: string;
        operator_name: string;
      }>;
    };
    publishing?: {
      platform: string;
      url: string;
      status: string;
      publish_time: string;
    };
    analytics?: {
      views: number;
      likes: number;
      shares: number;
      comments: number;
    };
    topicHistory?: Array<{
      action: string;
      comment: string;
      created_at: string;
      operator_name: string;
    }>;
    archived_at?: string;
  };
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

export default function Resources() {
  const addNotification = useAppStore((state) => state.addNotification);
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'shooting' | 'publishing' | 'history'>('script');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 400);

  useEffect(() => {
    void fetchArchives();
  }, [debouncedSearch, page]);

  const fetchArchives = async () => {
    setLoading(true);
    try {
      const result = await getArchives({ search: debouncedSearch, page, limit: 12 });
      setArchives(result.data);
      setTotal(result.total);
    } catch (error) {
      addNotification({
        title: '获取归档失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detail = await getArchiveDetail(id);
      setSelectedArchive(detail);
      setActiveTab('script');
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
    if (!selectedArchive) {
      return;
    }

    setDeleting(true);
    try {
      await deleteResource(selectedArchive.id);
      addNotification({
        title: '删除成功',
        message: '归档已删除',
        type: 'success',
      });
      setSelectedArchive(null);
      setShowDeleteModal(false);
      void fetchArchives();
    } catch (error) {
      addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (selectedArchive) {
    const archive = selectedArchive.archive;
    const topic = archive.topic;
    const script = archive.script;
    const shooting = archive.shooting;
    const publishing = archive.publishing;
    const analytics = archive.analytics;

    return (
      <PageShell>
        <PageHeader
          title={selectedArchive.name}
          description={`归档于 ${formatBeijingTime(archive.archived_at) || '未知时间'}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton type="button" variant="secondary" onClick={() => setSelectedArchive(null)}>
                返回资产库
              </ActionButton>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex min-h-10 items-center gap-2 rounded-button border border-studio-coral/30 bg-studio-coral/10 px-4 py-2.5 text-sm font-semibold text-[#FFC2CC] transition hover:bg-studio-coral/15"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </div>
          }
        />

        <GlassPanel className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <ResourceTypeBadge type="文档" />
            <PlatformBadge platform={topic?.platform || publishing?.platform} />
            <StatusPill tone="success">已归档</StatusPill>
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
                <a href={publishing.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-studio-cyan">
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
            <MetricCard title="播放量" value={analytics.views.toLocaleString()} icon={BarChart3} tone="cyan" />
            <MetricCard title="点赞数" value={analytics.likes.toLocaleString()} icon={BarChart3} tone="coral" />
            <MetricCard title="分享数" value={analytics.shares.toLocaleString()} icon={Send} tone="success" />
            <MetricCard title="评论数" value={analytics.comments.toLocaleString()} icon={MessageSquare} tone="violet" />
          </div>
        ) : null}

        <GlassPanel className="overflow-hidden">
          <div className="flex min-w-0 overflow-x-auto border-b border-studio-border-soft">
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
                  className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-5 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? 'border-studio-cyan bg-studio-cyan/10 text-studio-cyan'
                      : 'border-transparent text-studio-text-secondary hover:bg-white/[0.04] hover:text-studio-text-primary'
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
                    className="editor-content-preview prose prose-invert prose-sm max-w-none rounded-card border border-studio-border-soft bg-white/[0.03] p-5 text-studio-text-secondary"
                    dangerouslySetInnerHTML={{ __html: normalizeLegacyEditorHtmlTheme(script.content) }}
                  />
                ) : (
                  <DetailTabEmptyState title="暂无稿件内容" description="当前归档中还没有可展示的稿件内容。" />
                )}

                {script?.history && script.history.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-medium text-studio-text-primary">版本历史</h4>
                    {script.history.map((history, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-3 rounded-card border border-studio-border-soft bg-white/[0.03] p-3 text-sm">
                        <span className="font-mono text-studio-cyan">{history.version}</span>
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
                {publishing ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <GlassPanel className="p-4">
                      <p className="mb-2 text-xs text-studio-text-muted">发布平台</p>
                      <PlatformBadge platform={publishing.platform} />
                    </GlassPanel>
                    <GlassPanel className="p-4">
                      <p className="mb-2 text-xs text-studio-text-muted">发布时间</p>
                      <p className="text-sm font-medium text-studio-text-primary">{publishing.publish_time || '-'}</p>
                    </GlassPanel>
                    <GlassPanel className="p-4">
                      <p className="mb-2 text-xs text-studio-text-muted">发布状态</p>
                      <StatusPill tone={publishing.status === 'published' ? 'success' : 'amber'}>{publishing.status || '-'}</StatusPill>
                    </GlassPanel>
                    <GlassPanel className="p-4">
                      <p className="mb-2 text-xs text-studio-text-muted">发布链接</p>
                      {publishing.url ? (
                        <a href={publishing.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-studio-cyan">
                          查看
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-studio-text-primary">-</p>
                      )}
                    </GlassPanel>
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
                          <div className={`mt-1.5 h-3 w-3 rounded-full ${index === 0 ? 'bg-studio-cyan shadow-glow-cyan' : 'bg-slate-600'}`} />
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
          description={`确定要删除归档“${selectedArchive.name}”吗？此操作不可撤销，相关稿件、批注和发布数据将一起删除。`}
        />
      </PageShell>
    );
  }

  const linkedCount = archives.filter((item) => item.platform || item.scriptVersion || item.publishedAt).length;

  return (
    <PageShell>
      <PageHeader
        title="资源管理"
        description="沉淀已发布内容、稿件版本、制作批注和发布数据，方便团队复用素材资产。"
        actions={
          <div className="flex items-center gap-2 rounded-button border border-studio-border-soft bg-white/[0.05] px-3 py-2 text-sm text-studio-text-secondary">
            <Archive className="h-4 w-4 text-studio-cyan" />
            共 {total} 个存档
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="总资源" value={total} icon={Archive} tone="primary" />
        <MetricCard title="今日新增" value={archives.filter((item) => item.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length} icon={Calendar} tone="cyan" />
        <MetricCard title="待整理" value={archives.filter((item) => !item.platform && !item.scriptVersion).length} icon={Package} tone="amber" />
        <MetricCard title="已关联内容" value={linkedCount} icon={FileText} tone="success" />
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

      {loading || detailLoading ? (
        <LoadingState type="section" text="正在加载资源归档..." />
      ) : archives.length === 0 ? (
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
                    <ResourceTypeBadge type="文档" />
                    {item.platform ? <PlatformBadge platform={item.platform} /> : null}
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

import { useEffect, useState } from 'react';
import {
  Archive,
  Calendar,
  ChevronLeft,
  Eye,
  ExternalLink,
  FileText,
  MessageSquare,
  Search,
  Send,
  Trash2,
  User,
  Clock,
  Camera,
  BarChart3,
} from 'lucide-react';
import { getArchiveDetail, getArchives, deleteResource } from '../api';
import EmptyState from '../components/EmptyState';
import {
  ConfirmModal,
  LoadingState,
  PageHeader,
  PageToolbar,
} from '../components/common';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useDebounce } from '../hooks/useDebounce';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore } from '../store';

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
  return (
    <EmptyState
      icon={Archive}
      title={title}
      description={description}
    />
  );
}

export default function Resources() {
  const styles = useThemeStyles();
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
      <div className="space-y-6">
        <PageHeader
          title={selectedArchive.name}
          description={`归档于 ${formatBeijingTime(archive.archived_at) || '未知'}`}
          backButton={{
            onClick: () => setSelectedArchive(null),
            label: '返回',
          }}
          actions={
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 ${styles.buttonDanger} transition-colors`}
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-sm font-medium">删除</span>
            </button>
          }
        />

        <div className={`${styles.card} p-6`}>
          <h2 className={`mb-4 text-lg font-semibold ${styles.textPrimary}`}>选题信息</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className={`mb-1 text-xs ${styles.textMuted}`}>平台</p>
              <p className={styles.textPrimary}>{topic?.platform || '-'}</p>
            </div>
            <div>
              <p className={`mb-1 text-xs ${styles.textMuted}`}>截止日期</p>
              <p className={styles.textPrimary}>{topic?.deadline || '-'}</p>
            </div>
            <div>
              <p className={`mb-1 text-xs ${styles.textMuted}`}>发布时间</p>
              <p className={styles.textPrimary}>{publishing?.publish_time || '-'}</p>
            </div>
            <div>
              <p className={`mb-1 text-xs ${styles.textMuted}`}>发布链接</p>
              {publishing?.url ? (
                <a
                  href={publishing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                >
                  查看
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className={styles.textPrimary}>-</p>
              )}
            </div>
          </div>
          {topic?.description ? (
            <div className="mt-4">
              <p className={`mb-1 text-xs ${styles.textMuted}`}>选题描述</p>
              <p className={`text-sm ${styles.textSecondary}`}>{topic.description}</p>
            </div>
          ) : null}
        </div>

        {analytics ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: '播放量', value: analytics.views, icon: BarChart3 },
              { label: '点赞数', value: analytics.likes, icon: BarChart3 },
              { label: '分享数', value: analytics.shares, icon: BarChart3 },
              { label: '评论数', value: analytics.comments, icon: MessageSquare },
            ].map((stat) => (
              <div key={stat.label} className={`${styles.card} p-4`}>
                <p className={`mb-1 text-xs ${styles.textMuted}`}>{stat.label}</p>
                <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : 0}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className={`${styles.card} overflow-hidden`}>
          <div className={`flex border-b ${styles.border}`}>
            {[
              { key: 'script', label: '剧本', icon: FileText },
              { key: 'shooting', label: '拍摄批注', icon: Camera },
              { key: 'publishing', label: '发布信息', icon: Send },
              { key: 'history', label: '流程记录', icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : `border-transparent ${styles.textSecondary} ${styles.hoverBg}`
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {activeTab === 'script' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className={`font-semibold ${styles.textPrimary}`}>
                    剧本内容
                    {script?.version ? (
                      <span className={`ml-2 text-xs ${styles.textMuted}`}>版本：{script.version}</span>
                    ) : null}
                  </h3>
                </div>

                {script?.content ? (
                  <div
                    className={`prose prose-sm max-w-none ${styles.isDark ? 'prose-invert' : ''}`}
                    dangerouslySetInnerHTML={{ __html: script.content }}
                  />
                ) : (
                  <DetailTabEmptyState
                    title="暂无剧本内容"
                    description="当前归档中还没有可展示的剧本内容。"
                  />
                )}

                {script?.history && script.history.length > 0 ? (
                  <div className="mt-6">
                    <h4 className={`mb-3 font-medium ${styles.textPrimary}`}>版本历史</h4>
                    <div className="space-y-2">
                      {script.history.map((history, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-3 rounded p-2 text-sm ${styles.hoverBgLight}`}
                        >
                          <span className="font-mono text-blue-400">{history.version}</span>
                          <span className={styles.textSecondary}>
                            {history.change_type === 'major' ? '大版本' : '小版本'}
                          </span>
                          {history.comment ? (
                            <span className={styles.textMuted}>· {history.comment}</span>
                          ) : null}
                          <span className={`ml-auto ${styles.textMuted}`}>
                            {formatBeijingTime(history.created_at)}
                          </span>
                          <span className={styles.textMuted}>{history.operator_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'shooting' ? (
              <div className="space-y-4">
                <h3 className={`font-semibold ${styles.textPrimary}`}>拍摄制作批注</h3>
                {shooting?.comments && shooting.comments.length > 0 ? (
                  <div className="space-y-3">
                    {shooting.comments.map((comment, index) => (
                      <div key={index} className={`${styles.card} p-4`}>
                        <p className={`text-sm ${styles.textPrimary}`}>{comment.content}</p>
                        <div className={`mt-2 flex items-center gap-3 text-xs ${styles.textMuted}`}>
                          <User className="h-3 w-3" />
                          <span>{comment.operator_name}</span>
                          <span>{formatBeijingTime(comment.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <DetailTabEmptyState
                    title="暂无拍摄批注"
                    description="当前归档中还没有拍摄环节的批注记录。"
                  />
                )}
              </div>
            ) : null}

            {activeTab === 'publishing' ? (
              <div className="space-y-4">
                <h3 className={`font-semibold ${styles.textPrimary}`}>发布详情</h3>
                {publishing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className={`mb-1 text-xs ${styles.textMuted}`}>发布平台</p>
                      <p className={styles.textPrimary}>{publishing.platform || '-'}</p>
                    </div>
                    <div>
                      <p className={`mb-1 text-xs ${styles.textMuted}`}>发布时间</p>
                      <p className={styles.textPrimary}>{publishing.publish_time || '-'}</p>
                    </div>
                    <div>
                      <p className={`mb-1 text-xs ${styles.textMuted}`}>发布状态</p>
                      <p className={styles.textPrimary}>{publishing.status || '-'}</p>
                    </div>
                    <div>
                      <p className={`mb-1 text-xs ${styles.textMuted}`}>发布链接</p>
                      {publishing.url ? (
                        <a
                          href={publishing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          查看
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className={styles.textPrimary}>-</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <DetailTabEmptyState
                    title="暂无发布信息"
                    description="当前归档中还没有发布阶段的详细信息。"
                  />
                )}
              </div>
            ) : null}

            {activeTab === 'history' ? (
              <div className="space-y-4">
                <h3 className={`font-semibold ${styles.textPrimary}`}>选题流转记录</h3>
                {archive.topicHistory && archive.topicHistory.length > 0 ? (
                  <div className="space-y-0">
                    {archive.topicHistory.map((history, index) => (
                      <div key={index} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`mt-1.5 h-3 w-3 rounded-full ${
                              index === 0 ? 'bg-blue-500' : 'bg-gray-500'
                            }`}
                          />
                          {index < (archive.topicHistory?.length ?? 0) - 1 ? (
                            <div className={`my-1 w-px flex-1 ${styles.border}`} />
                          ) : null}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className={`text-sm font-medium ${styles.textPrimary}`}>
                            {history.comment || history.action}
                          </p>
                          <div className={`mt-1 flex items-center gap-2 text-xs ${styles.textMuted}`}>
                            <span>{history.operator_name}</span>
                            <span>{formatBeijingTime(history.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <DetailTabEmptyState
                    title="暂无流程记录"
                    description="当前归档中还没有可展示的流转记录。"
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>

        <ConfirmModal
          open={showDeleteModal}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          loading={deleting}
          variant="danger"
          title="确认删除"
          confirmText="确认删除"
          cancelText="取消"
          description={
            <>
              确定要删除归档“{selectedArchive.name}”吗？此操作不可撤销，相关剧本、批注和发布数据将一起删除。
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="选题存档"
        description="已完成发布的选题归档，包含剧本、批注和发布数据"
        actions={(
          <div className="flex items-center gap-2">
            <Archive className={`h-5 w-5 ${styles.textMuted}`} />
            <span className={`text-sm ${styles.textSecondary}`}>共 {total} 个存档</span>
          </div>
        )}
      />

      <PageToolbar
        search={(
          <div className="relative max-w-md">
            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.textMuted}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              placeholder="搜索选题名称..."
              className={`w-full py-2.5 pl-10 pr-4 ${styles.input}`}
            />
          </div>
        )}
      />

      {loading || detailLoading ? (
        <LoadingState type="section" text="正在加载资源归档..." />
      ) : archives.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="暂无存档"
          description="选题发布完成后会自动归档到这里。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {archives.map((item) => (
            <div
              key={item.id}
              className={`${styles.card} group cursor-pointer p-5 transition-shadow hover:shadow-lg`}
              onClick={() => void handleViewDetail(item.id)}
            >
              <div className="mb-3 flex items-start justify-between">
                <h3
                  className={`line-clamp-2 text-base font-semibold ${styles.textPrimary} transition-colors group-hover:text-blue-400`}
                >
                  {item.name}
                </h3>
                <Eye
                  className={`ml-2 h-4 w-4 flex-shrink-0 ${styles.textMuted} transition-colors group-hover:text-blue-400`}
                />
              </div>

              <div className="space-y-2">
                {item.platform ? (
                  <div className={`flex items-center gap-2 text-xs ${styles.textSecondary}`}>
                    <Send className="h-3 w-3" />
                    <span>{item.platform}</span>
                  </div>
                ) : null}
                {item.scriptVersion ? (
                  <div className={`flex items-center gap-2 text-xs ${styles.textSecondary}`}>
                    <FileText className="h-3 w-3" />
                    <span>剧本 {item.scriptVersion}</span>
                  </div>
                ) : null}
                {item.shootingCommentCount > 0 ? (
                  <div className={`flex items-center gap-2 text-xs ${styles.textSecondary}`}>
                    <MessageSquare className="h-3 w-3" />
                    <span>{item.shootingCommentCount} 条批注</span>
                  </div>
                ) : null}
              </div>

              {item.views > 0 || item.likes > 0 ? (
                <div className={`mt-3 flex items-center gap-4 border-t pt-3 ${styles.borderLight}`}>
                  {item.views > 0 ? (
                    <span className={`text-xs ${styles.textMuted}`}>播放 {item.views.toLocaleString()}</span>
                  ) : null}
                  {item.likes > 0 ? (
                    <span className={`text-xs ${styles.textMuted}`}>点赞 {item.likes.toLocaleString()}</span>
                  ) : null}
                </div>
              ) : null}

              <div className={`mt-3 flex items-center gap-2 text-xs ${styles.textMuted}`}>
                <Calendar className="h-3 w-3" />
                <span>归档于 {formatBeijingDate(item.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 12 ? (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={page === 1}
            className={`rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:opacity-50`}
          >
            上一页
          </button>
          <span className={`text-sm ${styles.textSecondary}`}>
            {page} / {Math.ceil(total / 12)}
          </span>
          <button
            type="button"
            onClick={() => setPage((currentPage) => currentPage + 1)}
            disabled={page >= Math.ceil(total / 12)}
            className={`rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:opacity-50`}
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}

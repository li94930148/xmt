import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { getArchives, getArchiveDetail, deleteResource } from '../api';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useDebounce } from '../hooks/useDebounce';
import { Search, Archive, Eye, ChevronLeft, FileText, Camera, Send, Calendar, User, BarChart3, MessageSquare, Clock, ExternalLink, Trash2 } from 'lucide-react';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';

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

export default function Resources() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
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
    fetchArchives();
  }, [debouncedSearch, page]);

  const fetchArchives = async () => {
    setLoading(true);
    try {
      const result = await getArchives({ search: debouncedSearch, page, limit: 12 });
      setArchives(result.data);
      setTotal(result.total);
    } catch (error) {
      appStore.addNotification({ title: '获取归档失败', message: (error as Error).message, type: 'error' });
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
      appStore.addNotification({ title: '获取详情失败', message: (error as Error).message, type: 'error' });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedArchive) return;
    setDeleting(true);
    try {
      await deleteResource(selectedArchive.id);
      appStore.addNotification({ title: '删除成功', message: '存档已删除', type: 'success' });
      setSelectedArchive(null);
      setShowDeleteModal(false);
      fetchArchives();
    } catch (error) {
      appStore.addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // 详情视图
  if (selectedArchive) {
    const archive = selectedArchive.archive;
    const topic = archive.topic;
    const script = archive.script;
    const shooting = archive.shooting;
    const publishing = archive.publishing;
    const analytics = archive.analytics;

    return (
      <div className="space-y-6">
        {/* 返回按钮 + 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedArchive(null)}
              className={`p-2 rounded-lg transition-colors ${styles.hoverBg}`}
            >
              <ChevronLeft className={`w-5 h-5 ${styles.textPrimary}`} />
            </button>
            <div>
              <h1 className={styles.pageTitle}>{selectedArchive.name}</h1>
              <p className={styles.subtitle}>
                归档于 {formatBeijingTime(archive.archived_at) || '未知'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className={`flex items-center gap-2 px-4 py-2 ${styles.buttonDanger} rounded-lg transition-colors`}
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-medium">删除</span>
          </button>
        </div>

        {/* 选题概览卡片 */}
        <div className={`${styles.card} p-6`}>
          <h2 className={`text-lg font-semibold mb-4 ${styles.textPrimary}`}>选题信息</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className={`text-xs ${styles.textMuted} mb-1`}>平台</p>
              <p className={styles.textPrimary}>{topic?.platform || '-'}</p>
            </div>
            <div>
              <p className={`text-xs ${styles.textMuted} mb-1`}>截止日期</p>
              <p className={styles.textPrimary}>{topic?.deadline || '-'}</p>
            </div>
            <div>
              <p className={`text-xs ${styles.textMuted} mb-1`}>发布时间</p>
              <p className={styles.textPrimary}>{publishing?.publish_time || '-'}</p>
            </div>
            <div>
              <p className={`text-xs ${styles.textMuted} mb-1`}>发布链接</p>
              {publishing?.url ? (
                <a href={publishing.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  查看 <ExternalLink className="w-3 h-3" />
                </a>
              ) : <p className={styles.textPrimary}>-</p>}
            </div>
          </div>
          {topic?.description && (
            <div className="mt-4">
              <p className={`text-xs ${styles.textMuted} mb-1`}>选题描述</p>
              <p className={`text-sm ${styles.textSecondary}`}>{topic.description}</p>
            </div>
          )}
        </div>

        {/* 数据统计 */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '播放量', value: analytics.views, icon: BarChart3 },
              { label: '点赞数', value: analytics.likes, icon: '👍' },
              { label: '分享数', value: analytics.shares, icon: '🔄' },
              { label: '评论数', value: analytics.comments, icon: MessageSquare },
            ].map((stat) => (
              <div key={stat.label} className={`${styles.card} p-4`}>
                <p className={`text-xs ${styles.textMuted} mb-1`}>{stat.label}</p>
                <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : 0}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 切换 */}
        <div className={`${styles.card} overflow-hidden`}>
          <div className={`flex border-b ${styles.border}`}>
            {[
              { key: 'script', label: '剧本', icon: FileText },
              { key: 'shooting', label: '成片批注', icon: Camera },
              { key: 'publishing', label: '发布信息', icon: Send },
              { key: 'history', label: '流程记录', icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                      : `border-transparent ${styles.textSecondary} ${styles.hoverBg}`
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {/* 剧本 Tab */}
            {activeTab === 'script' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className={`font-semibold ${styles.textPrimary}`}>
                    剧本内容
                    {script?.version && <span className={`ml-2 text-xs ${styles.textMuted}`}>版本: {script.version}</span>}
                  </h3>
                </div>
                {script?.content ? (
                  <div
                    className={`prose prose-sm max-w-none ${styles.isDark ? 'prose-invert' : ''}`}
                    dangerouslySetInnerHTML={{ __html: script.content }}
                  />
                ) : (
                  <p className={styles.textMuted}>暂无剧本内容</p>
                )}

                {/* 剧本版本历史 */}
                {script?.history && script.history.length > 0 && (
                  <div className="mt-6">
                    <h4 className={`font-medium mb-3 ${styles.textPrimary}`}>版本历史</h4>
                    <div className="space-y-2">
                      {script.history.map((h, i) => (
                        <div key={i} className={`flex items-center gap-3 text-sm p-2 rounded ${styles.hoverBgLight}`}>
                          <span className="text-blue-400 font-mono">{h.version}</span>
                          <span className={styles.textSecondary}>{h.change_type === 'major' ? '大版本' : '小版本'}</span>
                          {h.comment && <span className={styles.textMuted}>— {h.comment}</span>}
                          <span className={`ml-auto ${styles.textMuted}`}>{formatBeijingTime(h.created_at)}</span>
                          <span className={styles.textMuted}>{h.operator_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 成片批注 Tab */}
            {activeTab === 'shooting' && (
              <div className="space-y-4">
                <h3 className={`font-semibold ${styles.textPrimary}`}>成片制作批注</h3>
                {shooting?.comments && shooting.comments.length > 0 ? (
                  <div className="space-y-3">
                    {shooting.comments.map((c, i) => (
                      <div key={i} className={`${styles.card} p-4`}>
                        <p className={`text-sm ${styles.textPrimary}`}>{c.content}</p>
                        <div className={`flex items-center gap-3 mt-2 text-xs ${styles.textMuted}`}>
                          <User className="w-3 h-3" />
                          <span>{c.operator_name}</span>
                          <span>{formatBeijingTime(c.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.textMuted}>暂无批注</p>
                )}
              </div>
            )}

            {/* 发布信息 Tab */}
            {activeTab === 'publishing' && (
              <div className="space-y-4">
                <h3 className={`font-semibold ${styles.textPrimary}`}>发布详情</h3>
                {publishing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className={`text-xs ${styles.textMuted} mb-1`}>发布平台</p>
                      <p className={styles.textPrimary}>{publishing.platform || '-'}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${styles.textMuted} mb-1`}>发布时间</p>
                      <p className={styles.textPrimary}>{publishing.publish_time || '-'}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${styles.textMuted} mb-1`}>发布状态</p>
                      <p className={styles.textPrimary}>{publishing.status || '-'}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${styles.textMuted} mb-1`}>发布链接</p>
                      {publishing.url ? (
                        <a href={publishing.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                          查看 <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <p className={styles.textPrimary}>-</p>}
                    </div>
                  </div>
                ) : (
                  <p className={styles.textMuted}>暂无发布信息</p>
                )}
              </div>
            )}

            {/* 流程记录 Tab */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                <h3 className={`font-semibold ${styles.textPrimary}`}>选题流转记录</h3>
                {archive.topicHistory && archive.topicHistory.length > 0 ? (
                  <div className="space-y-0">
                    {archive.topicHistory.map((h, i) => (
                      <div key={i} className="flex gap-4">
                        {/* 时间线 */}
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-blue-500' : 'bg-gray-500'} mt-1.5`} />
                          {i < archive.topicHistory!.length - 1 && <div className={`w-px flex-1 ${styles.border} my-1`} />}
                        </div>
                        {/* 内容 */}
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
                ) : (
                  <p className={styles.textMuted}>暂无流转记录</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 删除确认弹窗 */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={`${styles.card} p-6 w-full max-w-md mx-4 border ${styles.border}`}>
              <h2 className={`text-xl font-bold ${styles.textPrimary} mb-2`}>确认删除</h2>
              <p className={`${styles.textSecondary} mb-6`}>
                确定要删除存档「{selectedArchive.name}」吗？此操作不可撤销，所有相关的剧本、批注和发布数据将被永久删除。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm ${styles.buttonSecondary} transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                >
                  {deleting ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 列表视图
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={styles.pageTitle}>选题存档</h1>
          <p className={styles.subtitle}>已完成发布的选题归档，包含剧本、批注和发布数据</p>
        </div>
        <div className="flex items-center gap-2">
          <Archive className={`w-5 h-5 ${styles.textMuted}`} />
          <span className={`text-sm ${styles.textSecondary}`}>共 {total} 个存档</span>
        </div>
      </div>

      {/* 搜索 */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="搜索选题名称..."
            className={`w-full pl-10 pr-4 py-2.5 ${styles.input}`}
          />
        </div>
      </div>

      {/* 归档列表 */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className={`w-8 h-8 border-4 border-t-transparent rounded-full animate-spin ${styles.spinner}`}></div>
        </div>
      ) : archives.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Archive className={`w-12 h-12 ${styles.textMuted} mb-4`} />
          <p className={`text-lg ${styles.textSecondary}`}>暂无存档</p>
          <p className={`text-sm ${styles.textMuted}`}>选题发布完成后会自动归档到这里</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {archives.map((item) => (
            <div
              key={item.id}
              className={`${styles.card} p-5 hover:shadow-lg transition-shadow cursor-pointer group`}
              onClick={() => handleViewDetail(item.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className={`font-semibold text-base ${styles.textPrimary} group-hover:text-blue-400 transition-colors line-clamp-2`}>
                  {item.name}
                </h3>
                <Eye className={`w-4 h-4 ${styles.textMuted} group-hover:text-blue-400 transition-colors flex-shrink-0 ml-2`} />
              </div>

              <div className="space-y-2">
                {item.platform && (
                  <div className={`flex items-center gap-2 text-xs ${styles.textSecondary}`}>
                    <Send className="w-3 h-3" />
                    <span>{item.platform}</span>
                  </div>
                )}
                {item.scriptVersion && (
                  <div className={`flex items-center gap-2 text-xs ${styles.textSecondary}`}>
                    <FileText className="w-3 h-3" />
                    <span>剧本 {item.scriptVersion}</span>
                  </div>
                )}
                {item.shootingCommentCount > 0 && (
                  <div className={`flex items-center gap-2 text-xs ${styles.textSecondary}`}>
                    <MessageSquare className="w-3 h-3" />
                    <span>{item.shootingCommentCount} 条批注</span>
                  </div>
                )}
              </div>

              {/* 数据预览 */}
              {(item.views > 0 || item.likes > 0) && (
                <div className={`flex items-center gap-4 mt-3 pt-3 border-t ${styles.borderLight}`}>
                  {item.views > 0 && (
                    <span className={`text-xs ${styles.textMuted}`}>
                      👁 {item.views.toLocaleString()}
                    </span>
                  )}
                  {item.likes > 0 && (
                    <span className={`text-xs ${styles.textMuted}`}>
                      👍 {item.likes.toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              <div className={`flex items-center gap-2 mt-3 text-xs ${styles.textMuted}`}>
                <Calendar className="w-3 h-3" />
                <span>归档于 {formatBeijingDate(item.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 12 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className={`px-4 py-2 rounded-lg ${styles.buttonSecondary} disabled:opacity-50`}
          >
            上一页
          </button>
          <span className={`text-sm ${styles.textSecondary}`}>
            {page} / {Math.ceil(total / 12)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 12)}
            className={`px-4 py-2 rounded-lg ${styles.buttonSecondary} disabled:opacity-50`}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

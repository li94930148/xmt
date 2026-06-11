import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, useAuthStore } from '../store';
import {
  getInspirations,
  createInspirition,
  voteInspiration,
  deleteInspiration,
  promoteInspiration,
  getInspirationDetail,
  createInspirationComment,
} from '../api';
import type { Inspiration, InspirationComment } from '../api/inspirations';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useDebounce } from '../hooks/useDebounce';
import { useSocket } from '../hooks/useSocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { showRealtimeToast } from '../components/RealtimeToast';
import { formatBeijingTime } from '../lib/utils';
import {
  Plus,
  Search,
  Lightbulb,
  ThumbsUp,
  Trash2,
  ArrowRight,
  X,
  Filter,
  Sparkles,
  MessageCircle,
} from 'lucide-react';

const categories = [
  { value: '', label: '全部' },
  { value: '口播', label: '口播' },
  { value: '带货', label: '带货' },
  { value: '科普', label: '科普' },
  { value: '故事', label: '故事' },
  { value: '其他', label: '其他' },
];

type DetailState = {
  inspiration: Inspiration;
  comments: InspirationComment[];
} | null;

export default function Inspirations() {
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', category: '其他' });
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [newItemIds, setNewItemIds] = useState<Set<number>>(new Set());
  const [voteAnimatingIds, setVoteAnimatingIds] = useState<Set<number>>(new Set());
  const [recentCommentIds, setRecentCommentIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<DetailState>(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const appStore = useAppStore();
  const authStore = useAuthStore();
  const styles = useThemeStyles();
  const debouncedSearch = useDebounce(searchTerm, 400);
  const socket = useSocket();
  const newItemIdsRef = useRef(new Set<number>());

  const fetchInspirations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getInspirations({
        search: debouncedSearch || undefined,
        category: categoryFilter || undefined,
      });
      setInspirations(result.data || []);
    } catch (error) {
      appStore.addNotification({
        title: '获取灵感列表失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [appStore, debouncedSearch, categoryFilter]);

  useEffect(() => {
    void fetchInspirations();
  }, [fetchInspirations]);

  const syncInspirationPatch = useCallback((id: number, patch: Partial<Inspiration>) => {
    setInspirations((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setDetailData((prev) =>
      prev && prev.inspiration.id === id
        ? { ...prev, inspiration: { ...prev.inspiration, ...patch } }
        : prev
    );
  }, []);

  useRealtimeSync({
    room: 'inspirations',
    socket,
    events: {
      'inspiration:created': (data: Inspiration) => {
        setInspirations((prev) => {
          if (prev.some((item) => item.id === data.id)) return prev;
          return [{ ...data, comment_count: data.comment_count || 0 }, ...prev];
        });
        newItemIdsRef.current.add(data.id);
        setNewItemIds(new Set(newItemIdsRef.current));
        setTimeout(() => {
          newItemIdsRef.current.delete(data.id);
          setNewItemIds(new Set(newItemIdsRef.current));
        }, 2000);
        showRealtimeToast({
          title: '新灵感',
          message: `「${data.title}」已添加到灵感池`,
          icon: <Lightbulb className="w-5 h-5 text-yellow-400" />,
        });
      },
      'inspiration:voted': (data: { id: number; votes: number; userId: number }) => {
        if (data.userId === authStore.user?.id) return;
        syncInspirationPatch(data.id, { votes: data.votes });
      },
      'inspiration:commented': (data: {
        inspirationId: number;
        comment: InspirationComment;
        comment_count: number;
      }) => {
        syncInspirationPatch(data.inspirationId, { comment_count: data.comment_count });

        if (data.comment.creator_id !== authStore.user?.id) {
          setRecentCommentIds((prev) => {
            const next = new Set(prev);
            next.add(data.inspirationId);
            return next;
          });
          setTimeout(() => {
            setRecentCommentIds((prev) => {
              const next = new Set(prev);
              next.delete(data.inspirationId);
              return next;
            });
          }, 6000);
        }

        setDetailData((prev) => {
          if (!prev || prev.inspiration.id !== data.inspirationId) return prev;
          if (prev.comments.some((comment) => comment.id === data.comment.id)) return prev;
          return {
            inspiration: { ...prev.inspiration, comment_count: data.comment_count },
            comments: [...prev.comments, data.comment],
          };
        });
      },
      'inspiration:deleted': (data: { id: number }) => {
        setInspirations((prev) => prev.filter((item) => item.id !== data.id));
        if (selectedId === data.id) {
          setSelectedId(null);
          setDetailData(null);
        }
      },
    },
  });

  const openDetail = useCallback(
    async (id: number) => {
      setSelectedId(id);
      setDetailLoading(true);
      setCommentText('');
      setRecentCommentIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      try {
        const result = await getInspirationDetail(id);
        setDetailData(result);
        syncInspirationPatch(id, { comment_count: result.comments.length });
      } catch (error) {
        appStore.addNotification({
          title: '获取灵感详情失败',
          message: (error as Error).message,
          type: 'error',
        });
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [appStore, syncInspirationPatch]
  );

  const closeDetail = () => {
    setSelectedId(null);
    setDetailData(null);
    setCommentText('');
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      appStore.addNotification({ title: '创建失败', message: '请输入灵感标题', type: 'error' });
      return;
    }

    try {
      await createInspirition(formData);
      setShowCreateModal(false);
      setFormData({ title: '', description: '', category: '其他' });
    } catch (error) {
      appStore.addNotification({
        title: '创建失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleVote = async (id: number) => {
    const previous = inspirations.find((item) => item.id === id);
    if (!previous) return;

    const nextVoted = !previous.voted;
    const delta = nextVoted ? 1 : -1;

    syncInspirationPatch(id, { voted: nextVoted, votes: previous.votes + delta });
    setVoteAnimatingIds((items) => new Set(items).add(id));
    setTimeout(() => {
      setVoteAnimatingIds((items) => {
        const next = new Set(items);
        next.delete(id);
        return next;
      });
    }, 300);

    try {
      await voteInspiration(id);
    } catch {
      syncInspirationPatch(id, { voted: previous.voted, votes: previous.votes });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条灵感吗？')) return;

    try {
      await deleteInspiration(id);
      appStore.addNotification({ title: '删除成功', message: '灵感已删除', type: 'success' });
      setInspirations((prev) => prev.filter((item) => item.id !== id));
      if (selectedId === id) closeDetail();
    } catch (error) {
      appStore.addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handlePromote = async (id: number) => {
    setPromotingId(id);
    try {
      const result = await promoteInspiration(id);
      appStore.addNotification({
        title: '转为选题成功',
        message: `已创建选题 #${result.topicId}`,
        type: 'success',
      });
      syncInspirationPatch(id, { status: 'promoted' });
    } catch (error) {
      appStore.addNotification({
        title: '转为选题失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setPromotingId(null);
    }
  };

  const handleCommentSubmit = async () => {
    if (!selectedId || !commentText.trim()) return;

    setCommentSubmitting(true);
    try {
      const result = await createInspirationComment(selectedId, commentText.trim());
      setCommentText('');
      syncInspirationPatch(selectedId, { comment_count: result.comment_count });
      setDetailData((prev) => {
        if (!prev || prev.inspiration.id !== selectedId) return prev;
        if (prev.comments.some((comment) => comment.id === result.comment.id)) return prev;
        return {
          inspiration: { ...prev.inspiration, comment_count: result.comment_count },
          comments: [...prev.comments, result.comment],
        };
      });
    } catch (error) {
      appStore.addNotification({
        title: '发表评论失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const categoryColors: Record<string, string> = {
    口播: 'bg-blue-500/15 text-blue-400',
    带货: 'bg-orange-500/15 text-orange-400',
    科普: 'bg-green-500/15 text-green-400',
    故事: 'bg-purple-500/15 text-purple-400',
    其他: 'bg-gray-500/15 text-gray-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className={styles.pageTitle}>灵感池</h1>
          <p className={`${styles.subtitle} mt-1`}>收集团队灵感，快速互动，再在详情里集中讨论</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className={`flex items-center gap-2 px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium text-sm">提交灵感</span>
        </button>
      </div>

      <div className={`${styles.card} p-4`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${styles.textMuted}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索灵感..."
              className={`w-full pl-10 pr-4 py-2.5 ${styles.input} text-sm`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className={`w-4 h-4 ${styles.textMuted}`} />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={`px-4 py-2.5 ${styles.input} text-sm`}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin`} />
        </div>
      ) : inspirations.length === 0 ? (
        <div className={`${styles.card} p-12 text-center`}>
          <Lightbulb className={`w-12 h-12 ${styles.textMuted} mx-auto mb-4`} />
          <h3 className={`text-lg font-medium ${styles.textPrimary} mb-2`}>还没有灵感</h3>
          <p className={`${styles.textSecondary} mb-4`}>点击右上角“提交灵感”开始收集团队创意</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inspirations.map((inspiration) => {
            const isPromoted = inspiration.status === 'promoted';

            return (
              <button
                key={inspiration.id}
                type="button"
                onClick={() => void openDetail(inspiration.id)}
                className={`${styles.card} p-5 text-left hover:border-[#5c7cfa]/30 hover:-translate-y-0.5 transition-all duration-200 group ${newItemIds.has(inspiration.id) ? 'animate-new-item new-item-highlight' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-base font-semibold ${styles.textPrimary} mb-1.5 line-clamp-2`}>
                      {inspiration.title}
                    </h3>
                    {inspiration.description && (
                      <p className={`text-sm ${styles.textSecondary} line-clamp-3`}>
                        {inspiration.description}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] shrink-0 ${styles.textMuted}`}>
                    {formatBeijingTime(inspiration.updated_at)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {inspiration.category && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        categoryColors[inspiration.category] || categoryColors.其他
                      }`}
                    >
                      {inspiration.category}
                    </span>
                  )}
                  {isPromoted && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
                      已转选题
                    </span>
                  )}
                  {recentCommentIds.has(inspiration.id) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-medium">
                      有新评论
                    </span>
                  )}
                </div>

                <div className={`flex items-center justify-between pt-3 border-t ${styles.borderLight}`}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleVote(inspiration.id);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        inspiration.voted
                          ? 'bg-[#5c7cfa]/15 text-[#5c7cfa]'
                          : `${styles.bgTertiary} ${styles.textSecondary} hover:bg-[#5c7cfa]/10 hover:text-[#5c7cfa]`
                      } ${voteAnimatingIds.has(inspiration.id) ? 'animate-pulse-vote' : ''}`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {inspiration.votes}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void openDetail(inspiration.id);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${styles.bgTertiary} ${styles.textSecondary} hover:bg-[#5c7cfa]/10 hover:text-[#5c7cfa] transition-all`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {inspiration.comment_count || 0}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${styles.textMuted}`}>
                      {inspiration.creator_name || '匿名'}
                    </span>
                    {!isPromoted && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePromote(inspiration.id);
                        }}
                        disabled={promotingId === inspiration.id}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${styles.bgTertiary} ${styles.textSecondary} hover:bg-green-500/10 hover:text-green-400 transition-all disabled:opacity-50`}
                      >
                        {promotingId === inspiration.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                        转为选题
                      </button>
                    )}
                    {(authStore.user?.role === 'admin' ||
                      authStore.user?.id === inspiration.creator_id) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(inspiration.id);
                        }}
                        className={`p-1.5 ${styles.buttonDanger} rounded-lg opacity-0 group-hover:opacity-100 transition-opacity`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div className={`fixed inset-0 ${styles.overlay} flex items-center justify-center z-50`}>
          <div className={`${styles.modal} p-6 w-full max-w-md mx-4`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#5c7cfa]" />
                <h2 className={`text-lg font-bold ${styles.textPrimary}`}>提交灵感</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)} className={styles.textMuted}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                  placeholder="你的灵感是什么？"
                />
              </div>
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>描述</label>
                <textarea
                  value={formData.description}
                  onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm resize-none`}
                  rows={4}
                  placeholder="补充更多想法、场景、切入角度"
                />
              </div>
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>分类</label>
                <select
                  value={formData.category}
                  onChange={(event) => setFormData({ ...formData, category: event.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                >
                  {categories
                    .filter((item) => item.value)
                    .map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className={`flex-1 px-4 py-2.5 ${styles.buttonSecondary} rounded-xl text-sm`}
                >
                  取消
                </button>
                <button
                  onClick={() => void handleCreate()}
                  className={`flex-1 px-4 py-2.5 ${styles.buttonPrimary} rounded-xl text-sm`}
                >
                  提交
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedId !== null && (
        <div className={`fixed inset-0 ${styles.overlay} flex items-center justify-center z-50 p-4`}>
          <div className={`${styles.modal} w-full max-w-4xl h-[82vh] flex flex-col overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.border} flex items-center justify-between gap-4 shrink-0`}>
              <div className="min-w-0">
                <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>灵感详情</p>
                <h2 className={`text-lg font-semibold ${styles.textPrimary} truncate mt-1`}>
                  {detailData?.inspiration.title || '加载中...'}
                </h2>
              </div>
              <button onClick={closeDetail} className={`p-2 rounded-lg ${styles.hoverBg}`}>
                <X className={`w-5 h-5 ${styles.textSecondary}`} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin`} />
              </div>
            ) : detailData ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className={`px-6 py-5 border-b ${styles.border}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {detailData.inspiration.category && (
                        <span
                          className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                            categoryColors[detailData.inspiration.category] || categoryColors.其他
                          }`}
                        >
                          {detailData.inspiration.category}
                        </span>
                      )}
                      <span className={`text-xs ${styles.textMuted}`}>
                        提交者 {detailData.inspiration.creator_name || '匿名'}
                      </span>
                      <span className={`text-xs ${styles.textMuted}`}>
                        更新于 {formatBeijingTime(detailData.inspiration.updated_at)}
                      </span>
                    </div>
                    <div className={`text-sm leading-7 whitespace-pre-wrap ${styles.textPrimary}`}>
                      {detailData.inspiration.description?.trim() || '这条灵感还没有补充详细描述。'}
                    </div>
                  </div>

                  <div className={`px-6 py-4 border-b ${styles.border}`}>
                    <p className={`text-sm font-medium ${styles.textPrimary}`}>讨论区</p>
                    <p className={`text-xs ${styles.textMuted} mt-1`}>
                      共 {detailData.comments.length} 条评论
                    </p>
                  </div>

                  <div className="px-6 py-4 space-y-3">
                    {detailData.comments.length === 0 ? (
                      <div className={`rounded-2xl border border-dashed ${styles.border} px-4 py-8 text-center ${styles.textMuted}`}>
                        还没有人留言，你可以先说说自己的想法。
                      </div>
                    ) : (
                      detailData.comments.map((comment, index) => (
                        <div key={comment.id} className={`rounded-2xl ${styles.bgTertiary} px-4 py-3`}>
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-xs font-semibold ${styles.textPrimary}`}>#{index + 1}</span>
                              <span className={`text-sm font-medium ${styles.textPrimary}`}>
                                {comment.creator_name || '匿名'}
                              </span>
                            </div>
                            <span className={`text-xs ${styles.textMuted}`}>
                              {formatBeijingTime(comment.created_at)}
                            </span>
                          </div>
                          <p className={`text-sm leading-6 whitespace-pre-wrap ${styles.textSecondary}`}>
                            {comment.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`px-6 py-4 border-t ${styles.border} shrink-0`}>
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      className={`w-full px-4 py-3 ${styles.input} text-sm resize-none`}
                      rows={3}
                      placeholder="写下你的想法，补充角度、风险点、延展方向..."
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => void handleCommentSubmit()}
                        disabled={commentSubmitting || !commentText.trim()}
                        className={`px-4 py-2 rounded-lg text-sm ${styles.buttonPrimary} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {commentSubmitting ? '发送中...' : '发表评论'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

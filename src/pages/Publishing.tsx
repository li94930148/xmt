import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  Edit3,
  FileText,
  Heart,
  Link2,
  MessageCircle,
  Play,
  Plus,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  createPublishing,
  deletePublishing,
  getPublishing,
  getTopics,
  updatePublishing,
} from '../api';
import EmptyState from '../components/EmptyState';
import {
  ConfirmModal,
  FormModal,
  LoadingState,
  PageHeader,
  PageToolbar,
} from '../components/common';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingDate } from '../lib/utils';
import { useAppStore } from '../store';
import { Publishing as PublishingType, Topic } from '../types';

const initialFormData = {
  topic_id: '',
  platform: '',
  url: '',
  status: 'pending',
  publish_time: '',
  views: '',
  likes: '',
  shares: '',
  comments: '',
};

export default function Publishing() {
  const [publishings, setPublishings] = useState<PublishingType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPublishing, setEditingPublishing] = useState<PublishingType | null>(null);
  const [formData, setFormData] = useState(initialFormData);
  const [deleteTarget, setDeleteTarget] = useState<PublishingType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const styles = useThemeStyles();

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getPublishing();
      setPublishings(result);

      const topicList = await getTopics();
      setTopics(topicList.data.filter((topic) => topic.status === 'publishing' || topic.status === 'shooting'));
    } catch (error) {
      addNotification({
        title: '获取数据失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingPublishing(null);
  };

  const handleCreate = async () => {
    if (!formData.topic_id) {
      addNotification({
        title: '创建失败',
        message: '请选择关联选题',
        type: 'error',
      });
      return;
    }

    try {
      if (editingPublishing) {
        await updatePublishing(editingPublishing.id, {
          platform: formData.platform,
          url: formData.url,
          status: formData.status,
          publish_time: formData.publish_time,
          views: Number.parseInt(formData.views, 10) || 0,
          likes: Number.parseInt(formData.likes, 10) || 0,
          shares: Number.parseInt(formData.shares, 10) || 0,
          comments: Number.parseInt(formData.comments, 10) || 0,
        });
        addNotification({
          title: '更新成功',
          message: '发布记录已更新',
          type: 'success',
        });
      } else {
        await createPublishing({
          topic_id: Number.parseInt(formData.topic_id, 10),
          platform: formData.platform,
          url: formData.url,
          status: formData.status,
          publish_time: formData.publish_time,
          views: Number.parseInt(formData.views, 10) || 0,
          likes: Number.parseInt(formData.likes, 10) || 0,
          shares: Number.parseInt(formData.shares, 10) || 0,
          comments: Number.parseInt(formData.comments, 10) || 0,
        });

        const message =
          formData.status === 'published'
            ? '发布记录已添加，选题已归档到资源库'
            : '发布记录已添加';
        addNotification({
          title: '创建成功',
          message,
          type: 'success',
        });
      }

      setShowCreateModal(false);
      resetForm();

      const result = await getPublishing();
      setPublishings(result);
    } catch (error) {
      addNotification({
        title: '操作失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePublishing(id);
      addNotification({
        title: '删除成功',
        message: '发布记录已删除',
        type: 'success',
      });
      const result = await getPublishing();
      setPublishings(result);
    } catch (error) {
      addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteLoading(true);
    try {
      await handleDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleEdit = (publishing: PublishingType) => {
    setEditingPublishing(publishing);
    setFormData({
      topic_id: publishing.topic_id.toString(),
      platform: publishing.platform || '',
      url: publishing.url || '',
      status: publishing.status,
      publish_time: publishing.publish_time ? new Date(publishing.publish_time).toISOString().slice(0, 16) : '',
      views: (publishing as any).views?.toString() || '',
      likes: (publishing as any).likes?.toString() || '',
      shares: (publishing as any).shares?.toString() || '',
      comments: (publishing as any).comments?.toString() || '',
    });
    setShowCreateModal(true);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    published: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    scheduled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const statusText: Record<string, string> = {
    pending: '待发布',
    published: '已发布',
    failed: '发布失败',
    scheduled: '已定时',
  };

  const filteredPublishings = useMemo(
    () =>
      publishings.filter(
        (publishing) =>
          publishing.topic_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          publishing.platform?.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [publishings, searchTerm],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="发布管理"
        description="管理内容发布记录及数据"
        actions={
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 ${styles.buttonPrimary} transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm font-medium">添加发布记录</span>
          </button>
        }
      />

      <PageToolbar
        search={
          <div className="relative">
            <Search className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.textMuted}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索选题标题或发布平台..."
              className={`w-full py-2.5 pl-10 pr-4 text-sm ${styles.input}`}
            />
          </div>
        }
      />

      <div className={`${styles.card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={styles.tableHeader}>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  关联选题
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  发布平台
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  发布链接
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  发布时间
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  数据统计
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  状态
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12">
                    <LoadingState type="inline" text="正在加载发布记录..." className="mx-auto flex" />
                  </td>
                </tr>
              ) : filteredPublishings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12">
                    <EmptyState
                      icon={FileText}
                      title="暂无发布记录"
                      description={
                        searchTerm
                          ? '没有匹配当前搜索条件的发布记录。'
                          : '当前还没有发布记录，新增后会显示在这里。'
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredPublishings.map((publishing) => (
                  <tr key={publishing.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/publishing/${publishing.id}`)}
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                        title="点击查看详情"
                      >
                        <FileText className="h-4 w-4" />
                        <span className={`font-medium ${styles.textPrimary}`}>{publishing.topic_title}</span>
                      </button>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{publishing.platform || '-'}</td>
                    <td className="px-6 py-4">
                      {publishing.url ? (
                        <a
                          href={publishing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          <Link2 className="h-4 w-4" />
                          <span className="max-w-xs truncate">查看</span>
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatBeijingDate(publishing.publish_time)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="flex items-center gap-1 text-blue-400" title="播放量">
                          <Play className="h-3 w-3" />
                          {(publishing as any).views ? (publishing as any).views.toLocaleString() : 0}
                        </span>
                        <span className="flex items-center gap-1 text-red-400" title="点赞量">
                          <Heart className="h-3 w-3" />
                          {(publishing as any).likes ? (publishing as any).likes.toLocaleString() : 0}
                        </span>
                        <span className="flex items-center gap-1 text-green-400" title="分享量">
                          <Share2 className="h-3 w-3" />
                          {(publishing as any).shares ? (publishing as any).shares.toLocaleString() : 0}
                        </span>
                        <span className="flex items-center gap-1 text-purple-400" title="评论量">
                          <MessageCircle className="h-3 w-3" />
                          {(publishing as any).comments ? (publishing as any).comments.toLocaleString() : 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${statusColors[publishing.status]}`}
                      >
                        {statusText[publishing.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(publishing)}
                          className={`rounded-lg p-2 ${styles.buttonInfo} transition-colors`}
                          title="编辑"
                        >
                          <Edit3 className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(publishing)}
                          className={`rounded-lg p-2 ${styles.buttonDanger} transition-colors`}
                          title="删除"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FormModal
        open={showCreateModal}
        onCancel={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        onSubmit={handleCreate}
        title={editingPublishing ? '编辑发布记录' : '添加发布记录'}
        submitText={editingPublishing ? '更新' : '保存'}
        cancelText="取消"
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>关联选题 *</label>
            <select
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
              disabled={Boolean(editingPublishing)}
            >
              <option value="">请选择选题</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>发布平台</label>
              <input
                type="text"
                value={formData.platform}
                onChange={(event) => setFormData({ ...formData, platform: event.target.value })}
                className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                placeholder="如：抖音、快手、微信视频号"
              />
            </div>
            <div>
              <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>发布链接</label>
              <input
                type="text"
                value={formData.url}
                onChange={(event) => setFormData({ ...formData, url: event.target.value })}
                className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                placeholder="请输入发布链接"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>发布时间</label>
              <div className="space-y-2">
                <input
                  type="date"
                  value={formData.publish_time}
                  onChange={(event) => setFormData({ ...formData, publish_time: event.target.value })}
                  className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing} ${
                    formData.status !== 'pending' ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                  disabled={formData.status !== 'pending'}
                />
                {formData.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          publish_time: new Date().toISOString().split('T')[0],
                        })
                      }
                      className={`rounded-md px-3 py-1 text-xs ${styles.buttonSecondary} transition-colors`}
                    >
                      今天
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        setFormData({
                          ...formData,
                          publish_time: tomorrow.toISOString().split('T')[0],
                        });
                      }}
                      className={`rounded-md px-3 py-1 text-xs ${styles.buttonSecondary} transition-colors`}
                    >
                      明天
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const weekLater = new Date();
                        weekLater.setDate(weekLater.getDate() + 7);
                        setFormData({
                          ...formData,
                          publish_time: weekLater.toISOString().split('T')[0],
                        });
                      }}
                      className={`rounded-md px-3 py-1 text-xs ${styles.buttonSecondary} transition-colors`}
                    >
                      一周后
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>状态</label>
              <select
                value={formData.status}
                onChange={(event) => setFormData({ ...formData, status: event.target.value })}
                className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
              >
                <option value="pending">待发布</option>
                <option value="published">已发布</option>
                <option value="failed">发布失败</option>
                <option value="scheduled">已定时</option>
              </select>
            </div>
          </div>

          <div className={`mt-4 border-t pt-4 ${styles.border}`}>
            <h3 className={`mb-4 flex items-center gap-2 text-lg font-semibold ${styles.textPrimary}`}>
              <BarChart3 className="h-5 w-5 text-blue-400" />
              数据统计（与数据复盘同步）
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`mb-2 flex items-center gap-1 text-sm font-medium ${styles.textSecondary}`}>
                  <Play className="h-4 w-4 text-blue-400" />
                  播放量
                </label>
                <input
                  type="number"
                  value={formData.views}
                  onChange={(event) => setFormData({ ...formData, views: event.target.value })}
                  className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={`mb-2 flex items-center gap-1 text-sm font-medium ${styles.textSecondary}`}>
                  <Heart className="h-4 w-4 text-red-400" />
                  点赞量
                </label>
                <input
                  type="number"
                  value={formData.likes}
                  onChange={(event) => setFormData({ ...formData, likes: event.target.value })}
                  className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={`mb-2 flex items-center gap-1 text-sm font-medium ${styles.textSecondary}`}>
                  <Share2 className="h-4 w-4 text-green-400" />
                  分享量
                </label>
                <input
                  type="number"
                  value={formData.shares}
                  onChange={(event) => setFormData({ ...formData, shares: event.target.value })}
                  className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={`mb-2 flex items-center gap-1 text-sm font-medium ${styles.textSecondary}`}>
                  <MessageCircle className="h-4 w-4 text-purple-400" />
                  评论量
                </label>
                <input
                  type="number"
                  value={formData.comments}
                  onChange={(event) => setFormData({ ...formData, comments: event.target.value })}
                  className={`w-full rounded-lg border px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
        variant="danger"
        title="确认删除"
        confirmText="确认删除"
        cancelText="取消"
        description={
          deleteTarget
            ? `确定要删除“${deleteTarget.topic_title || '这条发布记录'}”吗？此操作不可撤销。`
            : ''
        }
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle,
  Edit3,
  ExternalLink,
  FileText,
  Heart,
  Link2,
  MessageCircle,
  Play,
  Plus,
  Share2,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  createPublishing,
  deletePublishing,
  getPublishing,
  getTopics,
  updatePublishing,
} from '../api';
import { ConfirmModal, FormModal, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import PlatformBadge from '../components/studio/PlatformBadge';
import ResponsiveTableShell from '../components/studio/ResponsiveTableShell';
import SearchBar from '../components/studio/SearchBar';
import StatusPill, { type StatusTone } from '../components/studio/StatusPill';
import StudioEmptyState from '../components/studio/EmptyState';
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

const statusText: Record<string, string> = {
  pending: '待发布',
  published: '已发布',
  failed: '发布异常',
  scheduled: '已定时',
};

const statusTone: Record<string, StatusTone> = {
  pending: 'amber',
  published: 'success',
  failed: 'coral',
  scheduled: 'cyan',
};

function getNextAction(status: string) {
  if (status === 'published') {
    return '查看数据';
  }
  if (status === 'failed') {
    return '处理异常';
  }
  if (status === 'scheduled') {
    return '确认排期';
  }
  return '准备发布';
}

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

        addNotification({
          title: '创建成功',
          message: formData.status === 'published' ? '发布记录已添加，选题已归档到资源库' : '发布记录已添加',
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
      views: publishing.views?.toString() || '',
      likes: publishing.likes?.toString() || '',
      shares: publishing.shares?.toString() || '',
      comments: publishing.comments?.toString() || '',
    });
    setShowCreateModal(true);
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

  const todayKey = new Date().toISOString().slice(0, 10);
  const metrics = useMemo(
    () => ({
      today: publishings.filter((item) => item.publish_time?.slice(0, 10) === todayKey && item.status !== 'published').length,
      pending: publishings.filter((item) => item.status === 'pending' || item.status === 'scheduled').length,
      published: publishings.filter((item) => item.status === 'published').length,
      failed: publishings.filter((item) => item.status === 'failed').length,
    }),
    [publishings, todayKey],
  );

  return (
    <PageShell>
      <PageHeader
        title="发布管理"
        description="查看多平台发布节奏、发布时间、负责人和异常状态。"
        actions={
          <ActionButton
            type="button"
            variant="primary"
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
          >
            <Plus className="h-4 w-4" />
            添加发布记录
          </ActionButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="今日待发布" value={metrics.today} icon={Calendar} tone="cyan" />
        <MetricCard title="待确认" value={metrics.pending} icon={FileText} tone="amber" />
        <MetricCard title="已发布" value={metrics.published} icon={CheckCircle} tone="success" />
        <MetricCard title="发布异常" value={metrics.failed} icon={AlertTriangle} tone="coral" />
      </div>

      <GlassPanel className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="搜索选题标题或发布平台..."
          className="max-w-xl"
        />
      </GlassPanel>

      {loading ? (
        <LoadingState type="section" text="正在加载发布记录..." />
      ) : filteredPublishings.length === 0 ? (
        <StudioEmptyState
          icon={FileText}
          title="暂无发布记录"
          description={searchTerm ? '没有匹配当前搜索条件的发布记录。' : '添加发布任务后，会在这里形成多平台节奏表。'}
          actionLabel="添加发布记录"
          onAction={() => {
            resetForm();
            setShowCreateModal(true);
          }}
        />
      ) : (
        <ResponsiveTableShell>
          <table className="min-w-[1080px] w-full">
            <thead>
              <tr className="border-b border-studio-border-soft bg-white/[0.03] text-left text-xs font-semibold uppercase tracking-wide text-studio-text-muted">
                <th className="px-5 py-4">内容</th>
                <th className="px-5 py-4">平台</th>
                <th className="px-5 py-4">发布时间</th>
                <th className="px-5 py-4">数据</th>
                <th className="px-5 py-4">状态</th>
                <th className="px-5 py-4">下一步</th>
                <th className="px-5 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredPublishings.map((publishing) => (
                <tr key={publishing.id} className="group border-b border-studio-border-soft/70 transition hover:bg-white/[0.04]">
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => navigate(`/publishing/${publishing.id}`)}
                      className="flex min-w-0 items-start gap-3 text-left"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-button border border-studio-border-soft bg-white/[0.05] text-studio-cyan">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-semibold text-studio-text-primary group-hover:text-studio-cyan">
                          {publishing.topic_title || '未命名发布内容'}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-xs text-studio-text-muted">
                          <UserRound className="h-3.5 w-3.5" />
                          {publishing.operator_name || '未分配'}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <PlatformBadge platform={publishing.platform} />
                  </td>
                  <td className="px-5 py-4 text-sm text-studio-text-secondary">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-studio-text-muted" />
                      {formatBeijingDate(publishing.publish_time)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="flex items-center gap-1 text-studio-cyan" title="播放量">
                        <Play className="h-3.5 w-3.5" />
                        {publishing.views ? publishing.views.toLocaleString() : 0}
                      </span>
                      <span className="flex items-center gap-1 text-studio-coral" title="点赞量">
                        <Heart className="h-3.5 w-3.5" />
                        {publishing.likes ? publishing.likes.toLocaleString() : 0}
                      </span>
                      <span className="flex items-center gap-1 text-studio-success" title="分享量">
                        <Share2 className="h-3.5 w-3.5" />
                        {publishing.shares ? publishing.shares.toLocaleString() : 0}
                      </span>
                      <span className="flex items-center gap-1 text-studio-violet" title="评论量">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {publishing.comments ? publishing.comments.toLocaleString() : 0}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill tone={statusTone[publishing.status] || 'muted'}>
                      {statusText[publishing.status] || publishing.status}
                    </StatusPill>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-studio-text-secondary">{getNextAction(publishing.status)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity md:opacity-70 md:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleEdit(publishing)}
                        className="rounded-button border border-studio-border-soft bg-white/[0.05] p-2 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                        title="编辑"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {publishing.url ? (
                        <a
                          href={publishing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-button border border-studio-border-soft bg-white/[0.05] p-2 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary"
                          title="打开链接"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(publishing)}
                        className="rounded-button border border-studio-coral/30 bg-studio-coral/10 p-2 text-[#FFC2CC] transition hover:bg-studio-coral/15"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTableShell>
      )}

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
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">关联选题 *</label>
            <select
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-studio-text-secondary">发布平台</label>
              <input
                type="text"
                value={formData.platform}
                onChange={(event) => setFormData({ ...formData, platform: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                placeholder="如：抖音、小红书、视频号"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-studio-text-secondary">发布链接</label>
              <input
                type="text"
                value={formData.url}
                onChange={(event) => setFormData({ ...formData, url: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                placeholder="请输入发布链接"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-studio-text-secondary">发布时间</label>
              <input
                type="date"
                value={formData.publish_time}
                onChange={(event) => setFormData({ ...formData, publish_time: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={formData.status !== 'pending'}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-studio-text-secondary">状态</label>
              <select
                value={formData.status}
                onChange={(event) => setFormData({ ...formData, status: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              >
                <option value="pending">待发布</option>
                <option value="published">已发布</option>
                <option value="failed">发布异常</option>
                <option value="scheduled">已定时</option>
              </select>
            </div>
          </div>

          <div className="mt-4 border-t border-studio-border-soft pt-4">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-studio-text-primary">
              <BarChart3 className="h-5 w-5 text-studio-cyan" />
              数据统计
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { key: 'views', label: '播放量', icon: Play },
                { key: 'likes', label: '点赞量', icon: Heart },
                { key: 'shares', label: '分享量', icon: Share2 },
                { key: 'comments', label: '评论量', icon: MessageCircle },
              ].map((field) => {
                const Icon = field.icon;
                return (
                  <div key={field.key}>
                    <label className="mb-2 flex items-center gap-1 text-sm font-medium text-studio-text-secondary">
                      <Icon className="h-4 w-4 text-studio-cyan" />
                      {field.label}
                    </label>
                    <input
                      type="number"
                      value={formData[field.key as keyof typeof formData]}
                      onChange={(event) => setFormData({ ...formData, [field.key]: event.target.value })}
                      className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                      placeholder="0"
                    />
                  </div>
                );
              })}
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
    </PageShell>
  );
}

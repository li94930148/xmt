import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  RefreshCw,
  Share2,
  Trash2,
  Unlink,
  UserRound,
} from 'lucide-react';
import {
  createPublishing,
  deletePublishing,
  getPublishingDouyinCandidates,
  getPublishing,
  getTopics,
  reconcilePublishingDouyin,
  updatePublishing,
  updatePublishingDouyinLink,
} from '../api';
import type { PublishingDouyinCandidate } from '../api';
import type { PublishingSummary } from '../api/workflow';
import { getWorkflowStatusLabel } from '../platform/workflow-status-labels';
import { BaseModal, ConfirmModal, FormModal, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import PlatformBadge from '../components/studio/PlatformBadge';
import ResponsiveTableShell from '../components/studio/ResponsiveTableShell';
import SearchBar from '../components/studio/SearchBar';
import { formatBjtDatabase } from '@shared/time';
import StatusPill, { type StatusTone } from '../components/studio/StatusPill';
import StudioEmptyState from '../components/studio/EmptyState';
import { formatBeijingDate } from '../lib/utils';
import { useAppStore } from '../store';
import { Publishing as PublishingType, Topic } from '../types';
import { usePermission } from '../hooks/usePermission';

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

const statusTone: Record<string, StatusTone> = {
  pending: 'amber',
  published: 'success',
  failed: 'coral',
  scheduled: 'cyan',
};

const metricSourceLabels: Record<string, string> = {
  douyin_official_export: '官方',
  manual: '手录',
  douyin_creator_collection: '采集',
  douyin_legacy_current: '旧同步',
  legacy_analytics: '旧历史',
  unavailable: '待补',
};

function formMetricValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

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
  const [savingPublishing, setSavingPublishing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // 页大小以服务端返回为准，避免前端写死与后端默认值脱节
  const [pageSize, setPageSize] = useState(50);
  const [summary, setSummary] = useState<PublishingSummary>({ today: 0, pending: 0, published: 0, failed: 0 });
  const [linkTarget, setLinkTarget] = useState<PublishingType | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<PublishingDouyinCandidate[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [savingDouyinLink, setSavingDouyinLink] = useState(false);
  const [syncingDouyin, setSyncingDouyin] = useState(false);
  const mutationLockRef = useRef(false);
  const deleteLockRef = useRef(false);
  const reconcileLockRef = useRef(false);
  const douyinLinkLockRef = useRef(false);

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasAllPermissions, loading: permissionsLoading } = usePermission();
  const canManageDouyinLinks = !permissionsLoading
    && hasAllPermissions(['workflow:publishing', 'creator:data:view']);

  const fetchData = useCallback(async (requestedPage = 1): Promise<boolean> => {
    setLoading(true);
    setListError(null);
    try {
      const [initialResult, topicList] = await Promise.all([
        getPublishing({ page: requestedPage }),
        getTopics(),
      ]);
      let result = initialResult;
      // 删除末页最后一条后当前页会越界变空，回退到上一页避免出现空白列表
      if (result.data.length === 0 && result.page > 1) {
        result = await getPublishing({ page: result.page - 1 });
      }
      setPublishings(result.data);
      setPage(result.page);
      setTotal(result.total);
      setPageSize(result.limit || 50);
      setSummary(result.summary);
      setTopics(topicList.data.filter((topic) => topic.status === 'publishing' || topic.status === 'shooting'));
      return true;
    } catch (error) {
      setListError((error as Error).message || '暂时无法读取发布列表');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAfterConfirmedMutation = async (requestedPage: number, confirmedAction: string) => {
    const refreshed = await fetchData(requestedPage);
    if (!refreshed) {
      setListError(`${confirmedAction}，但发布列表刷新失败；请重新加载列表确认，不要重复操作。`);
    }
    return refreshed;
  };

  useEffect(() => {
    void fetchData(1);
  }, [fetchData]);

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingPublishing(null);
  };

  const handleCreate = async () => {
    if (mutationLockRef.current) return;
    if (!formData.topic_id) {
      addNotification({
        title: '创建失败',
        message: '请选择关联选题',
        type: 'error',
      });
      return;
    }

    mutationLockRef.current = true;
    setSavingPublishing(true);
    try {
      const isEditing = Boolean(editingPublishing);
      const manualMetricInputs = [formData.views, formData.likes, formData.shares, formData.comments];
      if (manualMetricInputs.some((value) => value.trim() !== '' && formMetricValue(value) === null)) {
        addNotification({ title: '数据无效', message: '手工补充指标必须是非负整数', type: 'error' });
        return;
      }
      const manualMetrics = {
        views: formMetricValue(formData.views),
        likes: formMetricValue(formData.likes),
        shares: formMetricValue(formData.shares),
        comments: formMetricValue(formData.comments),
      };
      if (editingPublishing) {
        const usesDouyinData = editingPublishing.data_source === 'douyin';
        await updatePublishing(editingPublishing.id, {
          platform: usesDouyinData ? undefined : formData.platform,
          url: formData.url,
          status: usesDouyinData ? undefined : formData.status,
          publish_time: usesDouyinData ? undefined : formData.publish_time,
          ...manualMetrics,
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
          ...manualMetrics,
        });

        addNotification({
          title: '创建成功',
          message: formData.status === 'published' ? '发布记录已添加，选题已归档到资源库' : '发布记录已添加',
          type: 'success',
        });
      }

      setShowCreateModal(false);
      resetForm();

      // 新建记录排在最前，回到第 1 页才能看到；编辑则停留在当前页
      await refreshAfterConfirmedMutation(
        isEditing ? page : 1,
        isEditing ? '服务端已确认发布记录更新' : '服务端已确认发布记录创建',
      );
    } catch (error) {
      addNotification({
        title: '操作失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      mutationLockRef.current = false;
      setSavingPublishing(false);
    }
  };

  const handleDelete = async (id: number): Promise<boolean> => {
    try {
      await deletePublishing(id);
    } catch (error) {
      addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
      return false;
    }

    const deletedRecord = publishings.find((publishing) => publishing.id === id);
    if (deletedRecord) {
      setPublishings((current) => current.filter((publishing) => publishing.id !== id));
      setTotal((current) => Math.max(0, current - 1));
    }
    addNotification({
      title: '删除成功',
      message: '服务端已确认发布记录删除',
      type: 'success',
    });

    const requestedPage = deletedRecord && publishings.length === 1 && page > 1 ? page - 1 : page;
    if (requestedPage !== page) setPage(requestedPage);
    await refreshAfterConfirmedMutation(requestedPage, '服务端已确认发布记录删除；该行已从当前页面移除，汇总可能尚未更新');
    return true;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleteLockRef.current) {
      return;
    }

    deleteLockRef.current = true;
    setDeleteLoading(true);
    try {
      const deleted = await handleDelete(deleteTarget.id);
      if (deleted) setDeleteTarget(null);
    } finally {
      deleteLockRef.current = false;
      setDeleteLoading(false);
    }
  };

  const loadLinkCandidates = async (target: PublishingType, query = '') => {
    setLinkLoading(true);
    try {
      const result = await getPublishingDouyinCandidates(target.id, query);
      setLinkCandidates(result.candidates);
    } catch (error) {
      addNotification({ title: '获取候选失败', message: (error as Error).message, type: 'error' });
    } finally {
      setLinkLoading(false);
    }
  };

  const openDouyinLink = (publishing: PublishingType) => {
    if (douyinLinkLockRef.current) return;
    setLinkTarget(publishing);
    setLinkQuery('');
    setLinkCandidates([]);
    void loadLinkCandidates(publishing);
  };

  const handleReconcileDouyin = async () => {
    if (reconcileLockRef.current) return;
    reconcileLockRef.current = true;
    setSyncingDouyin(true);
    try {
      const result = await reconcilePublishingDouyin();
      addNotification({
        title: '抖音数据关联已刷新',
        message: result.linked > 0
          ? `新增 ${result.linked} 条高置信关联；歧义或未匹配稿件可人工选择。`
          : '没有发现新的唯一高置信关联，现有绑定保持不变。',
        type: 'success',
      });
      await refreshAfterConfirmedMutation(page, '服务端已确认抖音数据关联刷新');
    } catch (error) {
      addNotification({ title: '刷新关联失败', message: (error as Error).message, type: 'error' });
    } finally {
      reconcileLockRef.current = false;
      setSyncingDouyin(false);
    }
  };

  const handleDouyinLink = async (workId: number | null) => {
    if (!linkTarget || douyinLinkLockRef.current) return;
    douyinLinkLockRef.current = true;
    setSavingDouyinLink(true);
    setLinkLoading(true);
    try {
      const result = await updatePublishingDouyinLink(linkTarget.id, workId);
      addNotification({ title: workId === null ? '关联已解除' : '关联成功', message: result.message, type: 'success' });
      setLinkTarget(null);
      setLinkCandidates([]);
      await refreshAfterConfirmedMutation(page, workId === null ? '服务端已确认抖音作品关联解除' : '服务端已确认抖音作品关联');
    } catch (error) {
      addNotification({ title: '更新关联失败', message: (error as Error).message, type: 'error' });
    } finally {
      douyinLinkLockRef.current = false;
      setSavingDouyinLink(false);
      setLinkLoading(false);
    }
  };

  const handleEdit = (publishing: PublishingType) => {
    setEditingPublishing(publishing);
    setFormData({
      topic_id: publishing.topic_id.toString(),
      platform: publishing.publishing_platform ?? publishing.platform ?? '',
      url: publishing.url || '',
      status: publishing.publishing_status ?? publishing.status,
      publish_time: (publishing.publishing_publish_time ?? publishing.publish_time)
        ? formatBjtDatabase(publishing.publishing_publish_time ?? publishing.publish_time).replace(' ', 'T').slice(0, 16)
        : '',
      views: publishing.manual_views?.toString() || '',
      likes: publishing.manual_likes?.toString() || '',
      shares: publishing.manual_shares?.toString() || '',
      comments: publishing.manual_comments?.toString() || '',
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
  const editingUsesDouyinData = editingPublishing?.data_source === 'douyin';

  return (
    <PageShell>
      <PageHeader
        title="发布管理"
        description="每条作品单独统计；抖音官方数据优先，手工补充只填缺项并标明来源。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManageDouyinLinks ? (
              <ActionButton type="button" onClick={() => void handleReconcileDouyin()} disabled={syncingDouyin}>
                <RefreshCw className={`h-4 w-4 ${syncingDouyin ? 'animate-spin' : ''}`} />
                {syncingDouyin ? '正在关联' : '刷新抖音关联'}
              </ActionButton>
            ) : null}
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
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="今日待发布" value={summary.today} icon={Calendar} tone="cyan" />
        <MetricCard title="待确认" value={summary.pending} icon={FileText} tone="amber" />
        <MetricCard title="已发布" value={summary.published} icon={CheckCircle} tone="success" />
        <MetricCard title="发布异常" value={summary.failed} icon={AlertTriangle} tone="coral" />
      </div>

      {listError ? (
        <div role="alert" className="flex flex-col items-stretch gap-3 rounded-button border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="w-full min-w-0 sm:flex-1">发布列表未能刷新：{listError}</p>
          <ActionButton type="button" className="self-start sm:self-auto" onClick={() => void fetchData(page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '正在重新加载' : '重新加载列表'}
          </ActionButton>
        </div>
      ) : null}

      <GlassPanel className="p-4">
        <SearchBar
          id="publishing-search"
          name="publishing-search"
          aria-label="搜索发布记录"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="搜索选题标题或发布平台..."
          className="max-w-xl"
        />
      </GlassPanel>

      {loading ? (
        <LoadingState type="section" text="正在加载发布记录..." />
      ) : listError && publishings.length === 0 ? null : (
        filteredPublishings.length === 0 ? (
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
              <tr className="border-b border-studio-border-soft bg-studio-surface-soft text-left text-xs font-semibold uppercase tracking-wide text-studio-text-muted">
                <th className="px-5 py-4">内容</th>
                <th className="px-5 py-4">平台</th>
                <th className="px-5 py-4">发布时间</th>
                <th className="px-5 py-4">数据</th>
                <th className="px-5 py-4">状态</th>
                <th className="px-5 py-4">下一步</th>
                <th className="sticky right-0 z-20 w-[152px] min-w-[152px] border-l border-studio-border-soft bg-studio-surface-soft px-1 py-4 text-right sm:w-[208px] sm:min-w-[208px] sm:px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredPublishings.map((publishing) => (
                <tr key={publishing.id} className="group border-b border-studio-border-soft/70 transition hover:bg-studio-surface-soft">
                  <td className="px-2 py-4 sm:px-5">
                    <button
                      type="button"
                      onClick={() => navigate(`/publishing/${publishing.id}`)}
                      className="flex min-w-0 items-start gap-3 text-left"
                    >
                      <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-button border border-studio-border-soft bg-studio-surface-soft text-studio-cyan sm:flex">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-semibold text-studio-text-primary group-hover:text-studio-cyan-contrast">
                          {publishing.topic_title || '未命名发布内容'}
                        </span>
                        {publishing.data_source === 'douyin' ? (
                          <span className="mt-1 block line-clamp-1 text-xs text-studio-cyan-contrast" title={publishing.douyin_title || undefined}>
                            抖音作品{publishing.douyin_title && publishing.douyin_title !== publishing.topic_title ? ` · ${publishing.douyin_title}` : ''}
                          </span>
                        ) : null}
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
                      <span className="flex items-center gap-1 text-studio-cyan-contrast" title={`播放量 · ${metricSourceLabels[publishing.views_source || 'unavailable']}`}>
                        <Play className="h-3.5 w-3.5" />
                        {publishing.views ? publishing.views.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.views_source || 'unavailable']}</span>
                      </span>
                      <span className="flex items-center gap-1 text-studio-coral-contrast" title={`点赞量 · ${metricSourceLabels[publishing.likes_source || 'unavailable']}`}>
                        <Heart className="h-3.5 w-3.5" />
                        {publishing.likes ? publishing.likes.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.likes_source || 'unavailable']}</span>
                      </span>
                      <span className="flex items-center gap-1 text-studio-success-contrast" title={`分享量 · ${metricSourceLabels[publishing.shares_source || 'unavailable']}`}>
                        <Share2 className="h-3.5 w-3.5" />
                        {publishing.shares ? publishing.shares.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.shares_source || 'unavailable']}</span>
                      </span>
                      <span className="flex items-center gap-1 text-studio-violet-contrast" title={`评论量 · ${metricSourceLabels[publishing.comments_source || 'unavailable']}`}>
                        <MessageCircle className="h-3.5 w-3.5" />
                        {publishing.comments ? publishing.comments.toLocaleString() : 0}
                        <span className="text-[10px] text-studio-text-secondary">{metricSourceLabels[publishing.comments_source || 'unavailable']}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill tone={statusTone[publishing.status] || 'muted'}>
                      {getWorkflowStatusLabel('publishing', publishing.status)}
                    </StatusPill>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-studio-text-secondary">{getNextAction(publishing.status)}</td>
                  <td className="sticky right-0 z-10 w-[152px] min-w-[152px] border-l border-studio-border-soft bg-studio-surface px-1 py-4 transition-colors group-hover:bg-studio-surface-soft sm:w-[208px] sm:min-w-[208px] sm:px-4">
                    <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity md:gap-2 md:opacity-70 md:group-hover:opacity-100">
                      {canManageDouyinLinks ? (
                        <button
                          type="button"
                          onClick={() => openDouyinLink(publishing)}
                          disabled={savingDouyinLink}
                          className={`min-h-8 min-w-8 rounded-button border p-1 transition sm:p-2 ${publishing.douyin_work_id ? 'border-studio-cyan/40 bg-studio-cyan/10 text-studio-cyan-contrast' : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary hover:border-studio-border-active hover:text-studio-text-primary'}`}
                          title={publishing.douyin_work_id ? '调整抖音作品关联' : '关联抖音作品'}
                          aria-label={`${publishing.douyin_work_id ? '调整抖音作品关联' : '关联抖音作品'} ${publishing.topic_title || '未命名发布内容'}`}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                      ) : null}
                        <button
                        type="button"
                        onClick={() => handleEdit(publishing)}
                          className="min-h-8 min-w-8 rounded-button border border-studio-border-soft bg-studio-surface-soft p-1 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary sm:p-2"
                        title="编辑"
                          aria-label={`编辑发布记录 ${publishing.topic_title || '未命名发布内容'}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {publishing.url ? (
                        <a
                          href={publishing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-8 min-w-8 rounded-button border border-studio-border-soft bg-studio-surface-soft p-1 text-studio-text-secondary transition hover:border-studio-border-active hover:text-studio-text-primary sm:p-2"
                          title="打开链接"
                          aria-label={`打开发布链接 ${publishing.topic_title || '未命名发布内容'}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(publishing)}
                        className="min-h-8 min-w-8 rounded-button border border-studio-coral/30 bg-studio-coral/10 p-1 text-studio-coral-contrast transition hover:bg-studio-coral/15 sm:p-2"
                        title="删除"
                        aria-label={`删除发布记录 ${publishing.topic_title || '未命名发布内容'}`}
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
        )
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between gap-3 text-sm text-studio-text-secondary">
          <span>共 {total} 条，第 {page} / {Math.ceil(total / pageSize)} 页</span>
          <div className="flex gap-2">
            <ActionButton type="button" variant="ghost" disabled={page <= 1} onClick={() => void fetchData(page - 1)}>上一页</ActionButton>
            <ActionButton type="button" variant="ghost" disabled={page >= Math.ceil(total / pageSize)} onClick={() => void fetchData(page + 1)}>下一页</ActionButton>
          </div>
        </div>
      ) : null}

      <FormModal
        open={showCreateModal}
        onCancel={() => {
          if (savingPublishing) return;
          setShowCreateModal(false);
          resetForm();
        }}
        onSubmit={handleCreate}
        loading={savingPublishing}
        title={editingPublishing ? '编辑发布记录' : '添加发布记录'}
        submitText={editingPublishing ? '更新' : '保存'}
        cancelText="取消"
        size="xl"
      >
        <div className="space-y-4">
          {editingUsesDouyinData ? (
            <div className="rounded-button border border-studio-cyan/30 bg-studio-cyan/10 px-4 py-3 text-sm text-studio-cyan-contrast">
              已关联抖音作品。平台、发布时间和状态由作品关联记录决定；下方数值填写这条作品截至当前的累计表现，官方导出中已有指标仍优先展示。
            </div>
          ) : null}
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
                disabled={editingUsesDouyinData}
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
                disabled={editingUsesDouyinData || formData.status !== 'pending'}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-studio-text-secondary">状态</label>
              <select
                value={formData.status}
                onChange={(event) => setFormData({ ...formData, status: event.target.value })}
                className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                disabled={editingUsesDouyinData}
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
                      手工补充{field.label}
                    </label>
                    <input
                      type="number"
                      value={formData[field.key as keyof typeof formData]}
                      onChange={(event) => setFormData({ ...formData, [field.key]: event.target.value })}
                      className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
                      min="0"
                      step="1"
                      placeholder="留空表示未补充"
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-studio-text-muted">请填写单条作品截至当前的累计值，不是某一天的新增量。手工值按发布记录分别保存；留空表示未补充，不会写入 0，也不会覆盖抖音官方已提供的指标。</p>
          </div>
        </div>
      </FormModal>

      <BaseModal
        open={Boolean(linkTarget)}
        onClose={() => {
          if (!savingDouyinLink) setLinkTarget(null);
        }}
        closeOnOverlayClick={!savingDouyinLink}
        showCloseButton={!savingDouyinLink}
        size="lg"
        title="关联抖音作品"
        description={linkTarget ? `发布稿件：${linkTarget.topic_title || '未命名发布内容'}` : undefined}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {linkTarget?.douyin_work_id ? (
                <ActionButton type="button" onClick={() => void handleDouyinLink(null)} disabled={linkLoading || savingDouyinLink}>
                  <Unlink className="h-4 w-4" />
                  解除当前关联
                </ActionButton>
              ) : null}
            </div>
            <ActionButton type="button" onClick={() => setLinkTarget(null)} disabled={savingDouyinLink}>关闭</ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchBar
              id="douyin-candidate-search"
              name="douyin-candidate-search"
              aria-label="搜索抖音作品标题关键词"
              value={linkQuery}
              onChange={(event) => setLinkQuery(event.target.value)}
              placeholder="输入抖音作品标题关键词"
              className="flex-1"
            />
            <ActionButton
              type="button"
              disabled={linkLoading || savingDouyinLink || !linkTarget}
              onClick={() => linkTarget && void loadLinkCandidates(linkTarget, linkQuery)}
            >
              搜索候选
            </ActionButton>
          </div>
          <p className="text-xs leading-5 text-studio-text-muted">
            系统只自动绑定唯一的高置信结果；同名、近似或已被其他稿件占用的作品需要人工确认。
          </p>
          {linkLoading ? (
            <LoadingState type="section" text="正在读取抖音作品..." />
          ) : linkCandidates.length === 0 ? (
            <div className="rounded-button border border-studio-border-soft px-4 py-8 text-center text-sm text-studio-text-muted">
              暂无候选作品
            </div>
          ) : (
            <div className="space-y-2">
              {linkCandidates.map((candidate) => {
                const linkedHere = candidate.linked_publishing_id === linkTarget?.id;
                const linkedElsewhere = Boolean(candidate.linked_publishing_id && !linkedHere);
                return (
                  <div key={candidate.id} className="rounded-button border border-studio-border-soft bg-studio-surface-soft p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium text-studio-text-primary">{candidate.title}</p>
                        <p className="mt-1 text-xs text-studio-text-muted">
                          {formatBeijingDate(candidate.publish_time)} · 播放 {(candidate.play_count || 0).toLocaleString()} · 点赞 {(candidate.like_count || 0).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-studio-cyan-contrast">
                          标题匹配 {Math.round(candidate.match_score * 100)}% · {candidate.match_method === 'exact' ? '标题一致' : candidate.match_method === 'containment' ? '标题包含' : '近似标题'}
                        </p>
                      </div>
                      <ActionButton
                        type="button"
                        variant={linkedHere ? 'primary' : 'secondary'}
                        disabled={linkLoading || savingDouyinLink || linkedHere || linkedElsewhere}
                        onClick={() => void handleDouyinLink(candidate.id)}
                      >
                        {linkedHere ? '当前关联' : linkedElsewhere ? '已关联其他稿件' : '关联此作品'}
                      </ActionButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BaseModal>

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

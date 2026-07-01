import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle, Clock3, FileText, MapPin, Plus, Trash2, UserRound, Video } from 'lucide-react';
import { createShooting, getShooting, getTopics, updateShooting } from '../api';
import { ConfirmModal, FormModal, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import SearchBar from '../components/studio/SearchBar';
import StageProgress, { type StageItem } from '../components/studio/StageProgress';
import StatusPill, { type StatusTone } from '../components/studio/StatusPill';
import StudioEmptyState from '../components/studio/EmptyState';
import TaskFlowCard from '../components/studio/TaskFlowCard';
import { formatBeijingDate } from '../lib/utils';
import { useAppStore, useAuthStore } from '../store';
import { Shooting as ShootingType, Topic } from '../types';

type ConfirmAction =
  | { type: 'delete'; shootingId: number; topicTitle: string }
  | { type: 'complete'; shooting: ShootingType }
  | null;

const initialFormData = {
  topic_id: '',
  plan_date: '',
  location: '',
  equipment: '',
  status: 'planned',
};

const shootingStatusText: Record<string, string> = {
  planned: '计划中',
  in_progress: '制作中',
  completed: '已完成',
  cancelled: '已取消',
  pending: '计划中',
};

const shootingStatusTone: Record<string, StatusTone> = {
  planned: 'amber',
  in_progress: 'cyan',
  completed: 'success',
  cancelled: 'muted',
  pending: 'amber',
};

const topicStatusText: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '发布中',
  completed: '已完成',
};

function buildStages(status: string): StageItem[] {
  const current = status === 'completed' ? 3 : status === 'in_progress' ? 2 : status === 'cancelled' ? 1 : 1;
  return [
    { label: '排期', state: current > 1 ? 'done' : 'active' },
    { label: '拍摄', state: current > 2 ? 'done' : current === 2 ? 'active' : 'pending' },
    { label: '交付', state: current >= 3 ? 'done' : 'pending' },
  ];
}

function getNextAction(status: string) {
  if (status === 'completed') {
    return '进入发布管理';
  }
  if (status === 'in_progress') {
    return '确认素材交付';
  }
  if (status === 'cancelled') {
    return '检查计划状态';
  }
  return '推进拍摄执行';
}

export default function Shooting() {
  const [shootings, setShootings] = useState<ShootingType[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getShooting();
      setShootings(result);

      const topicList = await getTopics();
      setTopics(
        topicList.data.filter(
          (topic) =>
            topic.status === 'approved' ||
            topic.status === 'production' ||
            topic.status === 'shooting',
        ),
      );
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
      await createShooting({
        topic_id: Number.parseInt(formData.topic_id, 10),
        plan_date: formData.plan_date,
        location: formData.location,
        equipment: formData.equipment,
        status: formData.status,
      });
      addNotification({
        title: '创建成功',
        message: '制作计划已添加',
        type: 'success',
      });
      setShowCreateModal(false);
      setFormData(initialFormData);

      const result = await getShooting();
      setShootings(result);
    } catch (error) {
      addNotification({
        title: '创建失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const token = useAuthStore.getState().token;
      const response = await fetch(`/api/workflow/shooting/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      addNotification({
        title: '删除成功',
        message: '制作计划已删除',
        type: 'success',
      });

      const result = await getShooting();
      setShootings(result);
    } catch (error) {
      addNotification({
        title: '删除失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleComplete = async (shooting: ShootingType) => {
    try {
      await updateShooting(shooting.id, {
        topic_id: shooting.topic_id,
        status: 'completed',
      });
      addNotification({
        title: '完成成功',
        message: '成片制作已完成，已流转到发布管理环节',
        type: 'success',
      });

      const result = await getShooting();
      setShootings(result);
    } catch (error) {
      addNotification({
        title: '操作失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) {
      return;
    }

    setConfirmLoading(true);
    try {
      if (confirmAction.type === 'delete') {
        await handleDelete(confirmAction.shootingId);
      } else {
        await handleComplete(confirmAction.shooting);
      }
      setConfirmAction(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const filteredShootings = useMemo(
    () =>
      shootings.filter(
        (shooting) =>
          shooting.topic_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          shooting.location?.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [searchTerm, shootings],
  );

  const todayKey = new Date().toISOString().slice(0, 10);
  const metrics = useMemo(
    () => ({
      today: shootings.filter((item) => item.plan_date?.slice(0, 10) === todayKey).length,
      active: shootings.filter((item) => item.status === 'in_progress').length,
      handoff: shootings.filter((item) => item.status === 'planned' || item.status === 'pending').length,
      done: shootings.filter((item) => item.status === 'completed').length,
    }),
    [shootings, todayKey],
  );

  const confirmTitle = confirmAction?.type === 'delete' ? '确认删除' : '确认完成';
  const confirmText = confirmAction?.type === 'delete' ? '确认删除' : '确认完成';
  const confirmDescription =
    confirmAction?.type === 'delete'
      ? `确定要删除“${confirmAction.topicTitle}”这条制作计划吗？此操作不可撤销。`
      : confirmAction?.type === 'complete'
        ? `确定要将“${confirmAction.shooting.topic_title}”标记为完成吗？完成后将自动流转到发布管理环节。`
        : '';

  return (
    <PageShell>
      <PageHeader
        title="成片制作"
        description="跟进拍摄计划、素材交付和制作状态，优先处理临近截止的内容。"
        actions={
          <ActionButton type="button" variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            添加制作计划
          </ActionButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="今日待拍" value={metrics.today} icon={Calendar} tone="cyan" />
        <MetricCard title="制作中" value={metrics.active} icon={Video} tone="primary" />
        <MetricCard title="待交付" value={metrics.handoff} icon={Clock3} tone="amber" />
        <MetricCard title="已完成" value={metrics.done} icon={CheckCircle} tone="success" />
      </div>

      <GlassPanel className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="搜索选题标题或拍摄地点..."
          className="max-w-xl"
        />
      </GlassPanel>

      {loading ? (
        <LoadingState type="section" text="正在加载制作计划..." />
      ) : filteredShootings.length === 0 ? (
        <StudioEmptyState
          icon={FileText}
          title="暂无制作计划"
          description={searchTerm ? '没有匹配当前搜索条件的制作计划。' : '添加拍摄或制作任务后，会在这里形成进度控制台。'}
          actionLabel="添加制作计划"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredShootings.map((shooting) => (
            <TaskFlowCard
              key={shooting.id}
              eyebrow={topicStatusText[shooting.topic_status || 'shooting'] || '成片制作'}
              title={shooting.topic_title || '未命名制作任务'}
              status={
                <StatusPill tone={shootingStatusTone[shooting.status] || 'muted'}>
                  {shootingStatusText[shooting.status] || shooting.status}
                </StatusPill>
              }
              meta={
                <>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatBeijingDate(shooting.plan_date)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {shooting.location || '待定地点'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5" />
                    {shooting.operator_name || '未分配'}
                  </span>
                </>
              }
              progress={<StageProgress stages={buildStages(shooting.status)} />}
              action={
                <div className="flex flex-wrap justify-end gap-2">
                  <ActionButton type="button" variant="ghost" onClick={() => navigate(`/shooting/${shooting.id}`)}>
                    查看
                  </ActionButton>
                  {shooting.status !== 'completed' ? (
                    <ActionButton type="button" variant="secondary" onClick={() => setConfirmAction({ type: 'complete', shooting })}>
                      完成
                    </ActionButton>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        type: 'delete',
                        shootingId: shooting.id,
                        topicTitle: shooting.topic_title || '该制作计划',
                      })
                    }
                    className="inline-flex min-h-10 items-center justify-center rounded-button border border-studio-coral/30 bg-studio-coral/10 px-3 py-2 text-sm font-semibold text-[#FFC2CC] transition hover:bg-studio-coral/15"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              }
            >
              <div className="line-clamp-2">
                <span className="text-studio-text-muted">设备：</span>
                {shooting.equipment || '暂未填写设备清单'}
              </div>
              <div className="mt-2 text-studio-cyan">{getNextAction(shooting.status)}</div>
            </TaskFlowCard>
          ))}
        </div>
      )}

      <FormModal
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        title="添加制作计划"
        submitText="保存"
        cancelText="取消"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">关联选题 *</label>
            <select
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            >
              <option value="">请选择选题</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">计划日期</label>
            <input
              type="date"
              value={formData.plan_date}
              onChange={(event) => setFormData({ ...formData, plan_date: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">拍摄地点</label>
            <input
              type="text"
              value={formData.location}
              onChange={(event) => setFormData({ ...formData, location: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              placeholder="请输入拍摄地点"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">设备清单</label>
            <textarea
              value={formData.equipment}
              onChange={(event) => setFormData({ ...formData, equipment: event.target.value })}
              rows={2}
              className="w-full resize-none rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              placeholder="请输入设备清单"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text-secondary">状态</label>
            <select
              value={formData.status}
              onChange={(event) => setFormData({ ...formData, status: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            >
              <option value="planned">计划中</option>
              <option value="in_progress">制作中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(confirmAction)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        loading={confirmLoading}
        variant={confirmAction?.type === 'delete' ? 'danger' : 'warning'}
        title={confirmTitle}
        confirmText={confirmText}
        cancelText="取消"
        description={confirmDescription}
      />
    </PageShell>
  );
}

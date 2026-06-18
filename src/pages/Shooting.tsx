import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle,
  Edit3,
  FileText,
  MapPin,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { createShooting, getShooting, getTopics, updateShooting } from '../api';
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
  const styles = useThemeStyles();

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
        message: '拍摄计划已添加',
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
        message: '拍摄计划已删除',
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
        message: '拍摄制作已完成，已流转到发布管理环节',
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

  const topicStatusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    production: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    shooting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    publishing: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const topicStatusText: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    production: '创作中',
    shooting: '拍摄制作',
    publishing: '发布中',
    completed: '已完成',
  };

  const shootingStatusColors: Record<string, string> = {
    planned: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  const shootingStatusText: Record<string, string> = {
    planned: '计划中',
    in_progress: '制作中',
    completed: '已完成',
    cancelled: '已取消',
    pending: '计划中',
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

  const confirmTitle = confirmAction?.type === 'delete' ? '确认删除' : '确认完成';
  const confirmText = confirmAction?.type === 'delete' ? '确认删除' : '确认完成';
  const confirmDescription =
    confirmAction?.type === 'delete'
      ? `确定要删除“${confirmAction.topicTitle}”这条拍摄计划吗？此操作不可撤销。`
      : confirmAction?.type === 'complete'
        ? `确定要将“${confirmAction.shooting.topic_title}”标记为完成吗？完成后将自动流转到发布管理环节。`
        : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="拍摄制作"
        description="管理拍摄制作计划和进度"
        actions={
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 ${styles.buttonPrimary} transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm font-medium">添加制作计划</span>
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
              placeholder="搜索选题标题或拍摄地点..."
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
                  计划日期
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  拍摄地点
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  设备
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  选题状态
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  制作状态
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  操作人
                </th>
                <th className={`px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider ${styles.textMuted}`}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12">
                    <LoadingState type="inline" text="正在加载拍摄计划..." className="mx-auto flex" />
                  </td>
                </tr>
              ) : filteredShootings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12">
                    <EmptyState
                      icon={FileText}
                      title="暂无拍摄计划"
                      description={
                        searchTerm
                          ? '没有匹配当前搜索条件的拍摄计划。'
                          : '当前还没有拍摄计划，创建后会显示在这里。'
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredShootings.map((shooting) => (
                  <tr key={shooting.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/shooting/${shooting.id}`)}
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                        title="点击查看详情"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">{shooting.topic_title}</span>
                      </button>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatBeijingDate(shooting.plan_date)}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {shooting.location || '-'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{shooting.equipment || '-'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${topicStatusColors[shooting.topic_status || 'shooting']}`}
                      >
                        {topicStatusText[shooting.topic_status || 'shooting']}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${shootingStatusColors[shooting.status]}`}
                      >
                        {shootingStatusText[shooting.status]}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${styles.textSecondary}`}>{shooting.operator_name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/shooting/${shooting.id}`)}
                          className={`rounded-lg p-2 text-blue-400 transition-colors hover:text-blue-300 ${styles.hoverBg}`}
                          title="查看详情"
                        >
                          <Edit3 className="h-5 w-5" />
                        </button>
                        {shooting.status !== 'completed' ? (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ type: 'complete', shooting })}
                            className={`rounded-lg p-2 text-green-400 transition-colors hover:text-green-300 ${styles.hoverBg}`}
                            title="标记完成"
                          >
                            <CheckCircle className="h-5 w-5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              type: 'delete',
                              shootingId: shooting.id,
                              topicTitle: shooting.topic_title || '该拍摄计划',
                            })
                          }
                          className={`rounded-lg p-2 text-red-400 transition-colors hover:text-red-300 ${styles.hoverBg}`}
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
        onCancel={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        title="添加拍摄计划"
        submitText="保存"
        cancelText="取消"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>关联选题 *</label>
            <select
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
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
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>计划日期</label>
            <input
              type="date"
              value={formData.plan_date}
              onChange={(event) => setFormData({ ...formData, plan_date: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>拍摄地点</label>
            <input
              type="text"
              value={formData.location}
              onChange={(event) => setFormData({ ...formData, location: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="请输入拍摄地点"
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>设备清单</label>
            <textarea
              value={formData.equipment}
              onChange={(event) => setFormData({ ...formData, equipment: event.target.value })}
              rows={2}
              className={`w-full resize-none rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="请输入设备清单"
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>状态</label>
            <select
              value={formData.status}
              onChange={(event) => setFormData({ ...formData, status: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="planned">计划中</option>
              <option value="in_progress">拍摄中</option>
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
    </div>
  );
}

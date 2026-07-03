import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Plus } from 'lucide-react';
import {
  createRetrospective,
  getMyRetroActions,
  getRetroTemplates,
  getRetrospectives,
  type CreateRetrospectivePayload,
  type RetroAction,
  type RetroTemplate,
  type RetroTemplateCategory,
  type Retrospective,
  type RetrospectiveStatus,
} from '../api/retrospectives';
import { getUsers } from '../api/users';
import type { User } from '../types';
import { useAppStore, useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import MyRetroActionsPanel from '../components/retrospectives/MyRetroActionsPanel';
import RetroCreateDialog from '../components/retrospectives/RetroCreateDialog';
import RetroList from '../components/retrospectives/RetroList';
import { retroCategoryLabels, toFriendlyRetroError } from '../components/retrospectives/retroLabels';

const statusOptions: Array<{ value: RetrospectiveStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];

const categoryOptions: Array<{ value: RetroTemplateCategory | 'all'; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'weekly', label: retroCategoryLabels.weekly },
  { value: 'project', label: retroCategoryLabels.project },
  { value: 'channel', label: retroCategoryLabels.channel },
  { value: 'topic', label: retroCategoryLabels.topic },
  { value: 'daily', label: retroCategoryLabels.daily },
  { value: 'custom', label: retroCategoryLabels.custom },
];

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

export default function RetrospectivesPage() {
  const navigate = useNavigate();
  const appStore = useAppStore();
  const currentUser = useAuthStore((state) => state.user);
  const { hasPermission } = usePermission();
  const canCreate = currentUser?.role === 'admin' || currentUser?.role === 'director' || hasPermission('analytics:retro:create');

  const [retrospectives, setRetrospectives] = useState<Retrospective[]>([]);
  const [myActions, setMyActions] = useState<RetroAction[]>([]);
  const [templates, setTemplates] = useState<RetroTemplate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<RetrospectiveStatus | 'all'>('all');
  const [category, setCategory] = useState<RetroTemplateCategory | 'all'>('all');
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(today());
  const [loading, setLoading] = useState(true);
  const [loadingMyActions, setLoadingMyActions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRetrospectives({ status, category, start, end });
      setRetrospectives(result.retrospectives);
    } catch (error) {
      setRetrospectives([]);
      appStore.addNotification({ title: '加载复盘列表失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [appStore, category, end, start, status]);

  const loadMyActions = useCallback(async () => {
    setLoadingMyActions(true);
    try {
      const result = await getMyRetroActions({ status: 'open' });
      setMyActions(result.actions);
    } catch {
      setMyActions([]);
    } finally {
      setLoadingMyActions(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadMyActions();
  }, [loadMyActions]);

  useEffect(() => {
    getRetroTemplates()
      .then((result) => setTemplates(result.templates))
      .catch((error) => appStore.addNotification({ title: '加载复盘模板失败', message: toFriendlyRetroError(error), type: 'warning' }));

    getUsers({ page: 1, limit: 200 })
      .then((result) => setUsers(result.data || []))
      .catch(() => setUsers(currentUser ? [currentUser] : []));
  }, [appStore, currentUser]);

  const handleCreate = async (payload: CreateRetrospectivePayload) => {
    setCreating(true);
    try {
      const detail = await createRetrospective(payload);
      appStore.addNotification({ title: '复盘已创建', message: '正在进入详情页', type: 'success' });
      setCreateOpen(false);
      navigate(`/retrospectives/${detail.retrospective.id}`);
    } catch (error) {
      appStore.addNotification({ title: '创建复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="复盘中心"
        description="用于沉淀周期复盘、指标快照、结论和行动项；实时数据看板仍保留在 analytics。"
        actions={
          <div className="flex flex-wrap gap-3">
            <Link to="/analytics">
              <ActionButton variant="ghost">
                <BarChart3 className="h-4 w-4" />
                查看实时看板
              </ActionButton>
            </Link>
            {canCreate ? (
              <ActionButton variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                新建复盘
              </ActionButton>
            ) : null}
          </div>
        }
      />

      <MyRetroActionsPanel
        actions={myActions}
        loading={loadingMyActions}
        onRefresh={loadMyActions}
        onOpen={(id) => navigate(`/retrospectives/${id}`)}
      />

      <GlassPanel className="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_180px_180px_auto]">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as RetrospectiveStatus | 'all')}
            className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as RetroTemplateCategory | 'all')}
            className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
          <ActionButton onClick={loadList} disabled={loading}>应用筛选</ActionButton>
        </div>
      </GlassPanel>

      <RetroList
        retrospectives={retrospectives}
        loading={loading}
        canCreate={canCreate}
        onCreate={() => setCreateOpen(true)}
        onRefresh={loadList}
        onOpen={(id) => navigate(`/retrospectives/${id}`)}
      />

      <RetroCreateDialog
        open={createOpen}
        templates={templates}
        users={users}
        currentUserId={currentUser?.id}
        loading={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </PageShell>
  );
}

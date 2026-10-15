import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
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
  const addNotification = useAppStore((state) => state.addNotification);
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.id;
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
  const [listError, setListError] = useState<string | null>(null);
  const [myActionsError, setMyActionsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createInFlightRef = useRef(false);
  const listRequestRef = useRef(0);
  const actionsRequestRef = useRef(0);
  const listOwnerRef = useRef(currentUserId);
  const actionsOwnerRef = useRef(currentUserId);
  const [listOwnerId, setListOwnerId] = useState(currentUserId);
  const [actionsOwnerId, setActionsOwnerId] = useState(currentUserId);
  const listScope = JSON.stringify([currentUserId, status, category, start, end]);
  const latestListScopeRef = useRef(listScope);
  latestListScopeRef.current = listScope;

  const loadList = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    const isCurrent = () => requestId === listRequestRef.current
      && latestListScopeRef.current === listScope
      && useAuthStore.getState().user?.id === currentUserId;
    if (listOwnerRef.current !== currentUserId) {
      listOwnerRef.current = currentUserId;
      setListOwnerId(currentUserId);
      setRetrospectives([]);
    }
    setLoading(true);
    setListError(null);
    try {
      if (!currentUserId) return;
      const result = await getRetrospectives({ status, category, start, end });
      if (!isCurrent()) return;
      setRetrospectives(result.retrospectives);
    } catch (error) {
      if (!isCurrent()) return;
      setListError(toFriendlyRetroError(error));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [category, currentUserId, end, listScope, start, status]);

  const loadMyActions = useCallback(async () => {
    const requestId = ++actionsRequestRef.current;
    const isCurrent = () => requestId === actionsRequestRef.current && useAuthStore.getState().user?.id === currentUserId;
    if (actionsOwnerRef.current !== currentUserId) {
      actionsOwnerRef.current = currentUserId;
      setActionsOwnerId(currentUserId);
      setMyActions([]);
    }
    setLoadingMyActions(true);
    setMyActionsError(null);
    try {
      if (!currentUserId) return;
      const result = await getMyRetroActions({ status: 'open' });
      if (!isCurrent()) return;
      setMyActions(result.actions);
    } catch (error) {
      if (!isCurrent()) return;
      setMyActionsError(toFriendlyRetroError(error));
    } finally {
      if (isCurrent()) setLoadingMyActions(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadList();
    return () => { listRequestRef.current += 1; };
  }, [loadList]);

  useEffect(() => {
    void loadMyActions();
    return () => { actionsRequestRef.current += 1; };
  }, [loadMyActions]);

  useEffect(() => {
    getRetroTemplates()
      .then((result) => setTemplates(result.templates))
      .catch((error) => addNotification({ title: '加载复盘模板失败', message: toFriendlyRetroError(error), type: 'warning' }));

    getUsers({ page: 1, limit: 200 })
      .then((result) => setUsers(result.data || []))
      .catch(() => setUsers(currentUser ? [currentUser] : []));
  }, [addNotification, currentUser]);

  const handleCreate = async (payload: CreateRetrospectivePayload) => {
    if (createInFlightRef.current) return;
    createInFlightRef.current = true;
    setCreating(true);
    try {
      const detail = await createRetrospective(payload);
      addNotification({ title: '复盘已创建', message: '正在进入详情页', type: 'success' });
      setCreateOpen(false);
      navigate(`/retrospectives/${detail.retrospective.id}`);
    } catch (error) {
      addNotification({ title: '创建复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      createInFlightRef.current = false;
      setCreating(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="复盘中心"
        description="复盘团队工作结果，跟进行动项。"
        actions={
          <div className="flex flex-wrap gap-3">
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
        actions={actionsOwnerId === currentUserId ? myActions : []}
        loading={loadingMyActions || actionsOwnerId !== currentUserId}
        error={actionsOwnerId === currentUserId ? myActionsError : null}
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
            className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
          <ActionButton onClick={loadList} disabled={loading}>应用筛选</ActionButton>
        </div>
      </GlassPanel>

      <RetroList
        retrospectives={listOwnerId === currentUserId ? retrospectives : []}
        loading={loading || listOwnerId !== currentUserId}
        error={listOwnerId === currentUserId ? listError : null}
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Download, FileText, RefreshCw, UserRound } from 'lucide-react';
import {
  archiveRetrospective,
  createRetroAction,
  exportRetrospective,
  generateRetroSnapshot,
  getRetroDailyRisks,
  getRetrospectiveDetail,
  publishRetrospective,
  updateRetroAction,
  updateRetrospective,
  type CreateRetroActionPayload,
  type RetroAction,
  type RetroDailyRiskItem,
  type RetrospectiveDetail,
  type UpdateRetroActionPayload,
} from '../api/retrospectives';
import { getUsers } from '../api/users';
import type { User } from '../types';
import { useAppStore, useAuthStore } from '../store';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import RetroStatusPill from '../components/retrospectives/RetroStatusPill';
import RetroMetricSnapshotPanel from '../components/retrospectives/RetroMetricSnapshotPanel';
import RetroSummaryEditor from '../components/retrospectives/RetroSummaryEditor';
import RetroPublishPanel from '../components/retrospectives/RetroPublishPanel';
import RetroActionTable from '../components/retrospectives/RetroActionTable';
import RetroActionDetailDrawer from '../components/retrospectives/RetroActionDetailDrawer';
import RetroDailyRiskPanel from '../components/retrospectives/RetroDailyRiskPanel';
import {
  formatDate,
  formatDateTime,
  retroCategoryLabels,
  retroScopeLabels,
  toFriendlyRetroError,
} from '../components/retrospectives/retroLabels';

function downloadTextFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function RetrospectiveDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.addNotification);
  const currentUser = useAuthStore((state) => state.user);
  const retroId = Number(params.id);
  const currentRetroIdRef = useRef(retroId);
  currentRetroIdRef.current = retroId;

  const [detail, setDetail] = useState<RetrospectiveDetail | null>(null);
  const [summary, setSummary] = useState('');
  const summaryBaselineRef = useRef({ retroId: 0, value: '' });
  const [summaryActionError, setSummaryActionError] = useState<string | null>(null);
  const [dailyRisks, setDailyRisks] = useState<RetroDailyRiskItem[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dailyRisksError, setDailyRisksError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<RetroAction | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRisks, setLoadingRisks] = useState(false);
  const [working, setWorking] = useState(false);
  const mutationInFlightRef = useRef(false);
  const detailRequestSequenceRef = useRef(0);
  const risksRequestSequenceRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const summaryIsDirty = Boolean(detail && summary !== (detail.retrospective.summaryMd || ''));

  useEffect(() => {
    if (!summaryIsDirty && !working) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [summaryIsDirty, working]);

  const handleReturnToList = () => {
    if (mutationInFlightRef.current) return;
    if (summaryIsDirty && !window.confirm('本页还有未保存的复盘结论，离开后这些修改可能无法恢复。请取消并先保存；当前已只读时请先复制保留。是否放弃未保存修改并返回列表？')) return;
    navigate('/retrospectives');
  };

  const applySummary = useCallback((next: RetrospectiveDetail, submittedSummary?: string) => {
    const previous = summaryBaselineRef.current;
    const nextValue = next.retrospective.summaryMd || '';
    const expectedValue = submittedSummary ?? previous.value;
    summaryBaselineRef.current = { retroId: next.retrospective.id, value: nextValue };
    setSummary((current) => previous.retroId !== next.retrospective.id || current === expectedValue ? nextValue : current);
  }, []);

  const beginMutation = () => {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    setWorking(true);
    return true;
  };

  const endMutation = () => {
    mutationInFlightRef.current = false;
    setWorking(false);
  };

  const loadDailyRisks = useCallback(async () => {
    if (!Number.isInteger(retroId) || retroId <= 0) return;
    const requestId = ++risksRequestSequenceRef.current;
    setLoadingRisks(true);
    setDailyRisksError(null);
    try {
      const result = await getRetroDailyRisks(retroId);
      if (requestId !== risksRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDailyRisks(result.risks);
    } catch (error) {
      if (requestId !== risksRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDailyRisksError(toFriendlyRetroError(error));
    } finally {
      if (requestId === risksRequestSequenceRef.current) setLoadingRisks(false);
    }
  }, [retroId]);

  const loadDetail = useCallback(async () => {
    if (!Number.isInteger(retroId) || retroId <= 0) {
      navigate('/retrospectives');
      return;
    }
    const requestId = ++detailRequestSequenceRef.current;
    setLoading(true);
    setDetailError(null);
    try {
      const result = await getRetrospectiveDetail(retroId);
      if (requestId !== detailRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDetail(result);
      applySummary(result);
    } catch (error) {
      if (requestId !== detailRequestSequenceRef.current || currentRetroIdRef.current !== retroId) return;
      setDetailError(toFriendlyRetroError(error));
    } finally {
      if (requestId === detailRequestSequenceRef.current && currentRetroIdRef.current === retroId) setLoading(false);
    }
  }, [applySummary, navigate, retroId]);

  useEffect(() => {
    setDailyRisks([]);
    setDailyRisksError(null);
    void loadDetail();
    void loadDailyRisks();
    return () => {
      detailRequestSequenceRef.current += 1;
      risksRequestSequenceRef.current += 1;
    };
  }, [loadDetail, loadDailyRisks]);

  useEffect(() => {
    getUsers({ page: 1, limit: 200 })
      .then((result) => setUsers(result.data || []))
      .catch(() => setUsers(currentUser ? [currentUser] : []));
  }, [currentUser]);

  const applyDetail = (next: RetrospectiveDetail, submittedSummary?: string) => {
    if (next.retrospective.id !== currentRetroIdRef.current) return;
    setDetail(next);
    applySummary(next, submittedSummary);
    setSelectedAction((current) => {
      if (!current) return null;
      return next.actions.find((action) => action.id === current.id) || null;
    });
  };

  const handleGenerateSnapshot = async () => {
    if (!detail) return;
    if (detail.snapshots.length > 0) {
      const confirmed = window.confirm('刷新快照会替换当前复盘的旧快照，是否继续？');
      if (!confirmed) return;
    }
    if (!beginMutation()) return;
    try {
      applyDetail(await generateRetroSnapshot(detail.retrospective.id, { mode: 'replace' }));
      addNotification({ title: '指标快照已更新', message: '已读取 XMT 系统内部数据', type: 'success' });
    } catch (error) {
      addNotification({ title: '生成快照失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      endMutation();
    }
  };

  const handleSaveSummary = async () => {
    if (!detail || !beginMutation()) return;
    const submittedSummary = summary;
    setSaving(true);
    try {
      applyDetail(await updateRetrospective(detail.retrospective.id, {
        title: detail.retrospective.title,
        summaryMd: submittedSummary,
        version: detail.retrospective.version,
      }), submittedSummary);
      setSummaryActionError(null);
      addNotification({ title: '复盘结论已保存', message: '详情已刷新', type: 'success' });
    } catch (error) {
      addNotification({ title: '保存结论失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      setSaving(false);
      endMutation();
    }
  };

  const handlePublish = async () => {
    if (!detail) return;
    if (summary !== (detail.retrospective.summaryMd || '')) {
      setSummaryActionError('还有尚未保存的复盘结论，请先点击“保存结论”，再发布复盘。');
      return;
    }
    const confirmed = window.confirm('发布后基础信息和指标快照将只读，是否继续？');
    if (!confirmed) return;
    if (!beginMutation()) return;
    try {
      applyDetail(await publishRetrospective(detail.retrospective.id));
      addNotification({ title: '复盘已发布', message: '可进入归档前观察和行动项跟进', type: 'success' });
    } catch (error) {
      addNotification({ title: '发布复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      endMutation();
    }
  };

  const handleArchive = async () => {
    if (!detail) return;
    if (summary !== (detail.retrospective.summaryMd || '')) {
      setSummaryActionError(detail.retrospective.status === 'draft' && detail.permissions.canEdit
        ? '还有尚未保存的复盘结论，请先点击“保存结论”，再归档复盘。'
        : '还有尚未保存的复盘结论，当前复盘已只读。请先复制保留本页文字，再确认使用已保存结论后归档。');
      return;
    }
    const confirmed = window.confirm('归档后复盘进入只读，不再允许新增行动项，是否继续？');
    if (!confirmed) return;
    if (!beginMutation()) return;
    try {
      applyDetail(await archiveRetrospective(detail.retrospective.id));
      addNotification({ title: '复盘已归档', message: '详情已刷新为只读状态', type: 'success' });
    } catch (error) {
      addNotification({ title: '归档复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      endMutation();
    }
  };

  const handleCreateAction = async (payload: CreateRetroActionPayload) => {
    if (!detail || !beginMutation()) return false;
    try {
      applyDetail(await createRetroAction(detail.retrospective.id, payload));
      addNotification({ title: '行动项已创建', message: '行动项列表已刷新', type: 'success' });
      return true;
    } catch (error) {
      addNotification({ title: '创建行动项失败', message: toFriendlyRetroError(error), type: 'error' });
      return false;
    } finally {
      endMutation();
    }
  };

  const handleUpdateAction = async (actionId: number, payload: UpdateRetroActionPayload) => {
    if (!detail || !beginMutation()) return false;
    try {
      applyDetail(await updateRetroAction(actionId, payload));
      addNotification({ title: '行动项已更新', message: '状态和结果已刷新', type: 'success' });
      return true;
    } catch (error) {
      addNotification({ title: '更新行动项失败', message: toFriendlyRetroError(error), type: 'error' });
      return false;
    } finally {
      endMutation();
    }
  };

  const handleExport = async (type: 'markdown' | 'html') => {
    if (!detail) return;
    setExporting(true);
    try {
      const result = await exportRetrospective(detail.retrospective.id, type);
      if (type === 'html') {
        const blob = new Blob([result.content], { type: result.contentType });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        downloadTextFile(result.filename, result.content, result.contentType);
      }
      addNotification({ title: '复盘导出已生成', message: type === 'html' ? '已打开 HTML 打印页' : '已下载 Markdown 文件', type: 'success' });
    } catch (error) {
      addNotification({ title: '导出复盘失败', message: toFriendlyRetroError(error), type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  if (loading || (detail && detail.retrospective.id !== retroId)) {
    return (
      <PageShell>
        <GlassPanel className="flex h-72 items-center justify-center p-8 text-studio-text-muted">
          正在加载复盘详情...
        </GlassPanel>
      </PageShell>
    );
  }

  if (!detail) {
    return (
      <PageShell>
        <GlassPanel className="p-8 text-center">
          {detailError ? (
            <div role="alert" className="space-y-3">
              <p className="text-studio-text-primary">复盘详情暂不可用：{detailError}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <ActionButton variant="primary" onClick={() => void loadDetail()}>重新加载详情</ActionButton>
                <ActionButton onClick={() => navigate('/retrospectives')}>返回复盘列表</ActionButton>
              </div>
            </div>
          ) : (
            <>
              <p className="text-studio-text-primary">复盘不存在或当前账号不可访问。</p>
              <ActionButton className="mt-4" onClick={() => navigate('/retrospectives')}>返回列表</ActionButton>
            </>
          )}
        </GlassPanel>
      </PageShell>
    );
  }

  const { retrospective, template, snapshots, actions, permissions } = detail;
  const categoryLabel = retrospective.templateCategory ? retroCategoryLabels[retrospective.templateCategory] : '-';
  const canEditSummary = retrospective.status === 'draft' && permissions.canEdit;

  return (
    <PageShell>
      <PageHeader
        title={retrospective.title}
        description="结论 + 快照 + 行动项的复盘闭环页。"
        actions={
          <div className="flex flex-wrap gap-3">
            <ActionButton variant="ghost" onClick={handleReturnToList} disabled={working}><ArrowLeft className="h-4 w-4" />返回列表</ActionButton>
            <ActionButton onClick={() => handleExport('markdown')} disabled={exporting}>
              <Download className="h-4 w-4" />
              导出 Markdown
            </ActionButton>
            <ActionButton onClick={() => handleExport('html')} disabled={exporting}>
              <FileText className="h-4 w-4" />
              打印页
            </ActionButton>
            <ActionButton onClick={loadDetail} disabled={loading || working}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </ActionButton>
          </div>
        }
      />

      {detailError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p>详情刷新失败，仍显示最近一次成功读取的内容：{detailError}</p>
          <ActionButton variant="ghost" onClick={() => void loadDetail()} disabled={loading || working}>重新加载详情</ActionButton>
        </div>
      ) : null}

      <GlassPanel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <RetroStatusPill status={retrospective.status} />
              <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-muted">{categoryLabel}</span>
              <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-muted">
                {retroScopeLabels[retrospective.scopeType]}
              </span>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-studio-text-secondary">
              <CalendarDays className="h-4 w-4" />
              {formatDate(retrospective.periodStart)} 至 {formatDate(retrospective.periodEnd)}
            </p>
          </div>
          <div className="grid gap-3 text-sm text-studio-text-muted sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="block text-xs">负责人</span><strong className="text-studio-text-primary">{retrospective.ownerName || '-'}</strong></div>
            <div><span className="block text-xs">创建人</span><strong className="text-studio-text-primary">{retrospective.creatorName || '-'}</strong></div>
            <div><span className="block text-xs">更新时间</span><strong className="text-studio-text-primary">{formatDateTime(retrospective.updatedAt)}</strong></div>
            <div><span className="block text-xs">版本</span><strong className="text-studio-text-primary">v{retrospective.version}</strong></div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
            <p className="text-xs text-studio-text-muted">模板</p>
            <p className="mt-1 font-semibold text-studio-text-primary">{template?.name || retrospective.templateName || '-'}</p>
          </div>
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
            <p className="text-xs text-studio-text-muted">快照指标</p>
            <p className="mt-1 font-semibold text-studio-text-primary">{snapshots.length} 项</p>
          </div>
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4">
            <p className="text-xs text-studio-text-muted">行动项</p>
            <p className="mt-1 flex items-center gap-2 font-semibold text-studio-text-primary">
              <UserRound className="h-4 w-4" />
              {actions.length} 项
            </p>
          </div>
        </div>
      </GlassPanel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <RetroMetricSnapshotPanel
            snapshots={snapshots}
            status={retrospective.status}
            canGenerate={permissions.canEdit}
            loading={working}
            onGenerate={handleGenerateSnapshot}
          />
          {summaryActionError && summaryIsDirty ? (
            <div role="alert" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary">
              {summaryActionError}
            </div>
          ) : null}
          {summaryIsDirty && canEditSummary ? (
            <p role="status" className="text-sm text-studio-text-secondary">复盘结论有未保存的修改，完成后请点击“保存结论”。</p>
          ) : null}
          {summaryIsDirty && !canEditSummary ? (
            <div role="alert" className="space-y-3 rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary">
              <p>当前复盘已只读，仍保留本页未保存的结论修改。请先复制保留下面的文字，再核对已保存结论。</p>
              <ActionButton onClick={() => {
                if (!window.confirm('确认使用已保存结论？这会替换本页尚未保存的结论修改，请先复制保留需要的文字。')) return;
                setSummary(retrospective.summaryMd || '');
                setSummaryActionError(null);
              }}>使用已保存结论</ActionButton>
            </div>
          ) : null}
          <RetroSummaryEditor
            value={summary}
            status={retrospective.status}
            canEdit={permissions.canEdit}
            saving={saving}
            locked={working}
            onChange={setSummary}
            onSave={handleSaveSummary}
          />
          <RetroDailyRiskPanel
            risks={dailyRisks}
            users={users}
            status={retrospective.status}
            canManageActions={permissions.canManageActions}
            loading={loadingRisks || working}
            error={dailyRisksError}
            onRefresh={() => void loadDailyRisks()}
            onCreateAction={handleCreateAction}
          />
          <RetroActionTable
            actions={actions}
            users={users}
            status={retrospective.status}
            currentUserId={currentUser?.id}
            canManageActions={permissions.canManageActions}
            loading={working}
            onCreate={handleCreateAction}
            onUpdate={handleUpdateAction}
            onOpenDetail={setSelectedAction}
          />
        </div>
        <div className="min-w-0 space-y-5">
          <RetroPublishPanel
            retrospective={retrospective}
            permissions={permissions}
            loading={working}
            onPublish={handlePublish}
            onArchive={handleArchive}
          />
          <GlassPanel className="p-5">
            <h2 className="text-lg font-bold text-studio-text-primary">权限状态</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-studio-text-muted">可编辑</dt><dd className="text-studio-text-primary">{permissions.canEdit ? '是' : '否'}</dd></div>
              <div className="flex justify-between"><dt className="text-studio-text-muted">可发布</dt><dd className="text-studio-text-primary">{permissions.canPublish ? '是' : '否'}</dd></div>
              <div className="flex justify-between"><dt className="text-studio-text-muted">可归档</dt><dd className="text-studio-text-primary">{permissions.canArchive ? '是' : '否'}</dd></div>
              <div className="flex justify-between"><dt className="text-studio-text-muted">行动项管理</dt><dd className="text-studio-text-primary">{permissions.canManageActions ? '是' : '否'}</dd></div>
            </dl>
          </GlassPanel>
        </div>
      </div>

      <RetroActionDetailDrawer
        action={selectedAction}
        users={users}
        currentUserId={currentUser?.id}
        canManageActions={permissions.canManageActions}
        loading={working}
        onClose={() => setSelectedAction(null)}
        onUpdate={handleUpdateAction}
      />
    </PageShell>
  );
}

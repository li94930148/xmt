import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileClock, RefreshCw, Users } from 'lucide-react';
import {
  generateDailyReportDraft,
  getDailyReportArchive,
  getMyDailyReport,
  getTeamDailyReports,
  reviewDailyReport,
  saveDailyReportDraft,
  submitDailyReport,
  type DailyReport,
  type DailyReportItem,
  type DailyReportRiskLevel,
  type DailyReportStatus,
  type GenerateDraftResponse,
} from '../api/dailyReports';
import { useAppStore, useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import DailyReportComposer from '../components/daily-report/DailyReportComposer';
import DailyReportAutoDraftPanel from '../components/daily-report/DailyReportAutoDraftPanel';
import DailyReportTeamBoard from '../components/daily-report/DailyReportTeamBoard';
import DailyReportArchiveList from '../components/daily-report/DailyReportArchiveList';
import DailyReportReviewDialog from '../components/daily-report/DailyReportReviewDialog';
import DailyReportDetailDrawer from '../components/daily-report/DailyReportDetailDrawer';
import { getUsers } from '../api/users';
import type { User } from '../types';

type TabKey = 'mine' | 'team' | 'archive';

const sections = [
  { key: 'done', title: '今日完成' },
  { key: 'progress', title: '关键数据' },
  { key: 'risk', title: '风险/阻塞' },
  { key: 'tomorrow', title: '明日计划' },
  { key: 'collaboration', title: '需要协作' },
  { key: 'notes', title: '备注' },
];

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function toFriendlyError(error: unknown) {
  const err = error as Error & { status?: number; code?: string };
  if (err.status === 401) return '登录已失效，请重新登录';
  if (err.status === 403) return '当前账号没有权限访问此功能';
  if (err.status === 404) return '日报不存在';
  if (err.status === 409) return '日报已被更新，请刷新后再编辑';
  if (err.status === 400) return err.message || '请求参数不正确';
  return err.message || '网络或服务异常，请稍后重试';
}

function normalizeItems(report: DailyReport | null) {
  const existing = report?.items || [];
  return sections.map((section, index) => {
    const item = existing.find((entry) => entry.sectionKey === section.key);
    return {
      id: item?.id,
      sectionKey: section.key,
      title: section.title,
      contentMd: item?.contentMd || '',
      sortOrder: index,
      sourceType: item?.sourceType,
      sourceId: item?.sourceId,
      meta: item?.meta,
    };
  });
}

function hasContent(summary: string, items: DailyReportItem[]) {
  return summary.trim().length > 0 || items.some((item) => item.contentMd.trim().length > 0);
}

function getSuggestionKey(item: DailyReportItem) {
  const sourceType = item.sourceType || 'unknown';
  const identity = item.sourceId === undefined || item.sourceId === null ? item.title || item.contentMd.slice(0, 80) : item.sourceId;
  return `${sourceType}:${identity}:${item.sectionKey}`;
}

function daysBetween(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00+08:00`).getTime();
  const endTime = new Date(`${end}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
    return null;
  }
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

export default function DailyReportPage() {
  const appStore = useAppStore();
  const user = useAuthStore((state) => state.user);
  const { hasPermission } = usePermission();
  const canManageDailyReport =
    user?.role === 'admin' ||
    user?.role === 'director' ||
    hasPermission('report:daily:view_team') ||
    hasPermission('report:daily:review');
  const canFilterArchiveUser =
    user?.role === 'admin' ||
    user?.role === 'director' ||
    hasPermission('report:daily:archive');

  const [activeTab, setActiveTab] = useState<TabKey>('mine');
  const [reportDate, setReportDate] = useState(today());
  const [myReport, setMyReport] = useState<DailyReport | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(normalizeItems(null));
  const [manualSummary, setManualSummary] = useState('');
  const [riskLevel, setRiskLevel] = useState<DailyReportRiskLevel>('normal');
  const [loadingMine, setLoadingMine] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoDraftLoading, setAutoDraftLoading] = useState(false);
  const [autoDraft, setAutoDraft] = useState<GenerateDraftResponse | null>(null);
  const [importedSuggestionKeys, setImportedSuggestionKeys] = useState<string[]>([]);

  const [teamDate, setTeamDate] = useState(today());
  const [teamStatus, setTeamStatus] = useState<DailyReportStatus | 'all'>('submitted');
  const [teamReports, setTeamReports] = useState<DailyReport[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [reviewTarget, setReviewTarget] = useState<DailyReport | null>(null);
  const [detailTarget, setDetailTarget] = useState<DailyReport | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [archiveStart, setArchiveStart] = useState(daysAgo(6));
  const [archiveEnd, setArchiveEnd] = useState(today());
  const [archiveReports, setArchiveReports] = useState<DailyReport[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveUserId, setArchiveUserId] = useState('');
  const [archiveUsers, setArchiveUsers] = useState<User[]>([]);

  const tabs = useMemo(
    () => [
      { key: 'mine' as const, label: '我的日报', icon: FileClock, visible: true },
      { key: 'team' as const, label: '团队日报', icon: Users, visible: canManageDailyReport },
      { key: 'archive' as const, label: '日报归档', icon: CalendarDays, visible: true },
    ],
    [canManageDailyReport],
  );

  const loadMyReport = useCallback(async () => {
    setLoadingMine(true);
    try {
      const result = await getMyDailyReport(reportDate);
      setMyReport(result.report);
      setManualSummary(result.report?.manualSummaryMd || '');
      setRiskLevel(result.report?.riskLevel || 'normal');
      setItems(normalizeItems(result.report));
    } catch (error) {
      appStore.addNotification({ title: '加载日报失败', message: toFriendlyError(error), type: 'error' });
    } finally {
      setLoadingMine(false);
    }
  }, [appStore, reportDate]);

  const loadTeamReports = useCallback(async () => {
    if (!canManageDailyReport) {
      setTeamError('当前账号没有团队日报权限');
      return;
    }
    setTeamLoading(true);
    setTeamError('');
    try {
      const result = await getTeamDailyReports({ date: teamDate, status: teamStatus });
      setTeamReports(result.reports);
    } catch (error) {
      setTeamReports([]);
      setTeamError(toFriendlyError(error));
    } finally {
      setTeamLoading(false);
    }
  }, [canManageDailyReport, teamDate, teamStatus]);

  const loadArchive = useCallback(async () => {
    const rangeDays = daysBetween(archiveStart, archiveEnd);
    if (!rangeDays) {
      appStore.addNotification({ title: 'Archive query failed', message: 'Archive date range is invalid.', type: 'warning' });
      return;
    }
    if (rangeDays > 31) {
      appStore.addNotification({ title: 'Archive query failed', message: 'Archive range cannot exceed 31 days.', type: 'warning' });
      return;
    }
    setArchiveLoading(true);
    try {
      const userId = canFilterArchiveUser && archiveUserId ? Number(archiveUserId) : undefined;
      const result = await getDailyReportArchive({ start: archiveStart, end: archiveEnd, userId });
      setArchiveReports(result.reports.filter(Boolean));
    } catch (error) {
      appStore.addNotification({ title: '加载归档失败', message: toFriendlyError(error), type: 'error' });
      setArchiveReports([]);
    } finally {
      setArchiveLoading(false);
    }
  }, [appStore, archiveEnd, archiveStart, archiveUserId, canFilterArchiveUser]);

  useEffect(() => {
    void loadMyReport();
  }, [loadMyReport]);

  useEffect(() => {
    setAutoDraft(null);
    setImportedSuggestionKeys([]);
  }, [reportDate]);

  useEffect(() => {
    if (activeTab === 'team') void loadTeamReports();
    if (activeTab === 'archive') void loadArchive();
  }, [activeTab, loadArchive, loadTeamReports]);

  useEffect(() => {
    if (!canFilterArchiveUser) {
      setArchiveUsers([]);
      setArchiveUserId('');
      return;
    }
    getUsers({ page: 1, limit: 200 })
      .then((result) => setArchiveUsers(result.data || []))
      .catch(() => setArchiveUsers([]));
  }, [canFilterArchiveUser]);

  const handleCreateDraft = () => {
    setMyReport(null);
    setManualSummary('');
    setRiskLevel('normal');
    setItems(normalizeItems(null));
    setImportedSuggestionKeys([]);
  };

  const handleGenerateDraft = async () => {
    setAutoDraftLoading(true);
    try {
      const result = await generateDailyReportDraft({ date: reportDate });
      setAutoDraft(result);
      appStore.addNotification({ title: '自动草稿已生成', message: result.message, type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '自动草稿失败', message: toFriendlyError(error), type: 'error' });
    } finally {
      setAutoDraftLoading(false);
    }
  };

  const handleApplyAutoDraft = (suggestions: DailyReportItem[]) => {
    const freshSuggestions = suggestions.filter((suggestion) => !importedSuggestionKeys.includes(getSuggestionKey(suggestion)));
    if (freshSuggestions.length === 0) {
      appStore.addNotification({ title: '自动草稿', message: '选中的记录已经导入过。', type: 'info' });
      return;
    }
    const nextItems = [...items];
    for (const suggestion of freshSuggestions) {
      const targetIndex = nextItems.findIndex((item) => item.sectionKey === suggestion.sectionKey);
      const addition = [suggestion.title, suggestion.contentMd].filter(Boolean).join('\n');
      if (targetIndex >= 0) {
        const current = nextItems[targetIndex].contentMd.trim();
        nextItems[targetIndex] = {
          ...nextItems[targetIndex],
          contentMd: current ? `${current}\n\n${addition}` : addition,
        };
      }
    }
    setItems(nextItems);
    setImportedSuggestionKeys((current) => Array.from(new Set([...current, ...freshSuggestions.map(getSuggestionKey)])));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveDailyReportDraft({
        reportDate,
        version: myReport?.version,
        manualSummaryMd: manualSummary,
        riskLevel,
        items,
      });
      setMyReport(saved);
      setItems(normalizeItems(saved));
      appStore.addNotification({ title: '草稿已保存', message: `版本 ${saved.version}`, type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '保存失败', message: toFriendlyError(error), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!hasContent(manualSummary, items)) {
      appStore.addNotification({ title: '无法提交', message: '请至少填写一个分段或手动总结', type: 'warning' });
      return;
    }
    if (!myReport?.id) {
      setSubmitting(true);
      try {
        const saved = await saveDailyReportDraft({
          reportDate,
          manualSummaryMd: manualSummary,
          riskLevel,
          items,
        });
        const submitted = await submitDailyReport(saved.id);
        setMyReport(submitted);
        setItems(normalizeItems(submitted));
        appStore.addNotification({ title: '日报已提交', message: '已自动保存草稿并提交', type: 'success' });
      } catch (error) {
        appStore.addNotification({ title: '提交失败', message: toFriendlyError(error), type: 'error' });
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmitting(true);
    try {
      const submitted = await submitDailyReport(myReport.id);
      setMyReport(submitted);
      setItems(normalizeItems(submitted));
      appStore.addNotification({ title: '日报已提交', message: '等待审核', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '提交失败', message: toFriendlyError(error), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (action: 'approve' | 'reject', comment: string) => {
    if (!reviewTarget) return;
    setReviewLoading(true);
    try {
      await reviewDailyReport(reviewTarget.id, { action, comment });
      setReviewTarget(null);
      appStore.addNotification({ title: action === 'approve' ? '已审核通过' : '已退回修改', message: '团队日报列表已刷新', type: 'success' });
      await loadTeamReports();
    } catch (error) {
      appStore.addNotification({ title: '审核失败', message: toFriendlyError(error), type: 'error' });
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="日报归档"
        description="提交个人日报、查看归档，管理者可查看和审核团队日报。"
        actions={
          <ActionButton onClick={() => activeTab === 'mine' ? void loadMyReport() : activeTab === 'team' ? void loadTeamReports() : void loadArchive()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </ActionButton>
        }
      />

      <GlassPanel className="p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.filter((tab) => tab.visible).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-button px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-studio-primary text-white shadow-glow-primary'
                    : 'text-studio-text-secondary hover:bg-white/[0.06] hover:text-studio-text-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </GlassPanel>

      {activeTab === 'mine' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="text-sm text-studio-text-muted">日报日期</p>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(event) => setReportDate(event.target.value)}
                  className="mt-2 rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
                />
              </div>
              <p className="text-sm text-studio-text-muted">
                {loadingMine ? '加载中...' : myReport ? '已加载当前日期日报' : '当前日期还没有日报，可直接新建或生成草稿。'}
              </p>
            </GlassPanel>

            <DailyReportComposer
              reportId={myReport?.id}
              status={myReport?.status || 'draft'}
              version={myReport?.version}
              updatedAt={myReport?.updatedAt}
              submittedAt={myReport?.submittedAt}
              reviewComment={myReport?.reviewComment}
              sections={sections}
              items={items}
              manualSummary={manualSummary}
              riskLevel={riskLevel}
              saving={saving}
              submitting={submitting}
              onItemsChange={setItems}
              onSummaryChange={setManualSummary}
              onRiskChange={setRiskLevel}
              onSave={handleSave}
              onSubmit={handleSubmit}
              onCreateDraft={handleCreateDraft}
            />
          </div>

          <DailyReportAutoDraftPanel
            loading={autoDraftLoading}
            result={autoDraft}
            importedKeys={importedSuggestionKeys}
            getSuggestionKey={getSuggestionKey}
            onGenerate={handleGenerateDraft}
            onApply={handleApplyAutoDraft}
          />
        </div>
      ) : null}

      {activeTab === 'team' ? (
        <DailyReportTeamBoard
          date={teamDate}
          status={teamStatus}
          reports={teamReports}
          loading={teamLoading}
          error={teamError}
          onDateChange={setTeamDate}
          onStatusChange={setTeamStatus}
          onRefresh={loadTeamReports}
          onView={setDetailTarget}
          onReview={setReviewTarget}
        />
      ) : null}

      {activeTab === 'archive' ? (
        <DailyReportArchiveList
          start={archiveStart}
          end={archiveEnd}
          reports={archiveReports}
          loading={archiveLoading}
          canFilterUser={canFilterArchiveUser}
          users={archiveUsers}
          selectedUserId={archiveUserId}
          onStartChange={setArchiveStart}
          onEndChange={setArchiveEnd}
          onUserChange={setArchiveUserId}
          onSearch={loadArchive}
          onView={setDetailTarget}
        />
      ) : null}

      <DailyReportDetailDrawer
        report={detailTarget}
        sections={sections}
        canReview={canManageDailyReport}
        onClose={() => setDetailTarget(null)}
        onReview={(report) => {
          setReviewTarget(report);
          setDetailTarget(null);
        }}
      />

      <DailyReportReviewDialog
        report={reviewTarget}
        loading={reviewLoading}
        onClose={() => setReviewTarget(null)}
        onReview={handleReview}
      />
    </PageShell>
  );
}

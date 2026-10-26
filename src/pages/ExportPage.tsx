import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Download, FileBarChart, FileClock, Loader2 } from 'lucide-react';
import { exportAnalytics, exportTopics } from '../api';
import DataExport from '../components/DataExport';
import WeeklyReport from '../components/WeeklyReport';
import { useAppStore } from '../store';
import { getCurrentBeijingDateString } from '../lib/utils';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import { usePermission } from '../hooks/usePermission';

type ReportTab = 'daily' | 'weekly' | 'export';

export default function ExportPage() {
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const [activeTab, setActiveTab] = useState<ReportTab>('weekly');
  const [loading, setLoading] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const exportInFlightRef = useRef(false);
  const dailyLinks = [
    { label: '填写个人日报', path: '/daily-report', visible: hasPermission('report:daily:submit') },
    { label: '查看团队日报', path: '/daily-report/team', visible: hasPermission('report:daily:view_team') },
    { label: '打开总结归档', path: '/daily-report/summary', visible: hasPermission('report:daily:archive') || hasPermission('report:daily:submit') },
  ].filter((item) => !permissionsLoading && item.visible);
  const displayedTab = activeTab === 'daily' && dailyLinks.length === 0 ? 'weekly' : activeTab;

  const handleExport = async (type: 'topics' | 'analytics') => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setLoading(type);
    setExportFeedback(null);
    try {
      const data = type === 'topics' ? await exportTopics() : await exportAnalytics();
      const filename = `${type === 'topics' ? '选题数据' : '数据分析'}_${getCurrentBeijingDateString()}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setExportFeedback({ kind: 'success', message: `${filename} 已开始下载。` });
      addNotification({ title: '文件已生成', message: `${filename} 已开始下载。`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '数据导出暂时失败，请检查连接后重试。';
      setExportFeedback({ kind: 'error', message });
      addNotification({ title: '导出失败', message, type: 'error' });
    } finally {
      exportInFlightRef.current = false;
      setLoading(null);
    }
  };

  const tabs = [
    { id: 'daily' as const, label: '日报', icon: FileClock },
    { id: 'weekly' as const, label: '周报', icon: FileBarChart },
    { id: 'export' as const, label: '导出', icon: Download },
  ];

  return (
    <PageShell>
      <PageHeader title="报告中心" description="统一查看周报与数据导出；日报和周期总结沿用既有工作流。" />

      <GlassPanel className="p-2">
        <div className="grid gap-2 sm:grid-cols-3">
          {tabs.filter((tab) => tab.id !== 'daily' || dailyLinks.length > 0).map((tab) => {
            const Icon = tab.icon;
            const isActive = displayedTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-button px-4 py-3 text-sm font-semibold leading-snug transition-all duration-200 ${
                  isActive
                    ? 'bg-studio-primary-button text-white shadow-glow-primary'
                    : 'text-studio-text-secondary hover:bg-studio-surface-soft hover:text-studio-text-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </GlassPanel>

      {displayedTab === 'daily' ? (
        <GlassPanel className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-studio-text-primary">日报</h2>
              <p className="mt-1 text-sm text-studio-text-secondary">填写日报，查看有权限访问的团队日报和总结归档。</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dailyLinks.map((item) => (
              <Link key={item.path} to={item.path} className="rounded-card border border-studio-border-soft bg-studio-surface-soft px-4 py-4 text-sm font-medium text-studio-text-primary transition hover:border-studio-border-active hover:bg-studio-surface-elevated">
                {item.label}
              </Link>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      {displayedTab === 'weekly' ? <WeeklyReport /> : null}

      {displayedTab === 'export' ? (
        <div className="space-y-5">
          <DataExport />
          <h2 className="text-base font-semibold text-studio-text-primary">JSON 数据文件</h2>
          {exportFeedback ? (
            <p
              role={exportFeedback.kind === 'error' ? 'alert' : 'status'}
              className={`rounded-xl border px-4 py-3 text-sm ${exportFeedback.kind === 'error' ? 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast' : 'border-studio-success/25 bg-studio-success/10 text-studio-success-contrast'}`}
            >
              {exportFeedback.kind === 'error' ? '导出失败：' : ''}{exportFeedback.message}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
          {[
            { id: 'topics' as const, title: '选题数据文件', description: '下载选题明细与统计信息（JSON）。', icon: FileBarChart },
            { id: 'analytics' as const, title: '分析汇总文件', description: '下载选题状态、成员活动、每日趋势和平台分布（JSON）。', icon: BarChart3 },
          ].map((card) => {
            const Icon = card.icon;
            const isLoading = loading === card.id;
            return (
              <GlassPanel key={card.id} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-studio-primary/15 text-studio-cyan-contrast">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-studio-text-primary">{card.title}</h3>
                    <p className="mt-1 text-sm text-studio-text-secondary">{card.description}</p>
                    <ActionButton type="button" onClick={() => void handleExport(card.id)} disabled={loading !== null} className="mt-4">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {isLoading ? '导出中...' : '导出 JSON'}
                    </ActionButton>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

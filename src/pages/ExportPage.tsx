import { useEffect, useState } from 'react';
import { BarChart3, Download, FileBarChart, FileClock, Loader2, CalendarRange } from 'lucide-react';
import { exportAnalytics, exportTopics, getWeeklyReport } from '../api';
import { useAppStore } from '../store';
import { getCurrentBeijingDateString } from '../lib/utils';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell, StatusPill } from '../components/studio';

type ReportTab = 'daily' | 'weekly' | 'monthly' | 'export';

type WeeklyReport = {
  period?: { start: string; end: string };
  summary?: {
    completedTopics?: number;
    publishedVideos?: number;
    newTopics?: number;
    totalViews?: number;
  };
};

export default function ExportPage() {
  const appStore = useAppStore();
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');
  const [loading, setLoading] = useState<string | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    getWeeklyReport()
      .then((report) => setWeeklyReport(report as WeeklyReport))
      .catch(() => {})
      .finally(() => setReportLoading(false));
  }, []);

  const handleExport = async (type: 'topics' | 'analytics') => {
    setLoading(type);
    try {
      const data = type === 'topics' ? await exportTopics() : await exportAnalytics();
      const filename = `${type === 'topics' ? '选题数据' : '数据分析'}_${getCurrentBeijingDateString()}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      appStore.addNotification({ title: '导出成功', message: `${filename} 已下载`, type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '导出失败', message: (error as Error).message, type: 'error' });
    } finally {
      setLoading(null);
    }
  };

  const tabs = [
    { id: 'daily' as const, label: '日报', icon: FileClock },
    { id: 'weekly' as const, label: '周报', icon: FileBarChart },
    { id: 'monthly' as const, label: '月报', icon: CalendarRange },
    { id: 'export' as const, label: '导出', icon: Download },
  ];

  return (
    <PageShell>
      <PageHeader title="报告中心" description="统一承载日报、周报、月报与数据导出。本阶段先完成入口和视觉预留。" />

      <GlassPanel className="p-2">
        <div className="grid gap-2 sm:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 rounded-button px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                  isActive
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

      {activeTab === 'daily' ? (
        <GlassPanel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-studio-text-primary">日报</h2>
              <p className="mt-1 text-sm text-studio-text-muted">预留个人日清、团队摘要、阻塞项和明日计划。</p>
            </div>
            <StatusPill tone="primary">规划中</StatusPill>
          </div>
          <EmptyState icon={FileClock} title="日报能力规划中" description="这里只做 UI 入口预留，不新增日报后端逻辑。" />
        </GlassPanel>
      ) : null}

      {activeTab === 'weekly' ? (
        <GlassPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-studio-violet/15 text-studio-violet">
              <FileBarChart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-studio-text-primary">本周数据报告</h2>
              <p className="text-sm text-studio-text-muted">复用现有周报接口，仅调整呈现层级。</p>
            </div>
          </div>
          {reportLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-studio-text-muted" />
            </div>
          ) : weeklyReport ? (
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: '完成选题', value: weeklyReport.summary?.completedTopics || 0, tone: 'text-studio-success' },
                { label: '发布视频', value: weeklyReport.summary?.publishedVideos || 0, tone: 'text-studio-cyan' },
                { label: '新增选题', value: weeklyReport.summary?.newTopics || 0, tone: 'text-studio-amber' },
                { label: '总播放量', value: (weeklyReport.summary?.totalViews || 0).toLocaleString(), tone: 'text-studio-violet' },
              ].map((item) => (
                <div key={item.label} className="rounded-card border border-studio-border-soft bg-white/[0.04] p-4 text-center">
                  <p className={`text-2xl font-bold ${item.tone}`}>{item.value}</p>
                  <p className="mt-1 text-xs text-studio-text-muted">{item.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={FileBarChart} title="暂无周报数据" description="当前没有可展示的本周复盘数据。" />
          )}
          {weeklyReport?.period ? (
            <p className="mt-4 text-center text-xs text-studio-text-muted">
              统计周期：{weeklyReport.period.start} ~ {weeklyReport.period.end}
            </p>
          ) : null}
        </GlassPanel>
      ) : null}

      {activeTab === 'monthly' ? (
        <GlassPanel className="p-6">
          <EmptyState icon={CalendarRange} title="月报能力规划中" description="月报页签已预留，后续可接入月度内容产能、爆款复盘和平台趋势。" />
        </GlassPanel>
      ) : null}

      {activeTab === 'export' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { id: 'topics' as const, title: '导出选题数据', description: '导出所有选题信息 JSON 文件，便于备份和二次分析。', icon: FileBarChart },
            { id: 'analytics' as const, title: '导出分析数据', description: '导出播放、点赞、分享、评论等数据分析结果。', icon: BarChart3 },
          ].map((card) => {
            const Icon = card.icon;
            const isLoading = loading === card.id;
            return (
              <GlassPanel key={card.id} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-studio-primary/15 text-studio-cyan">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-studio-text-primary">{card.title}</h3>
                    <p className="mt-1 text-sm text-studio-text-muted">{card.description}</p>
                    <ActionButton type="button" onClick={() => void handleExport(card.id)} disabled={isLoading} className="mt-4">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {isLoading ? '导出中...' : '导出 JSON'}
                    </ActionButton>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      ) : null}
    </PageShell>
  );
}

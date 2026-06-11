import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { exportTopics, exportAnalytics, getWeeklyReport } from '../api';
import { useAppStore } from '../store';
import {
  Download,
  FileText,
  BarChart3,
  FileBarChart,
  ChevronLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCurrentBeijingDateString } from '../lib/utils';

export default function ExportPage() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    getWeeklyReport()
      .then(setWeeklyReport)
      .catch(() => {})
      .finally(() => setReportLoading(false));
  }, []);

  const handleExport = async (type: 'topics' | 'analytics') => {
    setLoading(type);
    try {
      let data: any[];
      let filename: string;

      if (type === 'topics') {
        data = await exportTopics();
        filename = `选题数据_${getCurrentBeijingDateString()}.json`;
      } else {
        data = await exportAnalytics();
        filename = `数据分析_${getCurrentBeijingDateString()}.json`;
      }

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

  const exportCards = [
    {
      id: 'topics',
      title: '导出选题数据',
      description: '导出所有选题信息的 JSON 文件，便于备份和二次分析。',
      icon: FileText,
      gradient: 'from-blue-500 to-indigo-500',
      onClick: () => handleExport('topics'),
    },
    {
      id: 'analytics',
      title: '导出分析数据',
      description: '导出播放、点赞、分享、评论等数据分析结果。',
      icon: BarChart3,
      gradient: 'from-emerald-500 to-teal-500',
      onClick: () => handleExport('analytics'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-theme-text-muted hover:text-theme-text transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          返回首页
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-theme-text">数据导出</h1>
        <p className="text-sm text-theme-text-muted mt-1">导出项目数据用于备份、归档或复盘分析。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exportCards.map((card) => {
          const Icon = card.icon;
          const isLoading = loading === card.id;
          return (
            <div
              key={card.id}
              className="rounded-2xl bg-theme-secondary border border-theme-border p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-theme-text">{card.title}</h3>
                  <p className="text-sm text-theme-text-muted mt-1">{card.description}</p>
                  <button
                    onClick={card.onClick}
                    disabled={isLoading}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-theme-tertiary hover:bg-theme-elevated text-theme-text rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isLoading ? '导出中...' : '导出 JSON'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-theme-secondary border border-theme-border p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
            <FileBarChart className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-base font-semibold text-theme-text">本周数据报告</h3>
        </div>

        {reportLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-theme-text-muted" />
          </div>
        ) : weeklyReport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: '完成选题', value: weeklyReport.summary?.completedTopics || 0, color: 'text-emerald-400' },
                { label: '发布视频', value: weeklyReport.summary?.publishedVideos || 0, color: 'text-blue-400' },
                { label: '新增选题', value: weeklyReport.summary?.newTopics || 0, color: 'text-amber-400' },
                { label: '总播放量', value: (weeklyReport.summary?.totalViews || 0).toLocaleString(), color: 'text-purple-400' },
              ].map((item, index) => (
                <div key={index} className="rounded-xl bg-theme-tertiary/50 p-4 text-center">
                  <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-xs text-theme-text-muted mt-1">{item.label}</p>
                </div>
              ))}
            </div>
            {weeklyReport.period && (
              <p className="text-xs text-theme-text-muted text-center">
                统计周期：{weeklyReport.period.start} ~ {weeklyReport.period.end}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-theme-text-muted" />
            <p className="text-sm text-theme-text-muted">暂无周报数据</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { exportTopics, exportAnalytics } from '../api/export';
import { Download, FileText, BarChart3, Loader2 } from 'lucide-react';
import { getCurrentBeijingDateString } from '../lib/utils';
import ActionButton from './studio/ActionButton';
import { PLATFORMS } from '../constants';
import { topicStatusLabel } from './topics/topicStatusLabel';

type ExportType = 'topics' | 'analytics';

function platformLabel(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return PLATFORMS.find((platform) => platform.value === text.toLowerCase())?.label ?? text;
}

function jsonToCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        const text = value === null || value === undefined ? '' : String(value);
        if (text.includes(',') || text.includes('\n') || text.includes('"')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      })
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function DataExport() {
  const [exportType, setExportType] = useState<ExportType>('topics');
  const [loading, setLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ kind: 'success' | 'empty' | 'error'; message: string } | null>(null);
  const exportInFlightRef = useRef(false);
  const styles = useThemeStyles();
  const addNotification = useAppStore((state) => state.addNotification);

  const handleExport = async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setLoading(true);
    setExportFeedback(null);
    try {
      let data: Record<string, unknown>[] = [];
      let filename = '';

      if (exportType === 'topics') {
        const topics = await exportTopics();
        data = topics.data.map((topic) => ({
          ID: topic.id,
          标题: topic.title,
          描述: topic.description,
          状态: topicStatusLabel(topic.status),
          平台: platformLabel(topic.platform),
          截止日期: topic.deadline,
          创建者: topic.creator_name || topic.creator_id,
          负责人: topic.assignee_name || topic.assignee_id,
          创建时间: topic.created_at,
          更新时间: topic.updated_at,
        }));
        filename = `选题数据_${getCurrentBeijingDateString()}`;
      } else {
        const analytics = await exportAnalytics();
        data = [
          ...analytics.topicStats.map((item) => ({
            类别: '选题状态', 项目: topicStatusLabel(item.status), 选题数: '', 完成番茄数: '', 数量: item.count,
          })),
          ...analytics.userActivity.map((item) => ({
            类别: '成员活动', 项目: item.name, 选题数: item.topics_created, 完成番茄数: item.pomodoros_completed, 数量: '',
          })),
          ...analytics.dailyTrend.map((item) => ({
            类别: '每日趋势', 项目: item.date, 选题数: item.topics_created, 完成番茄数: '', 数量: '',
          })),
          ...analytics.platformDistribution.map((item) => ({
            类别: '平台分布', 项目: platformLabel(item.platform), 选题数: '', 完成番茄数: '', 数量: item.count,
          })),
        ];
        filename = `数据分析_${getCurrentBeijingDateString()}`;
      }

      if (data.length === 0) {
        const message = '当前筛选范围内暂无数据可导出。';
        setExportFeedback({ kind: 'empty', message });
        addNotification({ title: '导出提示', message: '暂无数据可导出', type: 'warning' });
        return;
      }

      const csv = jsonToCsv(data);
      downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
      const message = `已生成 ${data.length} 条记录，文件已开始下载。`;
      setExportFeedback({ kind: 'success', message });
      addNotification({
        title: '导出成功',
        message,
        type: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出暂时失败，请检查连接后重试。';
      setExportFeedback({ kind: 'error', message });
      addNotification({
        title: '导出失败',
        message,
        type: 'error',
      });
    } finally {
      exportInFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.card} p-6`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-studio-primary/10">
          <Download className="w-5 h-5 text-studio-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-studio-text-primary">数据导出</h2>
          <p className="text-sm text-studio-text-secondary">导出选题明细，或选题状态、成员活动、每日趋势和平台分布汇总。</p>
        </div>
      </div>

      {exportFeedback ? (
        <p
          role={exportFeedback.kind === 'error' ? 'alert' : 'status'}
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            exportFeedback.kind === 'error'
              ? 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast'
              : exportFeedback.kind === 'success'
                ? 'border-studio-success/25 bg-studio-success/10 text-studio-success-contrast'
                : 'border-studio-amber/25 bg-studio-amber/10 text-studio-amber-contrast'
          }`}
        >
          {exportFeedback.kind === 'error' ? '导出失败：' : ''}{exportFeedback.message}
        </p>
      ) : null}

      <div className="space-y-4">
        <div>
          <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>导出类型</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setExportType('topics')}
              disabled={loading}
              aria-pressed={exportType === 'topics'}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                exportType === 'topics'
                  ? `border-studio-primary ${styles.bgInput}`
                  : `${styles.border} ${styles.hoverBg}`
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <FileText className={`w-5 h-5 ${exportType === 'topics' ? 'text-studio-primary' : styles.textMuted}`} />
              <div className="text-left">
                <p className={`text-sm font-medium ${styles.textPrimary}`}>选题数据</p>
                <p className="text-xs text-studio-text-secondary">导出所有选题信息</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExportType('analytics')}
              disabled={loading}
              aria-pressed={exportType === 'analytics'}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                exportType === 'analytics'
                  ? `border-studio-primary ${styles.bgInput}`
                  : `${styles.border} ${styles.hoverBg}`
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <BarChart3 className={`w-5 h-5 ${exportType === 'analytics' ? 'text-studio-primary' : styles.textMuted}`} />
              <div className="text-left">
                <p className={`text-sm font-medium ${styles.textPrimary}`}>数据分析</p>
                <p className="text-xs text-studio-text-secondary">导出状态、活动与平台汇总</p>
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>导出格式</label>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${styles.bgTertiary} ${styles.border}`}>
            <span className={`text-sm ${styles.textPrimary} font-medium`}>CSV</span>
            <span className="text-xs text-studio-text-secondary">(逗号分隔)</span>
          </div>
        </div>

        <ActionButton
          type="button"
          variant="primary"
          onClick={handleExport}
          disabled={loading}
          className="w-full justify-center"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="text-sm font-medium">{loading ? '导出中...' : '开始导出'}</span>
        </ActionButton>
      </div>
    </div>
  );
}

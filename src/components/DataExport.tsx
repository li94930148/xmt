import { useState } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { exportTopics, exportAnalytics } from '../api/export';
import { Download, FileText, BarChart3, Loader2 } from 'lucide-react';
import { getCurrentBeijingDateString } from '../lib/utils';

type ExportType = 'topics' | 'analytics';

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
  const styles = useThemeStyles();
  const appStore = useAppStore();

  const handleExport = async () => {
    setLoading(true);
    try {
      let data: Record<string, unknown>[] = [];
      let filename = '';

      if (exportType === 'topics') {
        const topics = await exportTopics();
        data = (topics || []).map((topic: Record<string, unknown>) => ({
          ID: topic.id,
          标题: topic.title,
          描述: topic.description,
          状态: topic.status,
          平台: topic.platform,
          截止日期: topic.deadline,
          创建者: topic.creator_name || topic.creator_id,
          负责人: topic.assignee_name || topic.assignee_id,
          创建时间: topic.created_at,
          更新时间: topic.updated_at,
        }));
        filename = `选题数据_${getCurrentBeijingDateString()}`;
      } else {
        const analytics = await exportAnalytics();
        data = (analytics || []).map((item: Record<string, unknown>) => ({
          ID: item.id,
          选题ID: item.topic_id,
          播放量: item.views,
          点赞量: item.likes,
          分享量: item.shares,
          评论量: item.comments,
          数据日期: item.data_date,
          创建时间: item.created_at,
        }));
        filename = `数据分析_${getCurrentBeijingDateString()}`;
      }

      if (data.length === 0) {
        appStore.addNotification({ title: '导出提示', message: '暂无数据可导出', type: 'warning' });
        return;
      }

      const csv = jsonToCsv(data);
      downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
      appStore.addNotification({
        title: '导出成功',
        message: `已导出 ${data.length} 条记录`,
        type: 'success',
      });
    } catch (error) {
      appStore.addNotification({
        title: '导出失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.card} p-6`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#5c7cfa]/10">
          <Download className="w-5 h-5 text-[#5c7cfa]" />
        </div>
        <div>
          <h3 className={`text-lg font-semibold ${styles.textPrimary}`}>数据导出</h3>
          <p className={`text-sm ${styles.textSecondary}`}>导出选题或分析数据为 CSV 文件。</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>导出类型</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setExportType('topics')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                exportType === 'topics'
                  ? `border-[#5c7cfa] ${styles.bgInput}`
                  : `${styles.border} ${styles.hoverBg}`
              }`}
            >
              <FileText className={`w-5 h-5 ${exportType === 'topics' ? 'text-[#5c7cfa]' : styles.textMuted}`} />
              <div className="text-left">
                <p className={`text-sm font-medium ${styles.textPrimary}`}>选题数据</p>
                <p className={`text-xs ${styles.textMuted}`}>导出所有选题信息</p>
              </div>
            </button>

            <button
              onClick={() => setExportType('analytics')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                exportType === 'analytics'
                  ? `border-[#5c7cfa] ${styles.bgInput}`
                  : `${styles.border} ${styles.hoverBg}`
              }`}
            >
              <BarChart3 className={`w-5 h-5 ${exportType === 'analytics' ? 'text-[#5c7cfa]' : styles.textMuted}`} />
              <div className="text-left">
                <p className={`text-sm font-medium ${styles.textPrimary}`}>数据分析</p>
                <p className={`text-xs ${styles.textMuted}`}>导出播放、点赞等指标</p>
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>导出格式</label>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${styles.bgTertiary} ${styles.border}`}>
            <span className={`text-sm ${styles.textPrimary} font-medium`}>CSV</span>
            <span className={`text-xs ${styles.textMuted}`}>(逗号分隔)</span>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 px-5 py-3 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="text-sm font-medium">{loading ? '导出中...' : '开始导出'}</span>
        </button>
      </div>
    </div>
  );
}

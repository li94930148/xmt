import { useState, useEffect, useCallback } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import ActionButton from './studio/ActionButton';
import LoadingState from './common/LoadingState';
import { getWeeklyReport } from '../api/export';
import { FileText, Video, Eye, Heart, Copy, Loader2, RefreshCw, Lightbulb } from 'lucide-react';
import { formatBeijingTime } from '../lib/utils';
import { getPlatformLabel } from '../platform/platform-labels';

interface WeeklyReportData {
  period: { start: string; end: string };
  summary: {
    completedTopics: number;
    publishedVideos: number;
    newTopics: number;
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    totalComments: number;
    pomodoroSessions: number;
    focusMinutes: number;
  };
  details: {
    completedTopics: { id: number; title: string; updated_at: string; creator_name?: string }[];
    publishedVideos: { id: number; topic_title: string; platform: string; publish_time: string }[];
    newTopics: { id: number; title: string; created_at: string }[];
    topInspirations: { id: number; title: string; votes: number }[];
  };
  generatedAt: string;
}

export default function WeeklyReport() {
  const [data, setData] = useState<WeeklyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const styles = useThemeStyles();
  const addNotification = useAppStore((state) => state.addNotification);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const report = await getWeeklyReport();
      setData(report);
    } catch {
      setLoadError('请检查连接后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const formatNumber = (num: number) => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const generateReportText = () => {
    if (!data) return '';
    const { summary, details, period } = data;

    const lines = [
      `📊 周报 (${period.start} ~ ${period.end})`,
      '',
      '📈 本周摘要',
      `• 完成选题数：${summary.completedTopics}`,
      `• 发布视频数：${summary.publishedVideos}`,
      `• 新增选题数：${summary.newTopics}`,
      `• 总播放量：${formatNumber(summary.totalViews)}`,
      `• 总点赞量：${formatNumber(summary.totalLikes)}`,
      `• 总分享量：${formatNumber(summary.totalShares)}`,
      `• 总评论量：${formatNumber(summary.totalComments)}`,
      '',
    ];

    if (details.completedTopics.length > 0) {
      lines.push('📝 本周完成的选题');
      details.completedTopics.forEach((t, i) => {
        lines.push(`${i + 1}. ${t.title}${t.creator_name ? ` (${t.creator_name})` : ''}`);
      });
      lines.push('');
    }

    if (details.publishedVideos.length > 0) {
      lines.push('🎬 本周发布的视频');
      details.publishedVideos.forEach((v, i) => {
        lines.push(`${i + 1}. ${v.topic_title} [${getPlatformLabel(v.platform)}]`);
      });
      lines.push('');
    }

    if (details.topInspirations.length > 0) {
      lines.push('💡 热门灵感');
      details.topInspirations.forEach((insp, i) => {
        lines.push(`${i + 1}. ${insp.title} (${insp.votes}票)`);
      });
      lines.push('');
    }

    lines.push(`—— 生成时间：${formatBeijingTime(data.generatedAt)}`);
    return lines.join('\n');
  };

  const handleCopy = async () => {
    setCopying(true);
    setCopyError(null);
    try {
      const text = generateReportText();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('aria-hidden', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        let fallbackCopied = false;
        try {
          fallbackCopied = document.execCommand('copy');
        } finally {
          textarea.remove();
        }
        if (!fallbackCopied) throw new Error('Clipboard fallback was rejected');
      }

      addNotification({ title: '复制成功', message: '周报已复制到剪贴板', type: 'success' });
    } catch {
      const message = '浏览器未能复制周报，请检查剪贴板权限后重试。';
      setCopyError(message);
      addNotification({ title: '复制失败', message, type: 'error' });
    } finally {
      setCopying(false);
    }
  };

  if (loading && !data) {
    return (
      <div className={`${styles.card} p-6`}>
        <LoadingState type="inline" text="正在加载周报…" className="w-full justify-center py-12" />
      </div>
    );
  }

  const summary = data?.summary;
  const details = data?.details;

  return (
    <div className={`${styles.card} p-6`}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-studio-violet/10">
            <FileText className="w-5 h-5 text-studio-violet" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-studio-text-primary">周报生成</h2>
            <p className="text-sm text-studio-text-secondary">
              {data?.period ? `${data.period.start} ~ ${data.period.end}` : '自动生成本周工作摘要'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchReport}
            disabled={loading}
            className={`flex !min-h-11 items-center gap-2 whitespace-nowrap px-3 py-2 ${styles.buttonSecondary} rounded-lg transition-all duration-200 disabled:opacity-50`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-sm">刷新</span>
          </button>
          <button
            onClick={handleCopy}
            disabled={copying || loading || !data || Boolean(loadError)}
            className={`flex !min-h-11 items-center gap-2 whitespace-nowrap px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-all duration-200 disabled:opacity-50`}
          >
            {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            <span className="text-sm font-medium">一键复制</span>
          </button>
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <span>
            {data
              ? `周报更新失败，仍显示最近一次成功读取的 ${data.period.start} 至 ${data.period.end} 数据。`
              : '周报暂时无法读取。'} {loadError}
          </span>
          <ActionButton type="button" variant="secondary" disabled={loading} onClick={() => void fetchReport()}>
            {loading ? '正在重新加载…' : '重试周报'}
          </ActionButton>
        </div>
      ) : loading && data ? (
        <p role="status" className="mb-6 text-sm text-studio-text-secondary">
          正在更新周报；当前仍显示 {data.period.start} 至 {data.period.end} 的最近一次成功结果。
        </p>
      ) : null}

      {copyError && (
        <p role="alert" className="mb-6 rounded-xl border border-studio-coral/25 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast">
          {copyError}
        </p>
      )}

      {data && summary && details && (
        <div className="space-y-6">
          {/* 摘要卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '完成选题', value: summary.completedTopics, icon: FileText, color: 'var(--xmt-success)' },
              { label: '发布视频', value: summary.publishedVideos, icon: Video, color: 'var(--xmt-primary)' },
              { label: '总播放量', value: formatNumber(summary.totalViews), icon: Eye, color: 'var(--xmt-amber)' },
              { label: '总点赞量', value: formatNumber(summary.totalLikes), icon: Heart, color: 'var(--xmt-coral)' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
                  <Icon className="w-5 h-5 mx-auto mb-2" style={{ color: item.color }} />
                  <p className={`text-2xl font-bold ${styles.textPrimary}`}>{item.value}</p>
                  <p className="mt-1 text-xs text-studio-text-secondary">{item.label}</p>
                </div>
              );
            })}
          </div>

          {/* 额外统计 */}
          <div className="grid grid-cols-3 gap-4">
            <div className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
              <p className={`text-lg font-bold ${styles.textPrimary}`}>{summary.newTopics}</p>
              <p className="mt-1 text-xs text-studio-text-secondary">新增选题</p>
            </div>
            <div className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
              <p className={`text-lg font-bold ${styles.textPrimary}`}>{formatNumber(summary.totalShares)}</p>
              <p className="mt-1 text-xs text-studio-text-secondary">总分享量</p>
            </div>
            <div className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
              <p className={`text-lg font-bold ${styles.textPrimary}`}>{formatNumber(summary.totalComments)}</p>
              <p className="mt-1 text-xs text-studio-text-secondary">总评论量</p>
            </div>
          </div>

          {/* 完成的选题 */}
          {details.completedTopics.length > 0 && (
            <div>
              <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${styles.textPrimary}`}>
                <FileText className="w-4 h-4 text-studio-success" />
                本周完成的选题
              </h3>
              <div className="space-y-2">
                {details.completedTopics.map((topic) => (
                  <div key={topic.id} className={`flex items-center gap-3 p-3 ${styles.bgTertiary} rounded-lg`}>
                    <div className="w-2 h-2 rounded-full bg-studio-success flex-shrink-0" />
                    <span className={`text-sm ${styles.textPrimary} flex-1`}>{topic.title}</span>
                    {topic.creator_name && (
                      <span className="text-xs text-studio-text-secondary">{topic.creator_name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 发布的视频 */}
          {details.publishedVideos.length > 0 && (
            <div>
              <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${styles.textPrimary}`}>
                <Video className="w-4 h-4 text-studio-primary" />
                本周发布的视频
              </h3>
              <div className="space-y-2">
                {details.publishedVideos.map((video) => (
                  <div key={video.id} className={`flex items-center gap-3 p-3 ${styles.bgTertiary} rounded-lg`}>
                    <div className="w-2 h-2 rounded-full bg-studio-primary flex-shrink-0" />
                    <span className={`text-sm ${styles.textPrimary} flex-1`}>{video.topic_title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${styles.bgInput} text-studio-text-secondary`}>{getPlatformLabel(video.platform)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 热门灵感 */}
          {details.topInspirations.length > 0 && (
            <div>
              <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${styles.textPrimary}`}>
                <Lightbulb className="w-4 h-4 text-studio-amber" />
                热门灵感
              </h3>
              <div className="space-y-2">
                {details.topInspirations.map((insp) => (
                  <div key={insp.id} className={`flex items-center gap-3 p-3 ${styles.bgTertiary} rounded-lg`}>
                    <div className="w-2 h-2 rounded-full bg-studio-amber flex-shrink-0" />
                    <span className={`text-sm ${styles.textPrimary} flex-1`}>{insp.title}</span>
                    <span className="text-xs text-studio-text-secondary">{insp.votes}票</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {details.completedTopics.length === 0 && details.publishedVideos.length === 0 && (
            <p className="py-8 text-center text-studio-text-secondary">本周暂无完成的选题和发布的视频</p>
          )}
        </div>
      )}
    </div>
  );
}

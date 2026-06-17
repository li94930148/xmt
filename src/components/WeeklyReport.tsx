import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { getWeeklyReport } from '../api/export';
import { FileText, Video, Eye, Heart, Copy, Loader2, RefreshCw, Lightbulb, Clock } from 'lucide-react';
import { formatBeijingTime } from '../lib/utils';

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
  const [copying, setCopying] = useState(false);
  const styles = useThemeStyles();
  const appStore = useAppStore();

  const fetchReport = async () => {
    setLoading(true);
    try {
      const report = await getWeeklyReport();
      setData(report);
    } catch (error) {
      appStore.addNotification({ title: '获取周报失败', message: (error as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

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
        lines.push(`${i + 1}. ${v.topic_title} [${v.platform}]`);
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
    try {
      const text = generateReportText();
      await navigator.clipboard.writeText(text);
      appStore.addNotification({ title: '复制成功', message: '周报已复制到剪贴板', type: 'success' });
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = generateReportText();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      appStore.addNotification({ title: '复制成功', message: '周报已复制到剪贴板', type: 'success' });
    } finally {
      setCopying(false);
    }
  };

  if (loading && !data) {
    return (
      <div className={`${styles.card} p-6`}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#5c7cfa]" />
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const details = data?.details;

  return (
    <div className={`${styles.card} p-6`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#cc5de8]/10">
            <FileText className="w-5 h-5 text-[#cc5de8]" />
          </div>
          <div>
            <h3 className={`text-lg font-semibold ${styles.textPrimary}`}>周报生成</h3>
            <p className={`text-sm ${styles.textSecondary}`}>
              {data?.period ? `${data.period.start} ~ ${data.period.end}` : '自动生成本周工作摘要'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-2 ${styles.buttonSecondary} rounded-lg transition-all duration-200 disabled:opacity-50`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-sm">刷新</span>
          </button>
          <button
            onClick={handleCopy}
            disabled={copying || !data}
            className={`flex items-center gap-2 px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-all duration-200 disabled:opacity-50`}
          >
            {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            <span className="text-sm font-medium">一键复制</span>
          </button>
        </div>
      </div>

      {data && summary && details && (
        <div className="space-y-6">
          {/* 摘要卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '完成选题', value: summary.completedTopics, icon: FileText, color: '#51cf66' },
              { label: '发布视频', value: summary.publishedVideos, icon: Video, color: '#5c7cfa' },
              { label: '总播放量', value: formatNumber(summary.totalViews), icon: Eye, color: '#ff922b' },
              { label: '总点赞量', value: formatNumber(summary.totalLikes), icon: Heart, color: '#ff6b6b' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
                  <Icon className="w-5 h-5 mx-auto mb-2" style={{ color: item.color }} />
                  <p className={`text-2xl font-bold ${styles.textPrimary}`}>{item.value}</p>
                  <p className={`text-xs ${styles.textMuted} mt-1`}>{item.label}</p>
                </div>
              );
            })}
          </div>

          {/* 额外统计 */}
          <div className="grid grid-cols-3 gap-4">
            <div className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
              <p className={`text-lg font-bold ${styles.textPrimary}`}>{summary.newTopics}</p>
              <p className={`text-xs ${styles.textMuted} mt-1`}>新增选题</p>
            </div>
            <div className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
              <p className={`text-lg font-bold ${styles.textPrimary}`}>{formatNumber(summary.totalShares)}</p>
              <p className={`text-xs ${styles.textMuted} mt-1`}>总分享量</p>
            </div>
            <div className={`${styles.bgTertiary} rounded-xl p-4 text-center`}>
              <p className={`text-lg font-bold ${styles.textPrimary}`}>{formatNumber(summary.totalComments)}</p>
              <p className={`text-xs ${styles.textMuted} mt-1`}>总评论量</p>
            </div>
          </div>

          {/* 完成的选题 */}
          {details.completedTopics.length > 0 && (
            <div>
              <h4 className={`text-sm font-semibold ${styles.textPrimary} mb-3 flex items-center gap-2`}>
                <FileText className="w-4 h-4 text-[#51cf66]" />
                本周完成的选题
              </h4>
              <div className="space-y-2">
                {details.completedTopics.map((topic) => (
                  <div key={topic.id} className={`flex items-center gap-3 p-3 ${styles.bgTertiary} rounded-lg`}>
                    <div className="w-2 h-2 rounded-full bg-[#51cf66] flex-shrink-0" />
                    <span className={`text-sm ${styles.textPrimary} flex-1`}>{topic.title}</span>
                    {topic.creator_name && (
                      <span className={`text-xs ${styles.textMuted}`}>{topic.creator_name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 发布的视频 */}
          {details.publishedVideos.length > 0 && (
            <div>
              <h4 className={`text-sm font-semibold ${styles.textPrimary} mb-3 flex items-center gap-2`}>
                <Video className="w-4 h-4 text-[#5c7cfa]" />
                本周发布的视频
              </h4>
              <div className="space-y-2">
                {details.publishedVideos.map((video) => (
                  <div key={video.id} className={`flex items-center gap-3 p-3 ${styles.bgTertiary} rounded-lg`}>
                    <div className="w-2 h-2 rounded-full bg-[#5c7cfa] flex-shrink-0" />
                    <span className={`text-sm ${styles.textPrimary} flex-1`}>{video.topic_title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${styles.bgInput} ${styles.textMuted}`}>{video.platform}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 热门灵感 */}
          {details.topInspirations.length > 0 && (
            <div>
              <h4 className={`text-sm font-semibold ${styles.textPrimary} mb-3 flex items-center gap-2`}>
                <Lightbulb className="w-4 h-4 text-[#ff922b]" />
                热门灵感
              </h4>
              <div className="space-y-2">
                {details.topInspirations.map((insp) => (
                  <div key={insp.id} className={`flex items-center gap-3 p-3 ${styles.bgTertiary} rounded-lg`}>
                    <div className="w-2 h-2 rounded-full bg-[#ff922b] flex-shrink-0" />
                    <span className={`text-sm ${styles.textPrimary} flex-1`}>{insp.title}</span>
                    <span className={`text-xs ${styles.textMuted}`}>{insp.votes}票</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {details.completedTopics.length === 0 && details.publishedVideos.length === 0 && (
            <p className={`text-center py-8 ${styles.textSecondary}`}>本周暂无完成的选题和发布的视频</p>
          )}
        </div>
      )}
    </div>
  );
}

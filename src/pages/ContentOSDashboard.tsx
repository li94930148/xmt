import { useEffect, useState } from 'react';
import { Activity, BrainCircuit, Clock, RefreshCw, Sparkles, Users } from 'lucide-react';
import {
  getContentOSContext,
  getContentOSInsight,
} from '../api';
import type { ContentOSContext, ContentOSInsight } from '../content/orchestrator/types';
import { useAppStore } from '../store';
import { useThemeStyles } from '../hooks/useThemeStyles';

function stateLabel(state?: string) {
  const labels: Record<string, string> = {
    draft: '初稿',
    editing: '编辑中',
    stabilizing: '收敛中',
    finalized: '已定稿',
  };
  return labels[state || ''] || '-';
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export default function ContentOSDashboard() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const [docId, setDocId] = useState('production:1');
  const [activeDocId, setActiveDocId] = useState('production:1');
  const [context, setContext] = useState<ContentOSContext | null>(null);
  const [insight, setInsight] = useState<ContentOSInsight | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async (targetDocId = activeDocId) => {
    const normalizedDocId = targetDocId.trim();
    if (!normalizedDocId) return;
    setLoading(true);

    try {
      const [contextResult, insightResult] = await Promise.all([
        getContentOSContext(normalizedDocId),
        getContentOSInsight(normalizedDocId),
      ]);
      setContext(contextResult);
      setInsight(insightResult);
      setActiveDocId(normalizedDocId);
    } catch (error) {
      appStore.addNotification({
        title: '内容 OS 加载失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(activeDocId);
  }, []);

  return (
    <div className="space-y-5">
      <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>Content OS</p>
            <h1 className={`mt-1 flex items-center gap-2 text-2xl font-bold ${styles.textPrimary}`}>
              <BrainCircuit className="h-6 w-6 text-blue-400" />
              内容操作系统
            </h1>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <input
              value={docId}
              onChange={(event) => setDocId(event.target.value)}
              className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary}`}
              placeholder="production:1 或 shooting:1"
            />
            <button
              onClick={() => void loadData(docId)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              调度
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          { label: '系统状态', value: stateLabel(context?.state), icon: Activity },
          { label: '编辑状态', value: context?.uxState || '-', icon: Clock },
          { label: '协作人数', value: context?.presence.activeUserCount ?? 0, icon: Users },
          { label: '质量评分', value: context?.intelligence.quality.score ?? 0, icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={`${styles.bgSecondary} border ${styles.border} rounded-xl p-4`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${styles.textMuted}`}>{item.label}</span>
                <Icon className="h-4 w-4 text-blue-400" />
              </div>
              <p className={`mt-3 text-xl font-semibold ${styles.textPrimary}`}>{item.value}</p>
            </div>
          );
        })}
      </div>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}>
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>系统洞察</h2>
          <p className={`mt-1 text-xs ${styles.textMuted}`}>{activeDocId}</p>
        </div>
        <div className="space-y-4 p-5">
          <p className={`text-lg font-semibold ${styles.textPrimary}`}>{insight?.headline || '暂无洞察'}</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(insight?.keyInsights || []).map((item) => (
              <p key={item} className={`rounded-xl ${styles.bgTertiary} p-4 text-sm ${styles.textSecondary}`}>
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`border-b ${styles.border} px-5 py-4`}>
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>AI 生成建议</h2>
          </div>
          <div className="space-y-3 p-5">
            {(context?.generation.suggestions || []).slice(0, 5).map((suggestion) => (
              <div key={`${suggestion.type}-${suggestion.message}`} className={`rounded-xl ${styles.bgTertiary} p-4`}>
                <p className={`text-sm font-medium ${styles.textPrimary}`}>{suggestion.type}</p>
                <p className={`mt-2 text-sm ${styles.textSecondary}`}>{suggestion.message}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`border-b ${styles.border} px-5 py-4`}>
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>时间轴概览</h2>
          </div>
          <div className="max-h-96 overflow-y-auto p-5">
            <div className="space-y-3">
              {(context?.timeline.events || []).slice(-8).reverse().map((event) => (
                <div key={event.id} className={`rounded-xl ${styles.bgTertiary} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-medium ${styles.textPrimary}`}>{event.type}</span>
                    <span className={`text-xs ${styles.textMuted}`}>{formatTime(event.timestamp)}</span>
                  </div>
                  <p className={`mt-2 text-xs ${styles.textMuted}`}>{event.source}</p>
                </div>
              ))}
              {(!context || context.timeline.events.length === 0) && (
                <p className={`text-sm ${styles.textMuted}`}>暂无时间轴节点</p>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}>
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>推荐动作</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
          {(insight?.recommendedActions || []).map((action) => (
            <p key={action} className={`rounded-xl ${styles.bgTertiary} p-4 text-sm ${styles.textSecondary}`}>
              {action}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

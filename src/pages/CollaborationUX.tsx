import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Flame, RefreshCw, Sparkles, User } from 'lucide-react';
import {
  getCollaborationExplanation,
  getCollaborationNarrative,
  type CollaborationExplanation,
  type CollaborationNarrativeItem,
} from '../api';
import { useAppStore } from '../store';
import { useThemeStyles } from '../hooks/useThemeStyles';

function formatTime(timestamp?: number | null) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export default function CollaborationUX() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const [docId, setDocId] = useState('production:1');
  const [activeDocId, setActiveDocId] = useState('production:1');
  const [explanation, setExplanation] = useState<CollaborationExplanation | null>(null);
  const [narrative, setNarrative] = useState<CollaborationNarrativeItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async (targetDocId = activeDocId) => {
    if (!targetDocId.trim()) return;
    setLoading(true);
    try {
      const [explainResult, narrativeResult] = await Promise.all([
        getCollaborationExplanation(targetDocId.trim()),
        getCollaborationNarrative(targetDocId.trim()),
      ]);
      setExplanation(explainResult.explanation);
      setNarrative(narrativeResult.narrative);
      setActiveDocId(targetDocId.trim());
    } catch (error) {
      appStore.addNotification({
        title: '协作体验层加载失败',
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
            <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>Collaboration UX</p>
            <h1 className={`mt-1 text-2xl font-bold ${styles.textPrimary}`}>协作故事线</h1>
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
              生成
            </button>
          </div>
        </div>
      </div>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>解释摘要</h2>
          <span className={`ml-auto text-xs ${styles.textMuted}`}>{activeDocId}</span>
        </div>
        <p className={`mt-4 text-sm leading-6 ${styles.textSecondary}`}>
          {explanation?.summary || '暂无可解释的协作事件。'}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`flex items-center gap-2 border-b ${styles.border} px-5 py-4`}>
            <BookOpen className="h-5 w-5 text-emerald-400" />
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>文档编辑故事线</h2>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-5">
            {narrative.length === 0 ? (
              <div className={`rounded-xl ${styles.bgTertiary} p-6 text-center text-sm ${styles.textMuted}`}>
                暂无故事线
              </div>
            ) : (
              <div className="space-y-3">
                {narrative.map((item) => (
                  <div key={item.id} className={`rounded-xl border ${styles.border} ${styles.bgTertiary} p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${styles.textPrimary}`}>{item.text}</span>
                      <span className={`text-xs ${styles.textMuted}`}>{formatTime(item.timestamp)}</span>
                    </div>
                    <p className={`mt-2 text-xs ${styles.textMuted}`}>user {item.userId} · {item.type}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-purple-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>最活跃用户</h2>
            </div>
            <p className={`mt-4 text-2xl font-semibold ${styles.textPrimary}`}>
              {explanation?.highlights.mostActiveUser || '-'}
            </p>
          </section>

          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>热点区域</h2>
            </div>
            <p className={`mt-4 text-sm ${styles.textSecondary}`}>
              {explanation?.highlights.mostEditedSection || '暂无热点区域'}
            </p>
          </section>

          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>冲突解释</h2>
            </div>
            {explanation?.highlights.conflictHotspots.length ? (
              <div className="mt-4 space-y-2">
                {explanation.highlights.conflictHotspots.map((hotspot) => (
                  <div key={hotspot} className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {hotspot}
                  </div>
                ))}
              </div>
            ) : (
              <p className={`mt-4 text-sm ${styles.textMuted}`}>暂无冲突热点</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { FilePenLine, Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import {
  getGeneratedStructure,
  getGeneratedSuggestions,
  getGeneratedSummary,
  getGeneratedTitle,
  type GeneratedStructureResponse,
  type GeneratedSuggestionsResponse,
  type GeneratedSummaryResponse,
  type GeneratedTitleResponse,
} from '../api';
import { useAppStore } from '../store';
import { useThemeStyles } from '../hooks/useThemeStyles';

function priorityClass(priority: string) {
  if (priority === 'high') return 'bg-red-500/10 text-red-400';
  if (priority === 'medium') return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

export default function ContentGenerationDashboard() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const [docId, setDocId] = useState('production:1');
  const [activeDocId, setActiveDocId] = useState('production:1');
  const [summary, setSummary] = useState<GeneratedSummaryResponse | null>(null);
  const [title, setTitle] = useState<GeneratedTitleResponse | null>(null);
  const [structure, setStructure] = useState<GeneratedStructureResponse | null>(null);
  const [suggestions, setSuggestions] = useState<GeneratedSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async (targetDocId = activeDocId) => {
    const normalizedDocId = targetDocId.trim();
    if (!normalizedDocId) return;
    setLoading(true);

    try {
      const [summaryResult, titleResult, structureResult, suggestionsResult] = await Promise.all([
        getGeneratedSummary(normalizedDocId),
        getGeneratedTitle(normalizedDocId),
        getGeneratedStructure(normalizedDocId),
        getGeneratedSuggestions(normalizedDocId),
      ]);
      setSummary(summaryResult);
      setTitle(titleResult);
      setStructure(structureResult);
      setSuggestions(suggestionsResult);
      setActiveDocId(normalizedDocId);
    } catch (error) {
      appStore.addNotification({
        title: '内容生成失败',
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
            <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>Content Generation</p>
            <h1 className={`mt-1 flex items-center gap-2 text-2xl font-bold ${styles.textPrimary}`}>
              <Sparkles className="h-6 w-6 text-blue-400" />
              内容生成助手
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
              生成
            </button>
          </div>
        </div>
      </div>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}>
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>自动生成标题</h2>
          <p className={`mt-1 text-xs ${styles.textMuted}`}>{activeDocId}</p>
        </div>
        <div className="space-y-4 p-5">
          <div className={`rounded-xl ${styles.bgTertiary} p-5`}>
            <p className={`text-xl font-semibold ${styles.textPrimary}`}>
              {title?.title.title || '暂无标题建议'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(title?.title.alternatives || []).map((item) => (
              <span key={item} className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`flex items-center gap-2 border-b ${styles.border} px-5 py-4`}>
            <FilePenLine className="h-5 w-5 text-emerald-400" />
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>一键总结</h2>
          </div>
          <div className="space-y-4 p-5">
            <p className={`text-sm leading-6 ${styles.textSecondary}`}>
              {summary?.summary.summary || '暂无总结'}
            </p>
            <div className="space-y-2">
              {(summary?.summary.keyPoints || []).map((point) => (
                <p key={point} className={`rounded-lg ${styles.bgTertiary} px-3 py-2 text-sm ${styles.textSecondary}`}>
                  {point}
                </p>
              ))}
            </div>
            <p className={`rounded-xl ${styles.bgTertiary} p-4 text-sm ${styles.textSecondary}`}>
              {summary?.summary.evolutionBasedSummary || '暂无演化总结'}
            </p>
          </div>
        </section>

        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`flex items-center gap-2 border-b ${styles.border} px-5 py-4`}>
            <Lightbulb className="h-5 w-5 text-amber-400" />
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>结构优化建议</h2>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <p className={`mb-2 text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>推荐章节结构</p>
              <div className="space-y-2">
                {(structure?.structure.recommendedSections || []).map((section) => (
                  <p key={section} className={`rounded-lg ${styles.bgTertiary} px-3 py-2 text-sm ${styles.textSecondary}`}>
                    {section}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <p className={`mb-2 text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>内容重组建议</p>
              <div className="space-y-2">
                {(structure?.structure.reorganizationSuggestions || []).map((item) => (
                  <p key={item} className={`rounded-lg ${styles.bgTertiary} px-3 py-2 text-sm ${styles.textSecondary}`}>
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}>
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>AI 编辑建议列表</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_0.8fr]">
          <div className="space-y-3">
            {(suggestions?.suggestions || []).map((item) => (
              <div key={`${item.type}-${item.message}`} className={`rounded-xl ${styles.bgTertiary} p-4`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium ${styles.textPrimary}`}>{item.type}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${priorityClass(item.priority)}`}>{item.priority}</span>
                </div>
                <p className={`text-sm ${styles.textSecondary}`}>{item.message}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>可重写区域</p>
            {(suggestions?.weakSections || []).map((section) => (
              <div key={section.section} className={`rounded-xl ${styles.bgTertiary} p-4`}>
                <p className={`text-sm font-medium ${styles.textPrimary}`}>{section.section}</p>
                <p className={`mt-2 text-sm ${styles.textSecondary}`}>{section.reason}</p>
                <p className={`mt-2 text-xs ${section.rewriteRecommended ? 'text-amber-400' : styles.textMuted}`}>
                  {section.rewriteRecommended ? '建议重写' : '可保留，仅需轻量优化'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

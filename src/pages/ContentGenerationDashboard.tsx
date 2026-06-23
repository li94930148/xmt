import { useState } from 'react';
import { FilePenLine, Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { displayDocId } from '../utils/docIdDisplay';
import { useContentOSContext } from '../content/orchestrator/useContentOSContext';
import { getCurrentContentDocument, resolveContentDocument, setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import ContentDocumentPicker from '../components/ContentDocumentPicker';

function priorityClass(priority: string) {
  if (priority === 'high') return 'bg-red-500/10 text-red-400';
  if (priority === 'medium') return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

function priorityLabel(priority: string) {
  if (priority === 'high') return '高优先级';
  if (priority === 'medium') return '中优先级';
  return '低优先级';
}

function suggestionTypeLabel(type: string) {
  if (type === 'paragraph') return '段落优化';
  if (type === 'redundancy') return '冗余检测';
  if (type === 'logic') return '逻辑结构';
  return '协作影响';
}

export default function ContentGenerationDashboard() {
  const styles = useThemeStyles();
  const initialDocument = getCurrentContentDocument();
  const [docId, setDocId] = useState(initialDocument.label);
  const [activeDocId, setActiveDocId] = useState(initialDocument.docId);
  const [refreshKey, setRefreshKey] = useState(0);
  const context = useContentOSContext(activeDocId, refreshKey);
  const { summary, title, structure, suggestions, weakSections } = context.generation;

  const loadData = (targetDocId = activeDocId) => {
    const resolved = resolveContentDocument(targetDocId);
    if (!resolved) return;
    const current = setCurrentContentDocument(resolved.docId, resolved.title);
    setDocId(current.title);
    setActiveDocId(current.docId);
    setRefreshKey((value) => value + 1);
  };

  const pickDocument = (pickedDocId: string, pickedTitle: string) => {
    const current = setCurrentContentDocument(pickedDocId, pickedTitle);
    setDocId(current.title);
    setActiveDocId(current.docId);
    setRefreshKey((value) => value + 1);
  };

  return (
    <div className="space-y-5">
      <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={`text-xs tracking-[0.24em] ${styles.textMuted}`}>内容生成助手</p>
            <h1 className={`mt-1 flex items-center gap-2 text-2xl font-bold ${styles.textPrimary}`}>
              <Sparkles className="h-6 w-6 text-blue-400" />
              内容生成助手
            </h1>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <ContentDocumentPicker
              value={docId}
              onChange={setDocId}
              onPick={pickDocument}
              className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary}`}
            />
            <button
              onClick={() => loadData(docId)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              生成
            </button>
          </div>
        </div>
      </div>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}>
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>自动生成标题</h2>
          <p className={`mt-1 text-xs ${styles.textMuted}`}>{displayDocId(activeDocId)}</p>
        </div>
        <div className="space-y-4 p-5">
          <div className={`rounded-xl ${styles.bgTertiary} p-5`}>
            <p className={`text-xl font-semibold ${styles.textPrimary}`}>
              {title.title || '暂无标题建议'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {title.alternatives.map((item) => (
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
              {summary.summary || '暂无总结'}
            </p>
            <div className="space-y-2">
              {summary.keyPoints.map((point) => (
                <p key={point} className={`rounded-lg ${styles.bgTertiary} px-3 py-2 text-sm ${styles.textSecondary}`}>
                  {point}
                </p>
              ))}
            </div>
            <p className={`rounded-xl ${styles.bgTertiary} p-4 text-sm ${styles.textSecondary}`}>
              {summary.evolutionBasedSummary || '暂无演化总结'}
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
                {structure.recommendedSections.map((section) => (
                  <p key={section} className={`rounded-lg ${styles.bgTertiary} px-3 py-2 text-sm ${styles.textSecondary}`}>
                    {section}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <p className={`mb-2 text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>内容重组建议</p>
              <div className="space-y-2">
                {structure.reorganizationSuggestions.map((item) => (
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
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>智能编辑建议列表</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_0.8fr]">
          <div className="space-y-3">
            {suggestions.map((item) => (
              <div key={`${item.type}-${item.message}`} className={`rounded-xl ${styles.bgTertiary} p-4`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium ${styles.textPrimary}`}>{suggestionTypeLabel(item.type)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${priorityClass(item.priority)}`}>{priorityLabel(item.priority)}</span>
                </div>
                <p className={`text-sm ${styles.textSecondary}`}>{item.message}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <p className={`text-xs uppercase tracking-[0.18em] ${styles.textMuted}`}>可重写区域</p>
            {weakSections.map((section) => (
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

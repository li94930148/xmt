import { useState } from 'react';
import { Activity, BarChart3, Brain, RefreshCw, Users } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { displayDocId } from '../utils/docIdDisplay';
import { useContentOSContext } from '../content/orchestrator/useContentOSContext';
import { getCurrentContentDocument, resolveContentDocument, setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import ContentDocumentPicker from '../components/ContentDocumentPicker';

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    draft: '初稿',
    editing: '集中编辑',
    refining: '精修',
    finalizing: '定稿收敛',
  };
  return labels[phase] || phase;
}

function trendLabel(trend?: string) {
  if (trend === 'improving') return '持续改善';
  if (trend === 'declining') return '风险下降';
  return '稳定';
}

export default function ContentIntelligenceDashboard() {
  const styles = useThemeStyles();
  const initialDocument = getCurrentContentDocument();
  const [docId, setDocId] = useState(initialDocument.label);
  const [activeDocId, setActiveDocId] = useState(initialDocument.docId);
  const [refreshKey, setRefreshKey] = useState(0);
  const context = useContentOSContext(activeDocId, refreshKey);
  const { evolution, stability, impact, quality } = context.intelligence;

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
            <p className={`text-xs tracking-[0.24em] ${styles.textMuted}`}>内容智能理解</p>
            <h1 className={`mt-1 flex items-center gap-2 text-2xl font-bold ${styles.textPrimary}`}>
              <Brain className="h-6 w-6 text-blue-400" />
              内容智能理解
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
              分析
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { label: '质量评分', value: quality.score, icon: BarChart3 },
          { label: '参与用户', value: impact.length, icon: Users },
          { label: '演化阶段', value: evolution.phases.length, icon: Activity },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={`${styles.bgSecondary} border ${styles.border} rounded-xl p-4`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${styles.textMuted}`}>{item.label}</span>
                <Icon className="h-4 w-4 text-blue-400" />
              </div>
              <p className={`mt-3 text-2xl font-semibold ${styles.textPrimary}`}>{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`border-b ${styles.border} px-5 py-4`}>
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>内容演化阶段</h2>
            <p className={`mt-1 text-xs ${styles.textMuted}`}>{displayDocId(activeDocId)}</p>
          </div>
          <div className="space-y-4 p-5">
            <p className={`text-sm leading-6 ${styles.textSecondary}`}>
              {evolution.evolutionSummary || '暂无演化数据'}
            </p>
            <div className="space-y-3">
              {evolution.phases.map((phase, index) => (
                <div key={`${phase.phase}-${phase.start}-${index}`} className={`rounded-xl ${styles.bgTertiary} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-medium ${styles.textPrimary}`}>{phaseLabel(phase.phase)}</span>
                    <span className={`text-xs ${styles.textMuted}`}>
                      {new Date(phase.start).toLocaleString('zh-CN', { hour12: false })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className={`rounded-xl ${styles.bgTertiary} p-4 text-sm ${styles.textSecondary}`}>
              {stability.reason || '暂无稳定性判断'}
            </div>
          </div>
        </section>

        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`border-b ${styles.border} px-5 py-4`}>
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>内容质量趋势</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className={`rounded-xl ${styles.bgTertiary} p-5`}>
              <p className={`text-sm ${styles.textMuted}`}>趋势</p>
              <p className={`mt-2 text-2xl font-semibold ${styles.textPrimary}`}>
                {trendLabel(quality.trend)}
              </p>
            </div>
            <div className="space-y-2">
              {quality.reasons.map((reason) => (
                <p key={reason} className={`rounded-lg ${styles.bgTertiary} px-3 py-2 text-sm ${styles.textSecondary}`}>
                  {reason}
                </p>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}>
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>用户影响力与结构分析</h2>
        </div>
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className={`border-b ${styles.border} ${styles.textMuted}`}>
                <th className="py-3 text-left font-medium">用户</th>
                <th className="py-3 text-left font-medium">影响分</th>
                <th className="py-3 text-left font-medium">结构</th>
                <th className="py-3 text-left font-medium">表达</th>
                <th className="py-3 text-left font-medium">润色</th>
                <th className="py-3 text-left font-medium">判断</th>
              </tr>
            </thead>
            <tbody>
              {impact.map((user) => (
                <tr key={user.userId} className={`border-b ${styles.border}`}>
                  <td className={`py-3 ${styles.textPrimary}`}>{user.userId}</td>
                  <td className={`py-3 ${styles.textSecondary}`}>{user.impactScore}</td>
                  <td className={`py-3 ${styles.textSecondary}`}>{user.structuralEdits}</td>
                  <td className={`py-3 ${styles.textSecondary}`}>{user.expressionEdits}</td>
                  <td className={`py-3 ${styles.textSecondary}`}>{user.polishEdits}</td>
                  <td className={`py-3 ${styles.textSecondary}`}>{user.summary}</td>
                </tr>
              ))}
              {impact.length === 0 && (
                <tr>
                  <td colSpan={6} className={`py-6 text-center ${styles.textMuted}`}>暂无用户影响数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

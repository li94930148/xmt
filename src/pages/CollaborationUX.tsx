import { useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Flame, RefreshCw, Sparkles, User } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { displayDocId } from '../utils/docIdDisplay';
import { useContentOSContext } from '../content/orchestrator/useContentOSContext';
import type { UnifiedTimelineEvent } from '../editor/timeline/unifiedContentTimeline';
import { editorStateLabel } from '../editor/state/editorStateManager';
import { getCurrentContentDocument, resolveContentDocument, setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import ContentDocumentPicker from '../components/ContentDocumentPicker';

function formatTime(timestamp?: number | null) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function eventText(event: UnifiedTimelineEvent) {
  const actor = event.userId || String(event.payload?.operatorName || event.payload?.userId || '系统');
  if (event.type === 'edit') return `${actor} 更新了内容`;
  if (event.type === 'save') return `${actor} 触发了自动保存`;
  if (event.type === 'version') return `${actor} 形成了版本节点`;
  if (event.type === 'snapshot') return `${actor} 创建了恢复快照`;
  return `${actor} 处理了一次协作冲突`;
}

function eventTypeLabel(type: UnifiedTimelineEvent['type']) {
  if (type === 'edit') return '编辑';
  if (type === 'save') return '保存';
  if (type === 'version') return '版本';
  if (type === 'snapshot') return '快照';
  return '冲突';
}

export default function CollaborationUX() {
  const styles = useThemeStyles();
  const initialDocument = getCurrentContentDocument();
  const [docId, setDocId] = useState(initialDocument.label);
  const [activeDocId, setActiveDocId] = useState(initialDocument.docId);
  const [refreshKey, setRefreshKey] = useState(0);
  const context = useContentOSContext(activeDocId, refreshKey);
  const narrative = useMemo(
    () => context.timeline.events.map((event) => ({
      id: event.id,
      text: eventText(event),
      timestamp: event.timestamp,
      userId: event.userId || String(event.payload?.operatorName || event.payload?.userId || '系统'),
      type: event.type,
    })),
    [context.timeline.events],
  );
  const mostActiveUser = context.intelligence.impact[0]?.userId || context.presence.activeUsers[0]?.name || '-';
  const conflictHotspots = context.timeline.events
    .filter((event) => event.type === 'conflict')
    .map((event) => String(event.payload?.label || event.id));

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
            <p className={`text-xs tracking-[0.24em] ${styles.textMuted}`}>协作故事线</p>
            <h1 className={`mt-1 text-2xl font-bold ${styles.textPrimary}`}>协作故事线</h1>
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

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
          <h2 className={`text-base font-semibold ${styles.textPrimary}`}>解释摘要</h2>
          <span className={`ml-auto text-xs ${styles.textMuted}`}>{displayDocId(activeDocId)}</span>
        </div>
        <p className={`mt-4 text-sm leading-6 ${styles.textSecondary}`}>
          {context.timeline.events.length > 0
            ? `当前文档共有 ${context.timeline.events.length} 个协作与内容演化节点，编辑状态为 ${editorStateLabel(context.uxState)}。`
            : '暂无可解释的协作事件。'}
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
                    <p className={`mt-2 text-xs ${styles.textMuted}`}>
                      用户 {item.userId} · {eventTypeLabel(item.type)}
                    </p>
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
              {mostActiveUser}
            </p>
          </section>

          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>热点区域</h2>
            </div>
            <p className={`mt-4 text-sm ${styles.textSecondary}`}>
              {context.intelligence.structuralEditors[0]?.summary || context.intelligence.stability.reason || '暂无热点区域'}
            </p>
          </section>

          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>冲突解释</h2>
            </div>
            {conflictHotspots.length ? (
              <div className="mt-4 space-y-2">
                {conflictHotspots.map((hotspot) => (
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

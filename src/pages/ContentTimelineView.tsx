import { useMemo, useState } from 'react';
import { Clock, GitCommit, RefreshCw } from 'lucide-react';
import { getFullHistory, jumpToTimestamp, compareTimeline } from '../editor/timeline/editorHistoryController';
import type { UnifiedTimelineEvent } from '../editor/timeline/unifiedContentTimeline';
import { useThemeStyles } from '../hooks/useThemeStyles';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function typeLabel(type: UnifiedTimelineEvent['type']) {
  const labels: Record<UnifiedTimelineEvent['type'], string> = {
    edit: '编辑',
    save: '保存',
    version: '版本',
    snapshot: '快照',
    conflict: '冲突',
  };
  return labels[type];
}

function typeClass(type: UnifiedTimelineEvent['type']) {
  const classes: Record<UnifiedTimelineEvent['type'], string> = {
    edit: 'bg-blue-500/15 text-blue-400',
    save: 'bg-emerald-500/15 text-emerald-400',
    version: 'bg-purple-500/15 text-purple-400',
    snapshot: 'bg-cyan-500/15 text-cyan-400',
    conflict: 'bg-red-500/15 text-red-400',
  };
  return classes[type];
}

export default function ContentTimelineView() {
  const styles = useThemeStyles();
  const [docId, setDocId] = useState('production:1');
  const [activeDocId, setActiveDocId] = useState('production:1');
  const [selected, setSelected] = useState<UnifiedTimelineEvent | null>(null);

  const history = useMemo(() => getFullHistory(activeDocId), [activeDocId]);
  const jumpResult = selected ? jumpToTimestamp(activeDocId, selected.timestamp) : null;
  const comparison = selected ? compareTimeline(jumpResult?.currentEvent || null, jumpResult?.nextEvent || null) : null;

  return (
    <div className="space-y-5">
      <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={`text-xs uppercase tracking-[0.24em] ${styles.textMuted}`}>Unified Content Timeline</p>
            <h1 className={`mt-1 text-2xl font-bold ${styles.textPrimary}`}>内容统一时间轴</h1>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <input
              value={docId}
              onChange={(event) => setDocId(event.target.value)}
              className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary}`}
              placeholder="production:1 或 shooting:1"
            />
            <button
              onClick={() => {
                setActiveDocId(docId.trim() || 'production:1');
                setSelected(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              查看
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_0.8fr]">
        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`flex items-center justify-between border-b ${styles.border} px-5 py-4`}>
            <div className="flex items-center gap-2">
              <GitCommit className="h-5 w-5 text-blue-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>时间轴节点</h2>
            </div>
            <span className={`text-xs ${styles.textMuted}`}>{history.timeline.length} 个节点</span>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-5">
            {history.timeline.length === 0 ? (
              <div className={`rounded-xl ${styles.bgTertiary} p-6 text-center text-sm ${styles.textMuted}`}>
                暂无编辑、保存或版本节点
              </div>
            ) : (
              <div className="space-y-3">
                {history.timeline.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelected(event)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selected?.id === event.id ? 'border-blue-500 bg-blue-500/10' : `${styles.border} ${styles.bgTertiary} ${styles.hoverBg}`
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${typeClass(event.type)}`}>
                          {typeLabel(event.type)}
                        </span>
                        <span className={`text-sm ${styles.textPrimary}`}>{event.payload?.version ? `版本 ${event.payload.version}` : event.source}</span>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs ${styles.textMuted}`}>
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    {event.userId && <p className={`mt-2 text-xs ${styles.textMuted}`}>操作者：{event.userId}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`border-b ${styles.border} px-5 py-4`}>
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>节点详情</h2>
          </div>
          <div className="space-y-4 p-5">
            {selected ? (
              <>
                <div className={`rounded-xl ${styles.bgTertiary} p-4`}>
                  <p className={`text-sm font-medium ${styles.textPrimary}`}>{typeLabel(selected.type)}节点</p>
                  <p className={`mt-2 text-xs ${styles.textMuted}`}>{formatTime(selected.timestamp)}</p>
                  <p className={`mt-2 text-xs ${styles.textMuted}`}>来源：{selected.source}</p>
                </div>
                <pre className={`max-h-72 overflow-auto rounded-xl p-4 text-xs ${styles.bgTertiary} ${styles.textSecondary}`}>
                  {JSON.stringify(selected.payload || {}, null, 2)}
                </pre>
                <div className={`rounded-xl ${styles.bgTertiary} p-4 text-sm ${styles.textSecondary}`}>
                  <p>只读跳转：{jumpResult?.currentEvent ? '可定位到该时间点' : '暂无可定位节点'}</p>
                  <p className="mt-2">与下一节点差异：{comparison?.changed ? '存在变化' : '无变化'}</p>
                </div>
              </>
            ) : (
              <p className={`text-sm ${styles.textMuted}`}>选择一个时间轴节点查看详情。</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

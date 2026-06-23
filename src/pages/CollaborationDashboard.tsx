import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  GitBranch,
  History,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { displayDocId } from '../utils/docIdDisplay';
import { useContentOSContext } from '../content/orchestrator/useContentOSContext';
import type { UnifiedTimelineEvent } from '../editor/timeline/unifiedContentTimeline';
import { getCurrentContentDocument, resolveContentDocument, setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import ContentDocumentPicker from '../components/ContentDocumentPicker';

function formatTime(timestamp?: number | null) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function eventColor(type: UnifiedTimelineEvent['type']) {
  const colors: Record<UnifiedTimelineEvent['type'], string> = {
    edit: 'bg-blue-500/15 text-blue-400',
    save: 'bg-emerald-500/15 text-emerald-400',
    version: 'bg-purple-500/15 text-purple-400',
    snapshot: 'bg-purple-500/15 text-purple-400',
    conflict: 'bg-red-500/15 text-red-400',
  };
  return colors[type];
}

function eventTypeLabel(type: UnifiedTimelineEvent['type']) {
  if (type === 'edit') return '编辑';
  if (type === 'save') return '保存';
  if (type === 'version') return '版本';
  if (type === 'snapshot') return '快照';
  return '冲突';
}

function diffSummary(diff?: unknown) {
  if (!diff) return '';
  if (Array.isArray(diff)) return `包含 ${diff.length} 条差异信息`;
  if (typeof diff === 'object') return `包含 ${Object.keys(diff as Record<string, unknown>).length} 项差异信息`;
  return '包含差异信息';
}

export default function CollaborationDashboard() {
  const styles = useThemeStyles();
  const initialDocument = getCurrentContentDocument();
  const [docId, setDocId] = useState(initialDocument.label);
  const [activeDocId, setActiveDocId] = useState(initialDocument.docId);
  const [humanReadableMode, setHumanReadableMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const context = useContentOSContext(activeDocId, refreshKey);
  const events = context.timeline.events;
  const conflicts = useMemo(() => events.filter((event) => event.type === 'conflict'), [events]);
  const snapshots = useMemo(() => events.filter((event) => event.type === 'snapshot'), [events]);
  const totalEdits = useMemo(() => events.filter((event) => event.type === 'edit').length, [events]);
  const diffCount = events.length;
  const narrative = useMemo(
    () => events.map((event) => ({
      id: event.id,
      text: `${event.userId || String(event.payload?.operatorName || event.payload?.userId || '系统')} 产生了${eventTypeLabel(event.type)}节点`,
      timestamp: event.timestamp,
      userId: event.userId || String(event.payload?.operatorName || event.payload?.userId || '系统'),
      type: event.type,
    })),
    [events],
  );

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
            <p className={`text-xs tracking-[0.24em] ${styles.textMuted}`}>协作控制台</p>
            <h1 className={`mt-1 text-2xl font-bold ${styles.textPrimary}`}>协作控制台</h1>
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
              刷新
            </button>
          </div>
        </div>
      </div>

      <div className={`${styles.bgSecondary} border ${styles.border} rounded-xl px-4 py-3`}>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className={`block text-sm font-medium ${styles.textPrimary}`}>人类可读模式</span>
            <span className={`text-xs ${styles.textMuted}`}>将协作事件切换为面向用户的故事线与解释面板。</span>
          </span>
          <input
            type="checkbox"
            checked={humanReadableMode}
            onChange={(event) => setHumanReadableMode(event.target.checked)}
            className="h-5 w-5 accent-blue-600"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '编辑次数', value: totalEdits, icon: Activity },
          { label: '在线用户', value: context.presence.activeUserCount, icon: Users },
          { label: '冲突次数', value: conflicts.length, icon: AlertTriangle },
          { label: '差异序列', value: diffCount, icon: GitBranch },
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
          <div className={`flex items-center justify-between border-b ${styles.border} px-5 py-4`}>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>
                {humanReadableMode ? '叙事视图' : '时间轴'}
              </h2>
            </div>
            <span className={`text-xs ${styles.textMuted}`}>{displayDocId(activeDocId)}</span>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-5">
            {humanReadableMode ? (
              narrative.length === 0 ? (
                <div className={`rounded-xl ${styles.bgTertiary} p-6 text-center text-sm ${styles.textMuted}`}>
                  暂无可解释的协作故事线
                </div>
              ) : (
                <div className="space-y-3">
                  {narrative.map((item) => (
                    <div key={item.id} className={`rounded-xl border ${styles.border} ${styles.bgTertiary} p-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className={`text-sm font-medium ${styles.textPrimary}`}>{item.text}</span>
                        <span className={`inline-flex items-center gap-1 text-xs ${styles.textMuted}`}>
                          <Clock className="h-3.5 w-3.5" />
                          {formatTime(item.timestamp)}
                        </span>
                      </div>
                      <p className={`mt-2 text-xs ${styles.textMuted}`}>
                        {item.userId} · {eventTypeLabel(item.type)}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : events.length === 0 ? (
              <div className={`rounded-xl ${styles.bgTertiary} p-6 text-center text-sm ${styles.textMuted}`}>
                暂无运行时事件
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className={`rounded-xl border ${styles.border} ${styles.bgTertiary} p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${eventColor(event.type)}`}>
                          {eventTypeLabel(event.type)}
                        </span>
                        <span className={`text-sm font-medium ${styles.textPrimary}`}>{event.userId}</span>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs ${styles.textMuted}`}>
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    {event.type === 'snapshot' && <p className="mt-2 truncate text-xs text-purple-400">{event.id}</p>}
                    {event.payload && (
                      <p className={`mt-3 rounded-lg p-3 text-xs ${styles.bgSecondary} ${styles.textSecondary}`}>
                        {diffSummary(event.payload)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          {humanReadableMode && (
            <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
              <div className={`border-b ${styles.border} px-5 py-4`}>
                <h2 className={`text-base font-semibold ${styles.textPrimary}`}>解释面板</h2>
              </div>
              <div className="space-y-4 p-5">
                <p className={`text-sm leading-6 ${styles.textSecondary}`}>
                  {events.length > 0 ? `当前统一上下文包含 ${events.length} 个时间轴节点。` : '暂无协作解释摘要'}
                </p>
                <div className={`rounded-xl ${styles.bgTertiary} p-4 text-sm ${styles.textSecondary}`}>
                  <p>最活跃用户：{context.intelligence.impact[0]?.userId ?? '-'}</p>
                  <p className="mt-2">热点区域：{context.intelligence.stability.reason ?? '-'}</p>
                </div>
                <div>
                  <p className={`mb-2 text-xs tracking-[0.18em] ${styles.textMuted}`}>冲突热点</p>
                  {conflicts.length ? (
                    <div className="flex flex-wrap gap-2">
                      {conflicts.map((event) => (
                        <span key={event.id} className="rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-300">
                          {event.payload?.label ? String(event.payload.label) : event.id}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-sm ${styles.textMuted}`}>暂无冲突热点</p>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
            <div className={`flex items-center gap-2 border-b ${styles.border} px-5 py-4`}>
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>用户贡献</h2>
            </div>
            <div className="p-5">
              {context.intelligence.impact.length === 0 ? (
                <p className={`text-sm ${styles.textMuted}`}>暂无贡献数据</p>
              ) : (
                <div className="space-y-3">
                  {context.intelligence.impact.map((item) => (
                    <div key={item.userId}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className={styles.textPrimary}>{item.userId}</span>
                        <span className={styles.textMuted}>{item.impactScore}</span>
                      </div>
                      <div className={`h-2 rounded-full ${styles.bgTertiary}`}>
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(item.impactScore * 10, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
            <div className={`border-b ${styles.border} px-5 py-4`}>
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>快照</h2>
            </div>
            <div className="max-h-64 overflow-y-auto p-5">
              {snapshots.length === 0 ? (
                <p className={`text-sm ${styles.textMuted}`}>暂无快照</p>
              ) : (
                <div className="space-y-2">
                  {snapshots.map((snapshot) => (
                    <div key={snapshot.id} className={`rounded-lg ${styles.bgTertiary} p-3`}>
                      <p className={`truncate text-xs font-medium ${styles.textPrimary}`}>{snapshot.id}</p>
                      <p className={`mt-1 text-xs ${styles.textMuted}`}>
                        统一时间轴快照 · {formatTime(snapshot.timestamp)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
            <div className={`border-b ${styles.border} px-5 py-4`}>
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>冲突记录</h2>
            </div>
            <div className="p-5">
              {conflicts.length === 0 ? (
                <p className={`text-sm ${styles.textMuted}`}>暂无冲突</p>
              ) : (
                <div className="space-y-2">
                  {conflicts.map((event) => (
                    <div key={event.id} className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                      <p className="text-sm font-medium text-red-300">{event.userId}</p>
                      <p className="mt-1 text-xs text-red-200/80">{formatTime(event.timestamp)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

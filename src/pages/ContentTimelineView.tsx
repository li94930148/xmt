import { useEffect, useMemo, useState } from 'react';
import { Clock3, FileClock, GitBranch, RefreshCw, UserRound } from 'lucide-react';
import { getProductionById, getProductionHistory, getShootingById } from '../api/workflow';
import ContentDocumentPicker from '../components/ContentDocumentPicker';
import { getCurrentContentDocument, resolveContentDocument, setCurrentContentDocument } from '../content/orchestrator/currentContentDocument';
import { getTimelineView, type BuildUnifiedTimelineSources, type UnifiedTimelineEvent } from '../editor/timeline/unifiedContentTimeline';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime } from '../lib/utils';
import { parseStoredBjt } from '@shared/time';
import { productionHistoryTimestamp } from '../lib/productionHistoryTime';

function eventText(event: UnifiedTimelineEvent) {
  const version = event.payload?.version ? ` ${String(event.payload.version)}` : '';
  if (event.type === 'version') return `生成了版本${version}`;
  if (event.type === 'save') return '保存了内容';
  if (event.type === 'snapshot') return `归档了版本${version}`;
  if (event.type === 'conflict') return '发现并处理协作冲突';
  return '编辑了内容';
}

function eventTone(type: UnifiedTimelineEvent['type']) {
  if (type === 'conflict') return 'bg-red-500';
  if (type === 'version') return 'bg-violet-500';
  if (type === 'save') return 'bg-emerald-500';
  return 'bg-blue-500';
}

function timeRange(start: number, end: number) {
  const startText = formatBeijingTime(start, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (start === end) return startText;
  return `${startText} – ${formatBeijingTime(end, { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadPersistedSources(docId: string): Promise<BuildUnifiedTimelineSources> {
  const [kind, rawId] = docId.split(':');
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return {};

  if (kind === 'production') {
    const [production, history] = await Promise.all([getProductionById(id), getProductionHistory(id)]);
    return {
      // History rows snapshot the *previous* version when a newer one is made.
      // The current row's updated_at is the last save, not its creation time.
      versionEvents: history.map((entry) => ({ id: `history-${entry.id}`, timestamp: productionHistoryTimestamp(entry.created_at), type: 'snapshot', version: entry.version, operatorName: entry.operator_name })),
      saveEvents: [{ id: `current-${production.id}`, timestamp: parseStoredBjt(production.updated_at || production.created_at)?.getTime(), operatorName: production.operator_name }],
    };
  }

  if (kind === 'shooting') {
    const shooting = await getShootingById(id);
    return {
      saveEvents: [{ id: `shooting-${id}`, timestamp: parseStoredBjt(shooting.updated_at || shooting.created_at)?.getTime(), operatorName: shooting.operator_name, label: '成片记录' }],
    };
  }
  return {};
}

export default function ContentTimelineView() {
  const styles = useThemeStyles();
  const initial = getCurrentContentDocument();
  const [input, setInput] = useState(initial.label);
  const [document, setDocument] = useState(initial);
  const [sources, setSources] = useState<BuildUnifiedTimelineSources>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void loadPersistedSources(document.docId).then((next) => {
      if (active) setSources(next);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : '内容动态加载失败');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [document.docId, reloadKey]);

  const timeline = useMemo(() => getTimelineView(document.docId, sources), [document.docId, sources]);
  const sessions = useMemo(() => timeline.sessions.slice().reverse(), [timeline.sessions]);
  const people = useMemo(() => new Set(timeline.timeline.map((event) => event.userId).filter(Boolean)).size, [timeline.timeline]);
  const versionCount = document.docId.startsWith('production:')
    ? (sources.versionEvents?.length || 0) + (sources.saveEvents?.length ? 1 : 0)
    : timeline.timeline.filter((event) => event.type === 'version').length;
  const latest = timeline.timeline[timeline.timeline.length - 1];

  const chooseDocument = (docId: string, title: string) => {
    const next = setCurrentContentDocument(docId, title);
    setInput(next.title);
    setDocument(next);
  };

  const applyInput = () => {
    const resolved = resolveContentDocument(input);
    if (!resolved) {
      setError('请从最近内容中选择，或输入 production:编号 / shooting:编号');
      return;
    }
    chooseDocument(resolved.docId, resolved.title);
    setReloadKey((value) => value + 1);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-12">
      <header className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className={`text-xs font-medium ${styles.textMuted}`}>内容生产记录</p><h1 className={`mt-1 text-2xl font-bold ${styles.textPrimary}`}>内容动态</h1><p className={`mt-2 text-sm ${styles.textMuted}`}>按时间查看这篇内容的编辑、保存和版本变化</p></div>
          <div className="flex w-full gap-2 lg:w-auto">
            <ContentDocumentPicker value={input} onChange={setInput} onPick={chooseDocument} className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm lg:w-80 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary}`} />
            <button type="button" onClick={applyInput} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>查看</button>
          </div>
        </div>
      </header>

      {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}><div className={`flex items-center gap-2 text-xs ${styles.textMuted}`}><FileClock className="h-4 w-4"/>最近更新</div><p className={`mt-3 text-base font-semibold ${styles.textPrimary}`}>{latest ? formatBeijingTime(latest.timestamp, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无记录'}</p></div>
        <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}><div className={`flex items-center gap-2 text-xs ${styles.textMuted}`}><GitBranch className="h-4 w-4"/>版本记录</div><p className={`mt-3 text-2xl font-semibold ${styles.textPrimary}`}>{versionCount}</p></div>
        <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}><div className={`flex items-center gap-2 text-xs ${styles.textMuted}`}><UserRound className="h-4 w-4"/>参与人员</div><p className={`mt-3 text-2xl font-semibold ${styles.textPrimary}`}>{people}</p></div>
      </section>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}><h2 className={`font-semibold ${styles.textPrimary}`}>{document.title}</h2><p className={`mt-1 text-xs ${styles.textMuted}`}>{sessions.length} 次编辑会话 · {timeline.timeline.length} 条有效记录</p></div>
        {loading && timeline.timeline.length === 0 ? <div className={`grid min-h-64 place-items-center ${styles.textMuted}`}><RefreshCw className="h-6 w-6 animate-spin"/></div> : sessions.length === 0 ? <div className="px-6 py-16 text-center"><Clock3 className={`mx-auto h-10 w-10 ${styles.textMuted}`}/><p className={`mt-4 text-sm font-medium ${styles.textPrimary}`}>这篇内容还没有可展示的动态</p><p className={`mt-2 text-xs ${styles.textMuted}`}>完成一次保存或生成版本后，这里会自动出现记录。</p></div> : <div className="divide-y divide-theme-border">
          {sessions.map((session) => <article key={session.id} className="grid gap-4 px-5 py-5 md:grid-cols-[180px_1fr]"><div><p className={`text-sm font-medium ${styles.textPrimary}`}>{timeRange(session.start, session.end)}</p><p className={`mt-1 text-xs ${styles.textMuted}`}>{session.events.length} 项变化</p></div><ol className="space-y-4">{session.events.slice().reverse().map((event) => <li key={event.id} className="flex gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${eventTone(event.type)}`}/><div className="min-w-0"><p className={`text-sm ${styles.textPrimary}`}>{eventText(event)}</p><p className={`mt-1 text-xs ${styles.textMuted}`}>{event.userId ? `${event.userId} · ` : ''}{formatBeijingTime(event.timestamp, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p></div></li>)}</ol></article>)}
        </div>}
      </section>
    </div>
  );
}

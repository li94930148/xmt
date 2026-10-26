import { useEffect, useMemo, useRef, useState } from 'react';
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
  if (type === 'conflict') return 'bg-studio-coral';
  if (type === 'version') return 'bg-studio-violet';
  if (type === 'save') return 'bg-studio-success';
  return 'bg-studio-primary';
}

function timeRange(start: number, end: number) {
  const startText = formatBeijingTime(start, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (start === end) return startText;
  return `${startText} – ${formatBeijingTime(end, { hour: '2-digit', minute: '2-digit' })}`;
}

function readFailureMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('详情')) return '创作详情暂时无法读取';
  if (message.includes('版本历史')) return '创作版本历史暂时无法读取';
  return '内容动态暂时无法读取';
}

const EMPTY_TIMELINE_SOURCES: BuildUnifiedTimelineSources = {};

function persistedSaveEvents(
  id: string,
  updatedAt: Parameters<typeof parseStoredBjt>[0],
  createdAt: Parameters<typeof parseStoredBjt>[0],
  operatorName?: string | null,
  label?: string,
) {
  const savedAt = parseStoredBjt(updatedAt) ?? parseStoredBjt(createdAt);
  if (!savedAt) return [];

  return [{ id, timestamp: savedAt.getTime(), operatorName, ...(label ? { label } : {}) }];
}

async function loadPersistedSources(docId: string): Promise<BuildUnifiedTimelineSources> {
  const [kind, rawId] = docId.split(':');
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return {};

  if (kind === 'production') {
    const [production, firstPage] = await Promise.all([getProductionById(id), getProductionHistory(id, 1, 100, false)]);
    const history = [...firstPage.data];
    for (let page = 2; history.length < firstPage.total; page++) {
      const next = await getProductionHistory(id, page, 100, false);
      if (!next.data.length) break;
      history.push(...next.data);
    }
    return {
      // History rows snapshot the *previous* version when a newer one is made.
      // The current row's updated_at is the last save, not its creation time.
      versionEvents: history.map((entry) => ({ id: `history-${entry.id}`, timestamp: productionHistoryTimestamp(entry.created_at), type: 'snapshot', version: entry.version, operatorName: entry.operator_name })),
      saveEvents: persistedSaveEvents(`current-${production.id}`, production.updated_at, production.created_at, production.operator_name),
    };
  }

  if (kind === 'shooting') {
    const shooting = await getShootingById(id);
    return {
      saveEvents: persistedSaveEvents(`shooting-${id}`, shooting.updated_at, shooting.created_at, shooting.operator_name, '成片记录'),
    };
  }
  return {};
}

export default function ContentTimelineView() {
  const styles = useThemeStyles();
  const initial = getCurrentContentDocument();
  const [input, setInput] = useState(initial.label);
  const [document, setDocument] = useState(initial);
  const [loadedSources, setLoadedSources] = useState<{ docId: string; sources: BuildUnifiedTimelineSources } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDocId, setLoadingDocId] = useState(initial.docId);
  const [readError, setReadError] = useState<{ docId: string; message: string } | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = ++requestIdRef.current;
    setLoadingDocId(document.docId);
    setLoading(true);
    setReadError((current) => current?.docId === document.docId ? null : current);
    void loadPersistedSources(document.docId).then((next) => {
      if (active && requestIdRef.current === requestId) {
        setLoadedSources({ docId: document.docId, sources: next });
        setReadError(null);
      }
    }).catch((cause) => {
      if (active && requestIdRef.current === requestId) {
        setReadError({ docId: document.docId, message: readFailureMessage(cause) });
      }
    }).finally(() => {
      if (active && requestIdRef.current === requestId) setLoading(false);
    });
    return () => {
      active = false;
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [document.docId, reloadKey]);

  const currentSources = loadedSources?.docId === document.docId ? loadedSources.sources : EMPTY_TIMELINE_SOURCES;
  const hasSuccessfulRead = loadedSources?.docId === document.docId;
  const currentReadError = readError?.docId === document.docId ? readError : null;
  const isLoadingCurrentDocument = loading && loadingDocId === document.docId;
  const timeline = useMemo(() => getTimelineView(document.docId, currentSources), [document.docId, currentSources]);
  const sessions = useMemo(() => timeline.sessions.slice().reverse(), [timeline.sessions]);
  const people = useMemo(() => new Set(timeline.timeline.map((event) => event.userId).filter(Boolean)).size, [timeline.timeline]);
  const versionCount = document.docId.startsWith('production:')
    ? (currentSources.versionEvents?.length || 0) + (currentSources.saveEvents?.length ? 1 : 0)
    : timeline.timeline.filter((event) => event.type === 'version').length;
  const latest = timeline.timeline[timeline.timeline.length - 1];
  const metricUnavailableLabel = currentReadError ? '暂不可用' : '读取中';
  const latestLabel = !hasSuccessfulRead
    ? metricUnavailableLabel
    : latest
      ? formatBeijingTime(latest.timestamp, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : currentReadError
        ? '暂不可用'
        : '暂无记录';
  const showConfirmedEmptyState = hasSuccessfulRead
    && !isLoadingCurrentDocument
    && !currentReadError
    && sessions.length === 0;

  const chooseDocument = (docId: string, title: string) => {
    const next = setCurrentContentDocument(docId, title);
    setInput(next.title);
    setDocument(next);
    setSelectionError('');
  };

  const applyInput = () => {
    const resolved = resolveContentDocument(input);
    if (!resolved) {
      setSelectionError('请从最近内容中选择，或输入 production:编号 / shooting:编号');
      return;
    }
    setSelectionError('');
    chooseDocument(resolved.docId, resolved.title);
    setReloadKey((value) => value + 1);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-12">
      <header className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className={`text-xs font-medium ${styles.textMuted}`}>内容生产记录</p><h1 className={`mt-1 text-2xl font-bold ${styles.textPrimary}`}>内容动态</h1><p className={`mt-2 text-sm ${styles.textMuted}`}>按时间查看这篇内容的编辑、保存和版本变化</p></div>
          <div className="flex w-full gap-2 lg:w-auto">
            <ContentDocumentPicker value={input} onChange={setInput} onPick={chooseDocument} className={`h-10 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm lg:w-80 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary}`} />
            <button type="button" onClick={applyInput} className="inline-flex h-10 items-center gap-2 rounded-lg bg-studio-primary-button px-4 py-2 text-sm font-medium text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>查看</button>
          </div>
        </div>
      </header>

      {selectionError ? <div role="alert" className="rounded-xl border border-studio-coral/30 bg-studio-coral/10 p-4 text-sm text-studio-coral-contrast">{selectionError}</div> : null}
      {currentReadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-coral/30 bg-studio-coral/10 p-4 text-sm text-studio-coral-contrast">
          <p>
            {currentReadError.message}，无法确认当前内容是否为空。
            {hasSuccessfulRead ? '仍显示上次成功读取的动态，可能不是最新。' : '请重试读取后再判断。'}
          </p>
          <button
            type="button"
            disabled={isLoadingCurrentDocument}
            onClick={() => setReloadKey((value) => value + 1)}
            className="h-10 rounded-lg border border-studio-coral/40 px-3 py-2 font-semibold text-studio-text-primary transition hover:bg-studio-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingCurrentDocument ? '正在重新读取…' : '重新读取内容动态'}
          </button>
        </div>
      ) : null}
      {isLoadingCurrentDocument && hasSuccessfulRead ? (
        <p role="status" className={`text-sm ${styles.textMuted}`}>正在重新读取内容动态，暂时保留上次成功结果。</p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}><div className={`flex items-center gap-2 text-xs ${styles.textMuted}`}><FileClock className="h-4 w-4"/>最近更新</div><p className={`mt-3 text-base font-semibold ${styles.textPrimary}`}>{latestLabel}</p></div>
        <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}><div className={`flex items-center gap-2 text-xs ${styles.textMuted}`}><GitBranch className="h-4 w-4"/>版本记录</div><p className={`mt-3 text-2xl font-semibold ${styles.textPrimary}`}>{hasSuccessfulRead ? versionCount : metricUnavailableLabel}</p></div>
        <div className={`${styles.bgSecondary} border ${styles.border} rounded-2xl p-5`}><div className={`flex items-center gap-2 text-xs ${styles.textMuted}`}><UserRound className="h-4 w-4"/>参与人员</div><p className={`mt-3 text-2xl font-semibold ${styles.textPrimary}`}>{hasSuccessfulRead ? people : metricUnavailableLabel}</p></div>
      </section>

      <section className={`${styles.bgSecondary} border ${styles.border} rounded-2xl overflow-hidden`}>
        <div className={`border-b ${styles.border} px-5 py-4`}>
          <h2 className={`font-semibold ${styles.textPrimary}`}>{document.title}</h2>
          <p className={`mt-1 text-xs ${styles.textMuted}`}>
            {hasSuccessfulRead
              ? `${sessions.length} 次编辑会话 · ${timeline.timeline.length} 条有效记录`
              : currentReadError
                ? '读取失败，记录数暂不可用'
                : '正在读取记录…'}
          </p>
        </div>
        {sessions.length > 0 ? <div className="divide-y divide-theme-border">
          {sessions.map((session) => <article key={session.id} className="grid gap-4 px-5 py-5 md:grid-cols-[180px_1fr]"><div><p className={`text-sm font-medium ${styles.textPrimary}`}>{timeRange(session.start, session.end)}</p><p className={`mt-1 text-xs ${styles.textMuted}`}>{session.events.length} 项变化</p></div><ol className="space-y-4">{session.events.slice().reverse().map((event) => <li key={event.id} className="flex gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${eventTone(event.type)}`}/><div className="min-w-0"><p className={`text-sm ${styles.textPrimary}`}>{eventText(event)}</p><p className={`mt-1 text-xs ${styles.textMuted}`}>{event.userId ? `${event.userId} · ` : ''}{formatBeijingTime(event.timestamp, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p></div></li>)}</ol></article>)}
        </div> : currentReadError ? (
          <div className="px-6 py-16 text-center">
            <Clock3 className={`mx-auto h-10 w-10 ${styles.textMuted}`}/>
            <p className={`mt-4 text-sm font-medium ${styles.textPrimary}`}>读取未完成，暂时无法判断是否有动态</p>
            <p className={`mt-2 text-xs ${styles.textMuted}`}>使用上方“重新读取内容动态”只重试读取，不会修改内容。</p>
          </div>
        ) : showConfirmedEmptyState ? (
          <div className="px-6 py-16 text-center"><Clock3 className={`mx-auto h-10 w-10 ${styles.textMuted}`}/><p className={`mt-4 text-sm font-medium ${styles.textPrimary}`}>这篇内容还没有可展示的动态</p><p className={`mt-2 text-xs ${styles.textMuted}`}>完成一次保存或生成版本后，这里会自动出现记录。</p></div>
        ) : (
          <div role="status" className={`grid min-h-64 place-items-center ${styles.textMuted}`}>
            <span className="flex items-center gap-2"><RefreshCw className="h-5 w-5 animate-spin"/>正在读取内容动态…</span>
          </div>
        )}
      </section>
    </div>
  );
}

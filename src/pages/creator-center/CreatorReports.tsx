import { AlertTriangle, BarChart3, CalendarDays, FileText, RefreshCw, Sparkles, Trash2, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteCreatorReport, generateCreatorReport, getCreatorCenterData, getCreatorReports, type CreatorReport } from '@/api/creatorCenter';
import { ConfirmModal } from '@/components/common';
import { getUserFacingErrorMessage } from '@/lib/userFacingError';
import { ErrorState, LoadingState, PageHeader, Panel, asRecord, formatDate, formatNumber, levelMeta, num } from './shared';

type ReportType='daily'|'weekly'|'monthly';
const typeLabel={daily:'日报',weekly:'周报',monthly:'月报'};
const reportWriteReviewStorageKey = (accountId: string) => `xmt:creator-report-write-review:${accountId}`;
const legacyGenerationReviewStorageKey = (accountId: string) => `xmt:creator-report-generation-review:${accountId}`;
type ReportWriteReview =
  | { operation: 'generate'; type: ReportType; baselineIds: number[] }
  | { operation: 'delete'; reportId: number; reportType: ReportType }
  | { operation: 'refresh'; message: string };
export default function CreatorReports() {
  const [reports, setReports] = useState<CreatorReport[]>([]);
  const [accountId, setAccountId] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [active, setActive] = useState<CreatorReport | null>(null);
  const [deleting, setDeleting] = useState<CreatorReport | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [error, setError] = useState('');
  const [reportListUnavailable, setReportListUnavailable] = useState(false);
  const [operationNotice, setOperationNotice] = useState<{ message: string; refreshFailed: boolean; needsReview?: boolean } | null>(null);
  const [pendingWriteReview, setPendingWriteReview] = useState<ReportWriteReview | null>(null);
  const [writeReviewReady, setWriteReviewReady] = useState(false);
  const [writeReviewStorageUnavailable, setWriteReviewStorageUnavailable] = useState(false);
  const [reportListInitialized, setReportListInitialized] = useState(false);
  const reportListRequestRef = useRef(0);
  const mutationLock = useRef(false);
  const pendingWriteReviewRef = useRef<{ accountId: string; review: ReportWriteReview } | null>(null);

  const load = useCallback(async () => {
    const reportListRequest = ++reportListRequestRef.current;
    setReportListInitialized(false);
    setWriteReviewReady(false);
    setWriteReviewStorageUnavailable(false);
    setLoading(true);
    setError('');
    const [dataResult, reportsResult] = await Promise.allSettled([getCreatorCenterData(), getCreatorReports()]);
    if (reportListRequest !== reportListRequestRef.current) {
      return { reportListLoaded: reportsResult.status === 'fulfilled' };
    }
    const errors: string[] = [];
    let hasStoredWriteReview = false;
    if (dataResult.status === 'fulfilled') {
      const loadedAccountId = String(dataResult.value.account?.account_id || '');
      setAccountId(loadedAccountId);
      setCanManage(dataResult.value.access_level === 'manage');
      try {
        hasStoredWriteReview = Boolean(window.localStorage.getItem(reportWriteReviewStorageKey(loadedAccountId))
          ?? window.localStorage.getItem(legacyGenerationReviewStorageKey(loadedAccountId)));
      } catch {
        hasStoredWriteReview = true;
        setWriteReviewStorageUnavailable(true);
        errors.push('暂时无法读取浏览器中的报告操作恢复记录，所有报告写入已暂停。');
      }
    } else {
      errors.push(getUserFacingErrorMessage(dataResult.reason, '创作者中心数据加载失败，请检查连接后重试。'));
    }
    if (reportsResult.status === 'fulfilled') {
      setReportListUnavailable(false);
      setReports(reportsResult.value);
      setActive((current) => reportsResult.value.find((item) => item.id === current?.id) || reportsResult.value[0] || null);
    } else {
      setReportListUnavailable(true);
      if (!hasStoredWriteReview) errors.push(getUserFacingErrorMessage(reportsResult.reason, '报告列表加载失败，请检查连接后重试。'));
    }
    setError(errors.join('；'));
    setReportListInitialized(true);
    setLoading(false);
    return { reportListLoaded: reportsResult.status === 'fulfilled' };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!accountId || !reportListInitialized) return;
    setWriteReviewReady(false);
    const storageKey = reportWriteReviewStorageKey(accountId);
    let restored: ReportWriteReview | null = null;
    let storageReadSucceeded = false;
    try {
      const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyGenerationReviewStorageKey(accountId));
      storageReadSucceeded = true;
      setWriteReviewStorageUnavailable(false);
      setError((current) => current.split('；').filter((message) => !message.includes('报告操作恢复记录')).join('；'));
      if (raw) {
        const parsed = JSON.parse(raw) as { operation?: unknown; type?: unknown; baselineIds?: unknown; reportId?: unknown; reportType?: unknown; message?: unknown };
        const isReportType = (value: unknown): value is ReportType => value === 'daily' || value === 'weekly' || value === 'monthly';
        if (parsed.operation === 'refresh' && typeof parsed.message === 'string' && parsed.message.length <= 300) {
          restored = { operation: 'refresh', message: parsed.message };
        } else if (parsed.operation === 'delete' && isReportType(parsed.reportType)
          && typeof parsed.reportId === 'number' && Number.isSafeInteger(parsed.reportId)) {
          restored = { operation: 'delete', reportId: parsed.reportId, reportType: parsed.reportType };
        } else if ((parsed.operation === 'generate' || parsed.operation === undefined) && isReportType(parsed.type)
          && Array.isArray(parsed.baselineIds)
          && parsed.baselineIds.length <= 100
          && parsed.baselineIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id))) {
          restored = { operation: 'generate', type: parsed.type, baselineIds: parsed.baselineIds as number[] };
        } else {
          throw new Error('无法识别运营报告恢复记录');
        }
      }
    } catch {
      storageReadSucceeded = false;
      setWriteReviewStorageUnavailable(true);
      setError((current) => current.includes('报告操作恢复记录')
        ? current
        : [current, '暂时无法读取浏览器中的报告操作恢复记录，所有报告写入已暂停。'].filter(Boolean).join('；'));
    }
    if (!restored && pendingWriteReviewRef.current?.accountId === accountId) {
      restored = pendingWriteReviewRef.current.review;
    }
    pendingWriteReviewRef.current = restored ? { accountId, review: restored } : null;
    if (restored?.operation === 'refresh' && !reportListUnavailable) {
      try {
        window.localStorage.removeItem(reportWriteReviewStorageKey(accountId));
        window.localStorage.removeItem(legacyGenerationReviewStorageKey(accountId));
      } catch {
        // The successful read still confirms the list for this page.
      }
      pendingWriteReviewRef.current = null;
      setPendingWriteReview(null);
      setOperationNotice({ message: restored.message, refreshFailed: false });
      setWriteReviewReady(true);
      return;
    }
    setPendingWriteReview(restored);
    if (restored) {
      let message: string;
      if (restored.operation === 'refresh') {
        message = `${restored.message}列表暂时无法读取，请只读重读后再继续操作。`;
      } else if (restored.operation === 'generate') {
        const newReports = reports.filter((report) => report.type === restored.type && !restored.baselineIds.includes(report.id));
        message = reportListUnavailable
          ? `此前运营${typeLabel[restored.type]}生成请求未获确认，报告列表暂时无法读取。请只读核实，暂不要重复生成。`
          : newReports.length > 0
            ? `此前运营${typeLabel[restored.type]}生成请求未获确认；重新读取后发现 ${newReports.length} 份新报告。请先核对，再决定是否继续。`
            : `此前运营${typeLabel[restored.type]}生成请求未获确认；报告列表已重新读取但暂未发现新报告。请核对后再决定是否继续。`;
      } else if (reportListUnavailable) {
        message = `此前运营${typeLabel[restored.reportType]}删除请求未获确认，报告列表暂时无法读取。请只读核实，暂不要重复删除。`;
      } else if (reports.some((report) => report.id === restored.reportId)) {
        message = `此前运营${typeLabel[restored.reportType]}删除请求未获确认；该报告仍在列表中，请核对后再决定是否继续。`;
      } else {
        message = `此前运营${typeLabel[restored.reportType]}删除请求未获确认；该报告已不在当前列表，请核对删除状态后再决定是否继续。`;
      }
      setOperationNotice({ message, refreshFailed: reportListUnavailable, needsReview: true });
    } else {
      setOperationNotice((current) => current?.needsReview ? null : current);
    }
    setWriteReviewReady(storageReadSucceeded);
  }, [accountId, reportListInitialized, reportListUnavailable, reports]);

  const persistWriteReview = (review: ReportWriteReview) => {
    if (!accountId) return false;
    const serialized = JSON.stringify(review);
    try {
      const key = reportWriteReviewStorageKey(accountId);
      window.localStorage.setItem(key, serialized);
      return window.localStorage.getItem(key) === serialized;
    } catch {
      return false;
    }
  };

  const clearWriteReview = () => {
    if (!accountId) return false;
    try {
      window.localStorage.removeItem(reportWriteReviewStorageKey(accountId));
      window.localStorage.removeItem(legacyGenerationReviewStorageKey(accountId));
      return window.localStorage.getItem(reportWriteReviewStorageKey(accountId)) === null
        && window.localStorage.getItem(legacyGenerationReviewStorageKey(accountId)) === null;
    } catch {
      return false;
    }
  };

  const reloadReports = async (): Promise<CreatorReport[] | null> => {
    const reportListRequest = ++reportListRequestRef.current;
    setLoading(true);
    setError('');
    try {
      const items = await getCreatorReports();
      if (reportListRequest !== reportListRequestRef.current) return null;
      setReportListUnavailable(false);
      setReports(items);
      setReportListInitialized(true);
      setActive((current) => items.find((item) => item.id === current?.id) || items[0] || null);
      return items;
    } catch (cause) {
      if (reportListRequest === reportListRequestRef.current) {
        setReportListUnavailable(true);
        setReportListInitialized(true);
        setError(getUserFacingErrorMessage(cause, '报告加载失败，请检查连接后重试。'));
      }
      return null;
    } finally {
      if (reportListRequest === reportListRequestRef.current) setLoading(false);
    }
  };

  const reload = async () => {
    const refreshed = await load();
    if (refreshed.reportListLoaded) {
      setOperationNotice((current) => current ? { ...current, refreshFailed: false } : null);
    }
  };

  const refreshAfterMutation = async (message: string) => {
    setOperationNotice({ message, refreshFailed: false });
    const refreshed = await reloadReports();
    if (refreshed) {
      if (!clearWriteReview()) {
        setWriteReviewReady(false);
        setWriteReviewStorageUnavailable(true);
        setOperationNotice({
          message: `${message}报告列表已重新读取，但浏览器安全恢复记录无法清除；所有报告写入已暂停。请恢复浏览器存储后重试。`,
          refreshFailed: true,
        });
        return;
      }
      pendingWriteReviewRef.current = null;
      setPendingWriteReview(null);
      return;
    }
    setError('');
    setOperationNotice({ message, refreshFailed: true });
  };

  const retryOperationRead = async () => {
    if (loading || mutationLock.current) return;
    const items = await reloadReports();
    setError('');
    if (!items) {
      setOperationNotice((current) => current ? { ...current, refreshFailed: true } : current);
      return;
    }
    if (pendingWriteReview?.operation === 'generate') {
      const newReports = items.filter((report) => report.type === pendingWriteReview.type && !pendingWriteReview.baselineIds.includes(report.id));
      const message = newReports.length > 0
        ? `运营${typeLabel[pendingWriteReview.type]}生成请求未收到确认；列表中出现 ${newReports.length} 份新报告，最新报告已显示。请先核对，再决定是否继续。`
        : `运营${typeLabel[pendingWriteReview.type]}生成请求未收到确认；重新读取后暂未发现新报告。请先核对列表，再决定是否继续。`;
      setOperationNotice({ message, refreshFailed: false, needsReview: true });
      return;
    }
    if (pendingWriteReview?.operation === 'delete') {
      const stillPresent = items.some((report) => report.id === pendingWriteReview.reportId);
      const message = stillPresent
        ? `运营${typeLabel[pendingWriteReview.reportType]}删除请求未收到确认；该报告仍在列表中，请核对后再决定是否继续。`
        : `运营${typeLabel[pendingWriteReview.reportType]}删除请求未收到确认；该报告已不在当前列表，请核对删除状态后再决定是否继续。`;
      setOperationNotice({ message, refreshFailed: false, needsReview: true });
      return;
    }
    if (pendingWriteReview?.operation === 'refresh') {
      if (!clearWriteReview()) {
        setWriteReviewReady(false);
        setWriteReviewStorageUnavailable(true);
        setOperationNotice({
          message: '报告列表已重新读取，但浏览器安全恢复记录无法清除；所有报告写入已暂停。请恢复浏览器存储后重试。',
          refreshFailed: true,
        });
        return;
      }
      pendingWriteReviewRef.current = null;
      setPendingWriteReview(null);
      setOperationNotice({ message: pendingWriteReview.message, refreshFailed: false });
      return;
    }
    setOperationNotice((current) => current ? { ...current, refreshFailed: false } : current);
  };

  const acknowledgeWriteReview = () => {
    if (!clearWriteReview()) {
      setWriteReviewReady(false);
      setWriteReviewStorageUnavailable(true);
      setOperationNotice({
        message: '浏览器安全恢复记录无法清除，报告写入仍已暂停。请恢复浏览器存储后重试读取。',
        refreshFailed: true,
      });
      return;
    }
    pendingWriteReviewRef.current = null;
    setPendingWriteReview(null);
    setOperationNotice(null);
  };

  const generate = async (type: ReportType) => {
    if (mutationLock.current || deleting || !writeReviewReady || pendingWriteReview || operationNotice?.refreshFailed) return;
    mutationLock.current = true;
    setGenerating(type);
    setError('');
    setOperationNotice(null);
    const baselineIds = reports.map((report) => report.id);
    const review: ReportWriteReview = { operation: 'generate', type, baselineIds };
    if (!persistWriteReview(review)) {
      setWriteReviewReady(false);
      setWriteReviewStorageUnavailable(true);
      setError('浏览器无法保存并核验报告安全恢复记录，本次生成请求未发送。请恢复浏览器存储后重试读取。');
      mutationLock.current = false;
      setGenerating(null);
      return;
    }
    pendingWriteReviewRef.current = { accountId, review };
    setPendingWriteReview(review);
    try {
      await generateCreatorReport(type, accountId);
      reportListRequestRef.current += 1;
      await refreshAfterMutation(`运营${typeLabel[type]}已生成。`);
    } catch {
      const items = await reloadReports();
      setError('');
      if (!items) {
        setOperationNotice({
          message: `运营${typeLabel[type]}生成请求未收到确认，报告列表也暂时无法读取。请仅读取核实，暂不要重复生成。`,
          refreshFailed: true,
          needsReview: true,
        });
      } else {
        const newReports = items.filter((report) => report.type === type && !baselineIds.includes(report.id));
        const message = newReports.length > 0
          ? `运营${typeLabel[type]}生成请求未收到确认；列表中出现 ${newReports.length} 份新报告，最新报告已显示。请先核对，再决定是否继续。`
          : `运营${typeLabel[type]}生成请求未收到确认；重新读取后暂未发现新报告。请先核对列表，再决定是否继续。`;
        setOperationNotice({ message, refreshFailed: false, needsReview: true });
      }
    } finally {
      mutationLock.current = false;
      setGenerating(null);
    }
  };

  const remove = async () => {
    const removed = deleting;
    if (!removed || mutationLock.current || !writeReviewReady || pendingWriteReview || operationNotice?.refreshFailed) return;
    mutationLock.current = true;
    setDeleteBusy(true);
    setError('');
    setOperationNotice(null);
    const review: ReportWriteReview = { operation: 'delete', reportId: removed.id, reportType: removed.type };
    if (!persistWriteReview(review)) {
      setWriteReviewReady(false);
      setWriteReviewStorageUnavailable(true);
      setOperationNotice({
        message: '浏览器无法保存并核验报告安全恢复记录，本次删除请求未发送。请恢复浏览器存储后重试读取。',
        refreshFailed: true,
      });
      mutationLock.current = false;
      setDeleteBusy(false);
      return;
    }
    pendingWriteReviewRef.current = { accountId, review };
    setPendingWriteReview(review);
    try {
      await deleteCreatorReport(removed.id, accountId);
      reportListRequestRef.current += 1;
      const remaining = reports.filter((report) => report.id !== removed.id);
      setReports(remaining);
      setActive((current) => current?.id === removed.id ? remaining[0] || null : current);
      setDeleting(null);
      await refreshAfterMutation(`运营${typeLabel[removed.type]}已删除。`);
    } catch {
      setDeleting(null);
      setError('');
      const items = await reloadReports();
      setError('');
      const stillPresent = items?.some((report) => report.id === removed.id) ?? false;
      setOperationNotice({
        message: !items
          ? `运营${typeLabel[removed.type]}删除请求未收到确认，报告列表也暂时无法读取。请只读核实，暂不要重复删除。`
          : stillPresent
            ? `运营${typeLabel[removed.type]}删除请求未收到确认；该报告仍在列表中，请核对后再决定是否继续。`
            : `运营${typeLabel[removed.type]}删除请求未收到确认；该报告已不在当前列表，请核对删除状态后再决定是否继续。`,
        refreshFailed: !items,
        needsReview: true,
      });
    } finally {
      mutationLock.current = false;
      setDeleteBusy(false);
    }
  };

  if (loading && !reports.length) return <LoadingState />;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <PageHeader
      title="运营复盘报告"
      description="账号、作品、累计播放和趋势统一使用抖音运营中心数据"
      actions={<div className="flex flex-wrap gap-2">{(['daily', 'weekly', 'monthly'] as ReportType[]).map((type) => <button type="button" key={type} aria-busy={generating === type} disabled={!canManage || !writeReviewReady || Boolean(generating) || Boolean(deleting) || deleteBusy || loading || Boolean(pendingWriteReview) || Boolean(operationNotice?.refreshFailed)} onClick={() => void generate(type)} className="inline-flex h-10 items-center gap-2 xmt-btn xmt-btn-primary disabled:opacity-45">{generating === type ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating === type ? `正在生成${typeLabel[type]}…` : `生成${typeLabel[type]}`}</button>)}</div>}
    />
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{generating ? `正在生成运营${typeLabel[generating]}，请稍候。` : ''}</div>
    {operationNotice ? <div role={!writeReviewStorageUnavailable && (operationNotice.refreshFailed || operationNotice.needsReview) ? 'alert' : 'status'} className={`space-y-3 rounded-xl border p-4 text-sm ${operationNotice.refreshFailed || operationNotice.needsReview ? 'border-studio-amber/30 bg-studio-amber/10 text-studio-amber-contrast' : 'border-studio-success/30 bg-studio-success/10 text-studio-success-contrast'}`}>
      <p>{operationNotice.message}{operationNotice.refreshFailed && !operationNotice.needsReview && !writeReviewStorageUnavailable ? ' 列表刷新失败，请重新加载报告；不要重复执行刚才的操作。' : ''}</p>
      {operationNotice.refreshFailed || pendingWriteReview ? <button type="button" onClick={() => void (writeReviewStorageUnavailable ? reload() : retryOperationRead())} disabled={loading || Boolean(deleting) || deleteBusy} className="xmt-btn xmt-btn-secondary inline-flex min-h-10 items-center gap-2 px-4 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{writeReviewStorageUnavailable ? '重试读取安全恢复记录' : '只重新读取报告'}</button> : null}
      {operationNotice.needsReview && !operationNotice.refreshFailed ? <button type="button" onClick={acknowledgeWriteReview} disabled={loading || deleteBusy} className="xmt-btn xmt-btn-secondary inline-flex min-h-10 items-center gap-2 px-4 disabled:opacity-60">我已核对，允许继续操作</button> : null}
    </div> : null}
    {error ? <div className="space-y-3">
      <ErrorState message={error} />
      <button type="button" onClick={() => void reload()} disabled={loading || deleteBusy || Boolean(deleting)} className="xmt-btn xmt-btn-secondary inline-flex min-h-10 items-center gap-2 px-4 disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />重新加载报告
      </button>
    </div> : null}
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel title="报告历史" description={`共 ${reports.length} 份分析报告`}>
        <div className="space-y-2">
          {reports.map((report) => <div key={report.id} className={`flex items-stretch rounded-xl border transition ${active?.id === report.id ? 'border-studio-cyan bg-studio-cyan/5' : 'border-studio-border bg-studio-surface hover:border-studio-cyan/40'}`}>
            <button type="button" onClick={() => setActive(report)} className="min-w-0 flex-1 p-4 text-left">
              <div className="flex items-center justify-between"><span className="font-medium">运营{typeLabel[report.type]}</span><FileText className="h-4 w-4 text-studio-text-muted" /></div>
              <p className="mt-2 text-xs text-studio-text-secondary">{formatDate(report.created_at, true)}</p>
            </button>
            {canManage ? <button type="button" aria-label={`删除运营${typeLabel[report.type]}`} disabled={!writeReviewReady || deleteBusy || Boolean(generating) || loading || Boolean(pendingWriteReview) || Boolean(operationNotice?.refreshFailed)} onClick={() => setDeleting(report)} className="m-2 grid h-10 min-h-10 w-10 min-w-10 place-items-center rounded-lg text-studio-text-muted transition hover:bg-studio-coral/10 hover:text-studio-coral disabled:opacity-45"><Trash2 className="h-4 w-4" /></button> : null}
          </div>)}
          {reports.length === 0 ? <p className="py-10 text-center text-sm text-studio-text-secondary">{reportListUnavailable ? '报告列表暂时无法读取；恢复读取后再确认是否为空。' : operationNotice?.refreshFailed ? '当前列表尚未刷新，请重新加载确认。' : '尚未生成报告'}</p> : null}
        </div>
      </Panel>
      {active ? <ReportContent report={active} /> : <Panel title="选择报告"><p className="py-20 text-center text-sm text-studio-text-secondary">生成或选择一份运营分析报告</p></Panel>}
    </div>
    <ConfirmModal open={Boolean(deleting)} title="删除复盘报告" description={writeReviewStorageUnavailable && operationNotice ? operationNotice.message : '删除后无法恢复，但不会影响账号、作品和历史快照数据。'} confirmText="删除报告" variant="danger" loading={deleteBusy} confirmDisabled={!writeReviewReady || Boolean(pendingWriteReview) || Boolean(operationNotice?.refreshFailed)} onCancel={() => setDeleting(null)} onConfirm={() => void remove()} />
  </div>;
}
function ReportContent({report}:{report:CreatorReport}){const content=asRecord(report.content),account=asRecord(content.account_performance),health=asRecord(account.health),current=asRecord(account.current),growth=asRecord(content.growth),works=asRecord(content.work_performance),coverage=asRecord(content.data_coverage),levels=asRecord(works.level_distribution),anomalies=Array.isArray(content.anomalies)?content.anomalies:[],top=Array.isArray(content.excellent_works)?content.excellent_works:[],low=Array.isArray(content.low_efficiency_works)?content.low_efficiency_works:[],isUnified=num(content.report_version)>=2;return <div className="space-y-6">{!isUnified?<div className="rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">这是一份旧口径报告，部分账号指标可能缺失。请重新生成统一口径报告，确认后可删除旧报告。</div>:null}<Panel title={`运营${typeLabel[report.type]}`} description={`生成于 ${formatDate(report.created_at,true)} · ${isUnified?'统一运营数据口径':'旧数据口径'}`}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Summary label="账号健康度" value={`${num(health.score).toFixed(1)} 分`} icon={BarChart3}/><Summary label={isUnified?'当前累计播放':'周期播放变化'} value={isUnified?formatNumber(current.play_count):signed(growth.plays)} icon={TrendingUp}/><Summary label="当前粉丝" value={current.fans_count==null?'暂无数据':formatNumber(current.fans_count)} icon={Users}/><Summary label="周期发布" value={`${formatNumber(works.published)} 条`} icon={CalendarDays}/></div></Panel>{isUnified?<Panel title="周期变化" description="日快照期末减期初；无可靠快照时明确显示暂无"><div className="grid gap-4 sm:grid-cols-3"><Summary label="播放增长" value={signedNullable(growth.plays)} icon={TrendingUp}/><Summary label="粉丝增长" value={signedNullable(growth.fans)} icon={Users}/><Summary label="互动增长" value={signedNullable(growth.interactions)} icon={BarChart3}/></div></Panel>:null}<Panel title="作品表现" description={`共 ${formatNumber(works.total)} 条去重作品，按透明评分规则汇总`}><div className="grid gap-3 sm:grid-cols-4">{(['viral','excellent','normal','low'] as const).map(level=><div key={level} className="rounded-xl bg-studio-surface p-4"><span className={`rounded-md px-2 py-1 text-xs ${levelMeta[level].className}`}>{levelMeta[level].label}</span><p className="mt-4 text-2xl font-semibold">{formatNumber(levels[level])}</p></div>)}</div></Panel>{isUnified?<Panel title="数据完整度" description={String(coverage.metric_definition||'')}><div className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-xl bg-studio-surface p-4"><span className="text-studio-text-secondary">日快照</span><p className="mt-2 font-semibold">{formatNumber(coverage.snapshot_count)} 个</p></div><div className="rounded-xl bg-studio-surface p-4"><span className="text-studio-text-secondary">统计区间</span><p className="mt-2 font-semibold">{String(coverage.period_start||'暂无')} 至 {String(coverage.period_end||'暂无')}</p></div><div className="rounded-xl bg-studio-surface p-4"><span className="text-studio-text-secondary">粉丝数据</span><p className="mt-2 font-semibold">{coverage.fans_available?'可用':'当前采集未提供'}</p></div></div></Panel>:null}<Panel title="异常数据" description="固定规则检测，不生成推测结论">{anomalies.length?<div className="space-y-2">{anomalies.map((item,index)=>{const row=asRecord(item);return <div key={index} className="flex gap-3 rounded-xl bg-studio-amber/8 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-studio-amber"/><span>{String(row.message||'检测到指标异常')}</span></div>})}</div>:<p className="py-8 text-center text-sm text-studio-text-secondary">本周期未检测到显著异常</p>}</Panel><section className="grid gap-6 lg:grid-cols-2"><WorkList title="优秀作品" items={top} icon={TrendingUp}/><WorkList title="低效作品" items={low} icon={TrendingDown}/></section><p className="text-center text-xs text-studio-text-secondary">{String(content.methodology||'全部结论来自 Creator Data Center 已入仓数据。')}</p></div>}
function Summary({label,value,icon:Icon}:{label:string;value:string;icon:typeof BarChart3}){return <div className="rounded-xl bg-studio-surface p-4"><div className="flex items-center justify-between text-xs text-studio-text-secondary"><span>{label}</span><Icon className="h-4 w-4"/></div><p className="mt-3 text-xl font-semibold">{value}</p></div>}
function WorkList({title,items,icon:Icon}:{title:string;items:unknown[];icon:typeof TrendingUp}){return <Panel title={title} description="按综合评分排序"><div className="space-y-2">{items.map((item,index)=>{const row=asRecord(item);return <div key={index} className="flex items-center gap-3 rounded-xl bg-studio-surface p-3"><Icon className="h-4 w-4 text-studio-cyan"/><span className="min-w-0 flex-1 truncate text-sm">{String(row.title||'未命名作品')}</span>{row.play_count!=null?<span className="text-xs text-studio-text-secondary">{formatNumber(row.play_count)} 播放</span>:null}<b>{num(row.score).toFixed(1)}</b></div>})}{items.length===0?<p className="py-8 text-center text-sm text-studio-text-secondary">暂无周期作品</p>:null}</div></Panel>}
const signed=(value:unknown)=>`${num(value)>=0?'+':''}${formatNumber(value)}`;
const signedNullable=(value:unknown)=>value==null?'暂无数据':signed(value);

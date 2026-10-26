import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import {
  getMonthlyRecord,
  getMonthlyRecordUpdateStatus,
  getYearlyRecord,
  getYearlyRecordUpdateStatus,
  saveMonthlyRecord,
  saveYearlyRecord,
  type MonthlyRecord,
  type YearlyRecord,
} from '../../api/dailyReports';
import { ActionButton, GlassPanel } from '../studio';
import { useAuthStore, useAppStore } from '../../store';
import {
  markReportSummaryRecoveryRejected,
  monthlySummaryPayload,
  persistReportSummaryRecovery,
  readReportSummaryRecovery,
  removeReportSummaryRecovery,
  reportSummaryUpdateFingerprint,
  sameReportSummaryRecovery,
  yearlySummaryPayload,
  type ReportSummaryFormSnapshot,
  type ReportSummaryKind,
  type ReportSummaryPayload,
  type ReportSummaryRecoveryStorage,
  type ReportSummaryUpdateRecovery,
  type MonthlySummaryPayload,
  type YearlySummaryPayload,
} from './reportSummaryUpdateRecovery';

type Props = { kind: 'monthly' | 'yearly' };
type RecoveryState = 'checking' | 'submitting' | 'not_found' | 'conflict' | 'unavailable' | 'processed_cleanup' | 'rejected_cleanup' | 'rejected_mark_failed' | 'storage_blocked' | null;
type SummaryRecord = MonthlyRecord | YearlyRecord;

const monthlyFields = ['work_summary_md', 'key_projects_md', 'issues_plan_md'] as const;
const yearlyFields = ['annual_summary_md', 'achievements_md', 'shortcomings_md', 'next_year_plan_md'] as const;

function getRecoveryStorage(): { session: ReportSummaryRecoveryStorage; local: ReportSummaryRecoveryStorage } {
  return { session: window.sessionStorage, local: window.localStorage };
}

function readBrowserRecovery(actorId: number) {
  try {
    const storage = getRecoveryStorage();
    return readReportSummaryRecovery(actorId, storage.session, storage.local);
  } catch {
    return { kind: 'blocked' as const, recovery: null, reason: 'unavailable' as const };
  }
}

function emptyMonthly(year: number, month: number): MonthlyRecord {
  return { year, month, work_summary_md: '', key_projects_md: '', issues_plan_md: '', display_content_md: '' };
}

function emptyYearly(year: number): YearlyRecord {
  return { year, annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '', display_content_md: '' };
}

function snapshotFor(kind: ReportSummaryKind, record: MonthlyRecord | YearlyRecord): ReportSummaryFormSnapshot {
  if (kind === 'monthly') {
    const monthly = record as MonthlyRecord;
    return {
      work_summary_md: monthly.work_summary_md || '',
      key_projects_md: monthly.key_projects_md || '',
      issues_plan_md: monthly.issues_plan_md || '',
    };
  }
  const yearly = record as YearlyRecord;
  return {
    annual_summary_md: yearly.annual_summary_md || '',
    achievements_md: yearly.achievements_md || '',
    shortcomings_md: yearly.shortcomings_md || '',
    next_year_plan_md: yearly.next_year_plan_md || '',
  };
}

function restoreSnapshot(kind: ReportSummaryKind, snapshot: ReportSummaryFormSnapshot, year: number, month: number | null): SummaryRecord {
  if (kind === 'monthly') return { ...emptyMonthly(year, month ?? 1), ...snapshot } as MonthlyRecord;
  return { ...emptyYearly(year), ...snapshot } as YearlyRecord;
}

function mutationTitle(kind: ReportSummaryKind) {
  return kind === 'monthly' ? '月报' : '年报';
}

function SummaryField({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; disabled: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold text-studio-text-primary">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={5} placeholder={placeholder} className="xmt-field w-full resize-y" /></label>;
}

export default function DailyReportSummaryForm({ kind }: Props) {
  const now = new Date();
  const actorId = useAuthStore((state) => Number(state.user?.id) || 0);
  const initialActorId = Number(useAuthStore.getState().user?.id) || 0;
  const initialRead = initialActorId > 0 ? readBrowserRecovery(initialActorId) : null;
  const initialRecovery = initialRead?.kind === 'ready' ? initialRead.recovery : null;
  const [year, setYear] = useState(initialRecovery?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initialRecovery?.month ?? now.getMonth() + 1);
  const [monthly, setMonthly] = useState<MonthlyRecord>(() => initialRecovery?.kind === 'monthly'
    ? restoreSnapshot('monthly', initialRecovery.formSnapshot, initialRecovery.year, initialRecovery.month) as MonthlyRecord
    : emptyMonthly(now.getFullYear(), now.getMonth() + 1));
  const [yearly, setYearly] = useState<YearlyRecord>(() => initialRecovery?.kind === 'yearly'
    ? restoreSnapshot('yearly', initialRecovery.formSnapshot, initialRecovery.year, null) as YearlyRecord
    : emptyYearly(now.getFullYear()));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [baselineFingerprint, setBaselineFingerprint] = useState<string | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<ReportSummaryUpdateRecovery | null>(initialRecovery);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>(() => initialRecovery?.rejected ? 'rejected_cleanup' : initialRecovery ? 'checking' : initialRead?.kind === 'blocked' ? 'storage_blocked' : null);
  const [recoveryError, setRecoveryError] = useState('');
  const [notice, setNotice] = useState('');
  const [baselineConflict, setBaselineConflict] = useState(false);
  const [conflictRecord, setConflictRecord] = useState<SummaryRecord | null>(null);
  const submitInFlight = useRef(false);
  const mutationGenerationRef = useRef(0);
  const mutationActorRef = useRef(actorId);
  const recoveryRef = useRef<ReportSummaryUpdateRecovery | null>(initialRecovery);
  const listRequestSequenceRef = useRef(0);
  const addNotification = useAppStore((state) => state.addNotification);
  const activeRecovery = pendingRecovery?.actorId === actorId ? pendingRecovery : null;
  const storageBlocked = recoveryState === 'storage_blocked';
  const formKind = activeRecovery?.kind ?? kind;
  const values = formKind === 'monthly' ? monthly : yearly;
  const isLocked = loading || submitting || Boolean(pendingRecovery) || storageBlocked || baselineConflict;

  const setRecovery = (recovery: ReportSummaryUpdateRecovery, state: RecoveryState) => {
    recoveryRef.current = recovery;
    setPendingRecovery(recovery);
    setRecoveryState(state);
    setRecoveryError('');
  };

  const isCurrentRecovery = (recovery: ReportSummaryUpdateRecovery, isActive: () => boolean = () => true) => (
    isActive()
    && Number(useAuthStore.getState().user?.id) === recovery.actorId
    && sameReportSummaryRecovery(recoveryRef.current, recovery)
  );

  const clearRecovery = useCallback((recovery: ReportSummaryUpdateRecovery, isActive: () => boolean = () => true, failureState: RecoveryState = recovery.rejected ? 'rejected_cleanup' : 'processed_cleanup') => {
    if (!isCurrentRecovery(recovery, isActive)) return false;
    let removed = false;
    try {
      const storage = getRecoveryStorage();
      removed = removeReportSummaryRecovery(recovery, storage.session, storage.local);
    } catch { removed = false; }
    if (!removed) {
      setRecoveryState(failureState);
      setRecoveryError('恢复标记尚未安全清除，月报和年报写入继续锁定。');
      return false;
    }
    recoveryRef.current = null;
    setPendingRecovery(null);
    setRecoveryState(null);
    setRecoveryError('');
    return true;
  }, []);

  const releaseRejectedRecovery = useCallback((recovery: ReportSummaryUpdateRecovery, message: string, conflict?: SummaryRecord | null) => {
    if (!isCurrentRecovery(recovery)) return false;
    let persisted = false;
    try {
      const storage = getRecoveryStorage();
      persisted = markReportSummaryRecoveryRejected(recovery, storage.session, storage.local);
    } catch { persisted = false; }
    if (!persisted) {
      setRecoveryState('rejected_mark_failed');
      setRecoveryError('服务器已拒绝本次更新，但拒绝标记未能安全保存。月报和年报写入保持锁定。');
      return false;
    }
    const rejected = { ...recovery, rejected: true };
    recoveryRef.current = rejected;
    setPendingRecovery(rejected);
    if (!clearRecovery(rejected)) return false;
    if (conflict) {
      setBaselineConflict(true);
      setConflictRecord(conflict);
    }
    setNotice(message);
    return true;
  }, [clearRecovery]);

  const loadCurrentRecord = useCallback(async (targetKind: ReportSummaryKind, targetYear: number, targetMonth: number | null) => (
    targetKind === 'monthly'
      ? getMonthlyRecord(targetYear, targetMonth ?? 1)
      : getYearlyRecord(targetYear)
  ), []);

  const applyRecord = useCallback((targetKind: ReportSummaryKind, record: SummaryRecord) => {
    if (targetKind === 'monthly') {
      const monthlyRecord = record as MonthlyRecord;
      setMonthly({ ...emptyMonthly(monthlyRecord.year, monthlyRecord.month), ...monthlyRecord, work_summary_md: monthlyRecord.work_summary_md || '', key_projects_md: monthlyRecord.key_projects_md || '', issues_plan_md: monthlyRecord.issues_plan_md || '' });
      setYear(monthlyRecord.year);
      setMonth(monthlyRecord.month);
    } else {
      const yearlyRecord = record as YearlyRecord;
      setYearly({ ...emptyYearly(yearlyRecord.year), ...yearlyRecord, annual_summary_md: yearlyRecord.annual_summary_md || '', achievements_md: yearlyRecord.achievements_md || '', shortcomings_md: yearlyRecord.shortcomings_md || '', next_year_plan_md: yearlyRecord.next_year_plan_md || '' });
      setYear(yearlyRecord.year);
    }
    if (typeof record.baseline_fingerprint === 'string') setBaselineFingerprint(record.baseline_fingerprint);
  }, []);

  const finishProcessedRecovery = useCallback((recovery: ReportSummaryUpdateRecovery, record: SummaryRecord, isActive: () => boolean = () => true) => {
    if (!isCurrentRecovery(recovery, isActive)) return false;
    applyRecord(recovery.kind, record);
    if (!clearRecovery(recovery, isActive)) return false;
    setNotice(`${mutationTitle(recovery.kind)}已保存，已恢复本次保存内容。`);
    addNotification({ title: '提交成功', message: `${mutationTitle(recovery.kind)}已提交。`, type: 'success' });
    return true;
  }, [addNotification, applyRecord, clearRecovery]);

  const verifyRecovery = useCallback(async (recovery: ReportSummaryUpdateRecovery, isActive: () => boolean = () => true): Promise<'processed' | 'not_found' | 'conflict' | 'unavailable' | null> => {
    if (recovery.rejected) {
      if (!isCurrentRecovery(recovery, isActive)) return null;
      if (!clearRecovery(recovery, isActive)) return 'unavailable';
      setNotice('上次总结更新已被服务器拒绝，原有内容已保留。');
      return 'unavailable';
    }
    setRecoveryState('checking');
    setRecoveryError('');
    setNotice('');
    try {
      const result = recovery.kind === 'monthly'
        ? await getMonthlyRecordUpdateStatus(recovery.year, recovery.month ?? 1, recovery.requestId, recovery.requestFingerprint)
        : await getYearlyRecordUpdateStatus(recovery.year, recovery.requestId, recovery.requestFingerprint);
      if (!isCurrentRecovery(recovery, isActive)) return null;
      if (result.status === 'processed') {
        finishProcessedRecovery(recovery, result.data, isActive);
        return 'processed';
      }
      if (result.status === 'conflict') {
        setRecoveryState('conflict');
        setRecoveryError('请求编号与保存内容或周期不一致。为避免覆盖，月报和年报写入继续锁定，只能只读核实。');
        setNotice('');
        return 'conflict';
      }
      const current = await loadCurrentRecord(recovery.kind, recovery.year, recovery.month);
      if (!isCurrentRecovery(recovery, isActive)) return null;
      const currentFingerprint = current.baseline_fingerprint;
      if (typeof currentFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(currentFingerprint)) {
        setRecoveryState('unavailable');
        setRecoveryError('当前总结缺少可核对的版本标记，写入继续锁定。');
        return 'unavailable';
      }
      applyRecord(recovery.kind, restoreSnapshot(recovery.kind, recovery.formSnapshot, recovery.year, recovery.month));
      setBaselineFingerprint(currentFingerprint);
      if (currentFingerprint !== recovery.baseFingerprint) {
        releaseRejectedRecovery(recovery, '服务器总结已被其他操作更新，本次内容未写入。你的完整草稿已保留，写入暂停等待核对。', current);
        return 'conflict';
      }
      setRecoveryState('not_found');
      setRecoveryError('服务器尚未找到这次保存记录，且当前基线未变化。核对保留内容后，只有明确点击下方按钮才会使用原请求编号与内容重试。');
      setNotice('');
      return 'not_found';
    } catch (error) {
      if (!isCurrentRecovery(recovery, isActive)) return null;
      setRecoveryState('unavailable');
      setRecoveryError(error instanceof Error ? error.message : '暂时无法核实总结保存结果');
      setNotice('');
      return 'unavailable';
    }
  }, [applyRecord, clearRecovery, finishProcessedRecovery, loadCurrentRecord, releaseRejectedRecovery]);

  const executeMutation = useCallback(async (recovery: ReportSummaryUpdateRecovery, explicitRetry = false, lockAlreadyHeld = false) => {
    const generation = mutationGenerationRef.current;
    if (!lockAlreadyHeld) {
      if (submitInFlight.current || (pendingRecovery && !sameReportSummaryRecovery(pendingRecovery, recovery)) || storageBlocked) return;
      submitInFlight.current = true;
      setSubmitting(true);
    }
    const stillCurrent = () => isCurrentRecovery(recovery);
    try {
      if (!stillCurrent() || recovery.rejected) return;
      if (explicitRetry) {
        const current = await loadCurrentRecord(recovery.kind, recovery.year, recovery.month);
        if (!stillCurrent()) return;
        if (!current.baseline_fingerprint || current.baseline_fingerprint !== recovery.baseFingerprint) {
          releaseRejectedRecovery(recovery, '服务器总结版本已变化，本次未重发。你的完整草稿已保留，请核对当前内容。', current);
          return;
        }
      }
      setRecoveryState('submitting');
      setRecoveryError('');
      setNotice(`正在保存${mutationTitle(recovery.kind)}…`);
      const request = { client_request_id: recovery.requestId, base_fingerprint: recovery.baseFingerprint };
      const saved = recovery.kind === 'monthly'
        ? await saveMonthlyRecord(recovery.year, recovery.month ?? 1, recovery.payload as MonthlySummaryPayload, request)
        : await saveYearlyRecord(recovery.year, recovery.payload as YearlySummaryPayload, request);
      if (!stillCurrent()) return;
      finishProcessedRecovery(recovery, saved);
    } catch (error) {
      if (!stillCurrent()) return;
      const apiError = error instanceof Error ? error as Error & { status?: number; code?: string } : null;
      if (apiError?.code === 'REPORT_SUMMARY_UPDATE_BASE_CONFLICT') {
        const current = await loadCurrentRecord(recovery.kind, recovery.year, recovery.month).catch(() => null);
        releaseRejectedRecovery(recovery, '服务器总结已被其他操作更新，本次内容未写入。你的完整草稿已保留。', current);
      } else if (apiError?.status === 409) {
        setRecoveryState('conflict');
        setRecoveryError(apiError.message || '总结请求编号发生冲突。所有总结写入继续锁定，只能只读核实。');
        setNotice('');
      } else if (apiError?.status && [400, 401, 403, 404, 422].includes(apiError.status)) {
        releaseRejectedRecovery(recovery, apiError.message || `${mutationTitle(recovery.kind)}更新被服务器拒绝，草稿内容已保留。`);
      } else {
        await verifyRecovery(recovery);
      }
    } finally {
      if (generation === mutationGenerationRef.current) {
        submitInFlight.current = false;
        setSubmitting(false);
      }
    }
  }, [finishProcessedRecovery, loadCurrentRecord, pendingRecovery, releaseRejectedRecovery, storageBlocked, verifyRecovery]);

  useEffect(() => {
    if (mutationActorRef.current !== actorId) {
      mutationActorRef.current = actorId;
      mutationGenerationRef.current += 1;
      listRequestSequenceRef.current += 1;
      submitInFlight.current = false;
      setSubmitting(false);
    }
    if (actorId <= 0) {
      recoveryRef.current = null;
      setPendingRecovery(null);
      setRecoveryState(null);
      setRecoveryError('');
      setBaselineFingerprint(null);
      return undefined;
    }
    let active = true;
    const stored = readBrowserRecovery(actorId);
    if (stored.kind === 'blocked') {
      recoveryRef.current = stored.recovery;
      setPendingRecovery(stored.recovery);
      setRecoveryState('storage_blocked');
      setRecoveryError(stored.reason === 'conflict'
        ? '浏览器中的总结恢复标记不一致，所有总结写入保持锁定。'
        : stored.reason === 'invalid'
          ? '浏览器中的总结恢复标记无法识别，所有总结写入保持锁定。'
          : '浏览器存储暂不可用，无法安全核实待处理的总结更新。');
      return () => { active = false; };
    }
    if (stored.kind === 'none') {
      recoveryRef.current = null;
      setPendingRecovery(null);
      setRecoveryState(null);
      setRecoveryError('');
      return () => { active = false; };
    }
    const recovery = stored.recovery;
    recoveryRef.current = recovery;
    setPendingRecovery(recovery);
    setYear(recovery.year);
    if (recovery.kind === 'monthly' && recovery.month) setMonth(recovery.month);
    applyRecord(recovery.kind, restoreSnapshot(recovery.kind, recovery.formSnapshot, recovery.year, recovery.month));
    if (recovery.rejected) {
      setRecoveryState('rejected_cleanup');
      clearRecovery(recovery, () => active);
    } else {
      setRecoveryState('checking');
      void verifyRecovery(recovery, () => active);
    }
    return () => { active = false; };
  }, [actorId, applyRecord, clearRecovery, verifyRecovery]);

  const loadTarget = useCallback(async () => {
    const sequence = ++listRequestSequenceRef.current;
    const requestActorId = Number(useAuthStore.getState().user?.id) || 0;
    const targetKind = formKind;
    const targetYear = year;
    const targetMonth = targetKind === 'monthly' ? month : null;
    setLoading(true);
    setLoadError('');
    try {
      const record = await loadCurrentRecord(targetKind, targetYear, targetMonth);
      if (sequence !== listRequestSequenceRef.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return;
      const recovery = recoveryRef.current;
      const recoveringSameTarget = recovery?.actorId === requestActorId && recovery.kind === targetKind
        && recovery.year === targetYear && recovery.month === targetMonth;
      if (!recoveringSameTarget) applyRecord(targetKind, record);
      else if (typeof record.baseline_fingerprint === 'string') setBaselineFingerprint(record.baseline_fingerprint);
    } catch (error) {
      if (sequence !== listRequestSequenceRef.current || Number(useAuthStore.getState().user?.id) !== requestActorId) return;
      setLoadError(error instanceof Error ? error.message : '加载总结失败');
    } finally {
      if (sequence === listRequestSequenceRef.current && Number(useAuthStore.getState().user?.id) === requestActorId) setLoading(false);
    }
  }, [applyRecord, formKind, loadCurrentRecord, month, year]);

  useEffect(() => {
    void loadTarget();
    return () => { listRequestSequenceRef.current += 1; };
  }, [loadTarget, retryKey]);

  async function submit() {
    if (submitInFlight.current || loading || activeRecovery || storageBlocked || baselineConflict) return;
    if (!baselineFingerprint || !/^[0-9a-f]{64}$/.test(baselineFingerprint)) {
      setNotice('当前总结缺少有效版本标记，请重新加载后再提交。');
      return;
    }
    const generation = mutationGenerationRef.current;
    const targetYear = formKind === 'monthly' ? year : year;
    const targetMonth = formKind === 'monthly' ? month : null;
    const formSnapshot = snapshotFor(formKind, values);
    const payload: ReportSummaryPayload = formKind === 'monthly'
      ? monthlySummaryPayload(values as MonthlyRecord)
      : yearlySummaryPayload(values as YearlyRecord);
    submitInFlight.current = true;
    setSubmitting(true);
    setNotice(`正在准备保存${mutationTitle(formKind)}…`);
    try {
      const requestId = window.crypto.randomUUID().toLowerCase();
      const requestFingerprint = await reportSummaryUpdateFingerprint(formKind, targetYear, targetMonth, payload, baselineFingerprint);
      if (generation !== mutationGenerationRef.current || Number(useAuthStore.getState().user?.id) !== actorId) return;
      const stored = readBrowserRecovery(actorId);
      if (stored.kind === 'blocked') {
        setRecoveryState('storage_blocked');
        setRecoveryError('浏览器已有无法核实的总结操作信息，本次没有发送请求。');
        return;
      }
      if (stored.kind === 'ready') {
        setRecovery(stored.recovery, stored.recovery.rejected ? 'rejected_cleanup' : 'checking');
        if (stored.recovery.rejected) clearRecovery(stored.recovery);
        else void verifyRecovery(stored.recovery);
        return;
      }
      const recovery: ReportSummaryUpdateRecovery = {
        schemaVersion: 1,
        actorId,
        kind: formKind,
        year: targetYear,
        month: targetMonth,
        requestId,
        baseFingerprint: baselineFingerprint,
        requestFingerprint,
        payload,
        formSnapshot,
        rejected: false,
      };
      let persisted = false;
      try {
        const storage = getRecoveryStorage();
        persisted = persistReportSummaryRecovery(recovery, storage.session, storage.local);
      } catch { persisted = false; }
      if (!persisted) {
        const current = readBrowserRecovery(actorId);
        if (current.kind === 'ready') setRecovery(current.recovery, 'storage_blocked');
        else {
          setRecoveryState('storage_blocked');
          setRecoveryError('浏览器无法同时保存月报恢复信息，本次没有发送写入请求。');
        }
        return;
      }
      setRecovery(recovery, 'submitting');
      await executeMutation(recovery, false, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法安全准备总结更新，请检查表单后重试。');
    } finally {
      if (generation === mutationGenerationRef.current) {
        submitInFlight.current = false;
        setSubmitting(false);
      }
    }
  }

  const retryOriginalRequest = () => {
    if (!activeRecovery || activeRecovery.rejected || recoveryState !== 'not_found' || submitting) return;
    void executeMutation(activeRecovery, true);
  };

  const retryStatusCheck = () => {
    if (!activeRecovery || submitting || recoveryState === 'checking' || recoveryState === 'submitting') return;
    void verifyRecovery(activeRecovery);
  };

  const retryRecoveryCleanup = () => {
    if (!activeRecovery || submitting) return;
    if (activeRecovery.rejected || recoveryState === 'rejected_mark_failed') {
      try {
        const storage = getRecoveryStorage();
        if (!markReportSummaryRecoveryRejected(activeRecovery, storage.session, storage.local)) {
          setRecoveryError('拒绝标记仍未能安全保存，月报和年报写入继续锁定。');
          return;
        }
        const rejected = { ...activeRecovery, rejected: true };
        recoveryRef.current = rejected;
        setPendingRecovery(rejected);
        clearRecovery(rejected);
      } catch { setRecoveryError('浏览器存储暂不可用，无法安全清理拒绝标记。'); }
    } else {
      clearRecovery(activeRecovery);
    }
  };

  const retryBaselineConflict = () => {
    if (!conflictRecord || submitting || activeRecovery) return;
    if (typeof conflictRecord.baseline_fingerprint === 'string') {
      setBaselineFingerprint(conflictRecord.baseline_fingerprint);
      setBaselineConflict(false);
      setConflictRecord(null);
      setNotice('已读取服务器当前版本标记；原草稿仍保留，请核对后再提交。');
    }
  };

  const replaceWithServerConflict = () => {
    if (!conflictRecord || submitting || activeRecovery) return;
    applyRecord(formKind, conflictRecord);
    setBaselineConflict(false);
    setConflictRecord(null);
    setNotice('已读取服务器当前内容。');
  };

  const retryLoad = () => setRetryKey((value) => value + 1);

  const recoveryDescription = recoveryState === 'checking'
    ? '正在只读核实上次总结更新；月报和年报写入暂时锁定。'
    : recoveryState === 'submitting'
      ? '正在提交或恢复总结更新；月报和年报写入暂时锁定。'
      : recoveryState === 'not_found'
        ? '服务器尚未找到这次更新记录。核对原表单内容后，只有明确点击按钮才会使用同一编号与原载荷重试。'
        : recoveryState === 'conflict'
          ? '请求编号或内容与服务器回执不匹配。为避免覆盖，月报和年报写入保持锁定。'
          : recoveryState === 'unavailable'
            ? '暂时无法核实本次总结更新结果。请勿重复提交，月报和年报写入保持锁定。'
            : recoveryState === 'processed_cleanup'
              ? '服务器已确认保存，恢复标记尚未安全清除。月报和年报写入保持锁定。'
              : recoveryState === 'rejected_cleanup'
                ? '服务器已拒绝本次更新。原内容已保留，正在安全清理拒绝标记。'
                : recoveryState === 'rejected_mark_failed'
                  ? '服务器已拒绝本次更新，但浏览器未能安全记录拒绝结果。月报和年报写入保持锁定。'
                  : '浏览器恢复信息无法安全读取或保存，本次没有发送新的总结写请求。';

  const fieldDisabled = isLocked;
  const submitLabel = formKind === 'monthly' ? '提交月报' : '提交年报';
  return <GlassPanel className="space-y-4 p-5">
    {activeRecovery || recoveryState === 'storage_blocked' ? <div role="alert" data-testid="report-summary-recovery" className="space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{recoveryDescription}</p>
      {activeRecovery ? <div className="rounded-lg border border-studio-border-soft bg-studio-surface/70 p-3 text-studio-text-secondary">
        <p>操作：保存{mutationTitle(activeRecovery.kind)} · {activeRecovery.year}{activeRecovery.kind === 'monthly' ? ` 年 ${activeRecovery.month} 月` : ' 年度'}</p>
        <p className="mt-1">原请求编号：<span className="font-mono text-xs">{activeRecovery.requestId}</span></p>
        <p className="mt-1">原表单内容已保留；如需重试，将使用保存时的完整内容。</p>
      </div> : null}
      {recoveryError ? <p className="text-studio-text-secondary">{recoveryError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {recoveryState === 'not_found' && activeRecovery && !activeRecovery.rejected ? <ActionButton type="button" variant="primary" disabled={submitting} onClick={retryOriginalRequest}>使用原请求重试</ActionButton> : null}
        {recoveryState === 'processed_cleanup' || recoveryState === 'rejected_cleanup' || recoveryState === 'rejected_mark_failed' ? <ActionButton type="button" variant="secondary" disabled={submitting} onClick={retryRecoveryCleanup}>{recoveryState === 'rejected_mark_failed' ? '重试保存拒绝标记' : '重试清理恢复标记'}</ActionButton> : null}
        {recoveryState !== 'processed_cleanup' && recoveryState !== 'rejected_cleanup' && recoveryState !== 'rejected_mark_failed' && recoveryState !== 'storage_blocked' ? <ActionButton type="button" variant="secondary" disabled={submitting || recoveryState === 'checking' || recoveryState === 'submitting'} onClick={retryStatusCheck}>{recoveryState === 'checking' ? '正在核实…' : '只读重新核实'}</ActionButton> : null}
        {recoveryState === 'storage_blocked' ? <ActionButton type="button" variant="secondary" onClick={() => window.location.reload()}>重新检查</ActionButton> : null}
      </div>
    </div> : null}
    {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-primary"><span>{loadError}</span><ActionButton type="button" variant="secondary" disabled={loading || Boolean(activeRecovery)} onClick={retryLoad}>重新加载</ActionButton></div> : null}
    {notice ? <div role="status" className="rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm text-studio-text-primary">{notice}</div> : null}
    {baselineConflict && conflictRecord ? <div role="alert" className="space-y-3 rounded-button border border-studio-amber/30 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast">
      <p className="font-medium">服务器总结已变化，本次没有覆盖。你的完整草稿仍保留，写入已暂停。</p>
      <details><summary className="cursor-pointer">查看服务器当前内容</summary><div className="mt-2 space-y-2 text-studio-text-secondary">{(formKind === 'monthly' ? monthlyFields : yearlyFields).map((field) => <p key={field}><span className="font-medium">{field}：</span>{String(conflictRecord[field as keyof SummaryRecord] || '（空）')}</p>)}</div></details>
      <div className="flex flex-wrap gap-2"><ActionButton type="button" variant="secondary" disabled={!conflictRecord.baseline_fingerprint} onClick={retryBaselineConflict}>保留草稿并采用当前版本标记</ActionButton><ActionButton type="button" variant="secondary" onClick={replaceWithServerConflict}>放弃草稿并读取服务器内容</ActionButton></div>
    </div> : null}
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="block"><span className="mb-2 block text-sm text-studio-text-muted">年份</span><input type="number" value={year} disabled={fieldDisabled} onChange={(event) => setYear(Number(event.target.value))} className="xmt-field w-28" /></label>
        {formKind === 'monthly' ? <label className="block"><span className="mb-2 block text-sm text-studio-text-muted">月份</span><select value={month} disabled={fieldDisabled} onChange={(event) => setMonth(Number(event.target.value))} className="xmt-field">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 月</option>)}</select></label> : null}
      </div>
      <ActionButton onClick={() => void submit()} variant="primary" disabled={isLocked || recoveryState !== null}><Send className="h-4 w-4" />{submitting ? '提交中' : submitLabel}</ActionButton>
    </div>
    {formKind === 'monthly' ? <div className="grid gap-5 md:grid-cols-2"><SummaryField label="工作总结" value={monthly.work_summary_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, work_summary_md: value }))} placeholder="记录本月工作总结" disabled={fieldDisabled} /><SummaryField label="重点项目" value={monthly.key_projects_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, key_projects_md: value }))} placeholder="记录本月重点项目" disabled={fieldDisabled} /><SummaryField label="问题与计划" value={monthly.issues_plan_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, issues_plan_md: value }))} placeholder="记录问题和下一步计划" disabled={fieldDisabled} /></div> : <div className="grid gap-5 md:grid-cols-2"><SummaryField label="年度总结" value={yearly.annual_summary_md || ''} onChange={(value) => setYearly((current) => ({ ...current, annual_summary_md: value }))} placeholder="记录年度总结" disabled={fieldDisabled} /><SummaryField label="主要成果" value={yearly.achievements_md || ''} onChange={(value) => setYearly((current) => ({ ...current, achievements_md: value }))} placeholder="记录主要成果" disabled={fieldDisabled} /><SummaryField label="经验不足" value={yearly.shortcomings_md || ''} onChange={(value) => setYearly((current) => ({ ...current, shortcomings_md: value }))} placeholder="记录经验和不足" disabled={fieldDisabled} /><SummaryField label="下一年度计划" value={yearly.next_year_plan_md || ''} onChange={(value) => setYearly((current) => ({ ...current, next_year_plan_md: value }))} placeholder="记录下一年度计划" disabled={fieldDisabled} /></div>}
  </GlassPanel>;
}

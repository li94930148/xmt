import type { MonthlyRecord, YearlyRecord } from '../../api/dailyReports';

export type ReportSummaryKind = 'monthly' | 'yearly';

export type MonthlySummaryPayload = {
  content_md: string;
  work_summary_md: string;
  key_projects_md: string;
  issues_plan_md: string;
};

export type YearlySummaryPayload = {
  content_md: string;
  annual_summary_md: string;
  achievements_md: string;
  shortcomings_md: string;
  next_year_plan_md: string;
};

export type ReportSummaryPayload = MonthlySummaryPayload | YearlySummaryPayload;
export type ReportSummaryFormSnapshot = Pick<MonthlyRecord, 'work_summary_md' | 'key_projects_md' | 'issues_plan_md'>
  | Pick<YearlyRecord, 'annual_summary_md' | 'achievements_md' | 'shortcomings_md' | 'next_year_plan_md'>;

export interface ReportSummaryUpdateRecovery {
  schemaVersion: 1;
  actorId: number;
  kind: ReportSummaryKind;
  year: number;
  month: number | null;
  requestId: string;
  baseFingerprint: string;
  requestFingerprint: string;
  payload: ReportSummaryPayload;
  formSnapshot: ReportSummaryFormSnapshot;
  rejected: boolean;
}

export interface ReportSummaryRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ReportSummaryRecoveryRead =
  | { kind: 'none' }
  | { kind: 'ready'; recovery: ReportSummaryUpdateRecovery }
  | { kind: 'blocked'; recovery: ReportSummaryUpdateRecovery | null; reason: 'unavailable' | 'invalid' | 'conflict' };

const KEY_PREFIX = 'xmt:report-summary-update:pending:actor:';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const MONTHLY_FIELDS = ['content_md', 'work_summary_md', 'key_projects_md', 'issues_plan_md'] as const;
const YEARLY_FIELDS = ['content_md', 'annual_summary_md', 'achievements_md', 'shortcomings_md', 'next_year_plan_md'] as const;

export function reportSummaryRecoveryKey(actorId: number) {
  return `${KEY_PREFIX}${actorId}`;
}

function rejectedFallbackKey(actorId: number) {
  return `${reportSummaryRecoveryKey(actorId)}:rejected`;
}

function toString(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function monthlySummaryPayload(record: Pick<MonthlyRecord, 'work_summary_md' | 'key_projects_md' | 'issues_plan_md'>): MonthlySummaryPayload {
  return {
    content_md: '',
    work_summary_md: toString(record.work_summary_md),
    key_projects_md: toString(record.key_projects_md),
    issues_plan_md: toString(record.issues_plan_md),
  };
}

export function yearlySummaryPayload(record: Pick<YearlyRecord, 'annual_summary_md' | 'achievements_md' | 'shortcomings_md' | 'next_year_plan_md'>): YearlySummaryPayload {
  return {
    content_md: '',
    annual_summary_md: toString(record.annual_summary_md),
    achievements_md: toString(record.achievements_md),
    shortcomings_md: toString(record.shortcomings_md),
    next_year_plan_md: toString(record.next_year_plan_md),
  };
}

function payloadValues(kind: ReportSummaryKind, year: number, month: number | null, payload: ReportSummaryPayload) {
  const values = kind === 'monthly'
    ? MONTHLY_FIELDS.map((field) => toString((payload as MonthlySummaryPayload)[field]))
    : YEARLY_FIELDS.map((field) => toString((payload as YearlySummaryPayload)[field]));
  return [kind, year, kind === 'monthly' ? month : 0, values];
}

async function sha256(value: unknown) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function reportSummaryUpdateFingerprint(
  kind: ReportSummaryKind,
  year: number,
  month: number | null,
  payload: ReportSummaryPayload,
  baseFingerprint: string,
) {
  const payloadFingerprint = await sha256(payloadValues(kind, year, month, payload));
  return sha256([baseFingerprint.trim().toLowerCase(), payloadFingerprint]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPayload(value: unknown, kind: ReportSummaryKind): value is ReportSummaryPayload {
  if (!isRecord(value)) return false;
  const fields: readonly string[] = kind === 'monthly' ? MONTHLY_FIELDS : YEARLY_FIELDS;
  return Object.keys(value).length === fields.length
    && Object.keys(value).every((field, index) => field === fields[index])
    && fields.every((field) => typeof value[field] === 'string');
}

function isFormSnapshot(value: unknown, kind: ReportSummaryKind): value is ReportSummaryFormSnapshot {
  if (!isRecord(value)) return false;
  const fields = kind === 'monthly'
    ? ['work_summary_md', 'key_projects_md', 'issues_plan_md']
    : ['annual_summary_md', 'achievements_md', 'shortcomings_md', 'next_year_plan_md'];
  return Object.keys(value).length === fields.length
    && Object.keys(value).every((field, index) => field === fields[index])
    && fields.every((field) => typeof value[field] === 'string');
}

function parseRecovery(raw: string | null, actorId: number): ReportSummaryUpdateRecovery | null | 'invalid' {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReportSummaryUpdateRecovery>;
    if (value.schemaVersion !== 1 || value.actorId !== actorId
      || (value.kind !== 'monthly' && value.kind !== 'yearly')
      || !Number.isSafeInteger(value.year) || Number(value.year) <= 0
      || (value.kind === 'monthly' ? !Number.isSafeInteger(value.month) || Number(value.month) < 1 || Number(value.month) > 12 : value.month !== null)
      || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)
      || typeof value.baseFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(value.baseFingerprint)
      || typeof value.requestFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(value.requestFingerprint)
      || typeof value.rejected !== 'boolean'
      || !isPayload(value.payload, value.kind)
      || !isFormSnapshot(value.formSnapshot, value.kind)) return 'invalid';
    return {
      schemaVersion: 1,
      actorId,
      kind: value.kind,
      year: Number(value.year),
      month: value.month ?? null,
      requestId: value.requestId.toLowerCase(),
      baseFingerprint: value.baseFingerprint,
      requestFingerprint: value.requestFingerprint,
      payload: value.payload,
      formSnapshot: value.formSnapshot,
      rejected: value.rejected,
    };
  } catch {
    return 'invalid';
  }
}

export function sameReportSummaryRecovery(left: ReportSummaryUpdateRecovery | null, right: ReportSummaryUpdateRecovery | null) {
  if (!left || !right) return left === right;
  return left.actorId === right.actorId
    && left.kind === right.kind
    && left.year === right.year
    && left.month === right.month
    && left.requestId === right.requestId
    && left.baseFingerprint === right.baseFingerprint
    && left.requestFingerprint === right.requestFingerprint
    && JSON.stringify(left.payload) === JSON.stringify(right.payload)
    && JSON.stringify(left.formSnapshot) === JSON.stringify(right.formSnapshot);
}

export function readReportSummaryRecovery(actorId: number, session: ReportSummaryRecoveryStorage, local: ReportSummaryRecoveryStorage): ReportSummaryRecoveryRead {
  let sessionRaw: string | null;
  let localRaw: string | null;
  let fallbackRaw: string | null;
  try {
    const key = reportSummaryRecoveryKey(actorId);
    sessionRaw = session.getItem(key);
    localRaw = local.getItem(key);
    fallbackRaw = local.getItem(rejectedFallbackKey(actorId));
  } catch {
    return { kind: 'blocked', recovery: null, reason: 'unavailable' };
  }
  const fromSession = parseRecovery(sessionRaw, actorId);
  const fromLocal = parseRecovery(localRaw, actorId);
  const fallback = parseRecovery(fallbackRaw, actorId);
  if (fromSession === 'invalid' || fromLocal === 'invalid' || fallback === 'invalid') return { kind: 'blocked', recovery: null, reason: 'invalid' };
  if (!fromSession && !fromLocal && !fallback) return { kind: 'none' };
  if ((fromSession && fromLocal && !sameReportSummaryRecovery(fromSession, fromLocal))
    || (fallback && (!fallback.rejected
      || (fromSession && !sameReportSummaryRecovery(fallback, fromSession))
      || (fromLocal && !sameReportSummaryRecovery(fallback, fromLocal))))) {
    return { kind: 'blocked', recovery: fromSession || fromLocal || fallback, reason: 'conflict' };
  }
  const recovery = fromSession || fromLocal || fallback;
  return recovery
    ? { kind: 'ready', recovery: { ...recovery, rejected: Boolean(fromSession?.rejected || fromLocal?.rejected || fallback?.rejected) } }
    : { kind: 'none' };
}

export function persistReportSummaryRecovery(recovery: ReportSummaryUpdateRecovery, session: ReportSummaryRecoveryStorage, local: ReportSummaryRecoveryStorage) {
  const key = reportSummaryRecoveryKey(recovery.actorId);
  const serialized = JSON.stringify(recovery);
  try { session.setItem(key, serialized); } catch { /* verify below */ }
  try { local.setItem(key, serialized); } catch { /* verify below */ }
  try {
    return session.getItem(key) === serialized && local.getItem(key) === serialized;
  } catch {
    return false;
  }
}

export function markReportSummaryRecoveryRejected(recovery: ReportSummaryUpdateRecovery, session: ReportSummaryRecoveryStorage, local: ReportSummaryRecoveryStorage) {
  const rejected = { ...recovery, rejected: true };
  const key = reportSummaryRecoveryKey(recovery.actorId);
  const serialized = JSON.stringify(rejected);
  try { session.setItem(key, serialized); } catch { /* local fallback below */ }
  try { local.setItem(key, serialized); } catch { /* verify below */ }
  try { local.setItem(rejectedFallbackKey(recovery.actorId), serialized); } catch { /* verify below */ }
  const read = readReportSummaryRecovery(recovery.actorId, session, local);
  try {
    const fallback = parseRecovery(local.getItem(rejectedFallbackKey(recovery.actorId)), recovery.actorId);
    return Boolean(fallback && fallback !== 'invalid' && fallback.rejected
      && sameReportSummaryRecovery(fallback, recovery) && read.kind === 'ready'
      && read.recovery.rejected && sameReportSummaryRecovery(read.recovery, recovery));
  } catch {
    return false;
  }
}

export function removeReportSummaryRecovery(recovery: ReportSummaryUpdateRecovery, session: ReportSummaryRecoveryStorage, local: ReportSummaryRecoveryStorage) {
  const before = readReportSummaryRecovery(recovery.actorId, session, local);
  if (before.kind === 'blocked' || (before.kind === 'ready' && !sameReportSummaryRecovery(before.recovery, recovery))) return false;
  const key = reportSummaryRecoveryKey(recovery.actorId);
  try { session.removeItem(key); } catch { /* verify below */ }
  try { local.removeItem(key); } catch { /* verify below */ }
  try {
    if (session.getItem(key) !== null || local.getItem(key) !== null) return false;
  } catch {
    return false;
  }
  try { local.removeItem(rejectedFallbackKey(recovery.actorId)); } catch { /* verify below */ }
  return readReportSummaryRecovery(recovery.actorId, session, local).kind === 'none';
}

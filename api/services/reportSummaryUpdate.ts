import { createHash } from 'node:crypto';
import { beijingNow, queryOne, runInTransaction, type TransactionContext } from '../database/utils';

export type ReportSummaryKind = 'monthly' | 'yearly';
export type ReportSummaryTarget = { kind: ReportSummaryKind; year: number; month: number | null };
export type ReportSummaryWriteValues = Record<string, string>;
export type ReportSummaryStoredResult = { row: Record<string, unknown>; baseline_fingerprint: string };

type SummaryRow = Record<string, unknown>;

const summaryFields: Record<ReportSummaryKind, string[]> = {
  monthly: ['content_md', 'work_summary_md', 'key_projects_md', 'issues_plan_md'],
  yearly: ['content_md', 'annual_summary_md', 'achievements_md', 'shortcomings_md', 'next_year_plan_md'],
};

function monthFor(target: ReportSummaryTarget) {
  return target.kind === 'monthly' ? target.month! : 0;
}

function valueFor(row: SummaryRow, key: string) {
  const value = row[key];
  return value == null ? '' : String(value);
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createReportSummaryBaseFingerprint(
  actorId: number,
  target: ReportSummaryTarget,
  row: SummaryRow | null,
) {
  const period = [actorId, target.kind, target.year, monthFor(target)];
  const baseline = row
    ? ['row', ...period, row.id == null ? null : Number(row.id), ...summaryFields[target.kind].map((field) => valueFor(row, field))]
    : ['no-row', ...period];
  return digest(baseline);
}

export function createReportSummaryPayloadFingerprint(
  target: ReportSummaryTarget,
  values: ReportSummaryWriteValues,
) {
  return digest([
    target.kind,
    target.year,
    monthFor(target),
    summaryFields[target.kind].map((field) => String(values[field] ?? '')),
  ]);
}

export function createReportSummaryUpdateRequestFingerprint(
  target: ReportSummaryTarget,
  values: ReportSummaryWriteValues,
  baseFingerprint: string,
) {
  return digest([
    baseFingerprint.trim().toLowerCase(),
    createReportSummaryPayloadFingerprint(target, values),
  ]);
}

export class ReportSummaryUpdateRequestConflictError extends Error {
  constructor() {
    super('REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT');
    this.name = 'ReportSummaryUpdateRequestConflictError';
  }
}

export class ReportSummaryUpdateBaseConflictError extends Error {
  readonly currentFingerprint: string;

  constructor(currentFingerprint: string) {
    super('REPORT_SUMMARY_UPDATE_BASE_CONFLICT');
    this.name = 'ReportSummaryUpdateBaseConflictError';
    this.currentFingerprint = currentFingerprint;
  }
}

export class ReportSummaryUpdateTargetMissingError extends Error {
  constructor() {
    super('REPORT_SUMMARY_UPDATE_TARGET_MISSING');
    this.name = 'ReportSummaryUpdateTargetMissingError';
  }
}

function isSqliteBusy(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; rawCode?: unknown; cause?: unknown };
    if (candidate.code === 'SQLITE_BUSY' || Number(candidate.rawCode) === 5) return true;
    current = candidate.cause;
  }
  return false;
}

async function runReportSummaryUpdateTransaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runInTransaction(callback);
    } catch (error) {
      if (!isSqliteBusy(error) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
    }
  }
}

function rowSelect(target: ReportSummaryTarget) {
  if (target.kind === 'monthly') {
    return {
      sql: 'SELECT * FROM monthly_summaries WHERE user_id=? AND year=? AND month=? ORDER BY id LIMIT 1',
      args: (actorId: number) => [actorId, target.year, target.month],
    };
  }
  return {
    sql: 'SELECT * FROM yearly_summaries WHERE user_id=? AND year=? ORDER BY id LIMIT 1',
    args: (actorId: number) => [actorId, target.year],
  };
}

async function selectTargetRow(tx: TransactionContext, actorId: number, target: ReportSummaryTarget) {
  const select = rowSelect(target);
  return tx.queryOne<SummaryRow>(select.sql, select.args(actorId));
}

async function readTargetRow(actorId: number, target: ReportSummaryTarget) {
  const select = rowSelect(target);
  return queryOne<SummaryRow>(select.sql, select.args(actorId));
}

export async function updateReportSummaryWithRequest(
  actorId: number,
  target: ReportSummaryTarget,
  values: ReportSummaryWriteValues,
  clientRequestId: string,
  baseFingerprint: string,
) {
  const normalizedRequestId = clientRequestId.trim().toLowerCase();
  const normalizedBaseFingerprint = baseFingerprint.trim().toLowerCase();
  const requestFingerprint = createReportSummaryUpdateRequestFingerprint(target, values, normalizedBaseFingerprint);
  const periodMonth = monthFor(target);

  return runReportSummaryUpdateTransaction(async (tx) => {
    const existing = await tx.queryOne<{
      actor_id: number;
      summary_kind: string;
      summary_year: number;
      summary_month: number;
      request_fingerprint: string;
      base_fingerprint: string;
      result_json: string;
    }>(
      `SELECT actor_id,summary_kind,summary_year,summary_month,request_fingerprint,base_fingerprint,result_json
       FROM report_summary_update_request_keys WHERE client_request_id=?`,
      [normalizedRequestId],
    );
    if (existing) {
      if (Number(existing.actor_id) !== actorId
        || existing.summary_kind !== target.kind
        || Number(existing.summary_year) !== target.year
        || Number(existing.summary_month) !== periodMonth
        || existing.request_fingerprint !== requestFingerprint
        || existing.base_fingerprint !== normalizedBaseFingerprint) {
        throw new ReportSummaryUpdateRequestConflictError();
      }
      return { result: JSON.parse(existing.result_json) as ReportSummaryStoredResult, replayed: true };
    }

    const currentRow = await selectTargetRow(tx, actorId, target);
    const currentFingerprint = createReportSummaryBaseFingerprint(actorId, target, currentRow);
    if (currentFingerprint !== normalizedBaseFingerprint) {
      throw new ReportSummaryUpdateBaseConflictError(currentFingerprint);
    }

    const updatedAt = beijingNow();
    if (target.kind === 'monthly') {
      await tx.execute(
        `INSERT INTO monthly_summaries
          (user_id,year,month,content_md,work_summary_md,key_projects_md,issues_plan_md,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id,year,month) DO UPDATE SET
          content_md=excluded.content_md,work_summary_md=excluded.work_summary_md,
          key_projects_md=excluded.key_projects_md,issues_plan_md=excluded.issues_plan_md,updated_at=excluded.updated_at`,
        [actorId, target.year, target.month, values.content_md || '', values.work_summary_md || '',
          values.key_projects_md || '', values.issues_plan_md || '', updatedAt, updatedAt],
      );
    } else {
      await tx.execute(
        `INSERT INTO yearly_summaries
          (user_id,year,content_md,annual_summary_md,achievements_md,shortcomings_md,next_year_plan_md,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id,year) DO UPDATE SET
          content_md=excluded.content_md,annual_summary_md=excluded.annual_summary_md,
          achievements_md=excluded.achievements_md,shortcomings_md=excluded.shortcomings_md,
          next_year_plan_md=excluded.next_year_plan_md,updated_at=excluded.updated_at`,
        [actorId, target.year, values.content_md || '', values.annual_summary_md || '', values.achievements_md || '',
          values.shortcomings_md || '', values.next_year_plan_md || '', updatedAt, updatedAt],
      );
    }

    const savedRow = await selectTargetRow(tx, actorId, target);
    if (!savedRow) throw new ReportSummaryUpdateTargetMissingError();
    const result: ReportSummaryStoredResult = {
      row: savedRow,
      baseline_fingerprint: createReportSummaryBaseFingerprint(actorId, target, savedRow),
    };
    await tx.execute(
      `INSERT INTO report_summary_update_request_keys
        (client_request_id,actor_id,summary_kind,summary_year,summary_month,request_fingerprint,base_fingerprint,result_json,created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [normalizedRequestId, actorId, target.kind, target.year, periodMonth, requestFingerprint,
        normalizedBaseFingerprint, JSON.stringify(result), updatedAt],
    );
    return { result, replayed: false };
  });
}

export async function getReportSummaryUpdateRequestStatus(
  actorId: number,
  target: ReportSummaryTarget,
  clientRequestId: string,
  fingerprint: string,
) {
  const request = await queryOne<{
    actor_id: number;
    summary_kind: string;
    summary_year: number;
    summary_month: number;
    request_fingerprint: string;
    result_json: string;
  }>(
    `SELECT actor_id,summary_kind,summary_year,summary_month,request_fingerprint,result_json
     FROM report_summary_update_request_keys WHERE client_request_id=?`,
    [clientRequestId.trim().toLowerCase()],
  );
  if (!request || Number(request.actor_id) !== actorId
    || request.summary_kind !== target.kind
    || Number(request.summary_year) !== target.year
    || Number(request.summary_month) !== monthFor(target)) {
    return { status: 'not_found' as const };
  }
  if (request.request_fingerprint !== fingerprint.trim().toLowerCase()) {
    throw new ReportSummaryUpdateRequestConflictError();
  }
  return { status: 'processed' as const, result: JSON.parse(request.result_json) as ReportSummaryStoredResult };
}

export async function getCurrentReportSummary(actorId: number, target: ReportSummaryTarget) {
  return readTargetRow(actorId, target);
}

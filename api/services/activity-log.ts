import { formatBjtApi, formatBjtDatabase, nowBjt, parseStoredBjt } from '../../shared/time';

export const ACTIVITY_LOG_RETENTION_DAYS = 7;

export function activityLogTimestamp(): string {
  return formatBjtDatabase(nowBjt());
}

export function activityLogCutoffTimestamp(): string {
  return formatBjtDatabase(new Date(nowBjt().getTime() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000));
}

export function serializeActivityLog<T extends { created_at: unknown }>(row: T): T & { created_at: string } {
  const parsed = parseStoredBjt(row.created_at == null ? null : String(row.created_at));
  return {
    ...row,
    created_at: parsed ? formatBjtApi(parsed) : String(row.created_at ?? ''),
  };
}

import { db } from './db';
import { dateKeyBjt, formatBjtDatabase, nowBjt } from '../../shared/time';
import { apiLogger } from '../observability/logger.js';

type DbArg = string | number | boolean | null;

export class DatabaseError extends Error {
  sql: string;
  params: unknown[];

  constructor(message: string, sql: string, params: unknown[], cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.sql = sql;
    this.params = params;

    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/** Returns the Beijing database timestamp format: YYYY-MM-DD HH:mm:ss. */
export function beijingNow(): string {
  return formatBjtDatabase(nowBjt());
}

export function beijingToday(): string {
  return dateKeyBjt(nowBjt());
}

function normalizeParams(params: unknown[]): DbArg[] {
  return params.map((param) => (param === undefined ? null : param)) as DbArg[];
}

function buildDatabaseError(operation: string, sql: string, params: unknown[], err: unknown) {
  const sqliteMessage = err instanceof Error ? err.message : String(err);
  const table = sql.match(/\b(?:INSERT\s+INTO|UPDATE|FROM|TABLE)\s+([a-zA-Z0-9_]+)/i)?.[1] || 'unknown';
  // Never log bound parameters: this layer is also used for encrypted OAuth tokens.
  apiLogger.error({
    module: 'database',
    operation: 'query.failed',
    databaseOperation: operation,
    table,
    error: { code: 'DATABASE_OPERATION_FAILED', name: err instanceof Error ? err.name : 'UnknownError' },
  }, 'api.database.query_failed');
  return new DatabaseError(`Database ${operation} failed on ${table}: ${sqliteMessage}`, sql, params, err);
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  try {
    const result = await db.execute({
      sql,
      args: normalizeParams(params),
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as T;
  } catch (err) {
    throw buildDatabaseError('queryOne', sql, params, err);
  }
}

export async function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const result = await db.execute({
      sql,
      args: normalizeParams(params),
    });

    return result.rows as unknown as T[];
  } catch (err) {
    throw buildDatabaseError('queryAll', sql, params, err);
  }
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const result = await db.execute({
      sql,
      args: normalizeParams(params),
    });

    return result.rowsAffected ?? 0;
  } catch (err) {
    throw buildDatabaseError('execute', sql, params, err);
  }
}

/**
 * 执行 INSERT 语句并返回新插入行的 ID
 */
export async function executeInsert(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const result = await db.execute({
      sql,
      args: normalizeParams(params),
    });

    return Number(result.lastInsertRowid ?? 0);
  } catch (err) {
    throw buildDatabaseError('executeInsert', sql, params, err);
  }
}

export type TransactionContext = {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
  executeInsert(sql: string, params?: unknown[]): Promise<number>;
};

export async function runInTransaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
  const transaction = await db.transaction('write');

  const txContext: TransactionContext = {
    async queryOne<U = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      try {
        const result = await transaction.execute({ sql, args: normalizeParams(params) });
        return result.rows.length === 0 ? null : (result.rows[0] as unknown as U);
      } catch (err) {
        throw buildDatabaseError('queryOne', sql, params, err);
      }
    },
    async queryAll<U = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      try {
        const result = await transaction.execute({ sql, args: normalizeParams(params) });
        return result.rows as unknown as U[];
      } catch (err) {
        throw buildDatabaseError('queryAll', sql, params, err);
      }
    },
    async execute(sql: string, params: unknown[] = []) {
      try {
        const result = await transaction.execute({ sql, args: normalizeParams(params) });
        return result.rowsAffected ?? 0;
      } catch (err) {
        throw buildDatabaseError('execute', sql, params, err);
      }
    },
    async executeInsert(sql: string, params: unknown[] = []) {
      try {
        const result = await transaction.execute({ sql, args: normalizeParams(params) });
        return Number(result.lastInsertRowid ?? 0);
      } catch (err) {
        throw buildDatabaseError('executeInsert', sql, params, err);
      }
    },
  };

  try {
    const result = await callback(txContext);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

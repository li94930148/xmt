import { db } from './db';
import { dateKeyBjt, formatBjtDatabase, nowBjt } from '../../shared/time';

type DbArg = string | number | boolean | null;

/**
 * Transitional SQL compatibility boundary.
 *
 * Existing routes still contain the former SQLite expression while they are
 * migrated in small, reviewable batches. Before execution it is converted to
 * a bound Beijing timestamp, so SQLite never calculates the application time
 * and every write receives an explicit value.
 */
function bindLegacyBjtNow(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  const expression = "datetime('now', '+8 hours')";
  let cursor = 0;
  let rewritten = sql;
  const values = [...params];

  while (true) {
    const index = rewritten.indexOf(expression, cursor);
    if (index < 0) break;
    const placeholdersBefore = (rewritten.slice(0, index).match(/\?/g) ?? []).length;
    values.splice(placeholdersBefore, 0, beijingNow());
    rewritten = `${rewritten.slice(0, index)}?${rewritten.slice(index + expression.length)}`;
    cursor = index + 1;
  }
  return { sql: rewritten, params: values };
}

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

/**
 * 获取北京时间字符串，用于替代 SQL 中的 CURRENT_TIMESTAMP
 * 格式：YYYY-MM-DD HH:MM:SS
 */
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
  console.error('[DB] operation failed', { operation, table, sqliteMessage });
  return new DatabaseError(`Database ${operation} failed on ${table}: ${sqliteMessage}`, sql, params, err);
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  try {
    const prepared = bindLegacyBjtNow(sql, params);
    const result = await db.execute({
      sql: prepared.sql,
      args: normalizeParams(prepared.params),
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
    const prepared = bindLegacyBjtNow(sql, params);
    const result = await db.execute({
      sql: prepared.sql,
      args: normalizeParams(prepared.params),
    });

    return result.rows as unknown as T[];
  } catch (err) {
    throw buildDatabaseError('queryAll', sql, params, err);
  }
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const prepared = bindLegacyBjtNow(sql, params);
    const result = await db.execute({
      sql: prepared.sql,
      args: normalizeParams(prepared.params),
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
    const prepared = bindLegacyBjtNow(sql, params);
    const result = await db.execute({
      sql: prepared.sql,
      args: normalizeParams(prepared.params),
    });

    return Number(result.lastInsertRowid ?? 0);
  } catch (err) {
    throw buildDatabaseError('executeInsert', sql, params, err);
  }
}

type TransactionContext = {
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
        const prepared = bindLegacyBjtNow(sql, params);
        const result = await transaction.execute({ sql: prepared.sql, args: normalizeParams(prepared.params) });
        return result.rows.length === 0 ? null : (result.rows[0] as unknown as U);
      } catch (err) {
        throw buildDatabaseError('queryOne', sql, params, err);
      }
    },
    async queryAll<U = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      try {
        const prepared = bindLegacyBjtNow(sql, params);
        const result = await transaction.execute({ sql: prepared.sql, args: normalizeParams(prepared.params) });
        return result.rows as unknown as U[];
      } catch (err) {
        throw buildDatabaseError('queryAll', sql, params, err);
      }
    },
    async execute(sql: string, params: unknown[] = []) {
      try {
        const prepared = bindLegacyBjtNow(sql, params);
        const result = await transaction.execute({ sql: prepared.sql, args: normalizeParams(prepared.params) });
        return result.rowsAffected ?? 0;
      } catch (err) {
        throw buildDatabaseError('execute', sql, params, err);
      }
    },
    async executeInsert(sql: string, params: unknown[] = []) {
      try {
        const prepared = bindLegacyBjtNow(sql, params);
        const result = await transaction.execute({ sql: prepared.sql, args: normalizeParams(prepared.params) });
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

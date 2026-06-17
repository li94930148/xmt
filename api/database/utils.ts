import { db } from './db';

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

/**
 * 获取北京时间字符串，用于替代 SQL 中的 CURRENT_TIMESTAMP
 * 格式：YYYY-MM-DD HH:MM:SS
 */
export function beijingNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

export function beijingToday(): string {
  return beijingNow().slice(0, 10);
}

function normalizeParams(params: unknown[]): DbArg[] {
  return params.map((param) => (param === undefined ? null : param)) as DbArg[];
}

function buildDatabaseError(operation: string, sql: string, params: unknown[], err: unknown) {
  console.error(`[DB] ${operation} error:`, err, '\nSQL:', sql, '\nParams:', params);
  return new DatabaseError(`Database ${operation} failed`, sql, params, err);
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

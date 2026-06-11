import { db } from './db';

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

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  try {
    const result = await db.execute({
      sql,
      args: params.map(p => p === undefined ? null : p) as (string | number | boolean | null)[],
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as T;
  } catch (err) {
    console.error('[DB] queryOne error:', err, '\nSQL:', sql, '\nParams:', params);
    return null;
  }
}

export async function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const result = await db.execute({
      sql,
      args: params.map(p => p === undefined ? null : p) as (string | number | boolean | null)[],
    });

    return result.rows as unknown as T[];
  } catch (err) {
    console.error('[DB] queryAll error:', err, '\nSQL:', sql, '\nParams:', params);
    return [];
  }
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const result = await db.execute({
      sql,
      args: params.map(p => p === undefined ? null : p) as (string | number | boolean | null)[],
    });

    return result.rowsAffected ?? 0;
  } catch (err) {
    console.error('[DB] execute error:', err, '\nSQL:', sql, '\nParams:', params);
    return 0;
  }
}

/**
 * 执行 INSERT 语句并返回新插入行的 ID
 */
export async function executeInsert(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const result = await db.execute({
      sql,
      args: params.map(p => p === undefined ? null : p) as (string | number | boolean | null)[],
    });

    // libsql 返回 lastInsertRowid 作为 BigInt
    return Number(result.lastInsertRowid ?? 0);
  } catch (err) {
    console.error('[DB] executeInsert error:', err, '\nSQL:', sql, '\nParams:', params);
    return 0;
  }
}

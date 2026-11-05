import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  dateKeyBjt,
  formatBjtApi,
  formatBjtDatabase,
  formatBjtDisplay,
  parseStoredBjt,
  rangeBjt,
} from '../../shared/time/index.js';

describe('Beijing time contracts', () => {
  it('keeps database, API, date-key, range, and display formats aligned at midnight', () => {
    const instant = new Date('2025-12-31T16:00:00.000Z');
    expect(formatBjtDatabase(instant)).toBe('2026-01-01 00:00:00');
    expect(formatBjtApi(instant)).toBe('2026-01-01T00:00:00+08:00');
    expect(dateKeyBjt('2025-12-31T15:59:59Z')).toBe('2025-12-31');
    expect(dateKeyBjt('2025-12-31T16:00:00Z')).toBe('2026-01-01');
    expect(parseStoredBjt('2026-01-01 00:00:00')?.toISOString()).toBe('2025-12-31T16:00:00.000Z');
    expect(rangeBjt('2025-12-31', '2026-01-01').endExclusive).toBe('2026-01-02 00:00:00');
    expect(formatBjtDisplay('2026-01-01 23:59:59')).toMatch(/2026/);
  });

  it('does not derive Beijing time from the host timezone', () => {
    for (const timezone of ['America/New_York', 'Europe/London', 'Asia/Tokyo']) {
      const output = execFileSync(process.execPath, [
        '--import', 'tsx', '-e',
        "import { formatBjtApi } from './shared/time/index.ts'; process.stdout.write(formatBjtApi('2025-12-31T16:00:00Z'));",
      ], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, TZ: timezone } });
      expect(output, `TZ=${timezone}`).toBe('2026-01-01T00:00:00+08:00');
    }
  });

  it('round-trips stored Beijing timestamps through API and display formatting', () => {
    for (const stored of ['2026-01-01 00:00:00', '2026-12-31 23:59:59']) {
      const parsed = parseStoredBjt(stored);
      expect(parsed).toBeTruthy();
      expect(formatBjtDatabase(parsed!)).toBe(stored);
      expect(formatBjtApi(parsed!)).toBe(`${stored.replace(' ', 'T')}+08:00`);
      expect(formatBjtDisplay(parsed!)).not.toBe('-');
    }
  });
});

describe('database explicit Beijing timestamp bindings', () => {
  const originalDatabasePath = process.env.XMT_DB_PATH;
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-time-vitest-'));
  let databaseHelpers: typeof import('../../api/database/utils');
  let databaseClient: typeof import('../../api/database/db').db;

  beforeAll(async () => {
    process.env.XMT_DB_PATH = path.join(tempDirectory, 'time.db');
    const databaseModule = await import('../../api/database/db');
    databaseClient = databaseModule.db;
    databaseHelpers = await import('../../api/database/utils');
    await databaseHelpers.execute(
      'CREATE TABLE timestamps (id INTEGER PRIMARY KEY, label TEXT, created_at TEXT, note TEXT, updated_at TEXT)',
    );
  });

  afterAll(async () => {
    if (databaseClient) await databaseClient.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    fs.rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    if (originalDatabasePath === undefined) delete process.env.XMT_DB_PATH;
    else process.env.XMT_DB_PATH = originalDatabasePath;
  });

  it('preserves bound timestamps, question marks, and transaction parameter order', async () => {
    const { execute, executeInsert, queryOne, runInTransaction } = databaseHelpers;
    const explicitTimestamp = formatBjtDatabase(new Date('2025-12-31T16:00:00.000Z'));
    await execute('INSERT INTO timestamps (label, created_at) VALUES (?, ?)', ['test', explicitTimestamp]);
    const row = await queryOne<{ id: number; created_at: string }>(
      'SELECT id, created_at FROM timestamps WHERE label = ?',
      ['test'],
    );
    expect(row?.created_at).toBe(explicitTimestamp);
    expect(formatBjtApi(row?.created_at ?? '')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);

    const questionMarkRowId = await executeInsert(
      `INSERT INTO timestamps (label, created_at, note)
       VALUES (CASE WHEN ? = 1 THEN 'literal ?' ELSE 'other' END /* ? comment */, ?, ?) /* ? comment placeholder is not a bind */`,
      [1, explicitTimestamp, 'value after explicit time'],
    );
    const questionMarkLiteral = await queryOne<{ label: string; created_at: string; note: string }>(
      'SELECT label, created_at, note FROM timestamps WHERE id = ?',
      [questionMarkRowId],
    );
    expect(questionMarkLiteral?.label).toBe('literal ?');
    expect(questionMarkLiteral?.note).toBe('value after explicit time');
    expect(questionMarkLiteral?.created_at).toBe(explicitTimestamp);

    const multipleTimeRowId = await executeInsert(
      'INSERT INTO timestamps (label, created_at, note, updated_at) VALUES (?, ?, ?, ?)',
      ['multiple-times', explicitTimestamp, 'between-time-bindings', explicitTimestamp],
    );
    const multipleTimeRow = await queryOne<{ created_at: string; note: string; updated_at: string }>(
      'SELECT created_at, note, updated_at FROM timestamps WHERE id = ?',
      [multipleTimeRowId],
    );
    expect(multipleTimeRow?.note).toBe('between-time-bindings');
    expect(multipleTimeRow?.created_at).toBe(explicitTimestamp);
    expect(multipleTimeRow?.updated_at).toBe(explicitTimestamp);

    await runInTransaction(async (transaction) => {
      const changed = await transaction.execute(
        "UPDATE timestamps SET label = '? literal', created_at = ? WHERE id = ?",
        [explicitTimestamp, row?.id],
      );
      expect(changed).toBe(1);
    });
  });
});

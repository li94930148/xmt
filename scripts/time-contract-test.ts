import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dateKeyBjt, formatBjtApi, formatBjtDatabase, formatBjtDisplay, parseStoredBjt, rangeBjt } from '../shared/time';

const instant = new Date('2025-12-31T16:00:00.000Z');
assert.equal(formatBjtDatabase(instant), '2026-01-01 00:00:00');
assert.equal(formatBjtApi(instant), '2026-01-01T00:00:00+08:00');
assert.equal(dateKeyBjt('2025-12-31T15:59:59Z'), '2025-12-31');
assert.equal(dateKeyBjt('2025-12-31T16:00:00Z'), '2026-01-01');
assert.equal(parseStoredBjt('2026-01-01 00:00:00')?.toISOString(), '2025-12-31T16:00:00.000Z');
assert.equal(rangeBjt('2025-12-31', '2026-01-01').endExclusive, '2026-01-02 00:00:00');
assert.match(formatBjtDisplay('2026-01-01 23:59:59'), /2026/);

// The formatter must not take its timezone from the browser/runtime setting.
for (const timezone of ['America/New_York', 'Europe/London', 'Asia/Tokyo']) {
  const output = execFileSync(process.execPath, [
    '--import', 'tsx', '-e',
    "import { formatBjtApi } from './shared/time/index.ts'; process.stdout.write(formatBjtApi('2025-12-31T16:00:00Z'));",
  ], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, TZ: timezone } });
  assert.equal(output, '2026-01-01T00:00:00+08:00', `TZ=${timezone}`);
}

// Persistence -> parse -> API -> display share one instant at both day boundaries.
for (const stored of ['2026-01-01 00:00:00', '2026-12-31 23:59:59']) {
  const parsed = parseStoredBjt(stored);
  assert.ok(parsed);
  assert.equal(formatBjtDatabase(parsed), stored);
  assert.equal(formatBjtApi(parsed), `${stored.replace(' ', 'T')}+08:00`);
  assert.notEqual(formatBjtDisplay(parsed), '-');
}

// Database wrapper binds the legacy expression as an explicit BJT value.
const tempDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-time-')), 'time.db');
process.env.XMT_DB_PATH = tempDb;
const { execute, queryOne } = await import('../api/database/utils');
const { db } = await import('../api/database/db');
await execute('CREATE TABLE timestamps (id INTEGER PRIMARY KEY, label TEXT, created_at TEXT)');
await execute("INSERT INTO timestamps (label, created_at) VALUES (?, datetime('now', '+8 hours'))", ['test']);
const row = await queryOne<{ created_at: string }>('SELECT created_at FROM timestamps WHERE label = ?', ['test']);
assert.match(row?.created_at ?? '', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
assert.match(formatBjtApi(row?.created_at ?? ''), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
await db.close();
await new Promise((resolve) => setTimeout(resolve, 50));
fs.rmSync(path.dirname(tempDb), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
console.log('Time contract tests passed');

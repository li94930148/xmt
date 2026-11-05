import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { formatBjtDatabase, nowBjt } from '../shared/time/index.js';

type SqlArg = string | number | null;

const measuredCalls = 1_000;
const iterationsPerRound = measuredCalls / 2;
const rounds = 5;
const insertWithSqlClock = "INSERT INTO sql_time_benchmark (id, payload, created_at) VALUES (?, ?, datetime('now', '+8 hours'))";
const insertWithBoundClock = 'INSERT INTO sql_time_benchmark (id, payload, created_at) VALUES (?, ?, ?)';
const selectById = 'SELECT payload, created_at FROM sql_time_benchmark WHERE id = ?';

function legacySqlClockRewrite(sql: string, params: unknown[]) {
  if (!/^\s*(?:INSERT|UPDATE|DELETE|SELECT|WITH)\b/i.test(sql)) return { sql, params };

  const expression = /datetime\(\s*'now'\s*,\s*'\+8 hours'\s*\)|CURRENT_TIMESTAMP/gi;
  let cursor = 0;
  let rewritten = sql;
  const values = [...params];
  const timestamp = formatBjtDatabase(nowBjt());

  while (true) {
    expression.lastIndex = cursor;
    const match = expression.exec(rewritten);
    if (!match) break;
    const index = match.index;
    const placeholdersBefore = (rewritten.slice(0, index).match(/\?/g) ?? []).length;
    values.splice(placeholdersBefore, 0, timestamp);
    rewritten = `${rewritten.slice(0, index)}?${rewritten.slice(index + match[0].length)}`;
    cursor = index + 1;
  }

  return { sql: rewritten, params: values };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function executeBatch(
  client: ReturnType<typeof createClient>,
  mode: 'legacy' | 'explicit',
  firstId: number,
  iterations: number,
) {
  const transaction = await client.transaction('write');
  try {
    for (let offset = 0; offset < iterations; offset += 1) {
      const id = firstId + offset;
      const payload = `payload-${id}`;
      const insert = mode === 'legacy'
        ? legacySqlClockRewrite(insertWithSqlClock, [id, payload])
        : { sql: insertWithBoundClock, params: [id, payload, formatBjtDatabase(nowBjt())] };
      await transaction.execute({ sql: insert.sql, args: insert.params as SqlArg[] });

      const select = mode === 'legacy'
        ? legacySqlClockRewrite(selectById, [id])
        : { sql: selectById, params: [id] };
      const result = await transaction.execute({ sql: select.sql, args: select.params as SqlArg[] });
      const row = result.rows[0] as { payload?: unknown; created_at?: unknown } | undefined;
      if (row?.payload !== payload || typeof row.created_at !== 'string') {
        throw new Error(`SQL timestamp benchmark verification failed for ${mode}, id=${id}.`);
      }
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

async function main() {
  const directory = mkdtempSync(path.join(tmpdir(), 'xmt-sql-time-benchmark-'));
  const client = createClient({ url: `file:${path.join(directory, 'benchmark.db')}` });

  try {
    await client.execute(`CREATE TABLE sql_time_benchmark (
      id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);

    // Warm both execution paths before collecting paired 1,000-statement batches.
    await executeBatch(client, 'legacy', -200, 100);
    await executeBatch(client, 'explicit', -100, 100);

    const legacyTimes: number[] = [];
    const explicitTimes: number[] = [];
    for (let round = 0; round < rounds; round += 1) {
      const firstId = round * iterationsPerRound;
      const run = async (mode: 'legacy' | 'explicit') => {
        const start = performance.now();
        const modeOffset = mode === 'legacy' ? 0 : rounds * iterationsPerRound;
        await executeBatch(client, mode, firstId + modeOffset, iterationsPerRound);
        return performance.now() - start;
      };

      // Alternate order to reduce bias from filesystem and runtime warm-up.
      if (round % 2 === 0) {
        legacyTimes.push(await run('legacy'));
        explicitTimes.push(await run('explicit'));
      } else {
        explicitTimes.push(await run('explicit'));
        legacyTimes.push(await run('legacy'));
      }
    }

    const legacyMedianMs = median(legacyTimes);
    const explicitMedianMs = median(explicitTimes);
    const improvementPercent = ((legacyMedianMs - explicitMedianMs) / legacyMedianMs) * 100;
    console.log(JSON.stringify({
      isolatedDatabase: true,
      sqlStatementsPerPathPerRound: measuredCalls,
      rounds,
      warmupStatementsPerPath: 200,
      legacyMedianMs: Number(legacyMedianMs.toFixed(2)),
      explicitBoundMedianMs: Number(explicitMedianMs.toFixed(2)),
      medianImprovementPercent: Number(improvementPercent.toFixed(2)),
      legacyRoundMs: legacyTimes.map((value) => Number(value.toFixed(2))),
      explicitBoundRoundMs: explicitTimes.map((value) => Number(value.toFixed(2))),
      comparison: 'historical SQL clock regex rewrite vs explicit bound Beijing timestamps',
    }, null, 2));
  } finally {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'SQL timestamp benchmark failed.');
  process.exitCode = 1;
});

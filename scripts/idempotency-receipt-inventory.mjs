import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--db' || !args[1]) {
  console.error('Usage: node scripts/idempotency-receipt-inventory.mjs --db <existing-local-database-file>');
  process.exit(2);
}

const databasePath = path.resolve(args[1]);
if (!fs.existsSync(databasePath) || !fs.statSync(databasePath).isFile()) {
  console.error('The database path must refer to an existing local file.');
  process.exit(2);
}

function query(sql) {
  const output = execFileSync('sqlite3', ['-readonly', '-json', databasePath, sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  return output ? JSON.parse(output) : [];
}

const tableRows = query(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND (name GLOB '*_request_keys' OR name = 'inspiration_comments') ORDER BY name",
);
const tables = [];

for (const row of tableRows) {
  const tableName = String(row.name);
  if (!/^[a-z][a-z0-9_]*$/i.test(tableName)) {
    throw new Error('Unexpected receipt table name in SQLite catalog.');
  }

  const columns = query(`PRAGMA table_info("${tableName}")`);
  const columnNames = new Set(columns.map((column) => String(column.name)));
  if (!columnNames.has('created_at')) {
    throw new Error(`Receipt table ${tableName} is missing created_at; inventory stopped.`);
  }

  const isEmbeddedCommentKey = tableName === 'inspiration_comments';
  if (isEmbeddedCommentKey && !columnNames.has('client_request_id')) {
    throw new Error('inspiration_comments is missing client_request_id; inventory stopped.');
  }

  const where = isEmbeddedCommentKey ? ' WHERE client_request_id IS NOT NULL' : '';
  const [summary] = query(
    `SELECT COUNT(*) AS row_count, MIN(created_at) AS oldest_created_at, MAX(created_at) AS newest_created_at FROM "${tableName}"${where}`,
  );

  tables.push({
    table: tableName,
    kind: isEmbeddedCommentKey ? 'embedded_request_key' : 'request_receipt',
    rowCount: Number(summary?.row_count || 0),
    oldestCreatedAtRaw: summary?.oldest_created_at ?? null,
    newestCreatedAtRaw: summary?.newest_created_at ?? null,
  });
}

console.log(JSON.stringify({
  readOnly: true,
  cleanupPerformed: false,
  scope: 'tables named *_request_keys and inspiration_comments rows with a client_request_id',
  timestampNote: 'created_at values are reported as stored; do not infer elapsed age until timezone representations are normalized.',
  tables,
}, null, 2));

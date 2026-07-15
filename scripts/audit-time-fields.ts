import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { getDatabasePath, getDatabaseUrl } from '../api/database/path';

type AuditRow = {
  table: string;
  field: string;
  nonNullCount: number;
  formats: string[];
  min: string | null;
  max: string | null;
  possiblyUtc: boolean;
  migration: 'no' | 'review' | 'not-applicable';
};

const TIME_FIELD = /(?:_at$|date|time|deadline|period|captured)/i;
const DB_VALUE = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/;
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function classify(value: unknown) {
  const text = String(value);
  if (DB_VALUE.test(text)) return DATE_VALUE.test(text) ? 'date-only' : 'beijing-civil-or-unknown';
  if (/Z$/i.test(text)) return 'iso-utc';
  if (/T.*[+-]\d{2}:\d{2}$/.test(text)) return 'iso-offset';
  if (/^\d+$/.test(text)) return 'numeric-epoch-or-id';
  return 'unrecognized';
}

async function main() {
  const dbPath = getDatabasePath();
  const db = createClient({ url: getDatabaseUrl() });
  const dateStamp = new Date().toISOString().replaceAll(':', '-').replace(/\..+/, '');
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  const reportDir = path.join(process.cwd(), 'reports', 'time-system');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });

  const backupPath = path.join(backupDir, `xmt-before-phase2-time-${dateStamp}.db`);
  const escapedBackup = backupPath.replaceAll("'", "''");
  await db.execute(`VACUUM INTO '${escapedBackup}'`);

  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const rows: AuditRow[] = [];
  for (const tableRow of tables.rows) {
    const table = String(tableRow.name);
    const columns = await db.execute(`PRAGMA table_info(${quoteIdentifier(table)})`);
    for (const columnRow of columns.rows) {
      const field = String(columnRow.name);
      if (!TIME_FIELD.test(field)) continue;
      const values = await db.execute(`SELECT ${quoteIdentifier(field)} AS value FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(field)} IS NOT NULL`);
      const textValues = values.rows.map((valueRow) => String(valueRow.value));
      const formats = [...new Set(textValues.map(classify))].sort();
      const hasUtc = formats.includes('iso-utc');
      const needsReview = hasUtc || formats.includes('unrecognized') || formats.includes('numeric-epoch-or-id');
      rows.push({
        table,
        field,
        nonNullCount: textValues.length,
        formats: formats.length ? formats : ['empty'],
        min: textValues.length ? [...textValues].sort()[0] : null,
        max: textValues.length ? [...textValues].sort().at(-1) ?? null : null,
        possiblyUtc: hasUtc,
        migration: textValues.length === 0 || formats.every((format) => format === 'date-only' || format === 'beijing-civil-or-unknown')
          ? 'no'
          : needsReview ? 'review' : 'not-applicable',
      });
    }
  }

  const reportPath = path.join(reportDir, `time-field-audit-${dateStamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), dbPath, backupPath, rows }, null, 2)}\n`);
  console.log(JSON.stringify({ backupPath, reportPath, fieldsAudited: rows.length, reviewRequired: rows.filter((row) => row.migration === 'review').length }, null, 2));
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

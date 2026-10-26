import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  markReportSummaryRecoveryRejected,
  monthlySummaryPayload,
  persistReportSummaryRecovery,
  readReportSummaryRecovery,
  removeReportSummaryRecovery,
  reportSummaryRecoveryKey,
  reportSummaryUpdateFingerprint,
  sameReportSummaryRecovery,
  yearlySummaryPayload,
  type ReportSummaryRecoveryStorage,
  type ReportSummaryUpdateRecovery,
} from '../../src/components/daily-report/reportSummaryUpdateRecovery';

class MemoryStorage implements ReportSummaryRecoveryStorage {
  private values = new Map<string, string>();
  failSet = false;
  failRemove = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failSet) throw new Error('storage write denied');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.failRemove) throw new Error('storage removal denied');
    this.values.delete(key);
  }
}

const monthBaseline = 'a'.repeat(64);
const monthDraft = { work_summary_md: '完整月度总结', key_projects_md: '重点项目', issues_plan_md: '问题与计划' };
const monthPayload = monthlySummaryPayload(monthDraft);
const monthFormSnapshot = { ...monthDraft };

async function monthlyRecovery() {
  return {
    schemaVersion: 1 as const,
    actorId: 953,
    kind: 'monthly' as const,
    year: 2026,
    month: 9,
    requestId: '1f2a3b4c-5d6e-4789-8a0b-1c2d3e4f5a67',
    baseFingerprint: monthBaseline,
    requestFingerprint: await reportSummaryUpdateFingerprint('monthly', 2026, 9, monthPayload, monthBaseline),
    payload: monthPayload,
    formSnapshot: monthFormSnapshot,
    rejected: false,
  } satisfies ReportSummaryUpdateRecovery;
}

test('monthly and yearly request fingerprints match the backend canonical tuple order', async () => {
  assert.deepEqual(Object.keys(monthPayload), ['content_md', 'work_summary_md', 'key_projects_md', 'issues_plan_md']);
  const payloadFingerprint = createHash('sha256').update(JSON.stringify([
    'monthly', 2026, 9, ['', '完整月度总结', '重点项目', '问题与计划'],
  ])).digest('hex');
  assert.equal(await reportSummaryUpdateFingerprint('monthly', 2026, 9, monthPayload, monthBaseline),
    createHash('sha256').update(JSON.stringify([monthBaseline, payloadFingerprint])).digest('hex'));

  const yearly = yearlySummaryPayload({ annual_summary_md: '全年', achievements_md: '成果', shortcomings_md: '不足', next_year_plan_md: '计划' });
  assert.deepEqual(Object.keys(yearly), ['content_md', 'annual_summary_md', 'achievements_md', 'shortcomings_md', 'next_year_plan_md']);
  const yearlyBase = 'b'.repeat(64);
  const yearlyPayloadFingerprint = createHash('sha256').update(JSON.stringify([
    'yearly', 2026, 0, ['', '全年', '成果', '不足', '计划'],
  ])).digest('hex');
  assert.equal(await reportSummaryUpdateFingerprint('yearly', 2026, null, yearly, yearlyBase),
    createHash('sha256').update(JSON.stringify([yearlyBase, yearlyPayloadFingerprint])).digest('hex'));
});

test('recovery preserves the complete form and is isolated by actor, period, and request identity', async () => {
  const recovery = await monthlyRecovery();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistReportSummaryRecovery(recovery, session, local), true);
  const read = readReportSummaryRecovery(953, session, local);
  assert.equal(read.kind, 'ready');
  if (read.kind !== 'ready') return;
  assert.deepEqual(read.recovery, recovery);
  assert.deepEqual(read.recovery.formSnapshot, monthFormSnapshot);
  assert.deepEqual(readReportSummaryRecovery(954, session, local), { kind: 'none' });
  assert.equal(sameReportSummaryRecovery(recovery, { ...recovery, month: 8 }), false);
  assert.equal(sameReportSummaryRecovery(recovery, { ...recovery, requestId: '2f2a3b4c-5d6e-4789-8a0b-1c2d3e4f5a67' }), false);
});

test('storage write and cleanup failures fail closed; rejected fallback prevents a later retry', async () => {
  const recovery = await monthlyRecovery();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  local.failSet = true;
  assert.equal(persistReportSummaryRecovery(recovery, session, local), false, 'a missing durable copy prevents sending the keyed update');
  assert.equal(session.getItem(reportSummaryRecoveryKey(953)) !== null, true);
  local.failSet = false;
  assert.equal(persistReportSummaryRecovery(recovery, session, local), true);

  session.failSet = true;
  session.failRemove = true;
  assert.equal(markReportSummaryRecoveryRejected(recovery, session, local), true);
  const rejected = { ...recovery, rejected: true };
  assert.equal(removeReportSummaryRecovery(rejected, session, local), false, 'removal failure retains a rejected marker');
  const afterReload = readReportSummaryRecovery(953, session, local);
  assert.equal(afterReload.kind, 'ready');
  if (afterReload.kind !== 'ready') return;
  assert.equal(afterReload.recovery.rejected, true);
  assert.equal(afterReload.recovery.requestId, recovery.requestId);
  assert.deepEqual(afterReload.recovery.payload, recovery.payload);
});

test('cleanup only removes the matching recovery marker and verifies both stores', async () => {
  const recovery = await monthlyRecovery();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistReportSummaryRecovery(recovery, session, local), true);
  assert.equal(removeReportSummaryRecovery({ ...recovery, year: 2025 }, session, local), false);
  assert.equal(readReportSummaryRecovery(953, session, local).kind, 'ready');
  assert.equal(removeReportSummaryRecovery(recovery, session, local), true);
  assert.deepEqual(readReportSummaryRecovery(953, session, local), { kind: 'none' });
});

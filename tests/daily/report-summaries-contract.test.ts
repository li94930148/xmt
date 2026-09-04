import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-report-summaries-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'report-summaries.test.db');
process.env.JWT_SECRET = 'report-summaries-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { default: reportSummariesRouter } = await import('../../api/routes/report-summaries.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { SummaryArchiveContent } = await import('../../src/components/daily-report/DailyReportSummaryArchive.js');
const { default: SummaryArchiveDetailModal } = await import('../../src/components/daily-report/SummaryArchiveDetailModal.js');

await initDatabase();
const directorId = await executeInsert(
  'INSERT INTO users (username, password, role, name, enabled) VALUES (?, ?, ?, ?, 1)',
  ['summary-director', 'hash', 'director', 'Summary Director'],
);
const memberId = await executeInsert(
  'INSERT INTO users (username, password, role, name, enabled) VALUES (?, ?, ?, ?, 1)',
  ['summary-member', 'hash', 'member', 'Summary Member'],
);

const app = express();
app.use(express.json());
app.use('/api/report-summaries', reportSummariesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}/api/report-summaries`;

async function request(pathname: string, userId: number, method = 'GET', body?: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${signToken({ userId })}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, payload: await response.json() as { success: boolean; data: unknown } };
}

try {
  const monthlyWrite = await request('/monthly?year=2099&month=8', directorId, 'PUT', {
    work_summary_md: '月报正文\n第二行',
    key_projects_md: '项目 A',
    issues_plan_md: '后续计划',
  });
  assert.equal(monthlyWrite.response.status, 200);
  assert.equal((monthlyWrite.payload.data as { display_content_md: string }).display_content_md, '月报正文\n第二行');
  const storedMonthly = await queryOne<{ work_summary_md: string; key_projects_md: string; issues_plan_md: string }>(
    'SELECT work_summary_md, key_projects_md, issues_plan_md FROM monthly_summaries WHERE user_id = ? AND year = ? AND month = ?',
    [directorId, 2099, 8],
  );
  assert.deepEqual(storedMonthly, { work_summary_md: '月报正文\n第二行', key_projects_md: '项目 A', issues_plan_md: '后续计划' });

  const yearlyWrite = await request('/yearly?year=2099', directorId, 'PUT', {
    annual_summary_md: '年报正文', achievements_md: '成果', shortcomings_md: '不足', next_year_plan_md: '计划',
  });
  assert.equal(yearlyWrite.response.status, 200);
  assert.equal((yearlyWrite.payload.data as { display_content_md: string }).display_content_md, '年报正文');
  const storedYearly = await queryOne<{ annual_summary_md: string; achievements_md: string }>(
    'SELECT annual_summary_md, achievements_md FROM yearly_summaries WHERE user_id = ? AND year = ?', [directorId, 2099],
  );
  assert.deepEqual(storedYearly, { annual_summary_md: '年报正文', achievements_md: '成果' });

  await execute(
    `INSERT INTO monthly_summaries (user_id, year, month, content_md, work_summary_md, key_projects_md, issues_plan_md, created_at, updated_at) VALUES (?, ?, ?, ?, '', '', '', datetime('now'), datetime('now'))`,
    [memberId, 2099, 9, '历史月报正文'],
  );
  await execute(
    `INSERT INTO yearly_summaries (user_id, year, content_md, annual_summary_md, achievements_md, shortcomings_md, next_year_plan_md, created_at, updated_at) VALUES (?, ?, ?, '', '', '', '', datetime('now'), datetime('now'))`,
    [memberId, 2099, '历史年报正文'],
  );
  await execute(
    `INSERT INTO monthly_summaries (user_id, year, month, content_md, work_summary_md, key_projects_md, issues_plan_md, created_at, updated_at) VALUES (?, ?, ?, '', '<p>&nbsp;</p>', '', '', datetime('now'), datetime('now'))`,
    [directorId, 2099, 10],
  );

  const archive = await request('/archive?year=2099', directorId);
  assert.equal(archive.response.status, 200);
  const monthly = (archive.payload.data as { monthly: Array<{ id: number; month: number; display_content_md: string; work_summary_md: string; key_projects_md: string; issues_plan_md: string }> }).monthly;
  const yearly = (archive.payload.data as { yearly: Array<{ id: number; display_content_md: string; annual_summary_md: string; achievements_md: string; shortcomings_md: string; next_year_plan_md: string }> }).yearly;
  assert.equal(monthly.find((record) => record.month === 8)?.display_content_md, '月报正文\n第二行');
  assert.equal(monthly.find((record) => record.month === 9)?.display_content_md, '历史月报正文');
  assert.equal(monthly.find((record) => record.month === 10)?.display_content_md, '');
  assert.equal(yearly.find((record) => record.display_content_md === '年报正文')?.display_content_md, '年报正文');
  assert.equal(yearly.find((record) => record.display_content_md === '历史年报正文')?.display_content_md, '历史年报正文');
  const savedMonthly = monthly.find((record) => record.month === 8);
  assert(savedMonthly);
  assert.deepEqual([savedMonthly.work_summary_md, savedMonthly.key_projects_md, savedMonthly.issues_plan_md], ['月报正文\n第二行', '项目 A', '后续计划']);
  const monthlyDetail = await request(`/archive/monthly/${savedMonthly.id}`, directorId);
  assert.equal(monthlyDetail.response.status, 200);
  const monthlyDetailData = monthlyDetail.payload.data as { work_summary_md: string; key_projects_md: string; issues_plan_md: string };
  assert.deepEqual({ work_summary_md: monthlyDetailData.work_summary_md, key_projects_md: monthlyDetailData.key_projects_md, issues_plan_md: monthlyDetailData.issues_plan_md }, { work_summary_md: '月报正文\n第二行', key_projects_md: '项目 A', issues_plan_md: '后续计划' });
  const savedYearly = yearly.find((record) => record.annual_summary_md === '年报正文');
  assert(savedYearly);
  const yearlyDetail = await request(`/archive/yearly/${savedYearly.id}`, directorId);
  assert.equal(yearlyDetail.response.status, 200);
  const yearlyDetailData = yearlyDetail.payload.data as { annual_summary_md: string; achievements_md: string; shortcomings_md: string; next_year_plan_md: string };
  assert.deepEqual({ annual_summary_md: yearlyDetailData.annual_summary_md, achievements_md: yearlyDetailData.achievements_md, shortcomings_md: yearlyDetailData.shortcomings_md, next_year_plan_md: yearlyDetailData.next_year_plan_md }, { annual_summary_md: '年报正文', achievements_md: '成果', shortcomings_md: '不足', next_year_plan_md: '计划' });
  assert.equal((await request('/archive/monthly/999999', directorId)).response.status, 404);
  assert.equal((await request(`/archive/monthly/${savedMonthly.id}`, memberId)).response.status, 403);
  assert.match(renderToStaticMarkup(createElement(SummaryArchiveContent, { record: { year: 2099, month: 8, work_summary_md: '', key_projects_md: '', issues_plan_md: '', display_content_md: '组件显示月报正文' } })), /组件显示月报正文/);
  assert.match(renderToStaticMarkup(createElement(SummaryArchiveContent, { record: { year: 2099, annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '', display_content_md: '' } })), /未填写内容/);
  const monthlyDetailView = renderToStaticMarkup(createElement(SummaryArchiveDetailModal, { kind: 'monthly', onClose() {}, record: { id: 1, year: 2099, month: 8, work_summary_md: '完整工作总结', key_projects_md: '完整重点项目', issues_plan_md: '完整问题与计划', display_content_md: '完整工作总结', created_at: '2099-08-01T00:00:00.000Z', updated_at: '2099-08-02T00:00:00.000Z' } }));
  assert.match(monthlyDetailView, /完整工作总结/);
  assert.match(monthlyDetailView, /完整重点项目/);
  assert.match(monthlyDetailView, /完整问题与计划/);
  const yearlyDetailView = renderToStaticMarkup(createElement(SummaryArchiveDetailModal, { kind: 'yearly', onClose() {}, record: { id: 2, year: 2099, annual_summary_md: '完整年度总结', achievements_md: '完整主要成果', shortcomings_md: '', next_year_plan_md: '完整下一年度计划', display_content_md: '完整年度总结' } }));
  assert.match(yearlyDetailView, /完整年度总结/);
  assert.match(yearlyDetailView, /完整主要成果/);
  assert.match(yearlyDetailView, /未填写/);

  const filtered = await request(`/archive?year=2099&userId=${memberId}`, directorId);
  assert.equal(filtered.response.status, 200);
  assert.deepEqual((filtered.payload.data as { monthly: Array<{ month: number }> }).monthly.map((record) => record.month), [9]);
  assert.equal((await request('/archive?year=2099', memberId)).response.status, 403);
  console.log('Report summary write, archive mapping, historical compatibility, empty content, and access tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

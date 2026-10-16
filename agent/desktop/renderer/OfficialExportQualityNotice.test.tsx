import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OfficialExportQualityNotice from './OfficialExportQualityNotice.js';

test('partial official-export ingestion is visible as a polite status, not a false total failure', () => {
  const html = renderToStaticMarkup(<OfficialExportQualityNotice quality={{
    source_rows: 43, accepted_rows: 40, duplicate_rows: 0, rejected_rows: 3,
    warnings: ['采集器报告 3 行未通过解析；本次入库仅包含已接受的行。'],
  }} />);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /读取 43 行，接收 40 行，未通过 3 行，重复 0 行/);
  assert.match(html, /已接受的行/);
});

test('a clean report does not add noise to the dashboard', () => {
  assert.equal(renderToStaticMarkup(<OfficialExportQualityNotice quality={{
    source_rows: 40, accepted_rows: 40, duplicate_rows: 0, rejected_rows: 0, warnings: [],
  }} />), '');
});

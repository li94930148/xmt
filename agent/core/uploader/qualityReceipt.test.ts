import assert from 'node:assert/strict';
import test from 'node:test';
import { readOfficialExportQualityReceipt } from './qualityReceipt.js';

test('quality receipt returns only validated, de-duplicated counters and messages', () => {
  const result = readOfficialExportQualityReceipt(JSON.stringify({ data_quality: {
    source_rows: 43, accepted_rows: 40, duplicate_rows: 0, rejected_rows: 3,
    warnings: ['采集器报告 3 行未通过解析；本次入库仅包含已接受的行。', '采集器报告 3 行未通过解析；本次入库仅包含已接受的行。'],
  } }));
  assert.deepEqual(result, {
    source_rows: 43, accepted_rows: 40, duplicate_rows: 0, rejected_rows: 3,
    warnings: ['采集器报告 3 行未通过解析；本次入库仅包含已接受的行。'],
  });
});

test('malformed or missing quality receipts are safely ignored', () => {
  for (const receipt of [null, '', '{', JSON.stringify({}), JSON.stringify({ data_quality: { source_rows: -1 } })]) {
    assert.equal(readOfficialExportQualityReceipt(receipt), undefined);
  }
});

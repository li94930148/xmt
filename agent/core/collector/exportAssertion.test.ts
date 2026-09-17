import assert from "node:assert/strict";
import test from "node:test";
import { assertExportReceipts, type ExportReceipt } from "./exportAssertion.js";

const receipt = (patch: Partial<ExportReceipt> = {}): ExportReceipt => ({ taskId: "round", source: "official_download", size: 10, sha256: "a".repeat(64), workbookValid: true, sheetNames: ["Sheet1"], page: "内容管理", datasetType: "content_list", period: null, ...patch });
const complete = () => [receipt(), receipt({ page: "数据中心", datasetType: "account_daily", period: "yesterday" }), receipt({ page: "数据中心", datasetType: "account_daily", period: "7d" }), receipt({ page: "数据中心", datasetType: "account_daily", period: "30d" })];

test("--exports requires four independently valid current-round receipts", () => {
  assert.equal(assertExportReceipts(complete(), true, "round").status, "pass");
  assert.equal(assertExportReceipts([], true, "round").code, "EXPORT_REQUIRED_MISSING");
  assert.equal(assertExportReceipts([receipt()], true, "round").code, "EXPORT_REQUIRED_INCOMPLETE");
  assert.equal(assertExportReceipts(complete().map((item, index) => index === 0 ? { ...item, workbookValid: false } : item), true, "round").code, "EXPORT_WORKBOOK_INVALID");
  assert.equal(assertExportReceipts(complete().map((item, index) => index === 1 ? { ...item, sheetNames: [] } : item), true, "round").code, "EXPORT_WORKBOOK_INVALID");
  assert.equal(assertExportReceipts(complete().map(item => ({ ...item, taskId: "old" })), true, "round").code, "EXPORT_REQUIRED_MISSING");
  assert.equal(assertExportReceipts([], false, "round").status, "not_required");
});

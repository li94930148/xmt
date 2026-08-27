import assert from "node:assert/strict";
import test from "node:test";
import { assertExportReceipts, type ExportReceipt } from "./exportAssertion.js";

const receipt = (patch: Partial<ExportReceipt> = {}): ExportReceipt => ({ taskId: "round", source: "official_download", size: 10, sha256: "a".repeat(64), workbookValid: true, sheetNames: ["Sheet1"], page: "内容管理", ...patch });

test("--exports requires two independently valid current-round receipts", () => {
  assert.equal(assertExportReceipts([receipt(), receipt({ page: "数据中心" })], true, "round").status, "pass");
  assert.equal(assertExportReceipts([], true, "round").code, "EXPORT_REQUIRED_MISSING");
  assert.equal(assertExportReceipts([receipt()], true, "round").code, "EXPORT_REQUIRED_INCOMPLETE");
  assert.equal(assertExportReceipts([receipt({ workbookValid: false }), receipt({ page: "数据中心" })], true, "round").code, "EXPORT_WORKBOOK_INVALID");
  assert.equal(assertExportReceipts([receipt({ sheetNames: [] }), receipt({ page: "数据中心" })], true, "round").code, "EXPORT_WORKBOOK_INVALID");
  assert.equal(assertExportReceipts([receipt({ taskId: "old" }), receipt({ taskId: "old", page: "数据中心" })], true, "round").code, "EXPORT_REQUIRED_MISSING");
  assert.equal(assertExportReceipts([], false, "round").status, "not_required");
});

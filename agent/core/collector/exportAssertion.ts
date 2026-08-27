export type ExportReceipt = {
  taskId?: string;
  source?: string;
  size?: number;
  bytes?: number;
  sha256?: string;
  workbookValid?: boolean;
  sheetNames?: string[];
  storedFilename?: string;
  page?: string;
};

export type ExportAssertion = {
  required: boolean;
  expected: number;
  actual: number;
  valid: number;
  status: "pass" | "not_required" | "fail";
  code?: "EXPORT_REQUIRED_MISSING" | "EXPORT_REQUIRED_INCOMPLETE" | "EXPORT_WORKBOOK_INVALID";
  receipts: ExportReceipt[];
};

export function assertExportReceipts(receipts: ExportReceipt[], required: boolean, taskId: string): ExportAssertion {
  const current = receipts.filter((receipt) => receipt.taskId === taskId);
  const expectedPages = ["内容管理", "数据中心"];
  const valid = expectedPages.filter((page) => current.filter((receipt) => receipt.page === page && receipt.source === "official_download" && Number(receipt.size) > 0 && typeof receipt.sha256 === "string" && receipt.sha256.length > 0 && receipt.workbookValid === true && Array.isArray(receipt.sheetNames) && receipt.sheetNames.length > 0).length === 1).length;
  if (!required) return { required, expected: 0, actual: current.length, valid, status: "not_required", receipts: current };
  if (current.length === 0) return { required, expected: 2, actual: 0, valid: 0, status: "fail", code: "EXPORT_REQUIRED_MISSING", receipts: current };
  if (current.some((receipt) => !expectedPages.includes(String(receipt.page)) || receipt.source !== "official_download" || Number(receipt.size) <= 0 || typeof receipt.sha256 !== "string" || receipt.sha256.length === 0 || receipt.workbookValid !== true || !Array.isArray(receipt.sheetNames) || receipt.sheetNames.length === 0)) return { required, expected: 2, actual: current.length, valid, status: "fail", code: "EXPORT_WORKBOOK_INVALID", receipts: current };
  if (current.length !== 2 || valid !== 2) return { required, expected: 2, actual: current.length, valid, status: "fail", code: "EXPORT_REQUIRED_INCOMPLETE", receipts: current };
  return { required, expected: 2, actual: current.length, valid, status: "pass", receipts: current };
}

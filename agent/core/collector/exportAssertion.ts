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
  datasetType?: string;
  period?: string | null;
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
  const expectedKeys = ["内容管理:content_list:", "数据中心:account_daily:yesterday", "数据中心:account_daily:7d", "数据中心:account_daily:30d"];
  const key = (receipt: ExportReceipt) => `${receipt.page || ''}:${receipt.datasetType || ''}:${receipt.period || ''}`;
  const isWorkbookValid = (receipt: ExportReceipt) => receipt.source === "official_download" && Number(receipt.size) > 0 && typeof receipt.sha256 === "string" && receipt.sha256.length > 0 && receipt.workbookValid === true && Array.isArray(receipt.sheetNames) && receipt.sheetNames.length > 0;
  const valid = expectedKeys.filter((expected) => current.filter((receipt) => key(receipt) === expected && isWorkbookValid(receipt)).length === 1).length;
  if (!required) return { required, expected: 0, actual: current.length, valid, status: "not_required", receipts: current };
  if (current.length === 0) return { required, expected: 4, actual: 0, valid: 0, status: "fail", code: "EXPORT_REQUIRED_MISSING", receipts: current };
  if (current.some((receipt) => !expectedKeys.includes(key(receipt)) || !isWorkbookValid(receipt))) return { required, expected: 4, actual: current.length, valid, status: "fail", code: "EXPORT_WORKBOOK_INVALID", receipts: current };
  if (current.length !== 4 || valid !== 4) return { required, expected: 4, actual: current.length, valid, status: "fail", code: "EXPORT_REQUIRED_INCOMPLETE", receipts: current };
  return { required, expected: 4, actual: current.length, valid, status: "pass", receipts: current };
}

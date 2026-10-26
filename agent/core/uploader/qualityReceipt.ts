import type { OfficialExportQualityReport } from '../types.js';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function readOfficialExportQualityReceipt(receiptJson: string | null | undefined): OfficialExportQualityReport | undefined {
  if (!receiptJson) return undefined;
  try {
    const receipt: unknown = JSON.parse(receiptJson);
    if (!isRecord(receipt) || !isRecord(receipt.data_quality)) return undefined;
    const quality = receipt.data_quality;
    if (!isCount(quality.source_rows) || !isCount(quality.accepted_rows) || !isCount(quality.duplicate_rows) || !isCount(quality.rejected_rows)) return undefined;
    if (!Array.isArray(quality.warnings) || quality.warnings.length > 20 || quality.warnings.some(item => typeof item !== 'string' || item.length > 240)) return undefined;
    return {
      source_rows: quality.source_rows,
      accepted_rows: quality.accepted_rows,
      duplicate_rows: quality.duplicate_rows,
      rejected_rows: quality.rejected_rows,
      warnings: [...new Set(quality.warnings as string[])],
    };
  } catch {
    return undefined;
  }
}

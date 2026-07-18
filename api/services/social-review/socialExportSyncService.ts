import { queryOne } from '../../database/utils.js';
import { runSocialCollection } from './runner.js';

export async function syncLatestOfficialExport(accountId: number) {
  const before = await queryOne<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM social_videos WHERE account_id = ?`, [accountId]);
  const result = await runSocialCollection(accountId, { collectMode: 'official-export' }, 'manual');
  const parsed = result.diagnostics?.find((item) => item.type === 'export_file_parse_success');
  const parsedMeta = parsed as unknown as { parsedRowCount?: number; skippedRowCount?: number; skipReasonCounts?: Record<string, number> } | undefined;
  const reasonCounts = parsedMeta?.skipReasonCounts || {};
  const beforeCount = Number(before?.count || 0);
  const after = await queryOne<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM social_videos WHERE account_id = ?`, [accountId]);
  const inserted = Number(result.insertCount || 0);
  const updated = Number(result.updateCount || 0);
  const skipped = Number(parsedMeta?.skippedRowCount || 0);
  return {
    success: !result.errorMessage,
    accountId,
    totalRows: Number(parsedMeta?.parsedRowCount || result.videoCount || 0),
    validAssetRows: result.videoCount,
    generatedInternalKeyCount: Number(result.diagnostics?.find((item) => item.type === 'video_internal_key_count')?.count || result.videoCount),
    insertCount: inserted || Math.max(0, Number(after?.count || 0) - beforeCount),
    updateCount: updated,
    skipCount: skipped,
    skipReasonCounts: reasonCounts,
    videoCount: Number(after?.count || 0),
    message: result.errorMessage || '作品数据同步完成。',
  };
}

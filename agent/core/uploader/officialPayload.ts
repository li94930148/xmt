import crypto from 'node:crypto';
import type { CreatorSnapshot } from '../types.js';

const records = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
export function toOfficialExportPayload(snapshot: CreatorSnapshot, accountId: string, _taskId?: string) {
  const files = records(snapshot.official_data).map(item => item.file as Record<string, unknown>).filter(Boolean);
  const contentMetrics = records(snapshot.official_data).flatMap(item => records((item.datasets as Record<string, unknown> | undefined)?.content_metrics));
  const incomeMetrics = records(snapshot.official_data).flatMap(item => records((item.datasets as Record<string, unknown> | undefined)?.income_metrics));
  const quality = records(snapshot.official_data).reduce<{ source_rows: number; accepted_rows: number; duplicate_rows: number; rejected_rows: number; warnings: string[] }>((total, item) => {
    const value = item.quality as Record<string, unknown> | undefined;
    for (const key of ['source_rows', 'accepted_rows', 'duplicate_rows', 'rejected_rows'] as const) total[key] += Number(value?.[key] || 0);
    total.warnings.push(...(Array.isArray(value?.warnings) ? value.warnings.map(String) : [])); return total;
  }, { source_rows: 0, accepted_rows: 0, duplicate_rows: 0, rejected_rows: 0, warnings: [] as string[] });
  const batchSeed = JSON.stringify({ accountId, parser: 'douyin-export-v1', files: files.map(file => file.sha256).sort() });
  const digest = crypto.createHash('sha256').update(batchSeed).digest('hex');
  const stableBatchId = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
  return { schema_version: 2, batch_id: stableBatchId, agent_version: snapshot.agent_version, parser_version: 'douyin-export-v1', platform: 'douyin', platform_account_id: accountId, generated_at: snapshot.collected_at, source_files: files.map(file => ({ file_type: 'official_export', file_name: String(file.storedFilename || ''), sha256: String(file.sha256 || ''), size_bytes: Number(file.size || 0), downloaded_at: snapshot.collected_at })), datasets: { content_metrics: contentMetrics, income_metrics: incomeMetrics }, quality };
}

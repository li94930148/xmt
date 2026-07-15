import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { NormalizedVideoSnapshot } from '@shared/types/social-review';

type ExportRow = Record<string, unknown>;

export type DouyinExportParseResult = {
  fileType: 'csv' | 'xlsx' | 'xls';
  parsedRowCount: number;
  skippedRowCount: number;
  unmappedFieldCount: number;
  videos: NormalizedVideoSnapshot[];
  identifiedIdCount: number;
  columnCount: number;
  columnStats: Array<{ name: string; typeCounts: Record<string, number>; emptyCount: number; nonEmptyCount: number }>;
  idSourceCounts: Record<string, number>;
  validAssetRows: number;
  generatedInternalKeyCount: number;
  skipReasonCounts: Record<string, number>;
};

function normalizeAssetTitle(title: string) {
  return title.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function normalizePublishDate(publishTime: string) {
  const normalized = publishTime.normalize('NFKC').replace(/[年月]/g, '-').replace(/日/g, '').replace(/[/.]/g, '-').replace(/\s+/g, ' ').trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString().slice(0, 10);
}

function createInternalVideoKey(accountId: number, title: string, publishTime: string) {
  const basis = `douyin|${accountId}|${normalizeAssetTitle(title)}|${normalizePublishDate(publishTime)}`;
  return `douyin_account_${accountId}_${createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 24)}`;
}

const FIELD_ALIASES = {
  id: ['作品id', '视频id', 'item_id', 'aweme_id', 'video_id', '作品编号'],
  title: ['作品标题', '标题', '作品名称', '内容标题'],
  publishTime: ['发布时间', '发布日期'],
  videoUrl: ['作品链接', '链接'],
  views: ['播放量', '播放'],
  likes: ['点赞量', '点赞'],
  comments: ['评论量', '评论'],
  shares: ['分享量', '分享'],
  collects: ['收藏量', '收藏'],
};

function normalizeHeader(value: unknown) {
  return String(value ?? '').replace(/[\s()（）【】\[\]_-]/g, '').replace(/(次|量|数|秒|%|％)$/g, '').toLowerCase();
}

function stableId(value: unknown, explicit = false) {
  const text = String(value ?? '').trim();
  if (explicit && (/^\d{4,}$/.test(text) || /^(?=.*\d)[a-z0-9_-]{6,}$/i.test(text))) return text;
  if (/^\d{8,}$/.test(text) || /^(?=.*\d)(?=.*[a-z])[a-z0-9_-]{8,}$/i.test(text)) return text;
  const urlId = text.match(/\/(?:video|note)\/([0-9a-z_-]+)|(?:item_id|aweme_id|video_id|modal_id)=([0-9a-z_-]+)/i);
  return urlId?.[1] || urlId?.[2] || null;
}

function findValue(row: ExportRow, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key))) return value;
  }
  return null;
}

function readRows(filePath: string, bytes: Buffer): { rows: ExportRow[]; headers: string[] } {
  const workbook = XLSX.read(bytes, { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], headers: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const headers = (matrix[0] || []).map((value) => String(value ?? '').trim());
  return { headers, rows: matrix.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))) };
}

function safeType(value: unknown) {
  if (value == null || String(value).trim() === '') return 'empty';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  return Array.isArray(value) ? 'array' : typeof value;
}

function normalizeExportNumber(value: unknown) {
  const text = String(value ?? '').trim().replace(/,/g, '').replace(/\+/g, '').toLowerCase();
  const matched = text.match(/(\d+(?:\.\d+)?)(万|w|k)?/);
  if (!matched) return null;
  const base = Number(matched[1]);
  if (!Number.isFinite(base)) return null;
  if (matched[2] === '万' || matched[2] === 'w') return Math.round(base * 10000);
  if (matched[2] === 'k') return Math.round(base * 1000);
  return Math.round(base);
}

export async function parseDouyinOfficialExport(filePath: string, accountId: number): Promise<DouyinExportParseResult> {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(extension)) throw new Error('导出文件格式暂不支持。');
  const table = readRows(filePath, await readFile(filePath));
  const rows = table.rows;
  const columnStats = table.headers.map((name) => {
    const stats = { name, typeCounts: {} as Record<string, number>, emptyCount: 0, nonEmptyCount: 0 };
    for (const row of rows) {
      const type = safeType(row[name]);
      stats.typeCounts[type] = (stats.typeCounts[type] || 0) + 1;
      if (type === 'empty') stats.emptyCount += 1; else stats.nonEmptyCount += 1;
    }
    return stats;
  });
  const videos: NormalizedVideoSnapshot[] = [];
  let skippedRowCount = 0;
  let unmappedFieldCount = 0;
  let identifiedIdCount = 0;
  let generatedInternalKeyCount = 0;
  const skipReasonCounts: Record<string, number> = {};
  const internalKeys = new Set<string>();
  const idSourceCounts: Record<string, number> = {};
  for (const row of rows) {
    const explicitId = findValue(row, FIELD_ALIASES.id);
    const link = findValue(row, FIELD_ALIASES.videoUrl);
    const id = stableId(explicitId, true) || stableId(link);
    const title = String(findValue(row, FIELD_ALIASES.title) ?? '').trim();
    const publishTime = String(findValue(row, FIELD_ALIASES.publishTime) ?? '').trim();
    if (Object.values(row).every((value) => String(value ?? '').trim() === '')) {
      skippedRowCount += 1;
      skipReasonCounts.invalid_row = (skipReasonCounts.invalid_row || 0) + 1;
      continue;
    }
    if (!title || !publishTime) {
      skippedRowCount += 1;
      if (!title) skipReasonCounts.missing_title = (skipReasonCounts.missing_title || 0) + 1;
      if (!publishTime) skipReasonCounts.missing_publish_time = (skipReasonCounts.missing_publish_time || 0) + 1;
      continue;
    }
    const internalVideoKey = createInternalVideoKey(accountId, title, publishTime);
    if (internalKeys.has(internalVideoKey)) {
      skippedRowCount += 1;
      skipReasonCounts.duplicate_asset = (skipReasonCounts.duplicate_asset || 0) + 1;
      continue;
    }
    internalKeys.add(internalVideoKey);
    generatedInternalKeyCount += 1;
    if (id) {
      identifiedIdCount += 1;
      const idSource = stableId(explicitId, true) ? 'explicit_id' : 'link';
      idSourceCounts[idSource] = (idSourceCounts[idSource] || 0) + 1;
    }
    const knownHeaders = new Set(Object.values(FIELD_ALIASES).flat().map(normalizeHeader));
    unmappedFieldCount += Object.keys(row).filter((key) => key && !knownHeaders.has(normalizeHeader(key))).length;
    const number = (aliases: string[]) => normalizeExportNumber(findValue(row, aliases)) ?? undefined;
    videos.push({
      platform: 'douyin', internal_video_key: internalVideoKey, external_video_id: id,
      title,
      publish_time: publishTime,
      video_url: String(link ?? '').trim() || null,
      views: number(FIELD_ALIASES.views), likes: number(FIELD_ALIASES.likes),
      comments: number(FIELD_ALIASES.comments), shares: number(FIELD_ALIASES.shares), collects: number(FIELD_ALIASES.collects),
      source_type: 'creator_center_export',
      raw_json: { source: 'douyin_creator_center_export', parsedFields: { hasTitle: Boolean(title) } },
    });
  }
  return { fileType: extension.slice(1) as 'csv' | 'xlsx' | 'xls', parsedRowCount: rows.length, validAssetRows: videos.length, generatedInternalKeyCount, skippedRowCount, skipReasonCounts, unmappedFieldCount, videos, identifiedIdCount, columnCount: table.headers.length, columnStats, idSourceCounts };
}

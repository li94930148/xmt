type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function parseRawJson(value: unknown): JsonRecord {
  if (typeof value !== 'string') return record(value);
  try { return record(JSON.parse(value)); } catch { return {}; }
}

function imageUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const source = record(value);
  const urls = Array.isArray(source.url_list) ? source.url_list : Array.isArray(source.urlList) ? source.urlList : [];
  return text(urls[0]) || text(source.url) || text(source.uri);
}

export function resolveCoverUrl(input: { douyinCoverUrl?: unknown; creatorCoverUrl?: unknown; creatorRawJson?: unknown }): string {
  const direct = text(input.douyinCoverUrl) || text(input.creatorCoverUrl);
  if (direct) return direct;
  const raw = parseRawJson(input.creatorRawJson);
  const video = record(raw.video);
  return imageUrl(raw.cover_url)
    || imageUrl(raw.cover)
    || imageUrl(video.cover)
    || imageUrl(video.origin_cover);
}

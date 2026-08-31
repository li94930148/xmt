type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function parseRawJson(value: unknown): JsonRecord {
  if (typeof value !== 'string') return record(value);
  try { return record(JSON.parse(value)); } catch { return {}; }
}

function imageUrl(value: unknown): string {
  if (Array.isArray(value)) return value.map(imageUrl).find(Boolean) || '';
  if (typeof value === 'string') { const normalized=value.trim().replace(/\\\//g,'/');const absolute=normalized.startsWith('//')?`https:${normalized}`:normalized;try{const url=new URL(absolute);return ['http:','https:'].includes(url.protocol)?url.toString():'';}catch{return '';} }
  const source = record(value);
  if (!Object.keys(source).length) return '';
  const urls = Array.isArray(source.url_list) ? source.url_list : Array.isArray(source.urlList) ? source.urlList : [];
  return imageUrl(urls) || imageUrl(source.url) || imageUrl(source.uri);
}

export function resolveCoverUrl(input: { douyinCoverUrl?: unknown; creatorCoverUrl?: unknown; creatorRawJson?: unknown }): string {
  const direct = imageUrl(input.douyinCoverUrl) || imageUrl(input.creatorCoverUrl);
  if (direct) return direct;
  const raw = parseRawJson(input.creatorRawJson);
  const video = record(raw.video);
  return imageUrl(raw.cover_url)
    || imageUrl(raw.cover)
    || imageUrl(video.cover)
    || imageUrl(raw.origin_cover)
    || imageUrl(video.origin_cover)
    || imageUrl(raw.dynamic_cover)
    || imageUrl(video.dynamic_cover);
}

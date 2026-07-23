import type { NetworkCapture } from '../../../types.js';

export function responseKeys(value: unknown): string[] {
  return value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>).slice(0, 200) : [];
}
export function buildApiMap(captures: NetworkCapture[]) {
  const seen = new Set<string>();
  return captures.filter((capture) => {
    const key = `${capture.page}|${capture.method}|${capture.url.split('?')[0]}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  }).map(({ page, url, method, response }) => ({ page, url: url.split('?')[0], method, responseKeys: responseKeys(response) }));
}

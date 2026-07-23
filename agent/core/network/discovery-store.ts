import fs from 'node:fs/promises';
import path from 'node:path';
import type { NetworkCapture } from '../types.js';

function keys(value: unknown) { return value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>).slice(0, 200) : []; }
export async function writeDiscovery(directory: string, fileName: string, page: string, captures: NetworkCapture[]) {
  const seen = new Set<string>();
  const discoveries = captures.filter((capture) => capture.page === page).filter((capture) => {
    const key = `${capture.method}|${capture.url.split('?')[0]}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  }).map((capture) => ({ page, url: capture.url.split('?')[0], method: capture.method, responseKeys: keys(capture.response) }));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), JSON.stringify(discoveries, null, 2), 'utf8');
  return discoveries;
}

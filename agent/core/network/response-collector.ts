import type { Page, Response } from 'playwright';
import type { NetworkCapture } from '../types.js';
import { safeJsonParse } from './safe-json.js';

const SECRET = /cookie|authorization|password|passwd|token|session|ticket|signature|secret|access[_-]?key|credential/i;
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET.test(key)).map(([key, item]) => [key, sanitize(item, depth + 1)]));
  return typeof value === 'string' && value.length > 10_000 ? `${value.slice(0, 10_000)}…` : value;
}

export class ResponseCollector {
  readonly captures: NetworkCapture[] = [];
  private pageType = 'unknown';
  private readonly handler = (response: Response) => { void this.capture(response); };
  constructor(private readonly page: Page) {}
  setPage(pageType: string) { this.pageType = pageType; }
  start() { this.page.on('response', this.handler); }
  stop() { this.page.off('response', this.handler); }
  private async capture(response: Response) {
    const request = response.request();
    if (!['xhr', 'fetch'].includes(request.resourceType())) return;
    if (!/creator\.douyin\.com/i.test(request.url()) || this.captures.length >= 2_000) return;
    try {
      const responseText = await response.text();
      const payload = sanitize(safeJsonParse(responseText));
      this.captures.push({
        page: this.pageType, url: request.url(), method: request.method(), status: response.status(),
        headers: sanitize(response.headers()) as Record<string, string>, request_body: request.postData() || undefined, response: payload,
        response_size: Buffer.byteLength(JSON.stringify(payload)), captured_at: new Date().toISOString(),
      });
    } catch {}
  }
}

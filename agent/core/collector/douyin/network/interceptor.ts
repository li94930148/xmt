import type { Page, Response } from 'playwright';
import type { NetworkCapture } from '../../../types.js';
import { apiName } from './api-map.js';

const SECRET = /cookie|authorization|password|passwd|token|session|ticket|signature/i;
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !SECRET.test(key)).map(([key, item]) => [key, sanitize(item, depth + 1)]));
  return typeof value === 'string' && value.length > 10000 ? `${value.slice(0, 10000)}…` : value;
}
function requestParams(response: Response) {
  const request = response.request();
  const query = Object.fromEntries(new URL(request.url()).searchParams.entries());
  let body: unknown = request.postData();
  try { body = body ? JSON.parse(String(body)) : undefined; } catch {}
  return sanitize({ query, body });
}

export class DouyinNetworkInterceptor {
  readonly captures: NetworkCapture[] = [];
  private readonly handler = (response: Response) => { void this.capture(response); };
  constructor(private readonly page: Page) {}
  start() { this.page.on('response', this.handler); }
  stop() { this.page.off('response', this.handler); }
  private async capture(response: Response) {
    const request = response.request();
    if (!['xhr', 'fetch'].includes(request.resourceType()) && !/graphql/i.test(request.url())) return;
    if (!/creator\.douyin\.com/i.test(request.url()) || this.captures.length >= 1500) return;
    const contentType = response.headers()['content-type'] ?? '';
    if (!/json|javascript/i.test(contentType)) return;
    try {
      const payload = sanitize(await response.json());
      this.captures.push({ name: apiName(request.url()), url: request.url(), method: request.method(), params: requestParams(response), response: payload, captured_at: new Date().toISOString() });
    } catch {}
  }
}

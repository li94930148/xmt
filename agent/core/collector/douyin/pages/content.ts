import type { Page } from 'playwright';
import type { CreatorWork, DouyinCollectionStats, NetworkCapture } from '../../../types.js';
import { safeJsonParse } from '../../../network/safe-json.js';
import { paginateWorkList } from '../../../network/work-list-pagination.js';
import { parseWorksDetailed, workCandidateArrays } from '../parser/common.js';
import { bodySnapshot, openPage } from './helpers.js';

function requestWithCursor(capture: NetworkCapture, cursor: string) {
  const url = new URL(capture.url);
  const cursorKey = ['cursor', 'max_cursor', 'maxCursor'].find((key) => url.searchParams.has(key)) || 'cursor';
  url.searchParams.set(cursorKey, cursor);
  let body = capture.request_body;
  if (body) {
    try {
      const parsed = safeJsonParse(body) as Record<string, unknown>;
      const bodyKey = ['cursor', 'max_cursor', 'maxCursor'].find((key) => parsed[key] !== undefined) || 'cursor';
      parsed[bodyKey] = cursor;
      body = JSON.stringify(parsed);
    } catch { /* Preserve opaque request bodies. */ }
  }
  return { url: url.toString(), method: capture.method, body };
}

async function fetchCursorPage(page: Page, capture: NetworkCapture, cursor: string) {
  const request = requestWithCursor(capture, cursor);
  const responseText = await page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });
    if (!response.ok) throw new Error(`Douyin work-list pagination failed: HTTP ${response.status}`);
    return response.text();
  }, request);
  return safeJsonParse(responseText);
}

export async function collectContent(page: Page, captures: NetworkCapture[]): Promise<{ works: CreatorWork[]; dom: string; collectionStats: DouyinCollectionStats }> {
  await openPage(page, 'https://creator.douyin.com/creator-micro/content/manage');
  const observeMs = Math.max(0, Number(process.env.XMT_DOUYIN_WORK_LIST_OBSERVE_MS ?? 0));
  if (observeMs) await page.waitForTimeout(observeMs);
  const initialCapture = captures.find((capture) => capture.page === 'work-list' && workCandidateArrays(capture.response).length > 0);
  let pageCount = initialCapture ? 1 : 0;
  if (initialCapture) {
    const paginated = await paginateWorkList(initialCapture.response, (cursor) => fetchCursorPage(page, initialCapture, cursor));
    pageCount = paginated.page_count;
    for (const response of paginated.responses.slice(1)) {
      captures.push({
        page: 'work-list', url: initialCapture.url, method: initialCapture.method, status: 200,
        headers: {}, request_body: initialCapture.request_body, response,
        response_size: Buffer.byteLength(JSON.stringify(response)), captured_at: new Date().toISOString(),
      });
    }
  }
  const parsed = parseWorksDetailed(captures.filter((capture) => capture.page === 'work-list'));
  return {
    works: parsed.works,
    dom: await bodySnapshot(page),
    collectionStats: {
      raw_response_count: parsed.raw_response_count,
      aweme_candidate_count: parsed.aweme_candidate_count,
      normalized_success_count: parsed.works.length,
      rejected_count: parsed.rejected_count,
      rejected_reasons: parsed.rejected_reasons,
      page_count: pageCount,
      new_count: 0,
    },
  };
}

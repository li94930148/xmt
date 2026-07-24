import { workCandidateArrays } from '../collector/douyin/parser/common.js';

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;

function paginationContainers(value: unknown): JsonRecord[] {
  const root = record(value);
  if (!root) return [];
  const data = record(root.data);
  const result = record(root.result);
  return [root, data, result, record(data?.data), record(result?.data)].filter((item): item is JsonRecord => Boolean(item));
}

export function readWorkListPagination(value: unknown): { hasMore: boolean; cursor: string } {
  const containers = paginationContainers(value);
  const read = (keys: string[]) => containers.flatMap((container) => keys.map((key) => container[key])).find((item) => item !== undefined && item !== null);
  const rawHasMore = read(['has_more', 'hasMore']);
  const rawCursor = read(['max_cursor', 'maxCursor', 'cursor']);
  return { hasMore: rawHasMore === true || rawHasMore === 1 || rawHasMore === '1', cursor: rawCursor == null ? '' : String(rawCursor) };
}

export type WorkListPaginationResult = { responses: unknown[]; page_count: number; stop_reason: 'completed'|'empty_page'|'repeated_cursor'|'missing_cursor'|'max_pages' };

export async function paginateWorkList(
  firstResponse: unknown,
  fetchPage: (cursor: string) => Promise<unknown>,
  options: { maxPages?: number; retries?: number } = {},
): Promise<WorkListPaginationResult> {
  const maxPages = Math.min(100, Math.max(1, options.maxPages ?? 100));
  const retries = Math.max(0, options.retries ?? 2);
  const responses = [firstResponse];
  const seenCursors = new Set<string>();
  let current = firstResponse;
  while (responses.length < maxPages) {
    const state = readWorkListPagination(current);
    if (!state.hasMore) return { responses, page_count: responses.length, stop_reason: 'completed' };
    if (!state.cursor) return { responses, page_count: responses.length, stop_reason: 'missing_cursor' };
    if (seenCursors.has(state.cursor)) return { responses, page_count: responses.length, stop_reason: 'repeated_cursor' };
    seenCursors.add(state.cursor);
    let next: unknown;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try { next = await fetchPage(state.cursor); lastError = undefined; break; }
      catch (error) { lastError = error; }
    }
    if (lastError) throw lastError;
    if (!workCandidateArrays(next).some((items) => items.length > 0)) return { responses, page_count: responses.length, stop_reason: 'empty_page' };
    responses.push(next);
    current = next;
  }
  return { responses, page_count: responses.length, stop_reason: 'max_pages' };
}

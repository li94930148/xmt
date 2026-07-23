import type { NetworkCapture } from '../../../types.js';

const RULES: Array<[string, RegExp]> = [
  ['works', /content|work|item|aweme/i], ['work_detail', /detail|video.*data/i], ['operation', /operation|overview|dashboard/i],
  ['content_analysis', /content.*(analysis|data)|work.*trend/i], ['follower', /follower|fans|portrait|audience/i], ['graphql', /graphql/i],
];

export function apiName(url: string) { return RULES.find(([, rule]) => rule.test(url))?.[0] ?? 'unknown'; }
export function responseKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value as Record<string, unknown>).slice(0, 100);
}
export function buildApiMap(captures: NetworkCapture[]) {
  const seen = new Set<string>();
  return captures.filter((capture) => { const key = `${capture.name}|${capture.url.split('?')[0]}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .map(({ name, url, params, response }) => ({ name, url: url.split('?')[0], params, response_keys: responseKeys(response) }));
}

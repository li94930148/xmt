import type { Topic } from '../types';
import { getTopics } from '../api/topics';

export type SimilarTopic = Pick<Topic, 'id' | 'title' | 'status'>;
export type TopicSearch = (search: string) => Promise<SimilarTopic[]>;

const SIMILARITY_THRESHOLD = 0.42;
const MAX_SEARCH_TERMS = 3;

function titleTerms(title: string): string[] {
  const normalized = title.normalize('NFKC').toLocaleLowerCase();
  const segments = normalized.match(/\p{Script=Han}+|[\p{L}\p{N}]+/gu) ?? [];
  const terms = new Set<string>();

  for (const segment of segments) {
    if (/\p{Script=Han}/u.test(segment)) {
      const characters = Array.from(segment);
      for (let index = 0; index < characters.length - 1; index += 1) {
        terms.add(`${characters[index]}${characters[index + 1]}`);
      }
    } else if (segment.length >= 2) {
      terms.add(segment);
    }
  }

  return [...terms];
}

export function normalizeTopicTitle(title: string): string {
  return title.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

export function scoreTopicTitleSimilarity(leftTitle: string, rightTitle: string): number {
  const left = normalizeTopicTitle(leftTitle);
  const right = normalizeTopicTitle(rightTitle);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftLength = Array.from(left).length;
  const rightLength = Array.from(right).length;
  if (Math.min(leftLength, rightLength) >= 4 && (left.includes(right) || right.includes(left))) return 0.9;

  const leftTerms = new Set(titleTerms(leftTitle));
  const rightTerms = new Set(titleTerms(rightTitle));
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0;

  let overlap = 0;
  for (const term of leftTerms) {
    if (rightTerms.has(term)) overlap += 1;
  }
  const diceScore = (2 * overlap) / (leftTerms.size + rightTerms.size);
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  let longestSharedRun = 0;
  let previousRow = Array.from({ length: rightCharacters.length + 1 }, () => 0);
  for (const leftCharacter of leftCharacters) {
    const currentRow = Array.from({ length: rightCharacters.length + 1 }, () => 0);
    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      if (leftCharacter === rightCharacters[rightIndex - 1]) {
        currentRow[rightIndex] = previousRow[rightIndex - 1] + 1;
        longestSharedRun = Math.max(longestSharedRun, currentRow[rightIndex]);
      }
    }
    previousRow = currentRow;
  }
  const sharedRunCoverage = longestSharedRun / Math.min(leftCharacters.length, rightCharacters.length);
  return Math.max(diceScore, sharedRunCoverage);
}

export function selectTopicTitleSearchTerms(title: string): string[] {
  const terms = titleTerms(title);
  if (terms.length <= MAX_SEARCH_TERMS) return terms;

  const selectedIndexes = [0, Math.floor((terms.length - 1) / 2), terms.length - 1];
  return [...new Set(selectedIndexes.map((index) => terms[index]).filter(Boolean))];
}

export async function findSimilarTopicsByTitle(
  title: string,
  searchTopics: TopicSearch = async (search) => (await getTopics({ search, page: 1, limit: 100 })).data,
): Promise<SimilarTopic[]> {
  const searchTerms = selectTopicTitleSearchTerms(title);
  if (searchTerms.length === 0) return [];

  const results = await Promise.allSettled(searchTerms.map((term) => searchTopics(term)));
  const successfulResults = results.filter((result): result is PromiseFulfilledResult<SimilarTopic[]> => result.status === 'fulfilled');
  if (successfulResults.length !== results.length) throw new Error('暂时无法检查相似选题');

  const candidates = new Map<number, SimilarTopic>();
  for (const result of successfulResults) {
    for (const topic of result.value) candidates.set(topic.id, topic);
  }

  return [...candidates.values()]
    .map((topic) => ({ topic, score: scoreTopicTitleSimilarity(title, topic.title) }))
    .filter(({ score }) => score >= SIMILARITY_THRESHOLD)
    .sort((left, right) => right.score - left.score || left.topic.id - right.topic.id)
    .slice(0, 5)
    .map(({ topic }) => topic);
}

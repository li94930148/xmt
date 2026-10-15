import assert from 'node:assert/strict';
import {
  findSimilarTopicsByTitle,
  normalizeTopicTitle,
  scoreTopicTitleSimilarity,
  selectTopicTitleSearchTerms,
  type SimilarTopic,
} from '../../src/utils/topic-title-similarity.js';

assert.equal(normalizeTopicTitle('  周末夜市的烟火气！  '), '周末夜市的烟火气');
assert.equal(scoreTopicTitleSimilarity('周末夜市的烟火气', '周末夜市的烟火气！'), 1);
assert.ok(scoreTopicTitleSimilarity('周末夜市的烟火气', '周末夜市摊主的一天') > 0.42);
assert.ok(scoreTopicTitleSimilarity('周末夜市的烟火气', '办公室收纳整理方法') < 0.42);
assert.ok(scoreTopicTitleSimilarity('Tea shop opening guide', 'tea shop opening guide 2026') > 0.42);
assert.ok(selectTopicTitleSearchTerms('周末夜市的烟火气和摊主的一天').length <= 3);

const visibleCandidate: SimilarTopic = { id: 3, title: '周末夜市摊主的一天', status: 'production' };
const duplicateCandidate: SimilarTopic = { id: 3, title: '周末夜市摊主的一天', status: 'production' };
const unrelatedCandidate: SimilarTopic = { id: 4, title: '办公室收纳整理方法', status: 'pending' };
const queried: string[] = [];
const matches = await findSimilarTopicsByTitle('周末夜市的烟火气', async (search) => {
  queried.push(search);
  return [visibleCandidate, duplicateCandidate, unrelatedCandidate];
});
assert.ok(queried.length > 0 && queried.length <= 3, 'only a few title terms are searched');
assert.deepEqual(matches, [visibleCandidate], 'results are deduplicated and unrelated titles are excluded');
await assert.rejects(
  () => findSimilarTopicsByTitle('无法检查的标题', async () => { throw new Error('offline'); }),
  /暂时无法检查相似选题/,
);
await assert.rejects(
  () => findSimilarTopicsByTitle('部分搜索失败的标题', async (search) => {
    if (search === selectTopicTitleSearchTerms('部分搜索失败的标题')[0]) throw new Error('partial outage');
    return [];
  }),
  /暂时无法检查相似选题/,
  'partial search failure must not be presented as a complete no-match result',
);

console.log('Topic title similarity tests passed');

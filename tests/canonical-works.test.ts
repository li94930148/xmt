import assert from 'node:assert/strict';
import { canonicalizeDouyinWorks } from '../api/services/canonicalWorks.js';

const base = { account_id: 1, play_count: 10, like_count: 2, comment_count: 1, share_count: 0, collect_count: 0, completion_rate: 0, publish_time: '2026-01-01T00:00:00.000Z', title: '同一作品' };
const rows = [
  { ...base, id: 1, aweme_id: 'abc123', cover_url: '', updated_at: '2026-01-01T00:00:00.000Z' },
  { ...base, id: 2, aweme_id: 'abc123', cover_url: 'https://cdn.example.test/cover.webp', updated_at: '2026-01-02T00:00:00.000Z' },
  { ...base, id: 3, aweme_id: 'different456', cover_url: 'https://cdn.example.test/other.webp' },
] as any;
const canonical = canonicalizeDouyinWorks(rows);
assert.equal(canonical.length, 2);
assert.equal(canonical[0].canonical_source_count, 2);
assert.equal(canonical[0].cover_url, 'https://cdn.example.test/cover.webp');
assert.equal(canonical[0].play_count, 10);
assert.deepEqual(canonical[0].cover_candidates, ['https://cdn.example.test/cover.webp']);

const crossAccount = canonicalizeDouyinWorks([{ ...base, id: 4, account_id: 1, aweme_id: 'same999' }, { ...base, id: 5, account_id: 2, aweme_id: 'same999' }] as any);
assert.equal(crossAccount.length, 2, '相同 aweme_id 不得跨抖音账号合并');

const fallbackCollision = canonicalizeDouyinWorks([{ ...base, id: 6, aweme_id: '', title: '无 ID 作品' }, { ...base, id: 7, aweme_id: '', title: '无 ID 作品' }] as any);
assert.equal(fallbackCollision.length, 2, 'fallback 碰撞必须拒绝自动合并');
assert.ok(fallbackCollision.every(work => work.canonical_collision));

const differentAweme = canonicalizeDouyinWorks([{ ...base, id: 8, aweme_id: 'one111', title: '相同标题' }, { ...base, id: 9, aweme_id: 'two222', title: '相同标题' }] as any);
assert.equal(differentAweme.length, 2, '不同 aweme_id 不得因标题和时间相同合并');
console.log('Canonical works tests passed');

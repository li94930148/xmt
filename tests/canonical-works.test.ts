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
console.log('Canonical works tests passed');

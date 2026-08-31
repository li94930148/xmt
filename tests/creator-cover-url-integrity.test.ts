import assert from 'node:assert/strict';
import { resolveCoverUrl } from '../api/utils/coverResolver.js';

const valid = 'https://cdn.example.test/cover.webp';

assert.equal(resolveCoverUrl({ douyinCoverUrl: valid }), valid);
assert.equal(resolveCoverUrl({ douyinCoverUrl: '//cdn.example.test/cover.webp' }), valid);
assert.equal(resolveCoverUrl({ douyinCoverUrl: 'cover/relative.webp' }), '');
assert.equal(resolveCoverUrl({
  douyinCoverUrl: 'cover/relative.webp',
  creatorRawJson: { video: { cover: { url_list: [valid] } } },
}), valid);
assert.equal(resolveCoverUrl({
  creatorCoverUrl: { url_list: ['javascript:alert(1)', valid] },
}), valid);

console.log('Creator cover URL integrity tests passed');

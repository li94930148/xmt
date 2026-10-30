import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { StaticRouter } from 'react-router';
import { LegacyPublishedArchiveSnapshotView } from '../../src/components/resource-center/ArchiveSnapshotView';
import { getSafeArchiveHttpUrl, parseLegacyPublishedArchive } from '../../src/components/resource-center/parseLegacyPublishedArchive';

const archiveIdentity = {
  libraryType: 'content_archive',
  sourceType: 'system_archive',
  filePath: 'archive/topic-71',
};

function parse(content: unknown) {
  return parseLegacyPublishedArchive({ ...archiveIdentity, content });
}

test('normalizes the current multi-platform JSON snapshot without copying top-level metrics to sibling records', () => {
  const result = parse(JSON.stringify({
    topic: { id: 71, title: '多平台主题', platform: 'douyin', description: '主题说明' },
    script: { version: 'v2.0', content: '<p>归档正文</p>' },
    shooting: { comments: [{ content: '镜头补充', operator_name: '验收成员' }] },
    analytics: { views: 999 },
    publishing: { id: 402, platform: 'weixin', status: 'published' },
    published_records: [
      { publishing_id: 402, platform: 'weixin', status: 'published', publish_time: '2026-09-29 10:00:00', analytics: { data_date: '2026-09-29', views: 1200, likes: 52, shares: 8, comments: 4 } },
      { publishing_id: 401, platform: 'douyin', status: 'published', analytics: null },
    ],
    archived_at: '2026-09-29 10:30:00',
  }));

  assert.equal(result.kind, 'archive');
  if (result.kind !== 'archive') return;
  assert.equal(result.snapshot.publishedRecords.length, 2);
  assert.deepEqual(result.snapshot.publishedRecords[0], {
    publishingId: 402,
    platform: 'weixin',
    status: 'published',
    publishTime: '2026-09-29 10:00:00',
    analytics: { dataDate: '2026-09-29', views: 1200, likes: 52, shares: 8, comments: 4 },
  });
  assert.equal(result.snapshot.publishedRecords[1].analytics, null, 'top-level latest metrics are not attributed to another platform');
  assert.equal(result.snapshot.script?.content, '<p>归档正文</p>');
  assert.deepEqual(result.snapshot.shootingComments.map(({ content }) => content), ['镜头补充']);
});

test('supports old single-publishing snapshots by pairing the root analytics with that record only', () => {
  const result = parse(JSON.stringify({
    topic: { title: '旧版归档' },
    publishing: { platform: 'xiaohongshu', status: 'published', publish_time: '2026-09-28 11:00:00', url: 'https://example.test/post' },
    analytics: { data_date: '2026-09-28', views: 88, likes: 5, shares: 1, comments: 0 },
  }));

  assert.equal(result.kind, 'archive');
  if (result.kind !== 'archive') return;
  assert.deepEqual(result.snapshot.publishedRecords, [{
    platform: 'xiaohongshu',
    status: 'published',
    publishTime: '2026-09-28 11:00:00',
    url: 'https://example.test/post',
    analytics: { dataDate: '2026-09-28', views: 88, likes: 5, shares: 1, comments: 0 },
  }]);
});

test('accepts producer-realistic nullable database fields and normalizes them without losing valid metrics', () => {
  const result = parse(JSON.stringify({
    topic: { id: 71, title: '可空字段归档', description: null, platform: null, deadline: null },
    script: { version: null, content: null },
    shooting: null,
    publishing: { id: 402, platform: null, status: null, publish_time: null, url: null },
    analytics: { data_date: null, views: 17, likes: 3, shares: 1, comments: 0 },
    published_records: [{
      id: 402,
      publishing_id: 402,
      platform: null,
      status: null,
      publish_time: null,
      url: null,
      analytics: { data_date: null, views: 17, likes: 3, shares: 1, comments: 0 },
    }],
    archived_at: '2026-09-29 10:30:00',
  }));

  assert.equal(result.kind, 'archive');
  if (result.kind !== 'archive') return;
  assert.deepEqual(result.snapshot.topic, { id: 71, title: '可空字段归档' });
  assert.deepEqual(result.snapshot.script, {});
  assert.deepEqual(result.snapshot.publishedRecords, [{
    publishingId: 402,
    analytics: { views: 17, likes: 3, shares: 1, comments: 0 },
  }]);

  const markup = renderToStaticMarkup(createElement(LegacyPublishedArchiveSnapshotView, { snapshot: result.snapshot }));
  assert.match(markup, /选题平台：平台未记录/);
  assert.match(markup, /<h4[^>]*>平台未记录<\/h4>/);
  assert.match(markup, />未记录<\/span>/);
  assert.match(markup, /17/);
  assert.doesNotMatch(markup, /text-studio-success-contrast/);
});

test('normalizes nullable fields in the legacy single-publishing shape', () => {
  const result = parse(JSON.stringify({
    topic: { id: 72, title: '旧版可空字段归档', description: null, platform: null, deadline: null },
    publishing: { id: 403, platform: null, status: null, publish_time: null, url: null },
    analytics: { data_date: null, views: 88, likes: 5, shares: 1, comments: 0 },
    archived_at: '2026-09-28 11:30:00',
  }));

  assert.equal(result.kind, 'archive');
  if (result.kind !== 'archive') return;
  assert.deepEqual(result.snapshot.publishedRecords, [{
    publishingId: 403,
    analytics: { views: 88, likes: 5, shares: 1, comments: 0 },
  }]);
});

test('accepts a null script snapshot when the producer had no approved production row', () => {
  const result = parse(JSON.stringify({
    script: null,
    publishing: { platform: 'douyin', status: 'published' },
  }));

  assert.equal(result.kind, 'archive');
  if (result.kind !== 'archive') return;
  assert.equal(result.snapshot.script, undefined);
  assert.equal(result.snapshot.publishedRecords.length, 1);
});

test('uses a coral semantic badge for published exceptions instead of the success state', () => {
  const result = parse(JSON.stringify({
    publishing: { platform: 'douyin', status: 'failed' },
    published_records: [{ platform: 'douyin', status: 'failed' }],
  }));
  assert.equal(result.kind, 'archive');
  if (result.kind !== 'archive') return;

  const markup = renderToStaticMarkup(createElement(LegacyPublishedArchiveSnapshotView, { snapshot: result.snapshot }));
  assert.match(markup, /发布异常/);
  assert.match(markup, /text-studio-coral-contrast/);
  assert.doesNotMatch(markup, /text-studio-success-contrast/);
});

test('does not classify normal resources or lookalike paths as system archive snapshots', () => {
  const json = JSON.stringify({ publishing: { platform: 'douyin', status: 'published' } });
  assert.deepEqual(parseLegacyPublishedArchive({ ...archiveIdentity, libraryType: 'knowledge', content: json }), { kind: 'not-archive' });
  assert.deepEqual(parseLegacyPublishedArchive({ ...archiveIdentity, sourceType: 'manual', content: json }), { kind: 'not-archive' });
  assert.deepEqual(parseLegacyPublishedArchive({ ...archiveIdentity, filePath: 'archive/topic-71-copy', content: json }), { kind: 'not-archive' });
});

test('fails closed for invalid JSON and malformed snapshot shapes', () => {
  assert.equal(parse('{not json').kind, 'invalid');
  assert.equal(parse('[]').kind, 'invalid');
  assert.equal(parse(JSON.stringify({ topic: { title: 'missing publishing records' } })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ published_records: [{ platform: 'douyin', analytics: { views: 'unknown' } }] })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ published_records: [{ platform: 'douyin' }, null] })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ published_records: [{ platform: 42 }] })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ published_records: [{ platform: 'douyin', url: 42 }] })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ published_records: [{ platform: 'douyin', status: 42 }] })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ published_records: [{ platform: 'douyin', publish_time: 42 }] })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ published_records: [{ platform: 'douyin', analytics: { data_date: 42 } }] })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ topic: { title: '错误字段', description: 42 }, publishing: { platform: 'douyin' } })).kind, 'invalid');
  assert.equal(parse(JSON.stringify({ script: { content: 42 }, publishing: { platform: 'douyin' } })).kind, 'invalid');
  assert.equal(parse(null).kind, 'invalid');
});

test('allows only absolute HTTP(S) publication links without embedded credentials', () => {
  assert.equal(getSafeArchiveHttpUrl('https://example.test/post'), 'https://example.test/post');
  assert.equal(getSafeArchiveHttpUrl('http://example.test/post'), 'http://example.test/post');
  assert.equal(getSafeArchiveHttpUrl('javascript:alert(1)'), null);
  assert.equal(getSafeArchiveHttpUrl('/relative/post'), null);
  assert.equal(getSafeArchiveHttpUrl('ftp://example.test/post'), null);
  assert.equal(getSafeArchiveHttpUrl('https://user:pass@example.test/post'), null);
});

test('renders archive fields as business-facing markup rather than serializing the JSON object', () => {
  const parsed = parse(JSON.stringify({
    topic: { title: '结构化显示选题' },
    published_records: [{ publishing_id: 701, platform: 'douyin', status: 'published', analytics: { views: 123 } }],
  }));
  assert.equal(parsed.kind, 'archive');
  if (parsed.kind !== 'archive') return;

  const markup = renderToStaticMarkup(createElement(LegacyPublishedArchiveSnapshotView, { snapshot: parsed.snapshot }));
  assert.match(markup, /历史发布快照/);
  assert.match(markup, /抖音/);
  assert.match(markup, /123/);
  assert.doesNotMatch(markup, /published_records|"publishing_id"|\{\s*"topic"/);
});

test('renders exact per-publication source snapshots and keeps source links behind production:view', () => {
  const result = parse(JSON.stringify({
    topic: { id: 71, title: '多平台来源归档' },
    published_records: [
      {
        publishing_id: 501,
        platform: 'weixin',
        status: 'published',
        script_source: { topic_id: 71, production_id: 801, version: 'v1.0', state: 'derived' },
      },
      {
        publishing_id: 502,
        platform: 'douyin',
        status: 'published',
        script_source: { topic_id: 71, production_id: 802, version: 'v2.0', state: 'inherited' },
      },
      {
        publishing_id: 503,
        platform: 'bilibili',
        status: 'published',
        script_source: { topic_id: 71, source_topic_id: 72, production_id: 803, version: 'v3.0', state: 'derived' },
      },
      {
        publishing_id: 504,
        platform: 'xiaohongshu',
        status: 'published',
        script_source: { topic_id: 71, production_id: null, version: 'v4.0', state: 'derived' },
      },
      {
        publishing_id: 505,
        platform: 'kuaishou',
        status: 'published',
        script_source: { topic_id: 71, production_id: 805, version: 'v5.0', state: 'derived' },
      },
    ],
    script_source_snapshots: [
      { topic_id: 71, production_id: 801, version: 'v1.0', content: '<p>微信发布来源正文</p>' },
      { topic_id: 71, production_id: 802, version: 'v2.0', content: '<p>抖音发布来源正文</p>' },
      { topic_id: 72, production_id: 803, version: 'v3.0', content: '<p>跨选题内容不可见</p>' },
      { topic_id: 71, production_id: 805, version: 'v5.0', content: '<p>重复匹配正文一</p>' },
      { topic_id: 71, production_id: 805, version: 'v5.0', content: '<p>重复匹配正文二</p>' },
    ],
  }));

  assert.equal(result.kind, 'archive');
  if (result.kind !== 'archive') return;
  assert.deepEqual(result.snapshot.publishedRecords.map((record) => record.scriptSource?.version ?? null), ['v1.0', 'v2.0', 'v3.0', null, 'v5.0']);
  assert.equal(result.snapshot.publishedRecords[2].scriptSource?.sourceTopicId, 72, 'the archive parser preserves server-derived source-topic provenance separately from the archive topic');
  assert.deepEqual(result.snapshot.scriptSourceSnapshots.map(({ productionId, version }) => [productionId, version]), [
    [801, 'v1.0'], [802, 'v2.0'], [803, 'v3.0'], [805, 'v5.0'], [805, 'v5.0'],
  ]);

  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new JSDOM('').window });
  let restrictedMarkup = '';
  let authorizedMarkup = '';
  try {
    restrictedMarkup = renderToStaticMarkup(createElement(StaticRouter, { location: '/' },
      createElement(LegacyPublishedArchiveSnapshotView, { snapshot: result.snapshot }),
    ));
    authorizedMarkup = renderToStaticMarkup(createElement(StaticRouter, { location: '/' },
      createElement(LegacyPublishedArchiveSnapshotView, { snapshot: result.snapshot, canViewProduction: true }),
    ));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    else Reflect.deleteProperty(globalThis, 'window');
  }
  assert.match(restrictedMarkup, /微信发布来源正文/);
  assert.match(restrictedMarkup, /抖音发布来源正文/);
  assert.doesNotMatch(restrictedMarkup, /跨选题内容不可见|重复匹配正文一|重复匹配正文二/);
  assert.match(restrictedMarkup, /来源选题与当前归档不同，正文未复制进归档；打开原稿仍需来源选题访问权限/);
  assert.match(restrictedMarkup, /创作稿来源记录无效，已隐藏来源内容/);
  assert.match(restrictedMarkup, /没有唯一匹配的来源正文快照/);
  assert.doesNotMatch(restrictedMarkup, /href="\/production\//, 'archive access alone does not expose a source-work link');

  assert.match(authorizedMarkup, /href="\/production\/801\/source-snapshot\?version=v1\.0"/);
  assert.match(authorizedMarkup, /href="\/production\/802\/source-snapshot\?version=v2\.0"/);
  assert.match(authorizedMarkup, /href="\/production\/803\/source-snapshot\?version=v3\.0"/, 'a cross-topic source can be opened through its independently authorized, read-only route');
  assert.match(authorizedMarkup, /href="\/production\/805\/source-snapshot\?version=v5\.0"/, 'a complete same-topic source link remains available even when its archived body match is ambiguous');
  assert.doesNotMatch(authorizedMarkup, /href="\/production\/804/, 'incomplete source references never become links');
});

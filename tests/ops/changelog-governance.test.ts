import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changelog } from '../../src/data/changelog.js';

const packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const versions = changelog.map(({ version }) => version);
const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);

assert.deepEqual(duplicates, [], '每个版本号在用户更新说明中只出现一次');
assert.equal(changelog[0]?.version, packageVersion, '当前版本应排在更新说明首位');

const displayedCopy = changelog.flatMap(({ version, title, impactScope, changes }) => [
  { version, field: '标题', text: title },
  ...(impactScope ?? []).map((text) => ({ version, field: '影响范围', text })),
  ...changes.map(({ description }) => ({ version, field: '更新内容', text: description })),
]);
const implementationLanguage = /(?:\b(?:api|http|sqlite|libsql|socket\.io|express|react|hmac|aes|preload|renderer|jwt|yjs|openapi|swagger|zod|redis|vite|playwright|prosemirror|tiptap|typescript|tailwind|webgl|capacitor|keystore|cors|sql|json)\b|\b(?:payload|runtime|single-flight|requestId|condition_type|protocol_version|contract_version|collection_mode|snapshot_id|summary_json|canSync|creatorDataCenter|DouyinWorkInput|creator_content_items|douyin_works|__proto__|body-parser|upgrade-insecure-requests|no-store)\b|(?:^|[\s'"`])(?:src|api|deploy|data|tests?|android)\/[\w./-]+)/i;
const technicalCopy = displayedCopy.filter(({ text }) => implementationLanguage.test(text));
assert.deepEqual(
  technicalCopy.map(({ version, field, text }) => `${version} ${field}: ${text}`),
  [],
  '面向用户的更新说明不应出现内部路径、代码字段名或开发工具术语',
);

console.log(`更新说明治理通过（${versions.length} 个版本，包含用户文案检查）`);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src/config/navigation.ts'), 'utf8');
const sourceFiles = fs.readdirSync(path.join(root, 'src/api')).filter((name) => name.endsWith('.ts'));
const apiSource = sourceFiles.map((name) => fs.readFileSync(path.join(root, 'src/api', name), 'utf8')).join('\n');

assert.doesNotMatch(app, /SocialReview|DouyinAnalytics|social-review/);
assert.doesNotMatch(navigation, /social-review|douyin-analytics/);
assert.doesNotMatch(apiSource, /\/api\/social-review|\/latest-snapshot/);
assert.doesNotMatch(apiSource, /scrapeDouyin|getDouyinSnapshots|getDouyinTrend\b/);
assert.match(app, /path="\/analytics\/creator-center"/);
assert.match(app, /path="\/templates"/);

console.log('Frontend mounted API contract tests passed');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateAndroidProductionEndpoints } from '../../scripts/mobile-build-contract.mjs';

const root = process.cwd();
const expected = { version: '2.19.8', versionCode: 21908, platform: 'android', target: 'production', apiBaseUrl: 'https://lanyaomedia.com/api', socketBaseUrl: 'https://lanyaomedia.com' };
for (const relative of ['dist/xmt-mobile-build.json', 'android/app/src/main/assets/public/xmt-mobile-build.json']) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  assert.deepEqual(artifact, expected, `${relative} must contain the deterministic production build contract`);
  assert.equal(validateAndroidProductionEndpoints(artifact), null);
}
const distSource = fs.readdirSync(path.join(root, 'dist/assets'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => fs.readFileSync(path.join(root, 'dist/assets', file), 'utf8'))
  .join('\n');
assert.match(distSource, /https:\/\/lanyaomedia\.com\/api/);
assert.match(distSource, /https:\/\/lanyaomedia\.com/);
assert.doesNotMatch(distSource, /https:\/\/localhost\/api/);
console.log('Android build output endpoint contract tests passed');

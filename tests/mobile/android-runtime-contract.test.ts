import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const buildGradle = read('android/app/build.gradle');
const activity = read('android/app/src/main/java/com/lanyaomedia/xmt/MainActivity.java');
const capacitorConfig = read('capacitor.config.ts');
const runtime = read('src/platform/runtime.ts');
const debugManifest = read('android/app/src/debug/AndroidManifest.xml');

assert.match(capacitorConfig, /appId:\s*'com\.lanyaomedia\.xmt'/);
assert.match(buildGradle, /versionCode\s+21900/);
assert.match(buildGradle, /versionName\s+"2\.19\.0"/);
assert.match(manifest, /android:usesCleartextTraffic="false"/);
assert.match(debugManifest, /android:usesCleartextTraffic="true"/);
assert.match(debugManifest, /tools:replace="android:usesCleartextTraffic"/);
assert.match(runtime, /VITE_ANDROID_ALLOW_CLEARTEXT/);
assert.match(runtime, /getNativeEndpointConfigurationError/);
assert.match(read('src/pages/Login.tsx'), /getNativeEndpointConfigurationError/);
assert.match(manifest, /android:launchMode="singleTask"/);
for (const host of ['topics', 'production', 'messages', 'daily-report']) {
  assert.match(manifest, new RegExp(`<data android:scheme="xmt" android:host="${host}"`));
}
assert.match(activity, /registerPlugin\(SecureCredentialPlugin\.class\)/);
console.log('Android runtime contract tests passed');

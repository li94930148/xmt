import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { validateAndroidProductionEndpoints } from '../../scripts/mobile-build-contract.mjs';

const apk = path.resolve(process.cwd(), process.argv[2] || 'android/app/build/outputs/apk/debug/app-debug.apk');
assert.ok(fs.existsSync(apk), `APK not found: ${apk}`);
const manifest = JSON.parse(execFileSync('unzip', ['-p', apk, 'assets/public/xmt-mobile-build.json'], { encoding: 'utf8' }));
const version = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version;
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10_000 + minor * 100 + patch;
assert.deepEqual(manifest, { version, versionCode, platform: 'android', target: 'production', apiBaseUrl: 'https://lanyaomedia.com/api', socketBaseUrl: 'https://lanyaomedia.com' });
assert.equal(validateAndroidProductionEndpoints(manifest), null);
console.log('APK endpoint artifact contract tests passed');

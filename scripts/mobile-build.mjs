import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildEnvironmentForProfile, createAndroidBuildManifest, resolveAndroidBuildProfile, validateAndroidProductionEndpoints } from './mobile-build-contract.mjs';

const target = process.argv[2];
const sync = process.argv.includes('--sync');
const profile = resolveAndroidBuildProfile(target);
const contractError = target === 'production' ? validateAndroidProductionEndpoints(profile) : null;
if (contractError) throw new Error(contractError);

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
if (!Number.isInteger(versionCode)) throw new Error('ANDROID_VERSION_CODE_MISSING');

const publicDir = path.join(root, 'public');
const manifestPath = path.join(publicDir, 'xmt-mobile-build.json');
const manifest = createAndroidBuildManifest({ version: pkg.version, versionCode, profile });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) => {
  const result = spawnSync(npm, args, {
    cwd: root,
    env: buildEnvironmentForProfile(profile),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
try {
  run(['run', 'build']);
  if (sync) run(['exec', 'cap', 'sync', 'android']);
} finally {
  fs.rmSync(manifestPath, { force: true });
}

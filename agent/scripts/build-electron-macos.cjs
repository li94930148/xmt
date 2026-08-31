const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(root, '..');
const release = path.join(root, 'release');
const appName = 'XMT Creator Agent.app';
const app = path.join(release, appName);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const systemVersion = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).system_version;
const releaseVersion = version.replace(/-agent$/, '');
const archive = path.join(release, `XMT-Creator-Agent-v${releaseVersion}-macos-arm64.zip`);
const metadata = path.join(root, '.package-metadata');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-agent-macos-stage-'));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
};
const ensureAbsent = (target) => {
  if (fs.existsSync(target)) throw new Error(`Refusing to overwrite existing release artifact: ${target}`);
};

if (process.platform !== 'darwin') throw new Error('MACOS_ARM64_HOST_REQUIRED');
if (process.arch !== 'arm64') throw new Error(`MACOS_ARM64_HOST_REQUIRED: ${process.arch}`);
if (!/^\d+\.\d+\.\d+$/.test(systemVersion)) throw new Error(`Invalid Agent system version: ${systemVersion}`);
ensureAbsent(app);
ensureAbsent(archive);
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(path.join(electronDist, 'Electron.app', 'Contents', 'MacOS', 'Electron'))) throw new Error('Missing local arm64 Electron distribution');
const commit = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', shell: false });
if (commit.status !== 0) throw new Error('Unable to resolve build commit');
const buildId = `macos-arm64-v${systemVersion}-v${version}-${commit.stdout.trim()}`;

try {
  fs.mkdirSync(metadata, { recursive: true });
  fs.writeFileSync(path.join(metadata, 'build-info.json'), JSON.stringify({ buildId, systemVersion, agentVersion: version, commit: commit.stdout.trim(), architecture: 'arm64' }, null, 2));
  const builder = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
  run(process.execPath, [builder, '--mac', 'dir', '--arm64', `--config.directories.output=${stage}`, `--config.electronDist=${electronDist}`], { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  const outputDirectory = path.join(stage, 'mac-arm64');
  const apps = fs.existsSync(outputDirectory) ? fs.readdirSync(outputDirectory).filter((entry) => entry.endsWith('.app')) : [];
  if (apps.length !== 1) throw new Error(`Expected exactly one macOS application, found: ${apps.join(', ') || 'none'}`);
  const built = path.join(outputDirectory, apps[0]);
  fs.mkdirSync(release, { recursive: true });
  fs.renameSync(built, app);
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  console.log(JSON.stringify({ app, archive, buildId, sha256: digest, bytes: fs.statSync(archive).size, signing: 'AD_HOC' }));
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(metadata, { recursive: true, force: true });
}

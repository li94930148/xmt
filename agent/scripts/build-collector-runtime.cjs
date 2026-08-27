const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const agentRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(agentRoot, '..');
const collectorRoot = path.join(repositoryRoot, 'collector');
const outputRoot = path.join(agentRoot, '.collector-runtime-build');
const python = process.env.XMT_COLLECTOR_BUILD_PYTHON || (process.platform === 'win32' ? 'python' : path.join(collectorRoot, '.venv', 'bin', 'python'));
const run = (args) => {
  const result = spawnSync(python, args, { cwd: collectorRoot, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
run(['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.lock', '-r', 'requirements-build.lock']);
const runtime = path.join(outputRoot, 'collector-runtime');
run(['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--name', 'xmt-collector-worker', '--distpath', runtime, '--workpath', path.join(outputRoot, 'work'), '--specpath', path.join(outputRoot, 'spec'), '--paths', collectorRoot, '--collect-all', 'scrapling', '--collect-all', 'patchright', '--collect-all', 'browserforge', '--collect-all', 'apify_fingerprint_datapoints', path.join(collectorRoot, 'xmt_collector', 'runtime', 'worker.py')]);
const executable = path.join(runtime, 'xmt-collector-worker', process.platform === 'win32' ? 'xmt-collector-worker.exe' : 'xmt-collector-worker');
if (!fs.existsSync(executable)) throw new Error(`Collector runtime build missing executable: ${executable}`);
console.log(`collector runtime: ${runtime}`);

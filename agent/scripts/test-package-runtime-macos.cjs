const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const agentRoot = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(agentRoot, 'package.json'), 'utf8')).version;
const releaseVersion = version.replace(/-agent$/, '');
const archive = path.join(agentRoot, 'release', `XMT-Creator-Agent-v${releaseVersion}-macos-arm64.zip`);
const appName = 'XMT Creator Agent.app';
const forbidden = /(^|[\\/])(config\.json|creator\.db|[^\\/]*\.(?:sqlite|xlsx)|cookies?|agent-token\.bin|sync\.log)(?:$|[\\/])/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const stopChild = async (child) => {
  if (child.exitCode !== null || child.killed) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(3_000)]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([exited, sleep(3_000)]); }
};
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
async function waitForFile(file, timeout = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (fs.existsSync(file)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for packaged runtime probe: ${file}`);
}
async function listenLoopback() {
  let syncRequests = 0;
  let heartbeatRequests = 0;
  const server = http.createServer((request, response) => {
    request.resume();
    if (request.url === '/api/creator-agent/data-sync') syncRequests += 1;
    if (request.url === '/api/creator-agent/heartbeat') heartbeatRequests += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ success: true, status: 'success', success_count: 1, failed_count: 0, modules: {}, errors: {} }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  return { server, serverUrl: `http://127.0.0.1:${address.port}`, counts: () => ({ syncRequests, heartbeatRequests }) };
}
async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('MACOS_ARM64_HOST_REQUIRED');
  assert(fs.existsSync(archive), `Missing macOS archive: ${archive}`);
  const relocation = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-agent-package-contract-'));
  const extracted = path.join(relocation, appName);
  const testData = path.join(relocation, 'test-data');
  const probe = path.join(relocation, 'runtime-probe.json');
  const loopback = await listenLoopback();
  try {
    run('/usr/bin/ditto', ['-x', '-k', archive, relocation]);
    const executable = path.join(extracted, 'Contents', 'MacOS', 'XMT-Creator-Agent');
    const resources = path.join(extracted, 'Contents', 'Resources');
    const worker = path.join(resources, 'collector-runtime', 'xmt-collector-worker', 'xmt-collector-worker');
    const playwrightDriver = path.join(resources, 'collector-runtime', 'xmt-collector-worker', '_internal', 'playwright', 'driver', 'node');
    assert(fs.existsSync(executable), 'PACKAGED_APP_EXECUTABLE_NOT_INCLUDED');
    assert(fs.existsSync(worker), 'PACKAGED_RUNTIME_NOT_INCLUDED');
    assert(fs.existsSync(playwrightDriver), 'PACKAGED_PLAYWRIGHT_DRIVER_NOT_INCLUDED');
    run(playwrightDriver, ['--version']);
    const files = run('/usr/bin/find', [extracted, '-type', 'f']).split('\n').filter(Boolean);
    const prohibited = files.filter((file) => forbidden.test(path.relative(extracted, file)));
    assert(!prohibited.length, `PACKAGED_RUNTIME_CONTAINS_USER_DATA: ${prohibited.join(', ')}`);
    const repositoryReference = spawnSync('/usr/bin/grep', ['-a', '-F', '-q', '/Users/youfeifei/Projects/xmt', path.join(resources, 'app.asar')], { shell: false });
    assert(repositoryReference.status === 1, 'PACKAGED_RUNTIME_REFERENCES_REPOSITORY');
    assert(/arm64/.test(run('/usr/bin/file', [executable])), 'APP_NOT_ARM64');
    assert(/arm64/.test(run('/usr/bin/file', [worker])), 'WORKER_NOT_ARM64');
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', extracted]);
    const workerHealth = spawn(worker, [], { cwd: path.dirname(worker), env: { PATH: '/usr/bin:/bin', XMT_COLLECTOR_PYTHON: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    workerHealth.stdout.setEncoding('utf8'); workerHealth.stdout.on('data', (chunk) => { output += chunk; });
    workerHealth.stdin.write(`${JSON.stringify({ id: 'health', method: 'health', params: {} })}\n`);
    const healthDeadline = Date.now() + 20_000;
    while (Date.now() < healthDeadline && !output.includes('"id":"health"')) await sleep(100);
    workerHealth.kill();
    const health = output.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((value) => value?.id === 'health');
    assert(health?.event === 'completed' && health.data?.ready === true && health.data?.scrapling_import === true, 'PACKAGED_WORKER_HEALTH_FAILED');
    let appDiagnostics = ''; const appProcess = spawn(executable, ['--no-sandbox'], { cwd: path.dirname(executable), env: { ...process.env, PATH: '/usr/bin:/bin', HOME: relocation, NODE_ENV: 'test', XMT_AGENT_TEST_DATA_ROOT: testData, XMT_AGENT_RUNTIME_PROBE_FILE: probe, XMT_AGENT_PACKAGE_CONTRACT_BOOTSTRAP: JSON.stringify({ serverUrl: loopback.serverUrl, token: 'package-contract-loopback-token' }), ELECTRON_RENDERER_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    appProcess.stdout.on('data', (chunk) => { appDiagnostics += String(chunk); }); appProcess.stderr.on('data', (chunk) => { appDiagnostics += String(chunk); });
    try {
      try { await waitForFile(probe); } catch (error) { throw new Error(`${error.message}: ${appDiagnostics.slice(-2000)}`); }
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && loopback.counts().syncRequests !== 1) await sleep(100);
    } finally {
      await stopChild(appProcess);
    }
    const runtime = JSON.parse(fs.readFileSync(probe, 'utf8'));
    assert(!runtime.startupError, `PACKAGED_APP_STARTUP_FAILED: ${runtime.startupError}`);
    assert(runtime.runtimeIdentity?.packaged === true, 'PACKAGED_FLAG_NOT_TRUE');
    assert(runtime.runtimeIdentity?.databaseReady === true && runtime.runtimeIdentity?.uploadQueue === true, 'PACKAGED_DATABASE_NOT_READY');
    assert(runtime.runtimeIdentity?.workerRuntime === 'packaged', 'PACKAGED_WORKER_MODE_NOT_USED');
    assert(runtime.runtimeIdentity?.apiTarget === 'loopback', 'PACKAGED_TEST_API_NOT_LOOPBACK');
    assert(runtime.rendererUrl === null, 'PACKAGED_RENDERER_USES_DEV_SERVER');
    assert(fs.realpathSync(runtime.resourcesPath) === fs.realpathSync(resources), `PACKAGED_RESOURCES_PATH_MISMATCH: expected=${resources} actual=${runtime.resourcesPath}`);
    const db = path.join(testData, 'creator.db');
    assert(fs.existsSync(db), 'PACKAGED_DATABASE_NOT_CREATED');
    const { DatabaseSync } = require('node:sqlite'); const queueDb = new DatabaseSync(db); const succeeded = queueDb.prepare("SELECT count(*) AS count FROM upload_queue WHERE status='succeeded'").get().count; queueDb.close();
    assert(loopback.counts().syncRequests === 1 && succeeded === 1, `PACKAGED_LOOPBACK_QUEUE_NOT_SUCCEEDED: ${JSON.stringify({ ...loopback.counts(), succeeded })}`);
    assert(loopback.counts().heartbeatRequests >= 1, 'PACKAGED_LOOPBACK_HEARTBEAT_NOT_SENT');
    console.log('macOS arm64 packaged runtime contract passed: relocated .app, minimal PATH, static renderer, packaged identity, database/upload_queue barrier, loopback HTTP queue succeeded, self-contained PyInstaller Scrapling worker health, no repository or user-data payload');
  } finally {
    await new Promise((resolve, reject) => loopback.server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(relocation, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

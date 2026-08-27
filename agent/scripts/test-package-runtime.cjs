const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? readFiles(file) : [file];
});

const waitFor = (child, id, predicate, timeoutMs = 20_000) => new Promise((resolve, reject) => {
  let output = '';
  let stderr = '';
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${id}: ${stderr || output}`)), timeoutMs);
  const finish = (error, value) => {
    clearTimeout(timer);
    child.stdout.off('data', onStdout);
    child.stderr.off('data', onStderr);
    child.off('exit', onExit);
    child.off('error', onError);
    error ? reject(error) : resolve(value);
  };
  const onStdout = (chunk) => {
    output += String(chunk);
    for (const line of output.split(/\r?\n/)) {
      if (!line) continue;
      let response;
      try { response = JSON.parse(line); } catch { continue; }
      if (response.id === id && predicate(response)) return finish(null, response);
    }
  };
  const onStderr = (chunk) => { stderr += String(chunk); };
  const onExit = (code, signal) => finish(new Error(`Worker exited before ${id}: code=${code} signal=${signal} stderr=${stderr}`));
  const onError = (error) => finish(error);
  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);
  child.on('exit', onExit);
  child.on('error', onError);
});

async function main() {
  if (process.platform !== 'win32') throw new Error('PACKAGED_RUNTIME_WINDOWS_REQUIRED');
  const agentRoot = path.resolve(__dirname, '..');
  const zip = path.join(agentRoot, 'release', 'XMT-Creator-Agent-Portable.zip');
  if (!fs.existsSync(zip)) throw new Error('Missing portable ZIP');
  const relocation = fs.mkdtempSync(path.join(os.tmpdir(), 'XMT Agent 测试 目录 '));
  const extract = path.join(relocation, 'bundle');
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const unzip = require('node:child_process').spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(extract)} -Force`], { stdio: 'inherit', shell: false });
  if (unzip.status !== 0) throw new Error(`Unable to unpack portable ZIP: ${unzip.status}`);
  const resources = path.join(extract, 'XMT Creator Agent', 'resources');
  const runtime = path.join(resources, 'collector-runtime');
  const executable = path.join(runtime, 'xmt-collector-worker', 'xmt-collector-worker.exe');
  if (!fs.existsSync(executable)) throw new Error('PACKAGED_RUNTIME_NOT_INCLUDED');
  const forbidden = /(^|[\\/])(config\.json|creator\.db|[^\\/]*\.(?:sqlite|xlsx)|cookies?)(?:$|[\\/])/i;
  const prohibited = readFiles(resources).filter((file) => forbidden.test(path.relative(resources, file)));
  if (prohibited.length) throw new Error(`PACKAGED_RUNTIME_CONTAINS_USER_DATA: ${prohibited.join(', ')}`);
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const child = spawn(executable, [], {
    cwd: path.dirname(executable),
    shell: false,
    env: { SystemRoot: systemRoot, PATH: path.join(systemRoot, 'System32'), XMT_COLLECTOR_PYTHON: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const request = async (id, method, params, predicate) => {
    const response = waitFor(child, id, predicate);
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return response;
  };
  try {
    await request('health', 'health', {}, (response) => response.event === 'completed' && response.data?.ready === true && response.data?.collector_import === true && response.data?.scrapling_import === true);
    await request('collect-smoke', 'collect', {
      platform: 'unsupported',
      browser: { type: 'chromium', engine: 'chromium', runtime: 'playwright', executablePath: 'C:\\Program Files\\XMT\\playwright-chromium.exe', headless: false },
    }, (response) => response.event === 'error' && response.data?.code === 'not_implemented');
    await request('shutdown', 'shutdown', {}, (response) => response.event === 'completed' && response.data?.shutdown === true);
    console.log('packaged runtime contract passed: included, relocated, no system Python or repo dependency, JSONL health, Scrapling import, Chromium browser descriptor, collect smoke, shutdown');
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

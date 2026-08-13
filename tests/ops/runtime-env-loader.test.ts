import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectRuntimeEnvironment, loadRuntimeEnvironment } from '../../api/config/runtime-env-loader.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-runtime-env-'));
const envFile = path.join(dir, 'production.env');
fs.writeFileSync(envFile, [
  'NODE_ENV=production',
  'XMT_MOBILE_AUTH_ENABLED=true',
  'XMT_MOBILE_AUTH_APPROVED=true',
  'XMT_MOBILE_AUTH_ALLOWLIST_USER_IDS=42',
  'ALLOWED_ORIGINS=https://lanyaomedia.com,http://localhost',
  'XMT_AUTH_REFRESH_PEPPER=not-printed',
].join('\n'), { mode: 0o600 });

const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', XMT_RUNTIME_ENV_FILE: envFile, XMT_MOBILE_AUTH_ENABLED: 'false' };
const loaded = loadRuntimeEnvironment(env);
assert.equal(loaded.source, 'runtime_env_file');
assert.equal(env.XMT_MOBILE_AUTH_ENABLED, 'true');
assert.equal(env.XMT_MOBILE_AUTH_ALLOWLIST_USER_IDS, '42');
assert.equal(inspectRuntimeEnvironment(env).source, 'runtime_env_file');

const insecure = path.join(dir, 'insecure.env');
fs.writeFileSync(insecure, 'NODE_ENV=production\n', { mode: 0o666 });
fs.chmodSync(insecure, 0o666);
assert.throws(() => loadRuntimeEnvironment({ NODE_ENV: 'production', XMT_RUNTIME_ENV_FILE: insecure }), /must not be group\/world writable/);
assert.throws(() => loadRuntimeEnvironment({ NODE_ENV: 'production', XMT_RUNTIME_ENV_FILE: path.join(dir, 'missing.env') }), /not readable/);
fs.rmSync(dir, { recursive: true, force: true });
console.log('runtime env loader contract tests passed');

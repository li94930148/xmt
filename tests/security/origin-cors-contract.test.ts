import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-origin-cors-'));
process.env.XMT_DB_PATH = path.join(temporaryDirectory, 'origin-cors.test.db');
process.env.JWT_SECRET = 'origin-cors-test-secret';
process.env.ALLOWED_ORIGINS = 'https://lanyaomedia.com,http://localhost,https://localhost';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { default: app } = await import('../../api/app.js');

await initDatabase();
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const origin = 'https://localhost';
  const health = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
  assert.equal(health.status, 200, 'exact Android HTTPS localhost origin does not enter the CORS error path');
  assert.equal(health.headers.get('access-control-allow-origin'), origin);
  assert.equal(health.headers.get('access-control-allow-credentials'), 'true');

  const preflight = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.ok(preflight.ok, 'Android HTTPS localhost preflight succeeds');
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

  const malicious = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://localhost.evil.test' },
  });
  assert.notEqual(malicious.headers.get('access-control-allow-origin'), 'https://localhost.evil.test');

  const maliciousPreflight = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://localhost.evil.test',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.notEqual(maliciousPreflight.headers.get('access-control-allow-origin'), 'https://localhost.evil.test');

  console.log('Android HTTPS localhost CORS contract tests passed');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

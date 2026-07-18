import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8');
}

function expectMatch(content, expression, description) {
  assert.match(content, expression, description);
}

async function main() {
  // This is deliberately a source-contract test: it does not import application
  // services, start a server, or make network requests.
  const [routes, recoveryService, app, recoveryPage, clientApi] = await Promise.all([
    source('api/routes/social-review.ts'),
    source('api/services/social-review/socialLoginRecoveryService.ts'),
    source('src/App.tsx'),
    source('src/pages/SocialLoginRecovery.tsx'),
    source('src/api/socialReview.ts'),
  ]);

  expectMatch(
    routes,
    /router\.post\('\/accounts\/:id\/login\/start',\s*requireAdmin,/, 
    'missing admin-protected login recovery start endpoint',
  );
  expectMatch(
    routes,
    /router\.get\('\/login-session\/:id',\s*requireAdmin,/, 
    'missing admin-protected login session status endpoint',
  );

  expectMatch(recoveryService, /export async function getSocialLoginRecovery\(/, 'missing login session status service');
  expectMatch(
    recoveryService,
    /return\s*\{\s*sessionId:\s*session\.id,\s*accountId:\s*Number\(session\.account_id\),\s*status:\s*session\.status,\s*message:/s,
    'login session status response must include sessionId, accountId, status, and message',
  );
  expectMatch(
    clientApi,
    /getSocialLoginStatus\([^)]*\).*sessionId.*status.*message/s,
    'client login session status contract is missing required fields',
  );

  expectMatch(app, /import\('\@\/pages\/SocialLoginRecovery'\)/, 'missing SocialLoginRecovery page import');
  expectMatch(
    app,
    /<Route path="\/social-review\/login-recovery\/:sessionId" element=\{<SocialLoginRecovery\s*\/>\}\s*\/>/,
    'missing SocialLoginRecovery route',
  );

  for (const eventName of ['social-login:join', 'social-login:stream']) {
    expectMatch(recoveryPage, new RegExp(`['\"]${eventName}['\"]`), `missing client socket event: ${eventName}`);
  }

  console.log('Social login recovery UI smoke passed.');
  console.log('Verified: recovery endpoints, admin guards, session response contract, route, and socket events.');
  console.log('Safety: static source checks only; no browser, network, cookies, storage state, or screenshots used.');
}

main().catch((error) => {
  console.error(`Social login recovery UI smoke failed: ${error.message}`);
  process.exitCode = 1;
});

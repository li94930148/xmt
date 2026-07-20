import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(resolve(root, file), 'utf8');

async function main() {
  const [routes, api, modal, page, recovery] = await Promise.all([
    source('api/routes/social-review.ts'),
    source('src/api/socialReview.ts'),
    source('src/components/social-review/AccountConnectModal.tsx'),
    source('src/pages/SocialReview.tsx'),
    source('api/services/social-review/socialLoginRecoveryService.ts'),
  ]);

  assert.match(routes, /router\.post\('\/accounts\/connect\/start',\s*requireAdmin,/, 'connect start must be admin-only');
  assert.match(routes, /status,\s*created_by,\s*updated_by/, 'connect start must record credential metadata only');
  assert.match(routes, /'pending_login'/, 'connect start must create a pending_login credential');
  assert.match(routes, /startSocialLoginRecovery\(accountId\)/, 'connect start must create a real login session');
  assert.match(routes, /router\.get\('\/accounts\/status',\s*requirePermission\('analytics:view'\)/, 'missing account status endpoint');
  assert.match(routes, /router\.delete\('\/accounts\/:id',\s*requireAdmin,/, 'account deletion must be admin-only');
  assert.match(api, /startAccountConnect\(/, 'client connect API missing');
  assert.match(api, /getSocialAccountStatuses\(/, 'client account status API missing');
  assert.match(modal, /social-login:join/, 'modal must join the protected login stream');
  assert.match(modal, /getLoginSessionStatus/, 'modal must poll login status');
  assert.match(modal, /startAccountConnect/, 'modal must start account connection');
  assert.match(page, /AccountConnectModal/, 'social review page must render connect modal');
  assert.match(page, /startLoginRecovery/, 'account cards must support re-login');
  assert.match(recovery, /openServerBrowser\(accountId, true\)/, 'login session must use the visible server browser');

  for (const forbidden of [/storageState\s*\(/, /cookies\s*\(/, /cookies\.json/i, /token\s*[:=]/i]) {
    assert.doesNotMatch(modal, forbidden, `modal must not handle browser credentials: ${forbidden}`);
  }
  console.log('Social Review account-connect smoke passed.');
  console.log('Verified: admin connect, pending login metadata, login session, account status, stream/poll UI, re-login, and admin deletion contracts.');
  console.log('Safety: static source smoke only; no browser profile, cookies, tokens, storageState, screenshots, or network responses were read.');
}

main().catch((error) => { console.error(`Social Review account-connect smoke failed: ${error.message}`); process.exitCode = 1; });

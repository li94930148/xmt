import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledgeBind, bind } from './client.js';

test('new binding requests send the persisted capability without caching while legacy callers remain supported', async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ agent_id: 5, agent_token: 'fixture-token', account_id: 'fixture-account', recovery_supported: true }), {
      status: 201, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  const recovery = { requestId: 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a54', recoverySecret: 'A'.repeat(43) };
  const device = { device_id: 'fixture-device' };
  const keyed = await bind('https://example.invalid/', 'one-time-code', device, recovery);
  assert.equal(keyed.recovery_supported, true);
  assert.equal(requests[0].url, 'https://example.invalid/api/creator-agent/bind');
  assert.equal(requests[0].init?.cache, 'no-store');
  const keyedBody = JSON.parse(String(requests[0].init?.body));
  assert.deepEqual(keyedBody, { binding_code: 'one-time-code', device, request_id: recovery.requestId, recovery_secret: recovery.recoverySecret });

  await bind('https://example.invalid', 'legacy-code', device);
  const legacyBody = JSON.parse(String(requests[1].init?.body));
  assert.deepEqual(legacyBody, { binding_code: 'legacy-code', device }, 'old callers may still omit recovery fields');

  await acknowledgeBind('https://example.invalid', recovery);
  assert.equal(requests[2].url, 'https://example.invalid/api/creator-agent/bind/ack');
  assert.equal(requests[2].init?.cache, 'no-store');
  assert.equal(String(requests[2].url).includes(recovery.recoverySecret), false, 'the recovery secret is never put in the URL');
  assert.deepEqual(JSON.parse(String(requests[2].init?.body)), { request_id: recovery.requestId, recovery_secret: recovery.recoverySecret });
});

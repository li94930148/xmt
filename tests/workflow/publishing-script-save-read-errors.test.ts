import assert from 'node:assert/strict';
import { getPublishingScriptVersions } from '../../src/api/workflow';

const originalFetch = globalThis.fetch;

try {
  for (const status of [401, 403, 503]) {
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: `模拟 HTTP ${status}` }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    await assert.rejects(
      getPublishingScriptVersions(501),
      (error: unknown) => {
        assert.equal((error as { status?: number }).status, status, `the versions API preserves HTTP ${status}`);
        return true;
      },
    );
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Publishing script history errors preserve distinct 401, 403, and 503 statuses.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';

describe('internal route exposure deployment gate', () => {
  it('checks loopback runtime policy and each protected endpoint', () => {
    const script = fs.readFileSync(path.resolve('scripts/internal-exposure-check.ts'), 'utf8');
    assert.match(script, /inspectRuntimeEnvironment/);
    assert.match(script, /variables\.XMT_PUBLIC_BASE_URL/);
    for (const endpoint of ['/internal/auth-rollout/runtime', '/internal/socket-lifecycle/summary', '/internal/ops/runtime', '/internal/metrics/auth']) {
      assert.match(script, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(script, /response\.status !== 404/);
  });
});

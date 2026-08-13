const url = process.env.XMT_AUTH_RUNTIME_STATUS_URL || 'http://127.0.0.1:3001/internal/auth-rollout/runtime';
const expectedSource = process.env.XMT_EXPECTED_RUNTIME_SOURCE;

const response = await fetch(url);
if (!response.ok) throw new Error(`Runtime readback failed: HTTP ${response.status}`);
const body = await response.json() as { runtime?: Record<string, unknown> };
const runtime = body.runtime;
if (!runtime || typeof runtime !== 'object') throw new Error('Runtime readback did not return diagnostics');
if (expectedSource && runtime.effectiveConfigSource !== expectedSource) {
  throw new Error(`Runtime source mismatch: expected ${expectedSource}, got ${String(runtime.effectiveConfigSource)}`);
}
for (const key of ['effectiveAuthV1Enabled', 'effectiveMobileAuthEnabled', 'mobileAuthApproved', 'mobileAllowlistCount', 'effectiveMobileSocketEnabled']) {
  if (!(key in runtime)) throw new Error(`Runtime readback missing ${key}`);
}
console.log(JSON.stringify({ status: 'PASS', source: runtime.effectiveConfigSource, processId: runtime.processId }));

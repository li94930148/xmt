import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startFailureInjectionProxy } from '../scripts/failure-injection-proxy.mjs';

const productionTargetPath = '/api/workflow/production/85';
const shootingId = 734;
const shootingTargetPath = `/api/workflow/shooting/${shootingId}`;

async function startUpstream() {
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, path: request.url }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    getRequests: () => requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function request(proxyOrigin, pathname) {
  return fetch(`${proxyOrigin}${pathname}`, { method: 'PUT' });
}

async function withProxy(options, callback) {
  const upstream = await startUpstream();
  let proxy;
  try {
    proxy = await startFailureInjectionProxy({ upstreamOrigin: upstream.origin, ...options });
    await callback({ proxy, upstream });
  } finally {
    if (proxy) await proxy.close();
    await upstream.close();
  }
}

const manifestDirectory = await mkdtemp(path.join(os.tmpdir(), 'xmt-shooting-fixture-'));
const manifestPath = path.join(manifestDirectory, 'shooting-fixture.json');
await writeFile(manifestPath, JSON.stringify({
  shootingGracefulDispose: {
    shootingId,
    productionId: 735,
    allowedPath: shootingTargetPath,
  },
}), 'utf8');

try {
  await withProxy({ profile: 'reject_once' }, async ({ proxy, upstream }) => {
    assert.equal((await request(proxy.origin, productionTargetPath)).status, 503);
    assert.equal(upstream.getRequests(), 0, 'production injected failure must not reach upstream');
    assert.equal((await request(proxy.origin, productionTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'production reject_once must be consumed exactly once');
    assert.equal(proxy.getState().consumed, true);
  });

  await withProxy({ profile: 'timeout_once', timeoutBudgetMs: 5, timeoutDelayMs: 20 }, async ({ proxy, upstream }) => {
    const startedAt = Date.now();
    assert.equal((await request(proxy.origin, productionTargetPath)).status, 504);
    assert.ok(Date.now() - startedAt >= 20, 'production timeout response must exceed the configured budget');
    assert.equal(upstream.getRequests(), 0, 'production injected timeout must not reach upstream');
    assert.equal((await request(proxy.origin, productionTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'production timeout_once must be consumed exactly once');
  });

  await withProxy({ profile: 'passthrough' }, async ({ proxy, upstream }) => {
    assert.equal((await request(proxy.origin, productionTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'production passthrough must forward the target request');
    assert.equal(proxy.getState().consumed, false);
  });

  await withProxy({
    profile: 'shooting_reject_once',
    shootingFixtureManifestPath: manifestPath,
  }, async ({ proxy, upstream }) => {
    assert.equal((await request(proxy.origin, shootingTargetPath)).status, 503);
    assert.equal(upstream.getRequests(), 0, 'shooting injected failure must not reach upstream');
    assert.equal((await request(proxy.origin, shootingTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'shooting_reject_once must be consumed exactly once');
  });

  await withProxy({
    profile: 'shooting_timeout_once',
    shootingFixtureManifestPath: manifestPath,
    timeoutBudgetMs: 5,
    timeoutDelayMs: 20,
  }, async ({ proxy, upstream }) => {
    assert.equal((await request(proxy.origin, shootingTargetPath)).status, 504);
    assert.equal(upstream.getRequests(), 0, 'shooting injected timeout must not reach upstream');
    assert.equal((await request(proxy.origin, shootingTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'shooting_timeout_once must be consumed exactly once');
  });

  await withProxy({
    profile: 'shooting_passthrough',
    shootingFixtureManifestPath: manifestPath,
  }, async ({ proxy, upstream }) => {
    assert.equal((await request(proxy.origin, shootingTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'shooting_passthrough must forward the fixture request');
  });

  await withProxy({
    profile: 'shooting_hold_once',
    shootingFixtureManifestPath: manifestPath,
  }, async ({ proxy, upstream }) => {
    const pending = request(proxy.origin, shootingTargetPath);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(proxy.getState(), {
      profile: 'shooting_hold_once',
      target: { method: 'PUT', pathname: shootingTargetPath },
      consumed: true,
      held: true,
    });
    assert.equal(upstream.getRequests(), 0, 'held Shooting save must not reach upstream');
    assert.equal(proxy.releaseHeld('reject'), true);
    assert.equal((await pending).status, 503);
    assert.equal(proxy.releaseHeld('forward'), false, 'hold can be released once only');
  });

  await withProxy({
    profile: 'shooting_hold_once',
    shootingFixtureManifestPath: manifestPath,
  }, async ({ proxy, upstream }) => {
    const pending = request(proxy.origin, shootingTargetPath);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(proxy.releaseHeld('forward'), true);
    assert.equal((await pending).status, 200);
    assert.equal(upstream.getRequests(), 1, 'released Shooting save must forward exactly once');
  });

  await withProxy({ profile: 'reject_once' }, async ({ proxy, upstream }) => {
    assert.equal((await request(proxy.origin, shootingTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'production profile must not match Shooting target');
  });

  await withProxy({
    profile: 'shooting_reject_once',
    shootingFixtureManifestPath: manifestPath,
  }, async ({ proxy, upstream }) => {
    assert.equal((await request(proxy.origin, productionTargetPath)).status, 200);
    assert.equal(upstream.getRequests(), 1, 'shooting profile must not match Production target');
  });

  await assert.rejects(
    () => startFailureInjectionProxy({
      profile: 'shooting_reject_once',
      upstreamOrigin: 'http://127.0.0.1:1',
    }),
    /requires a fixture manifest path/,
  );

  const invalidManifestPath = path.join(manifestDirectory, 'invalid-fixture.json');
  await writeFile(invalidManifestPath, JSON.stringify({
    shootingGracefulDispose: { shootingId, allowedPath: '/api/workflow/shooting/999' },
  }), 'utf8');
  await assert.rejects(
    () => startFailureInjectionProxy({
      profile: 'shooting_reject_once',
      upstreamOrigin: 'http://127.0.0.1:1',
      shootingFixtureManifestPath: invalidManifestPath,
    }),
    /target path does not match shootingId/,
  );

  await assert.rejects(
    () => startFailureInjectionProxy({
      profile: 'passthrough',
      upstreamOrigin: 'http://127.0.0.1:1',
      environment: 'production',
    }),
    /cannot run in production/,
  );
} finally {
  await rm(manifestDirectory, { recursive: true, force: true });
}

process.stdout.write('failure-injection-proxy tests passed\n');

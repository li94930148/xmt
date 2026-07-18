import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PRODUCTION_TARGET = Object.freeze({
  method: 'PUT',
  pathname: '/api/workflow/production/85',
});

const PRODUCTION_PROFILES = new Set(['passthrough', 'reject_once', 'timeout_once']);
const SHOOTING_PROFILES = new Set([
  'shooting_passthrough',
  'shooting_reject_once',
  'shooting_timeout_once',
  'shooting_hold_once',
]);
const PROFILES = new Set([...PRODUCTION_PROFILES, ...SHOOTING_PROFILES]);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const HOLD_RELEASE_PREFIX = '/__failure-injection/release/';

function assertLocalUpstream(upstreamOrigin) {
  const upstream = new URL(upstreamOrigin);
  if (upstream.protocol !== 'http:' || !LOCAL_HOSTS.has(upstream.hostname)) {
    throw new Error('Failure injection proxy upstream must be a local http origin');
  }
  return upstream;
}

function assertProfile(profile) {
  if (!PROFILES.has(profile)) {
    throw new Error(`Unsupported failure injection profile: ${profile}`);
  }
}

function isShootingProfile(profile) {
  return SHOOTING_PROFILES.has(profile);
}

async function loadShootingTarget(shootingFixtureManifestPath) {
  if (typeof shootingFixtureManifestPath !== 'string' || shootingFixtureManifestPath.trim() === '') {
    throw new Error('Shooting failure profile requires a fixture manifest path');
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(shootingFixtureManifestPath, 'utf8'));
  } catch {
    throw new Error('Shooting failure fixture manifest is missing or invalid');
  }

  const fixture = manifest?.shootingGracefulDispose;
  const shootingId = fixture?.shootingId;
  if (!Number.isInteger(shootingId) || shootingId <= 0) {
    throw new Error('Shooting failure fixture manifest has an invalid shootingId');
  }

  const pathname = `/api/workflow/shooting/${shootingId}`;
  if (fixture.allowedPath !== pathname) {
    throw new Error('Shooting failure fixture manifest target path does not match shootingId');
  }

  return Object.freeze({ method: 'PUT', pathname });
}

async function resolveTarget(profile, shootingFixtureManifestPath) {
  if (isShootingProfile(profile)) {
    return loadShootingTarget(shootingFixtureManifestPath);
  }
  return PRODUCTION_TARGET;
}

function isRejectProfile(profile) {
  return profile === 'reject_once' || profile === 'shooting_reject_once';
}

function isTimeoutProfile(profile) {
  return profile === 'timeout_once' || profile === 'shooting_timeout_once';
}

function isHoldProfile(profile) {
  return profile === 'shooting_hold_once';
}

function isTargetRequest(request, target) {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  return request.method === target.method && requestUrl.pathname === target.pathname;
}

function sendInjectedResponse(response, statusCode) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify({ error: 'E2E failure injection' }));
}

function forwardRequest(request, response, upstream) {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  const upstreamRequest = http.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port || 80,
    method: request.method,
    path: `${requestUrl.pathname}${requestUrl.search}`,
    headers: {
      ...request.headers,
      host: upstream.host,
    },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstreamRequest.on('error', () => {
    if (!response.headersSent) sendInjectedResponse(response, 502);
  });

  request.pipe(upstreamRequest);
}

/**
 * Local-only E2E proxy for deterministic persistence failure testing.
 * It deliberately never reads, stores, or logs request bodies or headers.
 */
export async function startFailureInjectionProxy({
  profile = 'passthrough',
  upstreamOrigin,
  port = 0,
  timeoutBudgetMs = 1500,
  timeoutDelayMs = 1600,
  environment = process.env.NODE_ENV,
  shootingFixtureManifestPath,
} = {}) {
  if (environment === 'production') {
    throw new Error('Failure injection proxy cannot run in production');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Failure injection proxy port must be a valid TCP port');
  }
  if (!Number.isFinite(timeoutBudgetMs) || !Number.isFinite(timeoutDelayMs) || timeoutDelayMs <= timeoutBudgetMs) {
    throw new Error('timeout_once delay must exceed the test timeout budget');
  }

  assertProfile(profile);
  const upstream = assertLocalUpstream(upstreamOrigin);
  const target = await resolveTarget(profile, shootingFixtureManifestPath);
  let consumed = false;
  let heldRequest = null;

  const releaseHeld = (outcome) => {
    if (!heldRequest) return false;
    const pending = heldRequest;
    heldRequest = null;
    if (outcome === 'forward') {
      forwardRequest(pending.request, pending.response, upstream);
    } else {
      sendInjectedResponse(pending.response, 503);
    }
    return true;
  };

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'POST' && requestUrl.pathname.startsWith(HOLD_RELEASE_PREFIX)) {
      const outcome = requestUrl.pathname.slice(HOLD_RELEASE_PREFIX.length);
      if (outcome !== 'reject' && outcome !== 'forward') {
        sendInjectedResponse(response, 404);
        return;
      }
      if (!releaseHeld(outcome)) {
        sendInjectedResponse(response, 409);
        return;
      }
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
      return;
    }

    if (!consumed && isTargetRequest(request, target)) {
      if (isRejectProfile(profile)) {
        consumed = true;
        sendInjectedResponse(response, 503);
        return;
      }
      if (isTimeoutProfile(profile)) {
        consumed = true;
        setTimeout(() => sendInjectedResponse(response, 504), timeoutDelayMs);
        return;
      }
      if (isHoldProfile(profile)) {
        consumed = true;
        heldRequest = { request, response };
        return;
      }
    }

    forwardRequest(request, response, upstream);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise((resolve) => server.close(resolve));
    throw new Error('Failure injection proxy did not bind a TCP address');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => {
      if (heldRequest) heldRequest.response.destroy();
      return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
    releaseHeld,
    getState: () => ({ profile, target: { ...target }, consumed, held: heldRequest !== null }),
  };
}

async function runFromCommandLine() {
  const proxy = await startFailureInjectionProxy({
    profile: process.env.FAILURE_INJECTION_PROFILE ?? 'passthrough',
    upstreamOrigin: process.env.FAILURE_INJECTION_UPSTREAM,
    port: Number(process.env.FAILURE_INJECTION_PORT ?? 0),
    timeoutBudgetMs: Number(process.env.FAILURE_INJECTION_TIMEOUT_MS ?? 1500),
    timeoutDelayMs: Number(process.env.FAILURE_INJECTION_DELAY_MS ?? 1600),
    shootingFixtureManifestPath: process.env.SHOOTING_FAILURE_FIXTURE_MANIFEST,
  });

  // This startup line deliberately contains no request metadata or credentials.
  process.stdout.write(`Failure injection proxy listening at ${proxy.origin}\n`);
  const close = async () => {
    await proxy.close();
    process.exitCode = 0;
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromCommandLine().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

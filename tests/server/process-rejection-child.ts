import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUnhandledRejectionHandler } from '../../api/middleware/process-failure.js';
import { getProcessReadiness, markProcessUnhealthy } from '../../api/middleware/process-health.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'process-error-contract-test-secret';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-process-error-contract-'));
process.env.XMT_DB_PATH = path.join(directory, 'isolated.db');

const { forceCloseServerConnections, server, shutdownServer } = await import('../../api/app.js');
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind');

if (process.env.XMT_TEST_SHUTDOWN_MODE === 'SIGTERM') {
  server.once('close', () => {
    process.stdout.write(`${JSON.stringify({
      event: 'signal_shutdown_complete',
      readiness: getProcessReadiness(),
      listening: server.listening,
    })}\n`);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  process.emit('SIGTERM');
} else if (process.env.XMT_TEST_SHUTDOWN_MODE === 'FORCED_TIMEOUT') {
  server.once('close', () => {
    process.stdout.write(`${JSON.stringify({
      event: 'forced_shutdown_complete',
      readiness: getProcessReadiness(),
      listening: server.listening,
    })}\n`);
    fs.rmSync(directory, { recursive: true, force: true });
    process.exitCode = 1;
  });
  forceCloseServerConnections();
} else {

const handleUnhandledRejection = createUnhandledRejectionHandler({
  markUnhealthy: markProcessUnhealthy,
  log: (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
  shutdown: async () => {
    const healthResponse = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    await shutdownServer('UNHANDLED_REJECTION');
    process.stdout.write(`${JSON.stringify({
      event: 'shutdown_complete',
      readiness: getProcessReadiness(),
      healthStatus: healthResponse.status,
      listening: server.listening,
    })}\n`);
    fs.rmSync(directory, { recursive: true, force: true });
  },
  setExitCode: (code) => { process.exitCode = code; },
});

process.on('unhandledRejection', (reason) => {
  void handleUnhandledRejection(reason);
});

void Promise.reject(Object.assign(new Error('sensitive token value'), { token: 'SENSITIVE_TOKEN_VALUE', name: 'SENSITIVE_TOKEN_VALUE' }));
}

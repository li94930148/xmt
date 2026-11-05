import { loadRuntimeEnvironment } from './config/runtime-env-loader.js';
import { assertProductionTokenEncryptionKeyConfigured } from './config/token-encryption.js';
import { createUnhandledRejectionHandler } from './middleware/process-failure.js';
import { markProcessUnhealthy } from './middleware/process-health.js';

function writeProcessFailure(record: Record<string, unknown>) {
  console.error(JSON.stringify(record));
}

process.on('uncaughtException', (error) => {
  writeProcessFailure({
    level: 'fatal',
    module: 'server',
    operation: 'uncaught_exception',
    error: { code: 'UNCAUGHT_EXCEPTION', name: error instanceof Error && error.name ? error.name : 'UnknownError' },
  });
  process.exit(1);
});

const handleUnhandledRejection = createUnhandledRejectionHandler({
  markUnhealthy: markProcessUnhealthy,
  log: writeProcessFailure,
  shutdown: async () => {
    const { shutdownServer } = await import('./app.js');
    await shutdownServer('UNHANDLED_REJECTION');
  },
  setExitCode: (code) => { process.exitCode = code; },
});

let rejectionShutdownDeadline: NodeJS.Timeout | null = null;
process.on('unhandledRejection', (reason) => {
  if (!rejectionShutdownDeadline) {
    rejectionShutdownDeadline = setTimeout(() => {
      writeProcessFailure({
        level: 'fatal',
        module: 'server',
        operation: 'unhandled_rejection_shutdown_timeout',
        error: { code: 'FATAL_SHUTDOWN_TIMEOUT', name: 'TimeoutError' },
      });
      void import('./app.js').then(({ forceCloseServerConnections }) => {
        forceCloseServerConnections();
      }).catch(() => {
        writeProcessFailure({
          level: 'fatal',
          module: 'server',
          operation: 'forced_shutdown_failed',
          error: { code: 'FORCED_SHUTDOWN_FAILED', name: 'UnknownError' },
        });
      }).then(() => {
        process.exitCode = 1;
      });
    }, 15_000);
    rejectionShutdownDeadline.unref();
  }
  void handleUnhandledRejection(reason);
});

async function bootstrap() {
  // Auth rollout configuration is a startup snapshot. Load its authoritative
  // source before importing app.ts and any module that reads that snapshot.
  loadRuntimeEnvironment();
  assertProductionTokenEncryptionKeyConfigured();
  const { startServer } = await import('./app.js');
  await startServer();
}

bootstrap().catch((error) => {
  writeProcessFailure({
    level: 'fatal',
    module: 'server',
    operation: 'startup_failed',
    error: { code: 'SERVER_STARTUP_FAILED', name: error instanceof Error && error.name ? error.name : 'UnknownError' },
  });
  process.exitCode = 1;
  void import('./app.js').then(({ shutdownServer }) => shutdownServer('STARTUP_FAILED')).catch(() => undefined);
});

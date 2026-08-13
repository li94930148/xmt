import { loadRuntimeEnvironment } from './config/runtime-env-loader.js';

process.on('uncaughtException', (error) => {
  console.error('[Fatal] uncaughtException', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] unhandledRejection', reason);
  process.exit(1);
});

async function bootstrap() {
  // Auth rollout configuration is a startup snapshot. Load its authoritative
  // source before importing app.ts and any module that reads that snapshot.
  loadRuntimeEnvironment();
  const { startServer } = await import('./app.js');
  await startServer();
}

bootstrap().catch((error) => {
  console.error('[Fatal] server startup failed', error);
  process.exit(1);
});

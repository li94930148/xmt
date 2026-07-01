import 'dotenv/config';
import { startServer } from './app.js';

process.on('uncaughtException', (error) => {
  console.error('[Fatal] uncaughtException', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] unhandledRejection', reason);
  process.exit(1);
});

startServer().catch((error) => {
  console.error('[Fatal] server startup failed', error);
  process.exit(1);
});

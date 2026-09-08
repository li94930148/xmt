/**
 * Vercel deploy entry handler. Only Node HTTP types are needed by this adapter.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import app from './app.js';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}

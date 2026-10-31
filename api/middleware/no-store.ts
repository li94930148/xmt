import type { RequestHandler } from 'express';

export const noStoreResponse: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  }
  const status = err.status || 500;
  if (status >= 500) logger.error(`[${req.id}]`, err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(err.details && { details: err.details }),
    requestId: req.id,
  });
}

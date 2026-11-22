import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** Routes only the Python service may call (NFR-6: shared X-Internal-Key). */
export function requireInternalKey(req, _res, next) {
  const given = Buffer.from(req.get('x-internal-key') ?? '');
  const expected = Buffer.from(env.INTERNAL_API_KEY);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return next(ApiError.unauthorized('Invalid internal key'));
  next();
}

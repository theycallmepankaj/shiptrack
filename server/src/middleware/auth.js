import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/** Requires a valid `Authorization: Bearer <access token>`; sets req.user = { id, role, name }. */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized('Missing access token'));
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, name: payload.name, sid: payload.sid };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}

/** requireRole('admin') or requireRole('driver', 'admin'). Use after requireAuth. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden('You do not have access to this resource'));
    next();
  };

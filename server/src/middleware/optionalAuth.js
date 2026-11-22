import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/** Like requireAuth, but guests (no header) pass through with req.user = null. A bad token is still rejected. */
export function optionalAuth(req, _res, next) {
  const header = req.get('authorization');
  req.user = null;
  if (!header) return next();
  const [scheme, token] = header.split(' ');
  try {
    if (scheme !== 'Bearer' || !token) throw new Error('bad scheme');
    const p = verifyAccessToken(token);
    req.user = { id: p.sub, role: p.role, name: p.name };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}

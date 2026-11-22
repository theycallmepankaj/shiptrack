import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';

export const ACCESS_TTL = '15m';
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE = 'st_refresh';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const MAX_SESSIONS = 10; // per user; the oldest sign-in drops off

export function signAccessToken(user, sid) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, name: user.name, ...(sid && { sid }) }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

export function signRefreshToken(user, sid) {
  // sid names the session (device); jti makes every token unique so rotation can detect reuse.
  return jwt.sign({ sub: user._id.toString(), sid, jti: randomToken(8) }, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL_MS / 1000,
  });
}

export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);
export const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);

export const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd || env.NODE_ENV === 'development', // browsers treat http://localhost as secure
  sameSite: isProd ? 'none' : 'lax', // client and API live on different sites in production
  path: '/api/auth',
  maxAge: REFRESH_TTL_MS,
};

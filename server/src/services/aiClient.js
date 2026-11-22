import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Calls the Python AI service with the shared internal key (NFR-6). Throws on any failure
 * or timeout so every caller can fall back to its local logic.
 */
export async function callAi(path, body, { timeoutMs = 1500, method = 'POST', returnErrorBody = false } = {}) {
  const res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-internal-key': env.INTERNAL_API_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`AI service ${path} responded ${res.status}`);
    err.status = res.status;
    if (returnErrorBody) err.detail = (await res.json().catch(() => ({}))).detail;
    throw err;
  }
  return res.json();
}

/** Logs (in development) why we fell back, without failing the request. */
export function aiFallback(what, err) {
  if (env.NODE_ENV === 'development') logger.warn(`${what}: AI service unavailable, using fallback (${err.message})`);
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

// NFR-7: every request gets an id (or keeps the caller's), echoed in X-Request-Id, written in the
// access log, and forwarded to the AI service so one id follows a request across both services.
const store = new AsyncLocalStorage();
const VALID = /^[\w.-]{1,100}$/;

export function requestId(req, res, next) {
  const given = req.get('x-request-id');
  req.id = given && VALID.test(given) ? given : randomUUID();
  res.set('x-request-id', req.id);
  store.run({ id: req.id }, next);
}

/** The id of the request being handled (undefined outside one, e.g. socket events). */
export const currentRequestId = () => store.getStore()?.id;

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// FR-10 via Nominatim, called server-side so we can cache results and respect the
// public instance's usage policy (≤ 1 request/second, identifying User-Agent).
const MIN_GAP_MS = 1100;
const CACHE_MAX = 500;
const cache = new Map();
let queue = Promise.resolve();
let lastCall = 0;

function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

async function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const value = await throttled(fn);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

async function nominatim(path, params) {
  const url = new URL(path, env.GEOCODER_URL);
  for (const [k, v] of Object.entries({ format: 'jsonv2', addressdetails: 1, ...params })) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': env.GEOCODER_USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new ApiError(503, 'Address search is unavailable right now. Please try again.');
  }
  if (!res.ok) throw new ApiError(503, 'Address search is unavailable right now. Please try again.');
  return res.json();
}

export function toPlace(r) {
  const a = r.address ?? {};
  const city = a.city || a.town || a.village || a.suburb || a.state_district || a.county || a.state || '';
  return { label: r.display_name, city, lat: Number(r.lat), lng: Number(r.lon) };
}

export function searchAddress(q) {
  const query = q.trim().replace(/\s+/g, ' ');
  return cached(`s:${query.toLowerCase()}`, async () => {
    const results = await nominatim('/search', { q: query, limit: 5, countrycodes: env.GEOCODER_COUNTRY });
    return results.map(toPlace);
  });
}

export function reverseGeocode(lat, lng) {
  const key = `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
  return cached(key, async () => {
    const r = await nominatim('/reverse', { lat, lon: lng, zoom: 18 });
    if (r.error) throw ApiError.notFound('No address found at that point');
    return toPlace(r);
  });
}

export const _clearGeocodeCache = () => cache.clear();

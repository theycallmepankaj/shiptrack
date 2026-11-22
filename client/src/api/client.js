import axios from 'axios';

// VITE_API_URL=/ means "same origin" (production: Vercel proxies /api to the API, so the
// refresh cookie is first-party). Otherwise the API's full origin.
const baseURL = `${(import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '')}/api`;

// The access token lives only in memory (never localStorage); the refresh token is an httpOnly cookie.
let accessToken = null;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

export const api = axios.create({ baseURL, withCredentials: true });

let refreshPromise = null;
/** One shared in-flight refresh, so parallel 401s don't rotate the refresh token twice. */
export function refreshSession() {
  refreshPromise ??= axios
    .post(`${baseURL}/auth/refresh`, null, { withCredentials: true })
    .then(({ data }) => {
      setAccessToken(data.accessToken);
      return data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

const NO_RETRY = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    if (response?.status !== 401 || !config || config._retry || NO_RETRY.some((p) => config.url?.startsWith(p))) {
      throw error;
    }
    config._retry = true;
    try {
      await refreshSession();
    } catch {
      setAccessToken(null);
      window.dispatchEvent(new Event('auth:expired'));
      throw error;
    }
    return api(config);
  },
);

/** Human-readable message + per-field errors from an API error. */
export function parseApiError(err) {
  const data = err?.response?.data;
  if (!err?.response) return { message: 'Can’t reach the server. Check your connection and try again.', fields: {} };
  const fields = Object.fromEntries(Object.entries(data?.details ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return { message: data?.error ?? 'Something went wrong', fields };
}

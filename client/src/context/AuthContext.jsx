import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, refreshSession, setAccessToken } from '@/api/client';

const AuthContext = createContext(null);

// Not a credential: just "this browser may have a session cookie". The cookie itself is httpOnly.
const HINT = 'st_signed_in';
function hint(value) {
  try {
    if (value === undefined) return localStorage.getItem(HINT) === '1';
    if (value) localStorage.setItem(HINT, '1');
    else localStorage.removeItem(HINT);
  } catch {
    return true; // storage blocked: fall back to always trying the cookie
  }
  return value;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'guest'

  const startSession = useCallback((data) => {
    hint(true);
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const endSession = useCallback(() => {
    hint(false);
    setAccessToken(null);
    setUser(null);
    setStatus('guest');
  }, []);

  // Restore the session from the refresh cookie on first load — only if this browser has
  // signed in before, so first-time visitors don't make a request that's bound to fail.
  useEffect(() => {
    if (!hint()) {
      endSession();
      return;
    }
    refreshSession()
      .then((data) => {
        setUser(data.user);
        setStatus('authenticated');
      })
      .catch(endSession);
  }, [endSession]);

  // The Axios interceptor fires this when a refresh fails mid-session.
  useEffect(() => {
    const onExpired = () => {
      endSession();
      toast.error('Your session has expired. Please log in again.');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [endSession]);

  const login = useCallback(
    async (email, password) => startSession((await api.post('/auth/login', { email, password })).data),
    [startSession],
  );
  const register = useCallback(async (form) => startSession((await api.post('/auth/register', form)).data), [startSession]);
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* the session is cleared locally either way */
    }
    endSession();
  }, [endSession]);

  const value = useMemo(() => ({ user, status, login, register, logout }), [user, status, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

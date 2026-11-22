import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

const ThemeContext = createContext(null);
const QUERY = '(prefers-color-scheme: dark)';
const KEY = 'theme';
const listeners = new Set();

function readStored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function subscribe(onChange) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  listeners.add(onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    listeners.delete(onChange);
  };
}
// Saved choice, else the system setting (§11.1). The prerendered page assumes "light"; the inline
// script in index.html has already set the real class on <html> before first paint.
const snapshot = () => readStored() ?? (window.matchMedia(QUERY).matches ? 'dark' : 'light');

export function ThemeProvider({ children }) {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggle = useCallback(() => {
    const next = snapshot() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: applies until reload */
      document.documentElement.classList.toggle('dark', next === 'dark');
    }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);

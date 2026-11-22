import { useSyncExternalStore } from 'react';

/**
 * Live `matchMedia` result. Hydration-safe: while React adopts the prerendered landing page it
 * uses `serverValue` (what the prerender assumed), then re-renders with the real value.
 */
export function useMediaQuery(query, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

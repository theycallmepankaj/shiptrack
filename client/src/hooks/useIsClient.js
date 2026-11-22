import { useSyncExternalStore } from 'react';

const noop = () => () => {};
/** false during the prerender and while hydrating it, true after — for browser-only UI. */
export const useIsClient = () => useSyncExternalStore(noop, () => true, () => false);

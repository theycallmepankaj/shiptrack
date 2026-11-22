import { useEffect, useState } from 'react';
import { api, parseApiError } from '@/api/client';

/** Live quote (FR-11/12): refetches, debounced, whenever the route or package changes. */
export function useQuote({ pickup, drop, weightKg, dimensions }) {
  const [state, setState] = useState({ data: null, loading: false, error: '' });
  const dimsKey = dimensions ? `${dimensions.l}x${dimensions.w}x${dimensions.h}` : '';
  const ready = pickup && drop && weightKg > 0;

  useEffect(() => {
    if (!ready) {
      setState({ data: null, loading: false, error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    const t = setTimeout(async () => {
      try {
        const { data } = await api.post(
          '/shipments/quote',
          { pickup: { lat: pickup.lat, lng: pickup.lng }, drop: { lat: drop.lat, lng: drop.lng }, package: { weightKg, ...(dimensions && { dimensions }) } },
          { signal: controller.signal },
        );
        setState({ data, loading: false, error: '' });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: parseApiError(err).message });
      }
    }, 400);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, weightKg, dimsKey]);

  return state;
}

import { aiFallback, callAi } from './aiClient.js';
import { haversineKm, ROAD_FACTOR } from './pricing.js';

/**
 * Greedy nearest-neighbour fallback with pickup-before-drop: a shipment's drop is only
 * eligible once its pickup (if it's in the list) has been visited.
 * stops: [{ id, lat, lng, kind, shipmentId }] → same objects, ordered.
 */
export function orderStops(start, stops) {
  const remaining = [...stops];
  const ordered = [];
  const pendingPickups = new Set(stops.filter((s) => s.kind === 'pickup').map((s) => s.shipmentId));
  let here = start ?? remaining[0];
  while (remaining.length) {
    const eligible = remaining.filter((s) => !(s.kind === 'drop' && pendingPickups.has(s.shipmentId)));
    let best = eligible[0];
    for (const s of eligible) if (haversineKm(here, s) < haversineKm(here, best)) best = s;
    remaining.splice(remaining.indexOf(best), 1);
    if (best.kind === 'pickup') pendingPickups.delete(best.shipmentId);
    ordered.push(best);
    here = best;
  }
  return ordered;
}

export function routeKm(start, ordered) {
  let km = 0;
  let here = start ?? ordered[0];
  for (const s of ordered) {
    km += haversineKm(here, s) * ROAD_FACTOR;
    here = s;
  }
  return Math.round(km * 10) / 10;
}

/**
 * FR-26/42: best visiting order from the OR-Tools optimiser in the Python service,
 * falling back to the greedy order above. Returns { ordered, totalKm, solver }.
 */
export async function optimizeRoute(start, stops) {
  if (stops.length > 1 && start) {
    try {
      const data = await callAi(
        '/route/optimize',
        { start, stops: stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, kind: s.kind, shipment_id: s.shipmentId })), time_limit_ms: 800 },
        { timeoutMs: 2500 },
      );
      const byId = new Map(stops.map((s) => [s.id, s]));
      const ordered = data.order.map((id) => byId.get(id));
      if (ordered.length === stops.length && ordered.every(Boolean)) return { ordered, totalKm: data.total_km, solver: data.solver };
    } catch (err) {
      aiFallback('Route optimisation', err);
    }
  }
  const ordered = orderStops(start, stops);
  return { ordered, totalKm: routeKm(start, ordered), solver: 'greedy' };
}

/** Where the driver needs to go next for a shipment: the pickup until collected, then the drop. */
export function nextStopOf(s) {
  const kind = s.status === 'ASSIGNED' ? 'pickup' : 'drop';
  const stop = s[kind]?.toObject?.() ?? s[kind]; // Mongoose subdocuments don't spread
  return { kind, ...stop };
}

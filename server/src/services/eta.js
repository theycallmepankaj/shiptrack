import { aiFallback, callAi } from './aiClient.js';

/** Distance-based fallback — the same formula the Python service uses without a trained model (FR-41). */
export function fallbackEtaHours(distanceKm, speed) {
  return speed === 'express' ? 4 + distanceKm / 55 : 18 + distanceKm / 35;
}

const IST_OFFSET_MS = 5.5 * 3600_000;
export const DELIVERY_WINDOW = { startHour: 9, endHour: 21 }; // IST

/**
 * Couriers deliver 9:00–21:00 IST. An estimate that lands outside the window moves to the
 * next morning: 9:00 plus a little of the overflow (capped at 3 h), so later estimates still
 * land later but overnight hours aren't counted as working time.
 */
export const OVERFLOW_CAP_H = 3;
export function alignToDeliveryWindow(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS); // read UTC fields as IST wall-clock
  const hour = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  const { startHour, endHour } = DELIVERY_WINDOW;
  if (hour >= startHour && hour < endHour) return date;
  const overflowH = hour >= endHour ? hour - endHour : hour + 24 - endHour;
  const morning = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (hour >= endHour ? 1 : 0), startHour));
  return new Date(morning.getTime() - IST_OFFSET_MS + Math.min(overflowH / 4, OVERFLOW_CAP_H) * 3600_000);
}

function istParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', weekday: 'short', hour12: false }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find((p) => p.type === 'weekday').value);
  return { hour, weekday };
}

/**
 * FR-12: asks the Python ETA service (trained model, M7); if it's down or slow, falls back to the formula.
 * Returns { hours, estimatedDeliveryAt, source }.
 */
export async function predictEta({ distanceKm, weightKg, speed, city, dropCity, at = new Date() }) {
  const { hour, weekday } = istParts(at);
  let hours;
  let source = 'fallback';
  try {
    const data = await callAi('/eta', { distance_km: distanceKm, weight_kg: weightKg, speed, hour, weekday, city: city ?? '', drop_city: dropCity ?? city ?? '' });
    hours = data.eta_hours;
    source = data.source; // 'model' once trained (Milestone 7), else 'formula'
  } catch (err) {
    aiFallback('ETA', err);
    hours = fallbackEtaHours(distanceKm, speed);
  }
  const estimatedDeliveryAt = alignToDeliveryWindow(new Date(at.getTime() + hours * 3600_000));
  return { hours: Math.round(((estimatedDeliveryAt - at) / 3600_000) * 10) / 10, estimatedDeliveryAt, source };
}

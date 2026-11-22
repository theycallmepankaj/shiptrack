import { computePrice, DEFAULT_RULE, haversineKm, roadDistanceKm, volumetricWeightKg } from '../src/services/pricing.js';
import { alignToDeliveryWindow, fallbackEtaHours } from '../src/services/eta.js';

const MUMBAI = { lat: 19.076, lng: 72.8777 };
const PUNE = { lat: 18.5204, lng: 73.8567 };

describe('pricing (FR-11)', () => {
  it('computes haversine distance', () => {
    expect(haversineKm(MUMBAI, PUNE)).toBeGreaterThan(115);
    expect(haversineKm(MUMBAI, PUNE)).toBeLessThan(125);
    expect(roadDistanceKm(MUMBAI, PUNE)).toBeCloseTo(haversineKm(MUMBAI, PUNE) * 1.3, 0);
  });

  it('prices base + distance + weight', () => {
    const p = computePrice({ distanceKm: 100, weightKg: 2, speed: 'standard' });
    expect(p).toMatchObject({ base: 40, distanceCharge: 120, weightCharge: 30, speedCharge: 0, total: 190, currency: 'INR' });
  });

  it('applies the express multiplier to the subtotal', () => {
    const p = computePrice({ distanceKm: 100, weightKg: 2, speed: 'express' });
    expect(p.speedCharge).toBeCloseTo(190 * 0.6);
    expect(p.total).toBe(304);
  });

  it('charges the larger of actual and volumetric weight, min 0.5 kg', () => {
    expect(volumetricWeightKg({ l: 50, w: 40, h: 30 })).toBe(12);
    expect(computePrice({ distanceKm: 10, weightKg: 1, dimensions: { l: 50, w: 40, h: 30 }, speed: 'standard' }).chargeableWeightKg).toBe(12);
    expect(computePrice({ distanceKm: 10, weightKg: 0.1, speed: 'standard' }).chargeableWeightKg).toBe(0.5);
  });

  it('uses a custom rule', () => {
    const p = computePrice({ distanceKm: 10, weightKg: 1, speed: 'standard' }, { ...DEFAULT_RULE, baseFare: 100, perKm: 2, perKg: 10 });
    expect(p.total).toBe(130);
  });

  it('express ETA fallback is faster than standard', () => {
    expect(fallbackEtaHours(70, 'express')).toBeLessThan(fallbackEtaHours(70, 'standard'));
    expect(fallbackEtaHours(70, 'standard')).toBe(20);
  });
});

describe('delivery window (9:00–21:00 IST)', () => {
  const ist = (iso) => new Date(`${iso}+05:30`);
  it('keeps daytime estimates', () => {
    expect(alignToDeliveryWindow(ist('2026-11-23T15:00:00'))).toEqual(ist('2026-11-23T15:00:00'));
  });
  it('moves late-night estimates to the next morning, later ones a little later', () => {
    expect(alignToDeliveryWindow(ist('2026-11-23T23:00:00'))).toEqual(ist('2026-11-24T09:30:00')); // 2 h over → +30 min
    expect(alignToDeliveryWindow(ist('2026-11-24T05:00:00'))).toEqual(ist('2026-11-24T11:00:00')); // 8 h over → +2 h
    expect(alignToDeliveryWindow(ist('2026-11-24T08:30:00'))).toEqual(ist('2026-11-24T11:52:30')); // capped near +3 h
  });
  it('moves early-morning estimates later the same day', () => {
    expect(alignToDeliveryWindow(ist('2026-11-24T06:00:00')).getTime()).toBeGreaterThanOrEqual(ist('2026-11-24T09:00:00').getTime());
    expect(alignToDeliveryWindow(ist('2026-11-24T06:00:00')).getTime()).toBeLessThan(ist('2026-11-24T21:00:00').getTime());
  });
});

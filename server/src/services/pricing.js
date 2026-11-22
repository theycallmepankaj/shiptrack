import { PricingRule } from '../models/PricingRule.js';

export const DEFAULT_RULE = Object.freeze({ baseFare: 40, perKm: 1.2, perKg: 15, expressMultiplier: 1.6 });
export const ROAD_FACTOR = 1.3; // straight-line → approximate road distance
export const VOLUMETRIC_DIVISOR = 5000; // cm³ per kg, courier industry standard

const round2 = (n) => Math.round(n * 100) / 100;

/** Great-circle distance in km between { lat, lng } points. */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const roadDistanceKm = (a, b) => Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10;

export function volumetricWeightKg(dimensions) {
  if (!dimensions?.l || !dimensions?.w || !dimensions?.h) return 0;
  return (dimensions.l * dimensions.w * dimensions.h) / VOLUMETRIC_DIVISOR;
}

/**
 * FR-11: price = base fare + distance × per-km + chargeable weight × per-kg, × express multiplier.
 * Chargeable weight is the larger of actual and volumetric weight (min 0.5 kg).
 */
export function computePrice({ distanceKm, weightKg, dimensions, speed }, rule = DEFAULT_RULE) {
  const chargeableWeightKg = round2(Math.max(0.5, weightKg, volumetricWeightKg(dimensions)));
  const base = rule.baseFare;
  const distanceCharge = round2(distanceKm * rule.perKm);
  const weightCharge = round2(chargeableWeightKg * rule.perKg);
  const subtotal = base + distanceCharge + weightCharge;
  const speedCharge = speed === 'express' ? round2(subtotal * (rule.expressMultiplier - 1)) : 0;
  return {
    base,
    distanceCharge,
    weightCharge,
    speedCharge,
    chargeableWeightKg,
    total: Math.round(subtotal + speedCharge),
    currency: 'INR',
  };
}

export async function getActiveRule() {
  const rule = await PricingRule.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();
  return rule ?? DEFAULT_RULE;
}

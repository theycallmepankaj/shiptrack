import { z } from 'zod';
import { PACKAGE_TYPES, SPEEDS } from '../models/Shipment.js';

// Service area: India (international shipping is out of scope for v1).
const IN_BOUNDS = { minLat: 6, maxLat: 37.5, minLng: 68, maxLng: 97.5 };
const outsideMsg = 'We currently deliver within India only';

export const point = z
  .object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) })
  .refine((p) => p.lat >= IN_BOUNDS.minLat && p.lat <= IN_BOUNDS.maxLat && p.lng >= IN_BOUNDS.minLng && p.lng <= IN_BOUNDS.maxLng, outsideMsg);

const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,16}$/, 'Enter a valid phone number');

const stop = z.object({
  address: z.string().trim().min(5, 'Enter the full address').max(300),
  city: z.string().trim().max(80).optional().default(''),
  lat: point.innerType().shape.lat,
  lng: point.innerType().shape.lng,
  contactName: z.string().trim().min(2, 'Enter a contact name').max(80),
  contactPhone: phone,
});

const dimension = z.coerce.number().positive().max(150, 'Max 150 cm per side');

export const packageSchema = z.object({
  weightKg: z.coerce.number().min(0.1, 'Min 0.1 kg').max(50, 'Max 50 kg per parcel'),
  dimensions: z.object({ l: dimension, w: dimension, h: dimension }).optional(),
  type: z.enum(PACKAGE_TYPES),
  description: z.string().trim().max(200).optional(),
});

const quotePoint = z.intersection(point, z.object({ city: z.string().trim().max(80).optional() }));
export const quoteSchema = z.object({
  pickup: quotePoint,
  drop: quotePoint,
  package: packageSchema.pick({ weightKg: true, dimensions: true }),
});

export const createShipmentSchema = z
  .object({
    pickup: stop,
    drop: stop,
    package: packageSchema,
    speed: z.enum(SPEEDS),
  })
  .superRefine((v, ctx) => {
    for (const key of ['pickup', 'drop']) {
      if (!point.safeParse(v[key]).success) ctx.addIssue({ code: 'custom', path: [key], message: outsideMsg });
    }
  });

export const listMineSchema = z.object({
  status: z.enum(['all', 'active', 'delivered', 'cancelled']).default('all'),
  q: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const geoSearchSchema = z.object({ q: z.string().trim().min(3, 'Type at least 3 characters').max(200) });
export const geoReverseSchema = z.object({ lat: z.coerce.number(), lng: z.coerce.number() });

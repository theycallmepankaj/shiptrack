import { z } from 'zod';
import { password } from './auth.js';

const vehicle = z.object({
  type: z.enum(['bike', 'scooter', 'van', 'truck']),
  number: z.string().trim().toUpperCase().min(4, 'Enter the registration number').max(20),
  capacityKg: z.coerce.number().min(1).max(5000),
});
const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,16}$/, 'Enter a valid phone number');

export const createDriverSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone,
  password,
  vehicle,
});

export const updateDriverSchema = z
  .object({ name: z.string().trim().min(2).max(80), phone, isActive: z.boolean(), vehicle: vehicle.partial() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listDriversSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'active', 'inactive', 'on-duty']).default('all'),
});

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
export const listShipmentsSchema = z.object({
  status: z.string().trim().optional(), // a status, or "active" / "delayed"
  driver: z.union([objectId, z.literal('unassigned')]).optional(),
  city: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().max(20).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'price', '-price', 'promisedDeliveryAt', '-promisedDeliveryAt']).default('-createdAt'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const assignSchema = z.object({ driverId: objectId });

export const pricingSchema = z.object({
  baseFare: z.coerce.number().min(0).max(10000),
  perKm: z.coerce.number().min(0).max(1000),
  perKg: z.coerce.number().min(0).max(1000),
  expressMultiplier: z.coerce.number().min(1, 'At least 1×').max(5, 'At most 5×'),
});

export const createAdminSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone,
  password,
});
export const updateAdminSchema = z.object({ isActive: z.boolean() });

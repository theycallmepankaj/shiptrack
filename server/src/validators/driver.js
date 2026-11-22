import { z } from 'zod';

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export const dutySchema = z.object({ isOnDuty: z.boolean(), lat: lat.optional(), lng: lng.optional() });

export const FAILURE_REASONS = {
  CUSTOMER_UNAVAILABLE: 'Customer not available',
  WRONG_ADDRESS: 'Address incorrect or incomplete',
  REFUSED: 'Customer refused the parcel',
  ACCESS_ISSUE: 'Couldn’t access the location',
  OTHER: 'Other',
};

export const statusSchema = z
  .object({
    status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_ATTEMPT', 'RETURNED']),
    reason: z.enum(Object.keys(FAILURE_REASONS)).optional(),
    note: z.string().trim().max(300).optional(),
    lat: lat.optional(),
    lng: lng.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'FAILED_ATTEMPT' && !v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Choose a reason' });
    if (v.reason === 'OTHER' && !v.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Describe what happened' });
  });

export const deliverSchema = z.object({
  otp: z.string().regex(/^\d{4}$/, 'Enter the 4-digit code'),
  lat: lat.optional(),
  lng: lng.optional(),
});

export const historySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid shipment');
export const createOrderSchema = z.object({ shipmentId: objectId });
export const verifySchema = z.object({
  shipmentId: objectId,
  orderId: z.string().trim().min(6).max(64),
  paymentId: z.string().trim().min(6).max(64),
  signature: z.string().trim().min(1).max(256),
  method: z.string().trim().max(30).optional(),
});
export const failedSchema = z.object({ shipmentId: objectId, orderId: z.string().trim().min(6).max(64), reason: z.string().trim().max(200).optional() });
export const listNotificationsSchema = z.object({
  filter: z.enum(['all', 'unread']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

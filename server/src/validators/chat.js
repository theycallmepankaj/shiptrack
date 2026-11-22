import { z } from 'zod';

export const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const sessionId = z.string().regex(SESSION_ID_RE, 'Invalid chat session');

export const chatMessageSchema = z.object({
  sessionId,
  message: z.string().trim().min(1, 'Type a message').max(1000, 'Keep messages under 1000 characters'),
});

export const historySchema = z.object({ sessionId: sessionId.optional() });

export const ratingSchema = z.object({ rating: z.enum(['up', 'down']).nullable(), sessionId: sessionId.optional() });

export const ticketSchema = z.object({
  sessionId,
  messageId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  question: z.string().trim().min(5, 'Describe what you need help with').max(1000),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional(),
  name: z.string().trim().max(80).optional(),
});

export const documentSchema = z.object({ title: z.string().trim().max(120).optional() });

export const ticketUpdateSchema = z.object({ status: z.enum(['open', 'resolved']) });

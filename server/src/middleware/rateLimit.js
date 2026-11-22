import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });
export const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });

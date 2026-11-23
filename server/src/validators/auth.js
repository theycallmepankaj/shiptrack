import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email');
export const password = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters') // bcrypt limit
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email,
  phone: z.string().trim().regex(/^\+?[0-9\s-]{7,16}$/, 'Enter a valid phone number'),
  password,
});

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password') });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ password });

const phoneField = z.string().trim().regex(/^\+?[0-9\s-]{7,16}$/, 'Enter a valid phone number');
export const updateMeSchema = z
  .object({ name: z.string().trim().min(2, 'Enter your name').max(80), phone: phoneField })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: password });

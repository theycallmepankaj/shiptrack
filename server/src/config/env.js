import dotenv from 'dotenv';
import { z } from 'zod';

// Tests don't read .env: they must behave the same on every machine and in CI.
if (process.env.NODE_ENV !== 'test') dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().default('mongodb://localhost:27017/shiptrack'),
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-refresh-secret'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  INTERNAL_API_KEY: z.string().default('dev-internal-key'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('ShipTrack <no-reply@shiptrack.dev>'),
  GEOCODER_URL: z.string().default('https://nominatim.openstreetmap.org'),
  GEOCODER_USER_AGENT: z.string().default('ShipTrack/0.1 (courier tracking demo)'),
  GEOCODER_COUNTRY: z.string().default('in'),
  // This API's public origin, for uploaded file URLs (Render sets RENDER_EXTERNAL_URL itself).
  PUBLIC_URL: z.string().default(process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000'),
  OTP_SECRET: z.string().min(1).default('dev-otp-secret'),
  CLOUDINARY_URL: z.string().optional(), // cloudinary://<key>:<secret>@<cloud>; local disk when empty
  UPLOAD_DIR: z.string().default('uploads'),
  // Demo data (accounts, history, policy docs): on by default in development; set SEED_DEMO=true to seed a demo deployment.
  SEED_DEMO: z.enum(['true', 'false']).optional(),
  // How many proxies sit in front of the API (Render = 1; Render behind the Vercel /api rewrite = 2).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  // Razorpay test-mode keys (Milestone 9). Without them, development uses a built-in mock checkout.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_TIMEOUT_MIN: z.coerce.number().min(5).default(30), // unpaid bookings are cancelled after this
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
env.SEED_DEMO = env.SEED_DEMO ? env.SEED_DEMO === 'true' : env.NODE_ENV === 'development';
export const allowedOrigins = env.CLIENT_URL.split(',').map((o) => o.trim());

export const isProd = env.NODE_ENV === 'production';

if (isProd && [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.OTP_SECRET].some((s) => s.startsWith('dev-'))) {
  console.error('Set real JWT_* and OTP_SECRET values in production');
  process.exit(1);
}
if (isProd && !env.CLOUDINARY_URL) {
  console.warn('CLOUDINARY_URL is not set: uploads are stored on local disk, which most hosts (e.g. Render) wipe on every deploy');
}
if (isProd && env.INTERNAL_API_KEY.startsWith('dev-')) {
  console.error('Set a real INTERNAL_API_KEY in production (shared with the AI service)');
  process.exit(1);
}
if (isProd && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) {
  console.error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in production (the mock checkout is development-only)');
  process.exit(1);
}

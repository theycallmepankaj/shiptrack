import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { allowedOrigins, env } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import shipmentRoutes from './routes/shipments.js';
import geoRoutes from './routes/geo.js';
import driverRoutes from './routes/driver.js';
import adminRoutes from './routes/admin.js';
import pricingRoutes from './routes/pricing.js';
import chatRoutes from './routes/chat.js';
import paymentRoutes from './routes/payments.js';
import notificationRoutes from './routes/notifications.js';
import internalRoutes from './routes/internal.js';
import { uploadRoot } from './services/storage.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY); // correct client IPs for rate limiting behind Render (and Vercel's /api rewrite)

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: ['Content-Disposition'] })); // invoice file names
  app.use(
    express.json({
      limit: '1mb',
      // Webhook signatures are computed over the exact bytes received.
      verify: (req, _res, buf) => {
        if (req.originalUrl.startsWith('/api/payments/webhook')) req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') {
    morgan.token('id', (req) => req.id);
    app.use(morgan(':id :method :url :status :response-time ms'));
  }

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/shipments', shipmentRoutes);
  app.use('/api/geo', geoRoutes);
  app.use('/api/driver', driverRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/pricing', pricingRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/internal', internalRoutes); // Python service only (X-Internal-Key)

  // Locally stored proof-of-delivery images (dev; production uses Cloudinary). File names are random UUIDs.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin'); // let the client origin display them
      next();
    },
    express.static(uploadRoot(), { maxAge: '7d', fallthrough: false, dotfiles: 'deny' }),
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

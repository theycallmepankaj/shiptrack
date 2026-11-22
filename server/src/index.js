import http from 'node:http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSockets } from './sockets/index.js';
import { logger } from './utils/logger.js';
import { seedDemoAccounts, seedDemoShipments } from './utils/seedDemo.js';
import { seedHistory } from './utils/seedHistory.js';
import { seedPolicyDocs } from './utils/seedDocs.js';
import { callAi } from './services/aiClient.js';
import { expireUnpaid } from './services/payments.js';

const app = createApp();
const server = http.createServer(app);
const io = initSockets(server);
app.set('io', io);

connectDB()
  .then(async () => {
    if (env.SEED_DEMO) {
      if (env.NODE_ENV === 'production') logger.warn('SEED_DEMO=true: creating demo accounts with public passwords (demo deployments only)');
      await seedDemoAccounts();
      await seedDemoShipments();
      const seeded = await seedHistory();
      if (seeded) trainEtaModelInBackground();
      await seedPolicyDocs();
    }
  })
  .catch((err) => logger.error('Startup error:', err.message))
  .finally(() => {
    server.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));
    // Unpaid bookings never reach drivers; cancel them after PAYMENT_TIMEOUT_MIN.
    setInterval(() => expireUnpaid().catch((err) => logger.warn('Unpaid sweep failed:', err.message)), 60_000).unref();
  });

/** Dev convenience: train the ETA model once fresh history exists (Python may still be booting). */
function trainEtaModelInBackground(attempt = 1) {
  setTimeout(async () => {
    try {
      const { metrics } = await callAi('/ml/train', {}, { timeoutMs: 120_000 });
      logger.info(`ETA model trained on ${metrics.samples} deliveries — MAE ${metrics.mae_hours.gradient_boosting_p50} h (formula ${metrics.mae_hours.formula} h)`);
    } catch (err) {
      if (attempt < 6) trainEtaModelInBackground(attempt + 1);
      else logger.warn(`Couldn't train the ETA model (${err.message}). Run: cd ai-service && python -m app.ml.train_eta`);
    }
  }, attempt * 5000);
}

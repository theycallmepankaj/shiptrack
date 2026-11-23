// End-to-end tests for the main journeys. Needs MongoDB; the API and the built client are
// started automatically (or reused if already running). See README › Tests.
import { defineConfig, devices } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:5000';
const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const MONGO = process.env.E2E_MONGO_URI ?? 'mongodb://localhost:27017/shiptrack_e2e';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // journeys share the demo driver, so run them one at a time
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        {
          command: 'node src/index.js',
          cwd: '../server',
          url: `${API}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: {
            NODE_ENV: 'development', // mock checkout + demo seeding
            SEED_DEMO: 'true',
            PORT: new URL(API).port || '5000',
            MONGO_URI: MONGO,
            CLIENT_URL: WEB,
            PUBLIC_URL: API, // upload links point at this server, not a .env value
            UPLOAD_DIR: process.env.E2E_UPLOAD_DIR ?? '/tmp/shiptrack-e2e-uploads',
            AI_SERVICE_URL: process.env.E2E_AI_URL ?? 'http://127.0.0.1:9', // unreachable → Node fallbacks
            INTERNAL_API_KEY: process.env.E2E_INTERNAL_KEY ?? 'dev-internal-key',
            RAZORPAY_KEY_ID: '',
            RAZORPAY_KEY_SECRET: '',
          },
        },
        {
          command: `npm run build && npx vite preview --port ${new URL(WEB).port || 4173} --strictPort`,
          cwd: '../client',
          url: WEB,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: { VITE_API_URL: API, VITE_SOCKET_URL: API },
        },
      ],
});

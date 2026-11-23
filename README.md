# ShipTrack

Courier and delivery tracking platform: customers book and track shipments live, drivers deliver and share GPS, admins run the operation. See [requirements.md](requirements.md) for the full spec.

```
client/      React (Vite) + Tailwind + shadcn/ui + Framer Motion + Leaflet
server/      Node + Express + Socket.io + Mongoose
ai-service/  Python FastAPI (ETA, routing, RAG chatbot)
scripts/     seed data
```

## Status

| # | Milestone | Status |
|---|---|---|
| 1 | Project setup, design system, landing page | ✅ Done |
| 2 | Auth and roles | ✅ Done |
| 3 | Shipment booking | ✅ Done |
| 4 | Driver panel | ✅ Done |
| 5 | Live tracking | ✅ Done |
| 6 | Admin dashboard | ✅ Done |
| 7 | Python ETA & routing | ✅ Done |
| 8 | RAG chatbot | ✅ Done |
| 9 | Payments & notifications | ✅ Done |
| 10 | Testing & deployment | ✅ Ready to deploy (see [Deploy](#deploy)) |

## Run locally

Prerequisites: Node 20+, Python 3.11+, MongoDB (local or Atlas) — or just Docker.

**With Docker (everything):**
```bash
cp server/.env.example server/.env && cp ai-service/.env.example ai-service/.env
docker compose up --build
# client http://localhost:5173 · API http://localhost:5000/api/health · AI http://localhost:8000/health
```

**Without Docker (one command):** with Node 20, MongoDB and a Python 3.11 venv in `ai-service/.venv` installed, `scripts/local.sh start` runs everything — app http://localhost:5174, API :5055, AI :8001 (`stop` / `status` too; logs in `~/.local/var/shiptrack/logs`). Point the three `.env` files at those ports.

**Without Docker (by hand):**
```bash
npm install                     # installs client + server workspaces
npm run dev:server              # http://localhost:5000
npm run dev:client              # http://localhost:5173
cd ai-service && python -m venv .venv && source .venv/bin/activate \
  && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
```

## Tests & lint
```bash
npm run lint                    # client + server (ESLint)
npm test                        # server: Jest + Supertest (MONGO_TEST_URI, or an in-memory MongoDB)
cd ai-service && pytest         # Python (RAG API tests need MongoDB: MONGO_TEST_URI or localhost)
npx playwright install chromium # once
npm run e2e                     # end-to-end journeys in a real browser (needs MongoDB on localhost)
```
- **Unit/integration:** 108 server tests (auth incl. multi-device sessions, pricing, status transitions, booking, driver, live tracking, admin, AI fallbacks, chatbot, payments, notifications) and 33 Python tests (ETA model, routing, assignment, forecast, RAG).
- **End-to-end** (`e2e/`, Playwright): sign-up/sign-in and role guards; booking with a declined then successful payment and the invoice download; public tracking without personal data; pay-later and refund; a driver's pickup → delivery with code, photo and signature; admin assignment; live notifications; accessibility (axe, WCAG 2.1 AA, light and dark) and 360 px layouts. The API and the built client start automatically (`e2e/playwright.config.js`); the chatbot journey runs when `E2E_AI_URL` points at the AI service.
- **API collection:** `docs/ShipTrack.postman_collection.json` — log in with the three *Log in* requests, then run the folders in order (Book → Pay → Invoice → Assign → Driver …).
- **CI:** `.github/workflows/ci.yml` runs all of the above on every push and pull request.

## Notes
- **Map tiles:** Carto basemaps now require an API key. Set `VITE_CARTO_API_KEY` in `client/.env` to get Positron / Dark Matter; without it the map falls back to OpenStreetMap tiles (darkened in dark mode).
- **Design tokens** live in `client/src/index.css` (CSS variables, light + dark) and `client/tailwind.config.js`. Orange buttons use navy text so they pass WCAG AA contrast.
- AI service routes all require the `X-Internal-Key` header (NFR-6).

## Authentication
- `POST /api/auth/register | login | refresh | logout | forgot-password | reset-password/:token`, `GET /api/auth/me`.
- Access token (15 min) is kept **in memory** on the client; the refresh token (7 days) is an **httpOnly cookie** scoped to `/api/auth`, stored hashed and **rotated** on every refresh. Each sign-in is its own session (up to 10 devices): logging out, or reusing an old refresh token, ends only that device's session; a password reset ends them all.
- `requireAuth` + `requireRole('admin')` protect API routes; Socket.io connections must send `auth: { token }`.
- Without SMTP settings, emails (e.g. password-reset links) are printed to the server console.
- Server tests use an in-memory MongoDB, or set `MONGO_TEST_URI` to use a real one.

## Shipments
- `POST /api/shipments/quote` returns **both** speeds (price breakdown + ETA) so the UI can compare them. Price = base fare + km × per-km + chargeable kg × per-kg (chargeable = max(actual, L×W×H ÷ 5000)), × express multiplier. Distance is straight-line × 1.3.
- `POST /api/shipments` recomputes price and ETA on the server (client numbers are ignored), issues a tracking ID like `SHP-7X4K2P`, records `BOOKED` in the status history and emails a confirmation. Payment stays `pending` until Milestone 9.
- ETA comes from the Python service (`POST /eta`); if it's unreachable within 1.5 s, Node uses the same distance formula. Estimates are moved into the 9:00–21:00 IST delivery window.
- Status lifecycle and who may set what live in `server/src/services/shipmentStatus.js`; every change is saved with time/location/actor and pushed over Socket.io (`shipment:status`).
- `GET /api/shipments/track/:trackingId` is public and returns only status, timeline, ETA, cities and ~1 km coordinates — no names, phones or addresses.
- Address search goes through `GET /api/geo/search` (server-side Nominatim, cached, ≤ 1 req/s, India only). Searches run on Enter/button rather than as-you-type, per Nominatim's usage policy; for heavy use, point `GEOCODER_URL` at your own instance.

## Driver panel
- `/api/driver`: `GET /me`, `PATCH /duty`, `GET /shipments/today`, `PATCH /shipments/:id/status`, `POST /shipments/:id/deliver` (multipart: `otp` + `photo` and/or `signature`), `GET /history`.
- Drivers must be **on duty** to update shipments, and only see shipments assigned to them (others return 404). They can't see what the customer paid or the delivery code.
- Today's stops are ordered nearest-first from the driver's position (Milestone 7 swaps in OR-Tools). The next stop is the pickup until collected, then the drop.
- **Delivery code (OTP):** issued each time a shipment goes out for delivery (including retries). It's derived from `OTP_SECRET` + shipment + version, so the customer's page can show it, while the database stores only a hash. 5 wrong tries lock it until a failed attempt + retry issues a new code.
- **Proof images** are checked by their bytes (JPEG/PNG/WebP only, ≤ 5 MB) and stored in Cloudinary when `CLOUDINARY_URL` is set, otherwise in `server/uploads` (served at `/uploads` with random file names).
- Emails go out on picked up, out for delivery (with the code), delivered and failed attempt.
- Driver earnings are 70 % of the shipment total for now (`DRIVER_SHARE` in `driverController.js`).
- In development the server seeds three Bengaluru shipments assigned to the demo driver. To hand shipments you book yourself to the demo driver before the admin panel exists: `npm run assign:demo -w server`.

## Live tracking
- While a driver is **on duty**, their browser watches GPS and emits `driver:location` every 5 s (and keeps the screen awake where supported). Bursts under 2 s, bad payloads, off-duty drivers and non-drivers are rejected.
- The server stores the latest fix on the driver, then emits `shipment:location` (with a live ETA) to `shipment:<id>` for each of the driver's moving shipments, and `fleet:update` to `admin:fleet`.
- Live ETA = remaining distance ÷ 22 km/h + 2 min, to the pickup before collection and the drop after. It's recalculated only after the driver moves > 500 m or every 2 minutes; while out for delivery it also updates the shipment's estimated delivery time.
- Only the shipment's owner (and admins) get the live position and driver card; the public tracking page never shows them.
- Admins get **Live fleet** (`/admin/fleet`): a snapshot from `GET /api/admin/fleet`, then live updates.

## Admin
- `/api/admin`: `GET/POST /drivers`, `PATCH /drivers/:id`, `GET /shipments` (filters: `status` incl. `active`/`delayed`, `driver` incl. `unassigned`, `city`, `from`, `to`, `q`, `sort`), `GET /shipments/:id/candidates`, `PATCH /shipments/:id/assign`, `POST /shipments/:id/auto-assign`, `GET /stats`, `GET/PUT /pricing`, `GET /fleet`. Public `GET /api/pricing` feeds the landing calculator.
- **Auto-assign** picks the nearest on-duty driver within 25 km (2dsphere `$near`) whose vehicle still has room for the parcel. Booked shipments can be assigned; assigned ones can be moved to another driver.
- Drivers can't be deactivated while they have active shipments; deactivating signs them out.
- **On-time %** compares delivery time with `promisedDeliveryAt` — the estimate shown at booking, which never changes (live tracking updates `estimatedDeliveryAt` instead).
- Pricing changes create a new rule and keep the old ones as history.
- In development the server also seeds **~90 days of history**: 7 more drivers (`driver2…driver8@shiptrack.dev` / `Driver@123`), 30 customers and ~900 shipments across Bengaluru, Mumbai, Delhi, Pune and Hyderabad. Delivery times depend on distance, weight, speed, time of day, weekday and city, so Milestone 7's ETA model has something real to learn. It's deterministic and only runs once.

## AI service (Python)
All routes need the `X-Internal-Key` header; Node calls each with a short timeout and falls back to its own logic if the service is down or slow.

| Route | What it does | Node fallback |
|---|---|---|
| `POST /eta` | Gradient-boosting model (distance, weight, speed, hour, weekday, city, intercity). Returns the **promise** (`PROMISE_QUANTILE` percentile, default 85th) and the typical (p50) time. | Distance formula |
| `POST /route/optimize` | OR-Tools pickup-and-delivery routing from the driver's position (open route; every pickup before its drop). | Greedy nearest-first with the same rule |
| `POST /assign/suggest` | Scores on-duty drivers with room: distance + 1.5 km per active job − rating bonus. | Nearest on-duty driver via `$near` |
| `POST /forecast/demand` | Bookings per city for the next 7 days (same-weekday average × recent trend). | Panel hidden |
| `POST /ml/train`, `GET /ml/model` | Retrain on delivered shipments / model metrics. The service hot-reloads the new model. | — |

**Training:** `cd ai-service && python -m app.ml.train_eta` (or *Retrain* on the admin dashboard; in development it runs automatically after history is seeded). On the seeded data, held-out results were:

| | Typical error | On time vs promise | Avg. promise |
|---|---|---|---|
| Formula (in delivery window) | 2.58 h | 83.8 % | 19.15 h |
| Model (p50 / p85 promise) | **1.62 h** | **86.2 %** | 20.06 h |

The model's typical estimate is ~37 % more accurate. As a *promise* it's slightly more reliable for ~1 h longer promises — raise or lower `PROMISE_QUANTILE` to trade reliability for tighter promises. (The seeded history is generated from the formula, which flatters the formula; real deliveries should favour the model more.)

## Payments, invoices & notifications
**Paying.** "Review & pay" books the shipment, then opens checkout. A booking goes to a driver only once it's paid; unpaid ones show a *Pay now* banner and are cancelled after `PAYMENT_TIMEOUT_MIN` (30). Cancelling a paid shipment before pickup refunds it in full.

- **Razorpay test mode:** set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (test keys) in `server/.env`. The server creates the order (amount always from its own price), Razorpay's checkout collects the payment, and the server verifies the signature before marking it paid. Use Razorpay's test cards or UPI `success@razorpay`.
- **Webhook (optional, recommended):** point a Razorpay webhook at `POST /api/payments/webhook` with `RAZORPAY_WEBHOOK_SECRET`. It confirms payments even if the customer closes the tab; duplicate events are harmless.
- **Without keys** (development only) a built-in test checkout runs the same order → pay → verify flow, including a "declined" button. Production refuses to start without keys.

**Invoices.** `GET /api/shipments/:id/invoice` (owner or admin) returns a PDF generated from the shipment, so it always matches the record; a refunded one is stamped *Refunded*. It's attached to the confirmation email sent on payment.

**Notifications.** Stored in MongoDB (kept 90 days) and pushed live over Socket.io (`notification:new`): the bell shows the unread count and latest items, and each role has a Notifications page. Customers hear about payments and every status change, drivers about new and cancelled pickups, admins about support tickets and documents that fail to index. Emails go out for booking confirmation, pickup, out for delivery, delivery and failed attempts (logged to the console when `SMTP_HOST` is empty).

## Chatbot (RAG)
A chat button sits on every customer page and on the public tracking page; guests can use it too.

- **Policy questions** are answered only from documents uploaded under **Admin › Chatbot docs** (PDF, Markdown or text, up to 10 MB), with numbered source chips. Five sample policies in `server/seed-docs/` are loaded automatically in development.
- **Tracking questions** ("Where is SHP-7X4K2P?", "Where is my latest parcel?") use live shipment data. Node decides what the asker may see: the sender (or an admin) gets addresses, live ETA and driver; anyone else only what the public Track page shows.
- **Not sure?** If no passage scores above the threshold, the bot says so and offers a **support ticket**; tickets and 👍/👎 ratings appear on the admin page.
- The last 10 messages are sent as context. Replies stream word by word over Socket.io (`/chat` namespace, max 8 messages a minute).

**How it works:** upload → Node stores the file → Python extracts text (pypdf) → ~500-token chunks with 50-token overlap, split on headings → embeddings → `doc_chunks`. A question → intent check (tracking / policy) → top-5 passages and/or Node's internal shipment lookup → Claude streams the answer with `[n]` citations.

| Setting (`ai-service/.env`) | Default | Notes |
|---|---|---|
| `LLM_API_KEY` | empty | Claude API key. **Without it** the bot still works: it quotes the best-matching passage instead of writing an answer. |
| `LLM_MODEL` / `LLM_EFFORT` | `claude-opus-5-5` / `low` | Low effort keeps the first word quick (NFR-3). Refusals fall back to another model automatically. |
| `EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Runs locally via fastembed (no key; baked into the Docker image). `hashing` = lexical fallback with much weaker recall. |
| `VECTOR_SEARCH` | `local` | `local` works on any MongoDB. On Atlas run `python -m app.rag.setup_index` once, then set `atlas`. |
| `RAG_MIN_SCORE` | `0` (auto) | "Not sure" threshold. Calibrated for bge on the sample policies: real questions scored ≥ 0.61, off-topic ≤ 0.52 → 0.56. |

## Deploy
### One click: everything on Render
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/theycallmepankaj/shiptrack)

`render.yaml` creates three services: the website (static, proxies `/api` so the login cookie is first-party), the Node API and the Python AI service. Render asks for:
- `MONGO_URI` — a MongoDB reachable from the internet (e.g. Atlas; allow access from `0.0.0.0/0`), with the database name in the URI.
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — Razorpay **test** keys (required in production).
- Optional: `CLOUDINARY_URL` (keeps uploads across deploys), `SMTP_*`, `LLM_API_KEY`, `RAZORPAY_WEBHOOK_SECRET`, `VITE_CARTO_API_KEY` — leave blank to skip.

URLs: site `https://pankaj-shiptrack.onrender.com`, API `https://pankaj-shiptrack-api.onrender.com`, AI `https://pankaj-shiptrack-ai.onrender.com`. Razorpay webhook (optional): `https://pankaj-shiptrack-api.onrender.com/api/payments/webhook`.

### Alternative: Atlas + Render + Vercel
Target: **MongoDB Atlas** (database + vector search) · **Render** (Node API + Python AI service) · **Vercel** (client). Free tiers work for a demo.

**1. MongoDB Atlas**
1. Create a free M0 cluster, a database user, and allow network access from `0.0.0.0/0` (Render's IPs aren't fixed).
2. Copy the connection string and add the database name: `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/shiptrack`.
3. Create the vector index once (from your machine): `cd ai-service && MONGO_URI="<atlas uri>" python -m app.rag.setup_index`.

**2. Render** — push the repo to GitHub, then *Dashboard → New → Blueprint* and pick it. `render.yaml` creates `shiptrack-api` and `shiptrack-ai` (Docker, Singapore, health checks) and generates the JWT/OTP secrets and the shared internal key. Fill in the prompted values:

| Service | Variable | Value |
|---|---|---|
| both | `MONGO_URI` | the Atlas string from step 1 |
| api | `CLIENT_URL` | your Vercel URL, e.g. `https://shiptrack.vercel.app` |
| api | `PUBLIC_URL` / `AI_SERVICE_URL` | `https://pankaj-shiptrack-api.onrender.com` / `https://pankaj-shiptrack-ai.onrender.com` |
| ai | `NODE_API_URL` | `https://pankaj-shiptrack-api.onrender.com` |
| api | `RAZORPAY_KEY_ID` / `_SECRET` | Razorpay **test** keys (required in production) |
| api | `CLOUDINARY_URL` | `cloudinary://key:secret@cloud` — Render's disk is wiped on every deploy |
| api | `SMTP_*` | optional; without them emails are only logged |
| ai | `LLM_API_KEY` | optional Claude key; without it the bot quotes policy text |

`SEED_DEMO=true` creates the demo accounts, sample history and policy documents on first start (and the ETA model trains itself); set it to `false` for a real launch. If Render gives a service a different URL, update the values above and `client/vercel.json`.

**3. Vercel** — *New Project* → import the repo → **Root Directory `client`** (Vite is detected). Environment variables:
- `VITE_API_URL=/` — the API is reached through the `/api` rewrite in `client/vercel.json`, so the refresh cookie is first-party (Safari and other browsers block third-party cookies).
- `VITE_SOCKET_URL=https://pankaj-shiptrack-api.onrender.com` — WebSockets go straight to Render.
- `VITE_CARTO_API_KEY` (optional).

**4. Razorpay webhook (optional):** *Settings → Webhooks* → `https://<vercel-app>/api/payments/webhook`, events `payment.captured` and `payment.failed`, secret → `RAZORPAY_WEBHOOK_SECRET`.

**Check it:** `https://pankaj-shiptrack-api.onrender.com/api/health` → `{"status":"ok","db":"connected"}`; log in with a demo account; book and pay with Razorpay test card `4111 1111 1111 1111` (any future date/CVV) or UPI `success@razorpay`.

**Good to know**
- Free Render services sleep after 15 idle minutes; the first request then takes ~1 minute. While the AI service sleeps the API falls back to its own ETA, routing and assignment, but the chatbot replies "unavailable".
- Peak memory measured with Docker: API ~150 MB, AI service ~370 MB (fits the free 512 MB).
- Production refuses to start with development secrets, a `dev-` internal key, or without Razorpay keys.
- `TRUST_PROXY=2` (set in `render.yaml`) makes rate limits see real client IPs behind Vercel → Render. If you call the API directly instead of through Vercel, use `1`.

### Production checklist
- [ ] Atlas: dedicated DB user, vector index created, backups on (paid tiers).
- [ ] Render: all `sync: false` values filled; health checks green; `SEED_DEMO=false` unless it's a demo.
- [ ] Vercel: `VITE_API_URL=/`, `VITE_SOCKET_URL` set; `/api` rewrite points at your API's URL.
- [ ] Razorpay test keys (and webhook) set; Cloudinary set; SMTP set if you want real emails.
- [ ] Log in, book, pay, assign, deliver once end to end; check the invoice email.
- [ ] Lighthouse on the deployed landing page (see below).

### Performance & accessibility
The landing page is prerendered to static HTML at build time (`client/src/prerender.jsx`, `client/scripts/prerender.mjs`) and hydrated in the browser, so the headline paints before the JavaScript loads. Measured locally on the production build with gzip (Lighthouse 12):

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Desktop | 100 | 97 | 96 | 100 |
| Mobile (simulated slow 4G) | 89 | 97 | 96 | 100 |

Accessibility loses 3 points only for the orange "Track" in the logo (logotypes are exempt from WCAG contrast); best practices loses points locally only because the API wasn't running. Mobile is held back by first paint waiting on the stylesheet over the simulated slow network; re-measure on Vercel's CDN (HTTP/2, Brotli). The e2e suite runs axe (WCAG 2.1 AA) on public and signed-in pages in both themes.

## Demo accounts
Created automatically on server start in development (`SEED_DEMO=true`), or with `npm run seed -w server`.

| Role | Email | Password |
|---|---|---|
| Admin | admin@shiptrack.dev | Admin@123 |
| Driver | driver1@shiptrack.dev | Driver@123 |
| Customer | customer@shiptrack.dev | Customer@123 |

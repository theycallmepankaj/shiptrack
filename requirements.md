# ShipTrack — Requirements

A courier and delivery tracking platform. Customers book shipments and track them live on a map, drivers deliver and share their location, and admins manage the operation. A Python service handles delivery-time prediction and route optimization, and a RAG chatbot answers customer questions from policy documents and live shipment data.

---

## 1. Goals

- Customers can book a shipment, pay, and follow it in real time until delivery.
- Drivers get a simple mobile-friendly page to see their stops, share GPS, and confirm delivery.
- Admins can assign shipments, monitor all drivers live, and see business metrics.
- A chatbot answers "Where is my parcel?" and policy questions accurately, with sources.

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), React Router, Tailwind CSS, shadcn/ui (components), Framer Motion (animation), Lucide (icons), Sonner (toasts), Leaflet with Carto map tiles, Recharts (charts), Socket.io client, Axios |
| Backend API | Node.js, Express, Socket.io, Mongoose, JWT (jsonwebtoken), bcrypt, Multer (uploads), Zod/Joi (validation) |
| Database | MongoDB Atlas (with 2dsphere geo indexes and Atlas Vector Search) |
| Python service | FastAPI, scikit-learn (ETA model), OR-Tools (route optimization), sentence-transformers or an embeddings API, LLM API |
| File storage | Cloudinary (proof-of-delivery photos, signatures, invoices) |
| Payments | Razorpay or Stripe (test mode) |
| Notifications | Socket.io (in-app), Nodemailer (email) |
| Deployment | Vercel (client), Render (Node + Python), MongoDB Atlas |
| Dev tooling | Docker Compose, ESLint, Prettier, Postman collection |

## 3. User roles

| Role | Description |
|---|---|
| **Customer** | Books and tracks shipments, pays, chats with the bot |
| **Driver** | Delivers assigned shipments, shares live location |
| **Admin** | Manages drivers, shipments, pricing and documents for the chatbot |

The role is stored in the JWT and checked on every protected API route and Socket.io connection.

---

## 4. Functional requirements

### 4.1 Authentication and authorization
- FR-1: Customers can sign up with name, email, phone, and password.
- FR-2: Drivers and admins are created by an admin (no public sign-up).
- FR-3: Login returns a short-lived **access token** (15 min) and sets a **refresh token** (7 days) in an httpOnly, secure cookie.
- FR-4: `/auth/refresh` issues a new access token; `/auth/logout` invalidates the refresh token.
- FR-5: Passwords are hashed with bcrypt.
- FR-6: Role-based middleware (`requireRole('admin')`, etc.) protects routes.
- FR-7: Socket.io connections must send the access token in the handshake; invalid tokens are rejected.
- FR-8: Forgot or reset password via an emailed link (token valid for 30 min).

### 4.2 Shipment booking (Customer)
- FR-9: Customer enters pickup address, drop address, package weight, dimensions, type (document, parcel, fragile), and delivery speed (standard or express).
- FR-10: Addresses are geocoded to latitude and longitude (Nominatim or Mapbox).
- FR-11: The system shows a **price quote** based on distance, weight, and speed before booking.
- FR-12: The system shows an **estimated delivery time** from the Python ETA service.
- FR-13: On confirmation and payment, a unique tracking ID is generated (e.g. `SHP-7X4K2P`).
- FR-14: Customer gets an email with the tracking ID and a downloadable PDF invoice.
- FR-15: Customer can cancel a shipment before it is picked up (refund status recorded).

### 4.3 Shipment status lifecycle
```
BOOKED → ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
                                                             ↘ FAILED_ATTEMPT → (retry) / RETURNED
BOOKED / ASSIGNED → CANCELLED
```
- FR-16: Every status change is saved in a status history with time, location, and who made the change.
- FR-17: Every status change is pushed live to the customer via Socket.io and also sent by email for key events (picked up, out for delivery, delivered).

### 4.4 Public tracking page
- FR-18: Anyone with a tracking ID can view status, timeline, and ETA (no login).
- FR-19: The live map with the driver's location is visible only to the logged-in owner of the shipment.

### 4.5 Live tracking (Socket.io)
- FR-20: When on duty, the driver's browser sends GPS coordinates every 5 seconds (`navigator.geolocation.watchPosition`).
- FR-21: The server stores the latest driver location and broadcasts it to the room `shipment:<id>` for each of the driver's active shipments.
- FR-22: The customer's map shows the driver marker moving, the route line, and a countdown ETA.
- FR-23: The ETA is recalculated when the driver moves significantly (more than 500 m) or every 2 minutes.
- FR-24: The admin live map shows all on-duty drivers (room `admin:fleet`).

### 4.6 Driver panel
- FR-25: Driver can toggle **On duty** or **Off duty**.
- FR-26: Driver sees today's assigned shipments in **optimized stop order** (from the Python route service) with navigation links.
- FR-27: Driver updates status: Picked up, In transit, Out for delivery, Delivered, Failed attempt (with reason).
- FR-28: **Proof of delivery**: the customer receives a 4-digit OTP; the driver enters it and uploads a photo or captures a signature.
- FR-29: Driver can see their delivery history and earnings summary.

### 4.7 Admin dashboard
- FR-30: Admin can create, edit, and deactivate drivers and vehicles.
- FR-31: Admin can assign shipments to drivers manually or use **auto-assign** (nearest available driver).
- FR-32: Admin can view and filter all shipments by status, date, driver, and city.
- FR-33: Dashboard metrics: shipments today, delivered on time %, delayed shipments, revenue (daily, weekly, monthly), top drivers.
- FR-34: Admin can manage pricing rules (base fare, per-km rate, per-kg rate, express multiplier).
- FR-35: Admin can upload or delete **policy documents** (PDF, MD, TXT) that feed the chatbot.
- FR-36: Live fleet map with all drivers.

### 4.8 Notifications
- FR-37: In-app notification bell (Socket.io) for status changes and assignments.
- FR-38: Email for booking confirmation, pickup, out for delivery, delivery, and failed attempt.
- FR-39: Notifications are stored in MongoDB and marked read or unread.

### 4.9 Python service: ETA and routing
- FR-40: `POST /eta` returns the estimated delivery time from distance, weight, speed, time of day, day of week, and city.
- FR-41: The ETA model is a regression model (e.g. RandomForest or GradientBoosting) trained on seeded historical shipment data; it falls back to a distance-based formula if the model is unavailable.
- FR-42: `POST /route/optimize` takes the driver's start point and a list of stops, and returns the best visiting order (OR-Tools TSP/VRP).
- FR-43: `POST /assign/suggest` returns the best driver for a shipment (nearest available, with capacity).
- FR-44: `POST /forecast/demand` (stretch) predicts shipment volume per city for the next 7 days.

### 4.10 RAG chatbot
- FR-45: A chat widget is available on all customer pages and the public tracking page.
- FR-46: The chatbot answers policy questions (prohibited items, refunds, delivery areas, pricing, packaging) **only from admin-uploaded documents**, and shows source citations.
- FR-47: If the user gives a tracking ID, the bot fetches **live shipment data** from the database (status, location, ETA) and answers using it. Logged-in users can ask "Where is my latest parcel?" without an ID.
- FR-48: The bot never reveals other customers' shipment details. A tracking-ID lookup by someone who isn't the owner returns only public tracking info.
- FR-49: Replies are streamed token by token over Socket.io.
- FR-50: If the bot isn't confident (low retrieval score), it says so and offers to raise a support ticket.
- FR-51: Chat history is saved per user, and the last 10 messages are used as conversation context.
- FR-52: Users can rate a reply 👍 or 👎; ratings are stored.

**RAG pipeline (Python):**
1. **Ingest:** admin uploads a document → Node saves the file record → Python extracts text → splits it into chunks (~500 tokens, 50 overlap) → creates embeddings → stores them in MongoDB Atlas Vector Search (`doc_chunks` collection).
2. **Query:** user message → intent check (tracking question or policy question) → for policy questions, vector search for the top 5 chunks; for tracking questions, call Node's internal shipment API → build the prompt → call the LLM → stream the answer with citations.

---

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Live location updates reach the customer in under 2 seconds. |
| NFR-2 | API responses under 300 ms (excluding Python and LLM calls). |
| NFR-3 | Chatbot starts streaming in under 3 seconds. |
| NFR-4 | Responsive UI; the driver panel works well on mobile. |
| NFR-5 | Security: Helmet, CORS whitelist, rate limiting on auth and chatbot routes, input validation, no secrets in the repo. |
| NFR-6 | Node ↔ Python calls authenticated with a shared internal API key. |
| NFR-7 | Logging with request IDs (morgan or winston on Node, logging module on Python). |
| NFR-8 | All config via `.env` files; `.env.example` committed. |
| NFR-9 | Basic tests: Jest + Supertest (Node), Pytest (Python), at least for auth, pricing, and status transitions. |

---

## 6. Data models (MongoDB)

**User**
```
_id, name, email (unique), phone, passwordHash,
role: 'customer' | 'driver' | 'admin',
isActive, refreshTokenHash, createdAt, updatedAt
```

**Driver** (profile linked to User)
```
_id, userId, vehicle: { type, number, capacityKg },
isOnDuty, currentLocation: { type: 'Point', coordinates: [lng, lat] },
lastLocationAt, rating, totalDeliveries
```
Index: `currentLocation: '2dsphere'`

**Shipment**
```
_id, trackingId (unique), customerId, driverId,
pickup: { address, location: Point, contactName, contactPhone },
drop:   { address, location: Point, contactName, contactPhone },
package: { weightKg, dimensions: { l, w, h }, type },
speed: 'standard' | 'express',
price: { base, distanceCharge, weightCharge, total, currency },
distanceKm, estimatedDeliveryAt,
status, statusHistory: [{ status, at, location, by, note }],
deliveryOtpHash, proofOfDelivery: { photoUrl, signatureUrl, deliveredAt },
payment: { provider, orderId, paymentId, status },
createdAt, updatedAt
```

**Notification**
```
_id, userId, type, title, message, shipmentId, isRead, createdAt
```

**PricingRule**
```
_id, baseFare, perKm, perKg, expressMultiplier, isActive
```

**Document** (chatbot knowledge base)
```
_id, title, fileUrl, uploadedBy, status: 'processing' | 'ready' | 'failed',
chunkCount, createdAt
```

**DocChunk** (written by Python)
```
_id, documentId, text, page, embedding: [float], createdAt
```
Index: Atlas Vector Search on `embedding`

**ChatMessage**
```
_id, userId (nullable for guests), sessionId, role: 'user' | 'assistant',
content, sources: [{ documentId, title, page }], rating, createdAt
```

---

## 7. REST API (Node / Express)

**Auth** — `/api/auth`
| Method | Route | Access |
|---|---|---|
| POST | `/register` | Public |
| POST | `/login` | Public |
| POST | `/refresh` | Cookie |
| POST | `/logout` | Logged in |
| POST | `/forgot-password` | Public |
| POST | `/reset-password/:token` | Public |
| GET | `/me` | Logged in |

**Shipments** — `/api/shipments`
| Method | Route | Access |
|---|---|---|
| POST | `/quote` | Customer |
| POST | `/` | Customer |
| GET | `/mine` | Customer |
| GET | `/:id` | Owner / Driver / Admin |
| PATCH | `/:id/cancel` | Owner |
| GET | `/track/:trackingId` | Public (limited data) |
| GET | `/:id/invoice` | Owner / Admin |

**Driver** — `/api/driver`
| Method | Route | Access |
|---|---|---|
| PATCH | `/duty` | Driver |
| GET | `/shipments/today` | Driver |
| PATCH | `/shipments/:id/status` | Driver |
| POST | `/shipments/:id/deliver` | Driver (OTP + proof upload) |
| GET | `/history` | Driver |

**Admin** — `/api/admin`
| Method | Route | Access |
|---|---|---|
| GET/POST/PATCH | `/drivers` | Admin |
| GET | `/shipments` | Admin |
| PATCH | `/shipments/:id/assign` | Admin |
| POST | `/shipments/:id/auto-assign` | Admin |
| GET | `/stats` | Admin |
| GET/PUT | `/pricing` | Admin |
| GET/POST/DELETE | `/documents` | Admin |

**Payments** — `/api/payments`
| Method | Route | Access |
|---|---|---|
| POST | `/create-order` | Customer |
| POST | `/verify` | Customer |
| POST | `/webhook` | Provider |

**Notifications** — `/api/notifications`: `GET /`, `PATCH /:id/read`, `PATCH /read-all`

**Internal (Python → Node only, API key)** — `/internal`: `GET /shipments/:trackingId`

---

## 8. Socket.io events

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `connection` | client → server | `auth: { token }` | JWT checked; user joins `user:<id>` |
| `shipment:join` | client → server | `{ shipmentId }` | Owner, assigned driver, or admin only |
| `shipment:leave` | client → server | `{ shipmentId }` | |
| `driver:location` | driver → server | `{ lat, lng, heading, speed }` | Every 5 s while on duty |
| `shipment:location` | server → room | `{ shipmentId, lat, lng, eta }` | To `shipment:<id>` |
| `shipment:status` | server → room | `{ shipmentId, status, at, note }` | |
| `fleet:update` | server → `admin:fleet` | `{ driverId, lat, lng, isOnDuty }` | |
| `notification:new` | server → `user:<id>` | Notification object | |
| `chat:message` | client → server | `{ sessionId, message }` | Rate limited |
| `chat:token` | server → client | `{ sessionId, token }` | Streamed reply |
| `chat:done` | server → client | `{ sessionId, messageId, sources }` | |
| `chat:error` | server → client | `{ sessionId, error }` | |
| `document:status` | server → `admin` | `{ documentId, status, chunkCount }` | Ingestion progress |

---

## 9. Python service API (FastAPI)

| Method | Route | Purpose |
|---|---|---|
| POST | `/eta` | Predict delivery time |
| POST | `/route/optimize` | Best stop order for a driver |
| POST | `/assign/suggest` | Best driver for a shipment |
| POST | `/rag/ingest` | Read, chunk, embed and store a document |
| DELETE | `/rag/documents/{id}` | Remove a document's chunks |
| POST | `/rag/chat` | Answer a question (streamed response) |
| POST | `/forecast/demand` | (Stretch) demand forecast |
| GET | `/health` | Health check |

All routes require the `X-Internal-Key` header.

---

## 10. Frontend pages

**Public:** Home / landing, Track parcel, Pricing, Login, Register, Forgot password
**Customer:** Dashboard, Book shipment (multi-step form with quote), My shipments, Shipment detail with live map, Notifications, Profile
**Driver:** Today's route (ordered stops plus map), Shipment detail with status buttons, Proof-of-delivery screen, History
**Admin:** Dashboard (metrics and charts), Live fleet map, Shipments table, Drivers, Pricing, Chatbot documents
**Global:** Chatbot widget, notification bell, protected route wrapper by role

---

## 11. UI / UX design

The site should look like a modern, premium SaaS product: clean, fast, and confident, with motion that explains what is happening rather than decorating.

### 11.1 Design direction
- **Look:** lots of white space, large bold headings, soft shadows, rounded cards, subtle gradients, bento-style grids for features.
- **Feel:** live and in motion — the product is about things moving, so maps, route lines, and status changes animate.
- **Light and dark mode**, with a toggle in the navbar; follows the system setting by default.

### 11.2 Brand
| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#FF6B2C` (signal orange) | `#FF7A40` | Buttons, links, active route line |
| `--ink` | `#0B1220` (deep navy) | `#F1F5F9` | Headings, body text |
| `--surface` | `#FFFFFF` | `#0F172A` | Cards |
| `--background` | `#F7F8FA` | `#070B14` | Page |
| `--muted` | `#64748B` | `#94A3B8` | Secondary text |
| `--border` | `#E5E7EB` | `#1E293B` | Card and input borders |

**Status colors** (used in badges, timeline, and map markers):
| Status | Color |
|---|---|
| Booked / Assigned | Slate `#64748B` |
| Picked up / In transit | Blue `#3B82F6` |
| Out for delivery | Orange `#FF6B2C` |
| Delivered | Green `#16A34A` |
| Failed attempt / Returned | Red `#DC2626` |
| Cancelled | Gray `#9CA3AF` |

- **Logo:** simple wordmark "ShipTrack" with a small location-pin or arrow mark (SVG).
- **Typography:** *Plus Jakarta Sans* for headings, *Inter* for body text, *JetBrains Mono* for tracking IDs and numbers.
- **Shape:** 12–16 px radius on cards, 10 px on buttons and inputs; 4 px spacing grid.

### 11.3 Motion
- Page transitions and scroll-reveal sections with Framer Motion (fade + slight slide, 200–400 ms).
- Landing hero: an animated truck moving along a curved route line between two pins.
- Stats count up when scrolled into view.
- Status timeline steps fill in as status changes arrive over Socket.io.
- Driver marker glides smoothly between GPS points (no jumping).
- Skeleton loaders instead of spinners; toasts for actions (Sonner).
- Hover and press micro-interactions on buttons and cards.
- All motion is turned off or reduced when the user has `prefers-reduced-motion` set.

### 11.4 Key screens
**Landing page**
1. Sticky glass navbar (blurred background) with theme toggle and Login / Get started.
2. Hero: big headline, sub-text, a **tracking-ID input** as the main call to action, and the animated route illustration.
3. Trust strip: key numbers (parcels delivered, cities, on-time %).
4. How it works: 3 steps — Book → Track live → Delivered.
5. Features bento grid: live map, AI assistant, proof of delivery, smart routing, instant quotes.
6. Interactive **price calculator** (from / to / weight → live quote).
7. Live tracking preview: a looping demo map card.
8. Testimonials, FAQ accordion, final call-to-action banner, footer.

**Tracking page**
- Full-width map with a floating glass card showing status, ETA countdown, and driver info.
- Vertical status timeline with icons, times, and locations.

**Customer, driver, and admin dashboards**
- Collapsible sidebar, top bar with search, notification bell, and avatar menu.
- KPI cards with small sparkline charts; clean data tables with filters, sorting, and status badges.
- Command palette (Ctrl/Cmd + K) for quick navigation in the admin panel.
- Empty states with an illustration and a clear next action.

**Driver panel (mobile-first)**
- Bottom navigation, large tap targets, the next stop shown as a big card.
- **Swipe to confirm** for status changes; OTP entry with large digit boxes.

**Chatbot widget**
- Floating round button (bottom right) that opens a chat panel with a smooth spring animation.
- Suggested questions as chips ("Track my parcel", "What can't I ship?").
- Typing indicator, word-by-word streaming, source chips under answers, 👍/👎 buttons.

**Booking flow**
- Multi-step form with a progress bar: Addresses → Package → Speed → Review & pay.
- The quote updates live as the user types, with a map preview of the route.

### 11.5 Maps
- Carto **Positron** tiles in light mode and **Dark Matter** tiles in dark mode.
- Custom SVG markers: pickup (circle), drop (pin), driver (vehicle icon that rotates with heading).
- Route drawn as a thick primary-colored line; the completed part is solid and the remaining part is dashed.

### 11.6 Quality bar
- Fully responsive at 360 px, 768 px, 1024 px, and 1440 px widths.
- WCAG AA color contrast, visible focus rings, keyboard navigation, alt text, ARIA labels on icon buttons.
- Lighthouse score of 90+ for performance, accessibility, and best practices on the landing page.
- Images in WebP/AVIF, lazy-loaded; routes code-split.

---

## 12. Folder structure

```
shiptrack/
├── client/                  # React (Vite)
│   └── src/
│       ├── api/             # Axios instance + interceptors (token refresh)
│       ├── components/      # Map, ChatWidget, StatusTimeline, ...
│       ├── context/         # AuthContext, SocketContext
│       ├── pages/           # public/, customer/, driver/, admin/
│       ├── hooks/
│       └── routes/
├── server/                  # Node + Express + Socket.io
│   └── src/
│       ├── config/          # db, env, cloudinary
│       ├── models/
│       ├── controllers/
│       ├── routes/
│       ├── middleware/      # auth, roles, validate, rateLimit, errorHandler
│       ├── sockets/         # index, tracking, chat, notifications
│       ├── services/        # pricing, python client, email, payments, pdf
│       └── utils/
├── ai-service/              # Python FastAPI
│   └── app/
│       ├── main.py
│       ├── routers/         # eta, routing, assign, rag
│       ├── rag/             # loader, chunker, embedder, retriever, prompt
│       ├── ml/              # train_eta.py, model.pkl
│       └── core/            # config, db, security
├── scripts/                 # seed data (users, drivers, historical shipments)
├── docker-compose.yml
└── README.md
```

---

## 13. Environment variables

**server/.env**
```
PORT=5000
MONGO_URI=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
CLIENT_URL=http://localhost:5173
AI_SERVICE_URL=http://localhost:8000
INTERNAL_API_KEY=
CLOUDINARY_URL=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

**ai-service/.env**
```
MONGO_URI=
INTERNAL_API_KEY=
NODE_API_URL=http://localhost:5000
LLM_API_KEY=
EMBEDDING_MODEL=
```

**client/.env**
```
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

---

## 14. Milestones

| # | Milestone | Done when |
|---|---|---|
| 1 | Project setup and design system | Monorepo, Docker Compose, MongoDB connected, lint/format set up; Tailwind theme tokens, fonts, light/dark mode, shadcn/ui base components, and the landing page built |
| 2 | Auth and roles | Register, login, refresh, logout, role-protected routes and pages |
| 3 | Shipment booking | Quote, booking, tracking ID, status history, public tracking page |
| 4 | Driver panel | Duty toggle, status updates, OTP + proof of delivery |
| 5 | Live tracking | Driver GPS → Socket.io → customer map and admin fleet map |
| 6 | Admin dashboard | Driver management, assignment, stats, pricing |
| 7 | Python ETA and routing | ETA model trained on seed data, route optimization, auto-assign |
| 8 | RAG chatbot | Document ingest, vector search, tracking-ID lookup, streaming, citations |
| 9 | Payments and notifications | Payment test mode, emails, in-app notifications, invoice PDF |
| 10 | Testing and deployment | Core tests passing, deployed to Vercel + Render + Atlas, README with demo accounts |

---

## 15. Out of scope (for version 1)

- Native mobile apps (the driver panel is a responsive web page)
- International shipping and customs
- Multiple courier companies on one platform (multi-tenancy)
- SMS / WhatsApp notifications
- Real payment processing (test mode only)

## 16. Demo accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | admin@shiptrack.dev | Admin@123 |
| Driver | driver1@shiptrack.dev | Driver@123 |
| Customer | customer@shiptrack.dev | Customer@123 |

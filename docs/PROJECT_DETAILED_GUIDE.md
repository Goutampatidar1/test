# OHO E-Bazar — Full Project Guide

This document explains what the **OHO E-Bazar** monorepo is, how its parts fit together, and how to work with it locally or in production. It is written for developers, QA, and stakeholders who need a single reference beyond the short root `README.md`.

**Repository:** [Goutampatidar1/test](https://github.com/Goutampatidar1/test.git)

---

## 1. What this project is

OHO E-Bazar is a **multi-sided marketplace platform** aimed at the Indian market (INR, GST/PAN/KYC fields, recharge utilities, etc.). It combines:

| Surface | Purpose |
|--------|---------|
| **Customer mobile apps** (not in this repo) | Browse e-commerce products, book or enquire about event **services** (DJ, catering, tents, etc.), cart/checkout, wallets, ratings, reels |
| **Backend API** (`Backend/`) | Single Node.js API for admin, web panels, mobile apps, and delivery partners |
| **Admin panel** (`AdminPannel/`) | Super-admin dashboard to operate the whole business |
| **Venue / vendor web panel** (`VenueVendorPanel/`) | Self-service portal for **e-commerce sellers**, **service providers**, or **both** on one phone/account |

The **public marketing site** lives in **`OhoEBazarWebsite/`** (port **5180**). Full shopping still targets **mobile apps** via `/api/public/*` and `/api/user/*`; the landing page uses public catalog APIs when the backend is running. Its architecture (Hindi/English dictionary, data rules, 3D hero, media pipeline) is documented in [`OhoEBazarWebsite/README.md`](../OhoEBazarWebsite/README.md).

---

## 2. High-level architecture

```mermaid
flowchart TB
  subgraph clients [Clients]
    Admin[AdminPannel React :5173]
    VendorPanel[VenueVendorPanel React :5174]
    UserApp[User mobile app]
    VendorApp[Vendor mobile app]
    DeliveryApp[Delivery partner app]
  end

  subgraph api [Backend Express :5001]
    Routes[/api/* routes]
    Auth[JWT middleware]
    Uploads[/uploads static]
    Cron[node-cron scheduler]
  end

  DB[(MongoDB)]

  Admin --> Routes
  VendorPanel --> Routes
  UserApp --> Routes
  VendorApp --> Routes
  DeliveryApp --> Routes
  Routes --> Auth
  Routes --> DB
  Cron --> DB
  Routes --> Uploads
```

**Data flow (typical):**

1. Client sends JSON (or `multipart/form-data` for images) to `http://<host>:5001/api/...`
2. Protected routes validate `Authorization: Bearer <JWT>`
3. Controllers use Mongoose models; responses often use a `{ status, message, data }` envelope (especially mobile-facing APIs)
4. Uploaded files are stored on disk under the backend uploads root and served at `/uploads/...` and `/api/uploads/...`

---

## 3. Repository layout

```text
ebazar/
├── Backend/                 # Express API, models, cron jobs, seed scripts
│   ├── server.js            # App entry: CORS, JSON, static uploads, /api mount
│   ├── config/              # env + DB connection
│   ├── routes/              # Route modules by actor (admin, user, vendor, …)
│   ├── controllers/         # Request handlers
│   ├── models/              # Mongoose schemas (entity + business + catalog)
│   ├── middleware/          # auth, errors, notFound
│   ├── utils/               # uploads, scheduler, payments, notifications, …
│   ├── scripts/             # seed.js, admin reset, migrations
│   └── docs/                # API.md, backend README
├── AdminPannel/             # React 18 + Vite admin UI
│   └── src/
│       ├── pages/           # Feature screens (users, vendors, venues, …)
│       ├── api/             # Axios wrappers per domain
│       ├── store/           # Redux Toolkit (auth, app config)
│       └── data/navItems.js # Sidebar structure
├── VenueVendorPanel/        # React vendor portal (shop + service modes)
│   └── src/                 # Same general pattern as admin
├── OhoEBazarWebsite/        # Public marketing landing (React 19 + TS + Vite + Tailwind)
│   └── src/                 # Hero, sections, Motion/GSAP/Lenis; optional R3F
├── docs/                    # Deployment + this guide
├── deploy/                  # Apache / proxy samples
├── scripts/                 # Packaging helpers
├── APP_INTEGRATION_PROMPT.md  # Mobile integration spec for AI/devs
└── README.md                # Quick start (clone, install, run)
```

**Note:** The folder name is intentionally `AdminPannel` (double “n”) in the codebase.

---

## 4. Technology stack

| Layer | Technologies |
|-------|----------------|
| **API** | Node.js, Express 4, Mongoose 8, JWT, bcryptjs, Multer, Sharp, PDFKit, node-cron |
| **Database** | MongoDB |
| **Admin & vendor web** | React 18, Vite 5, Redux Toolkit, React Router 6, Axios, Bootstrap 5, SweetAlert2 |
| **Admin extras** | CKEditor 5, Swiper, country-state-city |
| **Production (documented)** | Apache reverse proxy, PM2, SSL — see `docs/DEPLOYMENT.md` |

---

## 5. Actors, roles, and JWT

The API uses **role-based JWTs**. Each actor has its own auth prefix and middleware (`protectAdmin`, `protectUser`, vendor/venue-vendor/delivery guards).

| Actor | API prefix (auth) | Typical client |
|-------|-------------------|----------------|
| **Admin** | `/api/admin/auth` | AdminPannel |
| **End user (customer)** | `/api/user/auth` | Mobile user app |
| **E-commerce vendor** | `/api/vendor/auth` | Mobile vendor app + ecom mode in VenueVendorPanel |
| **Service / venue vendor** | `/api/venue-vendor/auth` | Mobile service app + service mode in VenueVendorPanel |
| **Unified vendor panel login** | `/api/vendor-panel/auth` | VenueVendorPanel (resolves ecom vs service vs both) |
| **Delivery partner** | `/api/delivery/auth` | Delivery mobile app |

**Account lifecycle fields** (vendors): `status` (`active` / `inactive` / `blocked`), `approvalStatus` (`pending` / `approved` / `rejected` / `suspended`), `isOpen`, `showPhoneOnApp`, `videoEnabled`, `profileScore`, etc.

**Vendor panel type** (`vendorPanelType` on vendor records): `ecom` | `service` | `both` — controls which sections appear in VenueVendorPanel.

Environment variables for tokens live in `Backend/.env` (see `.env.example`): `JWT_SECRET`, optional refresh/reset secrets, `PORT`, `MONGODB_URI`, `EXPOSE_OTP_IN_RESPONSE` (dev OTP in JSON), `FCM_SERVER_KEY`, `DISABLE_SCHEDULER`, etc.

---

## 6. Backend — structure and conventions

### 6.1 Entry point (`server.js`)

- Loads `.env`, connects MongoDB, listens on `config.port` (commonly **5001** in current `.env.example`)
- Mounts **`/api`** → `routes/index.js`
- Serves uploads at **`/uploads`** and **`/api/uploads`** (so Apache can proxy only `/api` and still serve images)
- CMS static pages: **`GET /view/:app/:slug`**
- Starts **`utils/scheduler.js`** after DB connect (unless disabled)

### 6.2 Route map (summary)

All paths below are under **`/api`**.

| Group | Mount path | Responsibility |
|-------|------------|----------------|
| Health | `/health` | Liveness |
| Public storefront | `/public/*` | Home feed, catalog, banners, hot deals, ratings (read), app config |
| User | `/user/*` | Profile, cart, checkout, orders, venue booking/enquiry, wishlist, notifications |
| Vendor (ecom) | `/vendor/*` | Products, orders, wallet, promotions, video feeds |
| Venue vendor | `/venue-vendor/*` | Services (“venues”), bookings, enquiries, promotions, reels |
| Vendor panel | `/vendor-panel/auth` | Web panel login bridging ecom + service accounts |
| Admin | `/admin/*` | Full CRUD for platform operation |
| Delivery | `/delivery/*` | Partner profile, orders, wallet, COD |
| Mobile settings | (shared) | App settings endpoints reused on user/vendor/delivery trees |

The **authoritative route list** is assembled in `Backend/routes/index.js`. For HTTP examples and Postman curls, use **`Backend/docs/API.md`** (default port in that file may say 5000 — use your actual `PORT` from `.env`).

### 6.3 Controllers and models

- **Controllers** live under `Backend/controllers/` grouped by `adminControllers`, `userControllers`, `vendorControllers`, `venueVendorControllers`, `publicControllers`, etc.
- **Models** under `Backend/models/`:
  - **`entity/`** — `Admin`, `User`, `Vendor`, `VenueVendor`, `DeliveryBoy`
  - **`bussiness/`** — `AppConfig`, `Page`, `StaticPageLayout` (CMS, payment gateways, commissions, feature flags)
  - **`other/`** — catalog, orders, carts, wallets, promotions, venues, recharges, notifications, hot deals, …

Exported model index: `Backend/models/index.js`.

### 6.4 Global configuration (`AppConfig`)

Single-document (or primary) business settings drive the live product:

- Branding, contact, currency
- **Payment gateways** (Razorpay, etc.) and **payment methods** (COD, online, wallet)
- **Commissions** for vendors vs venue vendors
- **E-commerce availability** by city/pincode/sub-district
- **Feature flags** exposed to apps: booking mode (enquiry vs direct), phone plan required, video toggles, hot deals, home sections
- Document requirements for KYC

Admin edits these via **App Settings** and **Feature Controls** screens; mobile apps read **`GET /api/public/app-config`** and related endpoints.

### 6.5 Background scheduler

`utils/scheduler.js` (node-cron) runs jobs such as:

- Expire stale **venue enquiries** and finished **banners**
- Expire **phone plan** subscriptions; send **plan expiring** push notifications
- Refresh **profile completion scores** in batches
- Keep feature-settings cache warm

Set `DISABLE_SCHEDULER=true` on secondary API instances if only one node should run jobs.

### 6.6 Seed data

```bash
cd Backend
npm run seed
```

Creates default **admin**, **AppConfig**, categories, locations, promotion plans, sample ecom vendors, service vendors, “both” vendors, products, services (venues), and dummy promotion requests.

Default admin (seed):

- Email: `admin@gmail.com`
- Password: `12345678`

Other seeded vendor passwords are typically `12345678` (see seed script console output).

Other scripts: `npm run check-admin`, `npm run reset-admin`, `npm run migrate:phone-plan`.

---

## 7. Admin panel (`AdminPannel/`)

### 7.1 Purpose

Operational control center for staff: approve vendors, manage catalog, orders, payments, marketing, CMS, and platform settings.

### 7.2 Dev URLs

- Local: **http://localhost:5173/**
- API base: resolved in `src/resolveApiBase.js` — **http://localhost:5001** on desktop (override with `VITE_API_URL`)

### 7.3 Navigation modules (sidebar)

Defined in `src/data/navItems.js`:

| Module | Examples |
|--------|----------|
| Dashboard | KPIs |
| User Management | Customers |
| Ecom Management | Vendors, delivery, COD, products, attributes |
| Service Management | Service vendors, services (venues), enquiries, amenities |
| Recharge & Utility | Mobile, gas, Fastag recharge monitoring |
| Orders | Combined order/booking views |
| Catalog | Categories, sub-categories, locations |
| Promotion Management | Dashboard, plans, vendor requests |
| Payments | Revenue / transaction oversight |
| Marketing | Banners, hot deals, video feeds / reels |
| Vendor plans | Subscription plans (e.g. show phone number) |
| Content | FAQ, notifications, static pages |
| Settings | Business settings, feature toggles, admin profile |

### 7.4 Frontend architecture

- **Routing:** `src/routes/adminRoutes.jsx` under `/admin/*`
- **State:** Redux (`authSlice`, `appConfigSlice`) — syncs branding/favicon from API
- **API layer:** `src/api/*.js` — one module per backend domain
- **UI:** Bootstrap layout in `AdminLayout.jsx`, shared components for tables, images (`AppImage` with upload URL fallback), CKEditor for rich static pages

---

## 8. Venue vendor panel (`VenueVendorPanel/`)

### 8.1 Purpose

Web portal for sellers and service providers to manage their business without using only the mobile app.

### 8.2 Dev URLs

- Local: **http://localhost:5174/** (fixed in `package.json`)
- Same API resolution as admin (`resolveApiBase.js`, optional `VITE_API_URL`)

### 8.3 Panel modes

Navigation switches by **panel mode** (`src/data/navItems.js`, `utils/panelMode.js`):

| Mode | Nav highlights |
|------|----------------|
| **service** | Dashboard, services, reels, bookings, promotions, profile |
| **ecom** | Dashboard, reels, products, orders, promotions, profile |
| **both** | Combined menu for dual-type vendors |

Auth session stores which vendor identity is active; **`vendorPanelType`** from the backend determines available modes.

### 8.4 Key features

- Register / login / forgot password
- CRUD **services** (venues) with pricing, media, amenities
- **Bookings** and enquiry workflows (aligned with admin booking mode)
- **E-commerce** product and order management when in ecom/both mode
- **Promotion plans** (banner, verified badge, etc.) and Razorpay checkout helpers
- **Video feeds / reels** upload and management
- Profile completion scoring UI

---

## 9. Core business domains (conceptual)

### 9.1 E-commerce

- Hierarchical **categories** → subcategories → optional child categories
- **Products** with attributes, images, stock, pricing
- User **cart** → **checkout** → **orders**; **COD** and online payment paths
- **Delivery partners** assign/deliver orders; **COD settlement** tracked in admin
- **Vendor wallet** and withdrawal requests
- **Product video feeds** (reels) with likes

### 9.2 Services (venues)

In code and APIs, event services (DJ, tent, catering, …) are modeled as **`Venue`** documents owned by **`VenueVendor`**.

- **Categories** for service types (admin “Service” categories)
- **Booking** vs **enquiry** mode controlled by app config (`venueBookingMode`)
- **Venue enquiries** with expiry, acceptance, conversion to booking
- **Venue orders/transactions** parallel to ecom
- **Amenities**, ratings, wishlists, venue reels

### 9.3 Promotions and monetization

- **Promotion plans** (banner slots, verified badge, product presence, etc.) for `ecom` or `venue` vendor types
- Vendors purchase via **promotion requests/subscriptions**
- **Vendor plans** (e.g. show phone on app) with subscription expiry handled by scheduler
- **Hot deals** rules for storefront merchandising

### 9.4 Recharge utilities

Admin lists and monitors **mobile**, **gas**, and **Fastag** recharge transactions (integration hooks in backend models/controllers).

### 9.5 Notifications

- In-app notification documents
- FCM push when `FCM_SERVER_KEY` configured
- Admin broadcast and inbox notification routes

### 9.6 CMS

- **Static pages** (privacy, terms, …) with layouts
- Rendered in-app via backend **`/view/:app/:slug`**

---

## 10. Public & mobile API behavior

Mobile apps (documented in **`APP_INTEGRATION_PROMPT.md`**) should treat the backend as the source of truth.

**Important conventions:**

- Base path: `/api`
- Many responses: `{ "status": true, "message": "…", "data": [ … ] }` — **single objects appear as `data[0]`**
- Empty lists: `status: false` with empty `data` (not always HTTP error)
- Optional auth on public routes improves personalization (wishlist flags, liked videos)
- **Feature flags** from `/public/app-config` must gate UI (booking mode, videos, hot deals, home sections)
- Business error **codes** (e.g. `ENQUIRY_REQUIRED`, `PHONE_PLAN_REQUIRED`) — apps should branch on `code`

Key public endpoints (see `routes/publicRoutes.js`):

- `GET /public/app-config`, `/public/app-settings`, `/public/ecom-availability`
- `GET /public/home/feed` — consolidated home payload
- `GET /public/hot-deals`, `/public/banners`, catalog and venue listings
- Product/venue/delivery **ratings** read APIs
- **Video feeds** listing and detail

---

## 11. File uploads and media

- Multipart field name: **`file`** (see `utils/fileUploader.js`)
- Max size ~**50 MB**; images may be processed with **Sharp**
- URLs stored as paths like `/uploads/...`; clients resolve against API host or same-origin proxy
- Admin/vendor panels implement **fallback** from Apache `/uploads` to Node `:5001` when needed (`media.js`, `AppImage.jsx`)

---

## 12. Local development (quick reference)

### 12.1 Prerequisites

- Node.js 18+
- MongoDB reachable at `MONGODB_URI` (default `mongodb://127.0.0.1:27017/ohoecom`)

### 12.2 Environment

```bash
# Backend
cp Backend/.env.example Backend/.env
# Set JWT_SECRET, PORT (5001), MONGODB_URI
```

Frontends auto-target **localhost:5001** unless `VITE_API_URL` is set.

### 12.3 Install and run

```bash
cd Backend && npm install && npm run dev
cd AdminPannel && npm install && npm run dev
cd VenueVendorPanel && npm install && npm run dev
```

Optional first-time data:

```bash
cd Backend && npm run seed
```

### 12.4 Verify

- `GET http://localhost:5001/api/health` → `{ "status": "ok", ... }`
- Admin login at http://localhost:5173/
- Vendor panel at http://localhost:5174/

---

## 13. Production deployment

See **`docs/DEPLOYMENT.md`** for Apache vhost samples (`deploy/`), PM2 process management, SSL, and environment split (`Backend/.env.production.example`, frontend `.env.production` examples).

Typical pattern:

- Build admin and vendor panels: `npm run build`
- Serve static build via Apache or CDN
- Proxy `/api` (and optionally uploads) to Node on internal port
- Run MongoDB as managed service or dedicated server
- One PM2 instance runs schedulers; others set `DISABLE_SCHEDULER=true`

---

## 14. Testing and quality

- Backend: `npm test` in `Backend/` runs Node’s built-in test runner on `tests/*.test.js`
- API manual testing: import curls from **`Backend/docs/API.md`** into Postman

---

## 15. Related documents

| Document | Use when |
|----------|----------|
| `README.md` | First clone, install, run |
| `Backend/docs/API.md` | Endpoint-by-endpoint HTTP reference |
| `Backend/docs/README.md` | Backend-only quick start |
| `APP_INTEGRATION_PROMPT.md` | Implementing or updating **mobile apps** |
| `docs/DEPLOYMENT.md` | Going live on a VPS |
| `DEPLOY-IT-HANDOFF.md` | Handoff notes for ops |

---

## 16. Glossary

| Term in UI | Meaning in API/data |
|------------|---------------------|
| Service | Event/wedding vendor offering (stored as **Venue**) |
| Service vendor | **VenueVendor** entity |
| Shop / Ecom vendor | **Vendor** entity |
| Both vendor | One phone; `vendorPanelType: "both"` — shop + service |
| Venue | Not necessarily a physical hall — any bookable **service listing** |
| Reels | **ProductVideoFeed** or **VenueVideoFeed** |
| Plan | **VendorPlan** / **VendorPlanSubscription** (platform subscription) |
| Promotion | Paid marketing **PromotionPlan** / **PromotionSubscription** |

---

## 17. Summary

OHO E-Bazar is a **monolithic Node API** plus **two React admin/vendor dashboards**, backing **three mobile app personas** (user, seller, delivery). MongoDB holds all business state; JWT secures actor-specific routes; cron maintains time-sensitive booking, banner, and subscription logic. Use this guide for orientation, **`Backend/docs/API.md`** for integration details, and **`APP_INTEGRATION_PROMPT.md`** when extending mobile clients.

*Last aligned with repository structure on the `main` branch (admin hot deals, venue enquiries, feature controls, banner/plan extensions).*

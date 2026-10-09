# OHO E-Bazar — Vendor Mobile App: Complete Development Guide

**One document. Everything the mobile developer needs to build the Vendor App so that it works *exactly* like the existing web Vendor Panel (`VenueVendorPanel/`) for all three vendor types:**

1. **Service vendor** (venue / event service provider) — panel mode `service`
2. **E-commerce vendor** (shop / product seller) — panel mode `ecom`
3. **Both** ("Service & Shop") — one person with both accounts — panel mode `both`

Source of truth: the React web panel in `VenueVendorPanel/src` and the Node backend in `Backend/`. Every screen, field, validation, message, status value and API call below was taken from that code. Nothing here is invented.

---

## 0. MASTER PROMPT (copy this to the app developer / AI coding tool)

> Build the **OHO E-Bazar Vendor App** (Android + iOS) as a 1:1 functional replica of the existing web Vendor Panel. Use the **existing backend APIs only** — do not change or add backend endpoints, database schemas, admin panel or the web panel.
>
> The app supports three vendor types — **Service**, **E-commerce (Shop)** and **Both** — with one OTP login. After login the backend returns a session that can contain **two accounts** (`accounts.service` and `accounts.ecom`), each with its own JWT `token` + `refreshToken`. A "Both" vendor can switch between **Service / Both / Shop** modes from a toggle; navigation, dashboard, profile, reels, promotions and notifications change per mode.
>
> **Token rule:** every request to `/api/vendor/*` uses the **ecom** token; every request to `/api/venue-vendor/*`, `/api/vendor-panel/*` and `/api/public/*` uses the **service** token (in single-mode sessions just use the session token). On HTTP 401, call `POST /api/vendor-panel/auth/refresh {refreshToken, mode}` once for the right account, retry the request once, and if refresh fails, log out.
>
> Implement these screens exactly as specified in this document: Splash, Login (mobile + 4-digit OTP), Register (3 steps: vendor type → personal → documents & shop), App Shell (header with mode toggle + notification bell + avatar menu, drawer with nav + dynamic "Pages" + logout, pending-approval banner, announcement ticker), Dashboards (Service / Shop / Both), Services (list / add / edit / view), Bookings (list / detail + status update + invoice PDF), Products (list / add / delete), Orders (list + filter), Reels (service + product video, ≤ 60 s, ≤ 50 MB), Promotions (plans, city/sub-district targeting, banner upload, Razorpay payment, request history), Profile (4 tabs: Personal / Business / Bank / Documents; Both-mode updates both accounts), Notifications, Static Pages (HTML).
>
> Respect every validation rule, limit, status label and message in this document. Use Razorpay's **native** SDK with the same `keyId / orderId / amountPaise` returned by the backend and send `razorpay_order_id / razorpay_payment_id / razorpay_signature` + `subscriptionId` to the confirm endpoint. Do not show fake data, fake counts, fake reviews, fake discounts or fake badges — show only what the API returns, and show proper empty states.

---

## Table of contents

1. [Vendor types, accounts and modes](#1-vendor-types-accounts-and-modes)
2. [Non-negotiable rules](#2-non-negotiable-rules)
3. [Recommended stack and web → mobile translation](#3-recommended-stack-and-web--mobile-translation)
4. [API basics (base URL, envelope, errors, media)](#4-api-basics)
5. [Authentication and session engine](#5-authentication-and-session-engine)
6. [Mode switching and navigation](#6-mode-switching-and-navigation)
7. [App shell (header, drawer, banners)](#7-app-shell)
8. [Screen specifications](#8-screen-specifications)
9. [Shared dashboard widgets](#9-shared-dashboard-widgets)
10. [Validation rules (master list)](#10-validation-rules-master-list)
11. [Status values and badge mapping](#11-status-values-and-badge-mapping)
12. [Profile completion algorithm](#12-profile-completion-algorithm)
13. [Service pricing rules](#13-service-pricing-rules)
14. [Razorpay payment flow](#14-razorpay-payment-flow)
15. [Complete API reference](#15-complete-api-reference)
16. [Data shapes used by the UI](#16-data-shapes-used-by-the-ui)
17. [Known panel behaviours and gaps (read before building)](#17-known-panel-behaviours-and-gaps)
18. [Mobile-only additions that use existing APIs](#18-mobile-only-additions-that-use-existing-apis)
19. [Branding](#19-branding)
20. [QA acceptance checklist](#20-qa-acceptance-checklist)
21. [Suggested build milestones](#21-suggested-build-milestones)

---

## 1. Vendor types, accounts and modes

| Registration choice (UI) | `vendorPanelType` sent | Backend creates | Session `capabilities` | Default `panelMode` after login |
|---|---|---|---|---|
| **E-commerce** — "Sell products online through the marketplace." | `ecom` | `Vendor` document (ecom) | `["ecom"]` | `ecom` |
| **Service Provider** — "Offer venue and event services for booking." | `service` | `VenueVendor` document | `["service"]` | `service` |
| **Both** — "Run an online shop and offer services from one account." | `both` | **both** documents with the same phone | `["ecom","service"]` | `both` |

- Both accounts are linked by **phone number**. One OTP login returns both accounts if both exist.
- Each account has its **own** JWT pair and its **own** `approvalStatus` (`pending` / `approved` / `rejected` / `suspended`).
- `panelMode` values: `service | ecom | both`. Any unknown value is treated as `service`.
- Mode labels: `service` → "Service", `ecom` → "E-commerce", `both` → "Service & Shop". Window title / app bar subtitle: "Service Vendor", "E-commerce Vendor", "Service & Shop Vendor".

---

## 2. Non-negotiable rules

1. **Do not change the backend**, database schemas, Admin panel or the web Vendor Panel. The app is a new client of the same APIs.
2. **Same behaviour as panel**: same fields, same validations, same limits, same status values, same success/error messages (wording can be localized, meaning must not change).
3. **No invented data**: no fake customers, reviews, ratings, counts, discounts, countdowns, "limited stock", verification badges or trust claims. If the API returns nothing, show the empty state text given in this doc.
4. **No invented links**: every navigation target in this doc exists in the panel.
5. Secure storage for tokens (Keychain / Keystore). Never log tokens.
6. All money is INR, formatted `₹` + Indian grouping (`₹15,000`).

---

## 3. Recommended stack and web → mobile translation

Framework is your choice (Flutter or React Native both fine). Required capabilities: HTTP client with interceptors, secure storage, image/video/PDF picker, camera, video metadata reader, WebView/HTML renderer, Razorpay native SDK, file save/share, push notifications (FCM).

| Web panel behaviour | Mobile equivalent (keep the same logic) |
|---|---|
| `localStorage["oho_venue_vendor_auth"]` | Secure storage key `oho_venue_vendor_auth` (same JSON shape, see §5.2) |
| axios request/response interceptors | Same interceptors in your HTTP client (Dio / axios) |
| Sidebar (desktop) / drawer (mobile web) | Side drawer **+** bottom navigation (see §6.3) |
| Tables (bookings, orders, recent lists) | Cards/list tiles showing **every column** of the table |
| SweetAlert2 popups | Native dialogs / snackbars with the same titles and texts |
| `window` focus → refresh profile | App resume (foreground) → refresh profile |
| 30 s notification polling | Same polling while app is in foreground + FCM push (§18) |
| `<input type="file">` | Gallery / camera / document picker with the same size & count limits |
| HTML5 video metadata for duration check | Native video metadata (duration) before upload |
| Razorpay web checkout.js | Razorpay native SDK, same order fields |
| Download invoice blob | Download PDF → save to device / open share sheet |
| `dangerouslySetInnerHTML` static pages | WebView or HTML widget |
| URL query `?status=` / `?tab=` / `?category=` | Screen arguments with the same meaning |

---

## 4. API basics

### 4.1 Base URL

- All endpoints are under **`{API_BASE}/api`**.
- Production `API_BASE` is the same value the web panel uses for `VITE_API_URL` (see `VenueVendorPanel/.env.production`). Put it in app config (`dev` = `http://<LAN-IP>:5001`, `prod` = HTTPS domain).
- Media (images, videos, documents) paths returned by the API may be **relative** (e.g. `/uploads/...`). Build absolute URLs as `API_BASE + path` (add `/` if missing). Absolute `http(s)` URLs are used as-is. On production hosts, strip ports `5000/5001` from media URLs (the panel does this — Apache proxies them).

### 4.2 Response envelope

Most endpoints return:

```json
{ "status": true, "message": "…", "data": [ { … } ] }
```

- `data` is usually an **array**; a single object is wrapped as `data[0]`.
- Some list endpoints add top-level `pagination`, `unreadCount`, `venues`, `bookings`, `products`, `orders`, `categories`, `plans`, etc.
- Auth endpoints (`/vendor-panel/auth/register`, `/otp/verify`) return the session fields at the **top level** (not inside `data`).

**Use one tolerant unwrap helper everywhere (same as panel):**

```
unwrapOne(body):  if body.data is array → body.data[0]
                  else if body.data is object → body.data
                  else → body
unwrapList(body): first array found in → body.data | body.data[0].items | body.data.items |
                  body.<listKey> (venues, bookings, products, orders, categories,
                  subCategories, amenities, plans, cities, subDistricts, announcements) | body
```

### 4.3 Error normalization

For any failed request, the message shown to the user is the first non-empty of:
`response.data.message` → `response.data.error` → transport error message → `"Request failed (<status>)"` → `"Request failed"`.
Keep the HTTP status on the error object (screens use `401` and `404`).

### 4.4 Multipart rules

- File uploads use `multipart/form-data`.
- Text fields: send as strings. Registration and product create **skip empty strings** (trim first).
- Repeated file fields are sent multiple times with the same name (`images`, `shopImages`).

---

## 5. Authentication and session engine

### 5.1 OTP facts (from backend)

- OTP length **4 digits**. OTP valid **5 minutes**. Resend cooldown **30 seconds** (backend returns `resendAfterSeconds`; error text contains "Please wait N seconds before requesting a new OTP" — parse `N`).
- In development (or when `EXPOSE_OTP_IN_RESPONSE=true`) the send-OTP response includes `otp`. Show it as an info dialog **"Development OTP: XXXX"** and a hint under the OTP boxes **"Test OTP (SMS not active): XXXX"**. Never show it if absent.
- Accounts with `status` `blocked`/`inactive` or `approvalStatus` `rejected`/`suspended` get **HTTP 403** on send/verify with messages like "E-commerce account is blocked", "Service provider account application was rejected: <reason>". Show the message as-is.
- Phone not registered → 404 "No vendor account found with this mobile number".

### 5.2 Session object (store exactly this)

```json
{
  "token": "<active/primary access token>",
  "refreshToken": "<active/primary refresh token>",
  "user": { "...active profile..." },
  "panelMode": "service | ecom | both",
  "capabilities": ["ecom", "service"],
  "vendorPanelType": "service | ecom | both",
  "accounts": {
    "service": { "token": "", "refreshToken": "", "user": {}, "approvalStatus": "pending|approved|…" },
    "ecom":    { "token": "", "refreshToken": "", "user": {}, "approvalStatus": "…" }
  }
}
```

Backend session response (register + verify OTP), top level:

```json
{
  "status": true, "message": "Login successful",
  "capabilities": ["ecom","service"], "vendorPanelType": "both", "panelMode": "both",
  "token": "...", "refreshToken": "...", "expiresIn": "...", "tokenExpiresIn": "...", "tokenExpiresAt": "...",
  "user": { },
  "accounts": {
    "ecom":    { "token": "...", "refreshToken": "...", "user": { }, "approvalStatus": "approved", "expiresIn": "..." },
    "service": { "token": "...", "refreshToken": "...", "user": { }, "approvalStatus": "pending",  "expiresIn": "..." }
  },
  "approvalRequired": true
}
```

(`approvalRequired` is only on register.)

### 5.3 `normalizePanelAuthSession(raw)` — implement exactly

1. `payload = unwrapOne(raw)`.
2. `accounts = payload.accounts` if it is a non-empty object; otherwise build it from `payload.token/refreshToken/user`:
   - `vendorPanelType == "both"` → put the same account in both `service` and `ecom`;
   - `"ecom"` → only `ecom`; otherwise only `service`.
3. `capabilities` = `payload.capabilities` filtered to `ecom|service`; if empty → `["ecom" if accounts.ecom.token] + ["service" if accounts.service.token]`.
4. `panelMode = normalize(payload.panelMode)`; `vendorPanelType = payload.vendorPanelType || (capabilities.length>1 ? "both" : panelMode || "service")`.
5. If `vendorPanelType=="both"` **and** capabilities contain both → `panelMode="both"`; else if exactly one capability → `panelMode = that capability`.
6. `primary` = (`both` → `accounts.service || accounts.ecom`) else `accounts[panelMode]`, falling back to `service`, then `ecom`.
7. Session = `{ token: payload.token ?? primary.token, refreshToken: payload.refreshToken ?? primary.refreshToken, user: payload.user ?? primary.user, panelMode, capabilities, vendorPanelType, accounts, approvalRequired }`.

Persist only if `token` and `user` exist; otherwise clear storage.

### 5.4 Ecom user normalization (`normalizeEcomProfileUser`) — apply to every ecom user you store

The ecom backend uses different field names. Map them for display:

| UI field | Ecom API field (fallback) |
|---|---|
| `panNumber` | `panCardNumber` |
| `gstNumber` | `gstin` |
| `accountNumber` | `accountNo` |
| `ifscCode` | `ifsc` |
| `businessDescription` | `shopDescription` |
| `panCard` (document) | `panCardFront` |
| `showPhoneOnApp` | `showPhoneOnApp !== false` (default true) |

And when **sending** ecom profile updates, map back: `panNumber→panCardNumber`, `gstNumber→gstin`, `accountNumber→accountNo`, `ifscCode→ifsc`, `businessDescription→shopDescription`, and **drop `businessEmail`** (ecom API does not take it).

### 5.5 Which token goes on which request

```
if panelMode != "both":   Authorization: Bearer <session.token>
else:
   path starts with /vendor/           → accounts.ecom.token
   path starts with /venue-vendor/     → accounts.service.token
   path starts with /vendor-panel/ or /public/ → accounts.service.token
   anything else                       → accounts.service.token
   (fallback to session.token if that account token is missing)
```

Note: `/vendor-panel/...` must be checked before `/vendor/` (string prefix). Some screens also pass an explicit token header (e.g. get-me for a specific account) — explicit header wins.

### 5.6 Refresh on 401 — implement exactly

- Skip refresh for public auth URLs: anything containing `/vendor-panel/auth/`, `/venue-vendor/auth/login`, `/venue-vendor/auth/otp/`, `/venue-vendor/auth/register`, `/venue-vendor/auth/refresh`, `/venue-vendor/auth/forgot-password`, `/venue-vendor/auth/reset-password`, `/vendor/auth/refresh`.
- On 401 for any other request that has not been retried:
  1. `apiMode` = (`panelMode=="both"` → mode from URL per §5.5, else `panelMode`).
  2. `refreshToken` = `accounts[apiMode].refreshToken || session.refreshToken`. If none → logout.
  3. `POST /api/vendor-panel/auth/refresh` body `{ "refreshToken": "...", "mode": "ecom" | "service" }` (**without** Authorization header). Response: `data[0].token`, `data[0].refreshToken` (refresh token may be omitted → keep old one).
  4. Update `accounts[apiMode].token/refreshToken`. Update top-level `token/refreshToken`: in `both` → `accounts.service ?? accounts.ecom`, else → new values. Persist.
  5. Retry the original request **once** with the new token.
  6. Only **one** refresh in flight at a time — queue concurrent 401s on the same refresh future.
  7. If refresh fails or the retried request returns 401 again → clear session, go to Login ("session expired").
- Refresh errors from backend: 400 "Refresh token is required", 400 "Invalid mode. Use ecom or service", 401 "Invalid or expired refresh token", 403 "Forbidden" (wrong role for mode).

### 5.7 App start and resume

- **Splash**: read stored session (migrate legacy: if it has `token`+`user` but no `panelMode/capabilities`, treat as `service` with `accounts.service = {token, refreshToken, user, approvalStatus: user.approvalStatus}`). Load public app config (`GET /public/app-config`) for logo/name. Token present → Dashboard; else → Login.
- **On every app resume (foreground)** and on shell mount: fetch profile with `GET /venue-vendor/auth/me` (mode `service`, also used in `both`) or `GET /vendor/auth/me` (mode `ecom`) and update `user`. 401 here → logout.
- Get-me response: `body.user` or `body.data[0].user` or `body.data[0]`.

### 5.8 Logout

Confirmation dialog (panel uses `confirmLogout`) → clear session → Login. Reset `panelMode` to `service`, empty capabilities/accounts. (Mobile: also `DELETE` device token — §18.)

---

## 6. Mode switching and navigation

### 6.1 Mode toggle (`PanelModeToggle`)

- Visible **only** when capabilities include both `ecom` and `service`.
- Three segments in this order: **Service | Both | Shop**. Active segment highlighted.
- Selecting a mode:
  - `both`: `panelMode="both"`, top-level `token/refreshToken/user` = `accounts.service` (fallback `accounts.ecom`).
  - `service`/`ecom`: only if that capability exists and that account has a token → `panelMode=mode`, top-level token/refresh/user = that account (ecom user normalized).
  - Persist, then navigate to **Dashboard** (replace stack).
- Shown in the header (compact) and at the top of the drawer.

### 6.2 Allowed screens per mode (route guard)

If the current screen is not allowed for the active mode, redirect to Dashboard.

| Screen group | service | ecom | both |
|---|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | ✅ |
| Services (`venues`) list/add/edit/view | ✅ | ❌ | ✅ |
| Reels | ✅ | ✅ | ✅ |
| Bookings list/detail | ✅ | ❌ | ✅ |
| Products list/add | ❌ | ✅ | ✅ |
| Orders | ❌ | ✅ | ✅ |
| Promotions | ✅ | ✅ | ✅ |
| Profile | ✅ | ✅ | ✅ |
| Pages (static) | ✅ | ✅ | ✅ |

### 6.3 Navigation items per mode (exact order and labels from panel)

- **Service**: Dashboard · Services · Reels · Bookings · Promotions · Profile
- **E-commerce**: Dashboard · Reels · Products · Orders · Promotions · Profile
- **Both**: Dashboard · Services · Reels · Bookings · Products · Orders · Promotions · Profile
- Plus a collapsible **"Pages"** group (dynamic static pages, §8.20) and **Logout** at the bottom of the drawer.

Recommended mobile layout (same destinations, nothing added or removed):

| Mode | Bottom bar (max 5) | Drawer (everything) |
|---|---|---|
| service | Dashboard · Services · Bookings · Reels · More | all items + Pages + Logout |
| ecom | Dashboard · Products · Orders · Reels · More | all items + Pages + Logout |
| both | Dashboard · Services · Bookings · Products · More (Orders, Reels, Promotions, Profile) | all items + Pages + Logout |

### 6.4 Screen titles (app bar)

| Screen | Title |
|---|---|
| Dashboard | Dashboard |
| Services list / add / edit / view | Services / Add Service / Edit Service / View Service |
| Products list / add | Products / Add Product |
| Orders | Orders |
| Bookings | Bookings |
| Reels | Reels |
| Promotions | Promotions |
| Profile | Profile |
| Static page | Page |

---

## 7. App shell

Present on every logged-in screen.

### 7.1 Header (app bar)

- Menu button (opens drawer).
- Title (§6.4).
- **Mode toggle** (compact) — only for Both vendors.
- **Notification bell** with unread badge (`99+` cap) — §8.19.
- **Avatar** button: `user.profileImage` (media URL) or the first letter of `name`/`email` (default "V"). Menu: **Profile**, separator, **Logout**.

### 7.2 Drawer

- Brand logo (`app-config.admin_logo` → fallback `user_logo`), app name (`app-config.app_name`, default "Oho Ebazar"), subtitle = mode label.
- Mode toggle (Both vendors only).
- Navigation items for the mode (§6.3) with active highlight.
- **Pages** group (expandable, open by default): loading text "Loading pages…", empty text "No pages available", else list of page titles → Static Page screen.
- **Logout** button.

### 7.3 Pending approval banner

Show under the header when **mode is `service` or `both` and the service account's `approvalStatus == "pending"`** (`accounts.service.approvalStatus ?? accounts.service.user.approvalStatus`):

> **Account pending approval.** You can update your profile while the admin team reviews your application.

(Panel does not show this banner for ecom-only accounts. Ecom approval status is visible on the Profile screen.)

### 7.4 Announcement ticker

- `GET /venue-vendor/announcements` once per session token; take `data[].message`, trim, drop empty.
- Join with `"   •   "` and show as a horizontally scrolling marquee at constant speed (~60 px/s, min loop 12 s).
- Hide completely if empty or on error.

---

## 8. Screen specifications

Format for each screen: **Purpose · Data loading · UI · Fields & validation · Actions · States & messages.**

### 8.1 Splash / root

See §5.7. No UI other than logo + loader.

### 8.2 Login (OTP) — `/vendor/login`

**If already logged in → Dashboard.**

**Step 1 — Mobile number**
- Logo (app-config), title **"Vendor Login"**, subtitle **"Sign in to manage your shop or services"**.
- Field **Mobile Number** (required): numeric keyboard, placeholder `+91 1234567890`, max 10 digits.
  - Input sanitizer: keep digits only, max 10, and **strip leading digits until the first digit is 6–9**.
  - Validation: `^[6-9]\d{9}$` → error dialog "Invalid mobile number" / "Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9."
- Button **"Send OTP"** (loading "Sending…") → `POST /vendor-panel/auth/otp/send {phone}`.
  - Success: read `data[0].otp` (dev) and `data[0].resendAfterSeconds` (default 30). Show dev OTP dialog "OTP sent" if present. Go to step 2, clear boxes, focus first box, start cooldown.
  - Failure: dialog "Could not send OTP" / server message (fallback "Please check your mobile number and try again.").
- Footer: "Don't have an account? **Register Now**" → Register.

**Step 2 — OTP**
- Subtitle: "Enter the OTP sent to +91 XXXXXXXXXX".
- **4 separate digit boxes**: digit-only, auto-advance on input, backspace on empty box moves back, paste of up to 4 digits fills all boxes, first box uses one-time-code autofill (Android SMS Retriever / iOS `oneTimeCode`).
- Dev hint under boxes when available: "Test OTP (SMS not active): XXXX".
- Button **"Verify OTP"** (loading "Verifying…").
  - If fewer than 4 digits: dialog "Enter OTP" / "Enter the 4-digit code sent to your mobile."
  - `POST /vendor-panel/auth/otp/verify {phone, otp}` (panel does not send `panelMode`; backend then picks the default mode).
  - Success: `normalizePanelAuthSession(response)` → save → toast "Signed in" / "Welcome, <businessName>." or "Welcome back." (1.5 s) → Dashboard (clear back stack).
  - Failure: "Verification failed" / server message (fallback "Invalid or expired OTP. Try again or resend.").
- **Resend OTP** link: disabled while cooldown, label "Resend OTP in Ns" → "Resend OTP". On resend: same send API; dev dialog "OTP resent"; reset boxes; restart cooldown. On error, if message contains "wait N seconds" set cooldown to N.
- **Change number** link: back to step 1, clear OTP, hint and cooldown.

### 8.3 Registration — `/vendor/register`

**If already logged in → Dashboard.** Header "Vendor Registration" with a **3-step stepper**: `1 Vendor Type` → `2 Personal Details` → `3 Documents & Shop`. Back / Next buttons; last step shows **Submit** (loading "Submitting…"). Step 1 shows "Already have an account? **Login**".

**Step 1 — Vendor Type** (radio cards, required): E-commerce / Service Provider / Both (texts in §1).
Error: "Required" / "Please choose a vendor type."

**Step 2 — Personal Details**

| Field | Shown for | Required | Rules |
|---|---|---|---|
| Full Name | all | ✅ | letters + spaces only (sanitize: remove other chars, collapse double spaces), 2–40 chars. Errors: "Full name is required." / "Full name must be at least 2 characters." / "Full name cannot exceed 40 characters." / "Full name should contain only letters and spaces." |
| Email Address | all | ❌ | placeholder "your.email@example.co.in (optional)". If filled must match `^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(co\.in\|com\|in\|net)$` (case-insensitive) → "Enter a valid email ending with .com, .co.in, .in, or .net." |
| Mobile Number | all | ✅ | sanitizer §8.2; exactly 10 digits, starts 6–9. Errors: "Mobile number is required." / "Mobile number should contain digits only." / "Mobile number must be exactly 10 digits." / "Enter a valid Indian mobile number (starts with 6, 7, 8, or 9)." |
| Business Name | all | ✅ | 2–32 chars (input capped at 32). "Business name is required." / "…at least 2 characters." / "…cannot exceed 32 characters." |
| Address (multiline, 3 rows) | **service, both** | ✅ | 10–240 chars. "Address is required." / "Address must be at least 10 characters." / "Address cannot exceed 240 characters." |

**Step 3 — Documents & Shop**

| Field | Shown for | Required | Rules |
|---|---|---|---|
| Shop Category (dropdown) | **ecom only** | ✅ | options from `GET /public/categories?mode=ecom&limit=100&page=1&includeEmpty=true` → "Please select a shop category." |
| Shop Images (grid, "+ Add image") | **ecom, both** | ✅ min 1, max 5 | images only, **≤ 5 MB each**. Hint "At least 1 image, up to 5 (max. 5MB each)". Too big → "File too large" / "Each shop image must be 5 MB or less." Limit → "Limit reached" / "You can upload up to 5 shop images." Missing → "Upload at least one shop image." Each tile has **Remove**. |
| Aadhaar Front | **service, both** | ✅ | image or PDF, ≤ 5 MB. Upload zone text "Click to upload … PDF or Image (max. 5MB)"; after pick shows preview (images) + file name + "Click to replace · PDF or Image (max. 5MB)". Missing → "Upload Aadhaar front side." |
| Aadhaar Back | **service, both** | ✅ | same → "Upload Aadhaar back side." |
| PAN Card | **service, both** | ❌ | same, optional |

Too-large document → "File too large" / "Maximum file size is 5MB."

**Next** validates the current step (dialog title "Required" / "Invalid email" / "Invalid mobile" as in panel). **Submit** re-validates steps 1–3 and jumps to the first failing step.

**Submit request** — `POST /vendor-panel/auth/register` (multipart; skip empty values):

| Part | Value |
|---|---|
| `vendorPanelType` | `ecom` / `service` / `both` |
| `name` | trimmed |
| `email` | only if filled |
| `phone` | 10 digits |
| `businessName` | trimmed |
| `businessPhone` | **same as `phone`** |
| `businessAddress` | only for service/both |
| `category` | ecom: selected id. **Both: silently pick the first ecom category id** (from the loaded list, or fetch `GET /public/categories?mode=ecom&limit=100&includeEmpty=true`); if none → error "Shop setup is temporarily unavailable. Please contact support." |
| `aadhaarCardFront`, `aadhaarCardBack`, `panCard` | files (service/both) |
| `shopImages` (repeat) | files (ecom/both) |

**Response** → `normalizePanelAuthSession`. `approved = approvalRequired === false || user.approvalStatus == "approved"`.
- Approved: "Registration successful" / "Your account is ready. You can start using the vendor panel."
- Else: "Registration submitted" / "Your application is pending admin approval."
- Save session (user is logged in immediately, even when pending) → Dashboard.
- Error: "Registration failed" / server message (fallback "Could not create account."). Backend errors include 409 "An e-commerce vendor account already exists for this phone number", 409 "A service provider account already exists for this phone number", 409 "Email is already registered", 400 "Aadhaar front and back images are required", 400 "At least one shop image is required", 400 "Shop category is required".

### 8.4 Forgot / Reset password (exists in panel, not linked from Login)

The panel's login is OTP-only. These two screens exist at `/vendor/forgot-password` and `/vendor/reset-password` but no button links to them. **Do not add them to the app UI** unless the product owner asks. For reference:
- Forgot: field "Email ID" (required, email) → `POST /venue-vendor/auth/forgot-password {email}` → text "If an account exists for that email, reset instructions have been sent."
- Reset: `token` from link query, password ≥ 8, confirm must match → `POST /venue-vendor/auth/reset-password {token, password}`.

### 8.5 Dashboard — Service mode

**Load in parallel:**
1. `GET /venue-vendor/bookings/dashboard?recentLimit=5` → `stats {total, pending, completed, cancelled}`, `recentBookings[]`
2. `GET /venue-vendor/auth/shop-status` → `isOpen`
3. `GET /venue-vendor/venues?page=1&limit=1` → `pagination.total` = service count (ignore errors)
4. `GET /venue-vendor/catalog/categories?limit=100&page=1` → service categories (ignore errors)

On failure: zero stats, error text "Failed to load dashboard" (or server message).

**UI (top → bottom):**
1. Title **"Dashboard Overview"**, subtitle "Welcome back! Here's your business summary".
2. **Business Open/Closed switch** (§9.1).
3. **Phone visibility switch** (§9.2).
4. Error line (if any).
5. **Admin banner carousel** (§9.3).
6. **4 stat cards** (show "—" while loading; tap → filtered list):
   - Total Bookings (blue, calendar) → Bookings
   - Pending Bookings (yellow, clock) → Bookings `status=pending`
   - Completed Bookings (green, check) → Bookings `status=confirmed`
   - Cancelled Bookings (red, cancel) → Bookings `status=cancelled`
7. **Profile completion card** (§9.4, variant `service`).
8. **Recent Bookings** list — each row: Booking ID (tap → Booking Detail using `orderId ?? id`), Customer, Service (`venue`), Date, Amount (₹), Status badge (Confirmed/Pending/Cancelled). Loading "Loading recent bookings…", empty "No bookings yet."
9. **"Add a Service"** section — subtitle "Pick a category to add a service quickly.", link **Browse all** → Add Service. Grid of category cards (image + name + "Add service") → Add Service pre-selected with that category. Loading "Loading service categories…", empty "No service categories are available yet."

### 8.6 Dashboard — E-commerce mode ("Shop Dashboard")

**Load in parallel:**
1. `GET /vendor/home` → `stats {totalOrders, completedOrders, pendingOrders}`, `newOrders[]`
2. `GET /vendor/products?page=1&limit=1` → `pagination.total` (ignore errors → 0)
3. `GET /public/categories?mode=ecom&limit=12&page=1&includeEmpty=true` (ignore errors)
4. `GET /vendor/auth/me` with ecom token → update `accounts.ecom.user` (normalized)

Error: "Could not load dashboard."

**UI:**
1. Title **"Shop Dashboard"**, subtitle "Welcome back, <businessName|name|Vendor>! Here's your store summary." Primary button **"+ Add Product"** → Add Product.
2. Phone visibility switch (§9.2). *(No Business Open switch in ecom mode.)*
3. Admin banner carousel.
4. **4 stat cards**:
   - New Orders (yellow) = `newOrders.length ?? stats.pendingOrders` → Orders `status=new`
   - Total Orders (blue) = `stats.totalOrders` → Orders
   - Completed (green) = `stats.completedOrders` → Orders `status=completed`
   - Products (blue) = products total → Products
5. Profile completion card (§9.4, variant `ecom`; if the vendor also has a service account, merge both users).
6. **Shop Images panel** (§9.5).
7. **Recent Orders** (link "View all" → Orders). Row: Order ID (`orderDisplayId || orderNumber || orderId`), Customer (`customerName`), Product (`productName`), Date (`orderDate`), Amount (`totalAmountLabel` or ₹`totalAmount`), Status badge. Loading "Loading recent orders…", empty "No orders yet. New orders will appear here."
8. **"Add a Product"** — "Pick a category to list a new product quickly.", "Browse all" → Add Product; category cards → Add Product with category pre-selected. Empty: "No shop categories available yet."

### 8.7 Dashboard — Both mode

**Load in parallel** (all of §8.5 + §8.6): bookings dashboard, ecom home, venues total, products total, service categories (limit 100), ecom categories (limit 12), service shop-status (service token), get-me for **service** (service token) and **ecom** (ecom token). Update both account users. Use a request counter so only the latest load updates the screen.

**UI:**
1. Title **"Dashboard"**, subtitle "Welcome back, <name>! Manage services and shop in one place." Business Open switch + **"+ Add Product"** button.
2. Phone visibility switch (applies to both accounts; hint "Applies to both your service and shop profiles.").
3. Error line, banner carousel.
4. Profile completion card (variant `both`, combined algorithm §12.3).
5. Shop Images panel.
6. **Add a service / Add a product** section with a **Service | Shop segment toggle** (default Service), "Browse all" goes to Add Service or Add Product accordingly.
7. **"Service overview" / "Shop overview"** stats with a segment toggle (default Service). Hints: "Booking counts for your services." / "Order and product counts for your shop." Service cards: Total Bookings, Pending, Completed, Cancelled. Shop cards: New Orders, Total Orders, Completed, Products.
8. **"Recent bookings" / "Recent orders"** with a segment toggle (default Service) and "View all".

### 8.8 Services list ("Service Management") — service & both

- `GET /venue-vendor/venues?page=1&limit=100` → map rows (§16.3). Reload every time the screen is shown.
- Header "Service Management", subtitle "Manage your service listings · N service(s)", button **"+ Add Service"**.
- Search box "Search services..." — **client-side** filter on name, category name, location (case-insensitive).
- (Panel shows a filter icon that does nothing — omit it in the app.)
- **Service card**:
  - Thumbnail, name, **enable switch**, category name, location (`city, state` or `address` or "—"), price label (§13).
  - Status badge: not `adminApproved` → **"Pending approval"**; `status=="inactive"` → **"Inactive"**; else **"Active"**.
  - Second line: approved → "Total Bookings: 0" *(panel hard-codes 0 — see §17)*; not approved → "Awaiting admin review".
  - Switch is **disabled until admin approved**. Toggle → optimistic update → `PATCH /venue-vendor/venues/:id {status:"active"|"inactive"}`; on error revert and show "Could not update status".
  - Buttons: **View** → View Service, **Edit** → Edit Service, **Delete** (icon) → confirm "Delete service?" / `Remove "<name>" from your listings?` (Delete red / Cancel) → `DELETE /venue-vendor/venues/:id` → remove from list; error "Could not delete service".
- States: loading "Loading your services…"; error text + **Retry**; empty "No services yet. Click Add Service to create your first listing."; no match "No services match your search."

### 8.9 Add / Edit Service

Entry: Add (optional pre-selected `category` from dashboard), Edit (`GET /venue-vendor/venues/:id` → `data.venue`; 404 → not found; 401 → logout). Header eyebrow "Add service"/"Edit service", title "Add new service"/venue name.

**Section 1 — "Select service type"** (required): grid of category cards (image + name) from `GET /venue-vendor/catalog/categories?limit=100`; if empty, fallback `GET /public/categories?mode=venue&limit=100&includeEmpty=true`. Loading "Loading service types…"; error in red; empty "No service types found. Ask admin to add categories." Category image: use `category.image` (panel has a fallback icon helper `resolveServiceCategoryImage`).

**Section 2 — "Add service photos"** — counter "N/6 photos (min 1)". **Min 1, max 6** photos. Existing photos (thumbnail + images) are pre-filled in edit mode. Each tile has × remove. Over limit: "Photo limit reached" / "You can add up to 6 photos per service." or "Only N more photo(s) added (maximum 6)."

**Section 3 — "Service details"**

| Field | Required | Rules |
|---|---|---|
| Service name | ✅ | max 80, placeholder "e.g. DJ Booking Service" |
| Short description | ❌ | max 200, placeholder "e.g. DJ + Sound + Light" |
| Price (₹) | ✅ | integer, > 0, placeholder "15000" |
| Price type (segmented) | ✅ | **Full booking** (`full`, default) · **Per hour** (`hourly`) · **Per day** (`day`) |
| Booking token (₹) | ✅ | integer ≥ 0, **must not exceed price**, help text "Paid by the customer at booking time.", placeholder "3000" |

Validation order and messages (dialog "Validation error"):
1. "Select a service type."
2. "Service name is required." / "Service name cannot exceed 80 characters."
3. "Short description cannot exceed 200 characters."
4. "Add at least one service photo." / "You can upload at most 6 photos."
5. "Enter a valid price greater than 0."
6. "Enter a valid booking token amount."
7. "Booking token cannot be greater than the service price."

Edit-mode pre-fill: `priceType` = venue.priceType if valid; else `hourly` when only hourlyPrice > 0; else `day` when dayPrice > 0; else `full`. Price = hourly → `hourlyPrice`; day → `dayPrice ?? basePrice`; full → `basePrice ?? dayPrice`. Description = `shortDescription || description`. Token = `tokenAmount`.

**Payload** (multipart if new photos, else JSON for edit):

```
name, shortDescription, description (= shortDescription), category, priceType, price, tokenAmount,
amenities = "[]" (JSON string in multipart / [] in JSON),
address = existing venue address || profile businessAddress   (omit if both empty — backend rejects "")
files: thumbnail = first NEW photo, images = remaining NEW photos
```

- Create: `POST /venue-vendor/venues` → `data.venue`. Edit: `PATCH /venue-vendor/venues/:id`.
- Success (create): "Service created" / approved ? "Your service is live and visible to users." : "Your service was submitted and will appear after admin approval." → Services list.
- Success (edit): "Service updated" / approved ? "Your changes were saved." : "Your changes were saved and will appear after admin approval." → View Service.
- Error: "Save failed" / server message (fallback "Could not save service."). 401 → logout.
- Buttons: **Cancel** / **Create service** or **Save changes** (spinner "Saving…").

> Note: removing an *existing* photo in edit mode only removes it from the preview; the panel does not send a "removed images" list. Keep the same behaviour (see §17).

### 8.10 View Service

`GET /venue-vendor/venues/:id`. 404 → not found screen; 401 → logout; other error → text + "Back to services".

- Header: name, subtitle "<category name> · <location>", button **Edit service**.
- Badges: status label (Pending approval / Inactive / Active) + "Admin approved" (green) or "Awaiting review" (yellow).
- Gallery: thumbnail + images (deduplicated); placeholder if none.
- **Overview**: Description, Sub-category.
- **Pricing**: price row (§13 label + formatted price), Token amount (flat ₹ or `%`, else "—").
- **Location**: Address, City / Sub-district (`city, state` or address).
- **Facilities**: amenity names as chips, else "No facilities listed."
- Footer: **Back** · **Edit service**. Empty values show "—".

### 8.11 Bookings list ("Booking Management") — service & both

- `GET /venue-vendor/bookings?page=1&limit=100&status=<filter>&search=<text>` → `bookings[]`. Search is **server-side**, debounced **300 ms**.
- Header "Booking Management", subtitle "View and manage all service bookings".
- Search "Search by ID, customer, or service...". Status filter: **All statuses · Confirmed · Pending · Cancelled** (can be preset from dashboard).
- Booking card (all table columns): Booking ID (`id`), Customer, Service (`venue`), Date, Amount (`amount ?? grandTotal`), Paid (`amountPaid ?? payment.amountPaid`), Remaining (`remainingAmount ?? payment.remainingAmount`), Status badge, Payment badge, **View** → detail (`orderId ?? id`).
- States: "Loading bookings…", "No bookings match your search.", error text.

### 8.12 Booking detail

`GET /venue-vendor/bookings/:id` → `unwrapOne`. 404 → back to list. Other error → dialog "Could not load booking". Loading "Loading booking details…".

- Header "Booking Details", subtitle "Booking ID: <id>", button **Download Invoice**.
- **Service Information**: Service Name, Category, Location, Full Address.
- **Customer Information**: Name, Email, Phone, Address (make phone tappable to call and email tappable — mobile convenience, same data).
- **Booking Details**: Booking Date, Booking Time, Number of Guests, Booked On, Special Requests (full width).
- **Booking Status** card: dropdown **Pending · Confirmed · Processing · Cancelled** (initial = `orderStatus ?? status`), button **Update Status** (loading "Saving…") → `PATCH /venue-vendor/bookings/:id/status {status}` → replace detail with response → toast "Status updated" / "Booking <id> is now <status>." Error "Update failed".
- **Payment Details**: Base Price, Tax & Fees, **Total Amount** (`total ?? grandTotal`), Token (`<pct>%`) only if `tokenAmountPercentage > 0`, Amount Paid, Remaining Amount, Amount Due Now only if > 0, Payment Method, Payment Status badge (`statusLabel` or Paid / Partially paid / Refunded / Pending), Transaction ID.
- **Invoice**: `GET /venue-vendor/bookings/:id/invoice?format=pdf` as binary → save as `<bookingId>-invoice.pdf` → open/share. Error "Invoice download failed".

### 8.13 Products list ("Product Management") — ecom & both

- `GET /vendor/products?page=1&limit=100` → items.
- Header "Product Management", subtitle "Manage your shop catalog · N product(s)", button **"+ Add Product"**.
- Search "Search products..." — client-side on name, category name, sub-category name.
- **Product card**: image (`thumbnail || images[0]`), name ("Untitled product"), status badge — `adminApproved === false` → **"Pending approval"**; `status=="inactive"` → **"Inactive"**; else **"Active"**; meta "<category> · <subcategory>"; price `₹(price ?? sellingPrice)`; **Delete** button.
- Delete → confirm "Delete product?" / `Remove "<name>" from your catalog?` → `DELETE /vendor/products/:id` → reload. Error "Delete failed".
- States: "Loading your products…"; error + Retry; empty "No products yet" / "Add your first product to start selling from the vendor panel." + Add button; no match "No products match your search" / "Try a different search term."
- *(Panel has no product edit / status toggle — see §17.)*

### 8.14 Add Product

Entry from list, dashboard or category card (`category` pre-selected). Eyebrow "Add product", title "Add new product".

**"Product details"**

| Field | Required | Rules / source |
|---|---|---|
| Product name | ✅ | non-empty after trim; placeholder "Enter product name" |
| Short description | ❌ | multiline 3 rows; "Brief description for customers" |
| Category | ✅ | `GET /vendor/categories?limit=100` |
| Sub-category | ✅ | disabled until category chosen; `GET /vendor/sub-categories?limit=100&category=<id>`; reset when category changes |
| Price (₹) | ✅ | number, step 0.01, **min 1** |
| Stock quantity | ❌ | integer ≥ 0, default "0" |

**"Product photos"** — counter "N/5 · min 1 required". **Min 1, max 5**, images only, **≤ 5 MB** (larger/non-image files are silently skipped, like the panel). Tile "Remove".

Validation messages: "Product name is required." / "Select a category." / "Select a sub-category." / "Invalid price" – "Enter a valid price (minimum ₹1)." / "Upload at least one product image."

**Request** `POST /vendor/products` multipart (skip empty): `name, description, category, subCategory, price, stock` + `variantType=single` + `images` (repeat).
Success: "Product added" / `adminApproved` ? "Your product is live in the store." : "Product saved. It will appear after admin approval if required." → Products. Error: "Could not add product".
Buttons: **Cancel** · **Save Product** ("Saving…").

### 8.15 Orders ("Order Management") — ecom & both

- `GET /vendor/orders?page=1&limit=100&status=<filter>` (status omitted for "all"). Reload on filter change; search typing re-triggers load after 300 ms but **filtering is client-side** on order ID, customer, product.
- Header "Order Management", subtitle "Track and manage customer orders for your shop".
- Search "Search by order ID, customer, or product...". Filter: **All statuses · New · Accepted · Out for delivery · Completed · Cancelled** (values `new, accepted, out_for_delivery, completed, cancelled`).
- Order card: Order ID, Customer, Product, Date, Amount, Status badge (§11.2).
- States: "Loading orders…"; empty "No orders yet. New orders will appear here once customers start buying."; no match "No orders match your search or filter."
- **View only** — the panel has no order detail or status actions (see §17 for available backend endpoints).

### 8.16 Reels — all modes

**Kind**: service mode → service reels; ecom mode → product reels; **both mode → segment toggle "Service | Shop"** (default Service). Switching kind resets the form.

**Load** (per kind):
- Service: `GET /venue-vendor/venue-video-feeds?page=1&limit=100` (`data[]`) + `GET /venue-vendor/venues?page=1&limit=200` for the link dropdown.
- Shop: `GET /vendor/product-video-feeds?page=1&limit=100` (`data[]`) + `GET /vendor/products?page=1&limit=200&status=active`.
- If the account token for the kind is missing: "Service account is not available." / "Shop account is not available." and disable save.
- Load error: dialog "Load failed".

Subtitle: "Upload service videos for the user app. Linking a service is optional." / "Upload product videos for the user app. Linking a product is optional."

**Form** — title "Add service reel" / "Add product reel" / "Edit reel":

| Field | Rules |
|---|---|
| Title | optional, **max 32 chars**, placeholder "Optional reel title" |
| Service (optional) / Product (optional) | dropdown, first option "No service linked" / "No product linked" |
| Status | Active (default) / Inactive |
| Video | **required on create**, optional on edit. Any video type (hint "MP4 / WebM / MOV · max 50 MB · max 60s"). **≤ 50 MB** → else "Video too large" / "Max video size is 50 MB." **Duration ≤ 60 s** (read metadata before accepting and again before submit) → else "Video too long" / "Max video length is 60 seconds (1 minute)." Unreadable → "Could not read this video. Please try another file." Preview + Remove. |
| Thumbnail (optional) | image, hint "JPG / PNG · shown as cover" |

Missing video on create → "Video required" / "Please choose a video file."

**Save** (multipart):
- Service create `POST /venue-vendor/venue-video-feed` — fields `title, venueId, status` (create skips empty values) + `video`, `thumbnail`.
- Service update `PATCH /venue-vendor/venue-video-feed/:id` — same fields (empty `venueId` **is** sent to unlink).
- Shop create `POST /vendor/product-video-feed` — `title, productId, status` + files.
- Shop update `PATCH /vendor/product-video-feed/:id`.
- Success toast "Reel added" / "Reel updated" → reset form → reload. Error "Save failed" / "Could not save reel."
- Buttons: **Add reel** / **Update reel** ("Saving..."), **Cancel** (edit only).

**List** "Your service reels" / "Your product reels" + count "N reel(s)": card with thumbnail (`thumbnail` → linked venue/product thumbnail), title ("Untitled reel"), linked name (or "No service linked"/"No product linked"), status badge Active/Inactive, **Open video** (play the media URL in an in-app player), **Edit** (pre-fill title (≤32), link id, status; scroll to top) and **Delete** (confirm "Delete reel?" / title or "This video will be removed from the user feed." → `DELETE …/venue-video-feed/:id` or `…/product-video-feed/:id`; error "Delete failed").
Empty: "No service reels uploaded yet. Add your first reel above." (or product). Loading "Loading your reels…".

### 8.17 Promotions — all modes

- **Service mode**: one panel "Banner Promotions" — subtitle "Promote your services in the user app. Choose a city, upload a banner, and submit for admin approval." Section title "Buy Banner Promotion".
- **Ecom mode**: one panel "Promotions" — subtitle "Buy banner ads, get verified, or boost product visibility in the user app. All plans require admin approval." Section title "Buy Promotion Plan".
- **Both mode**: page "Promotions" — subtitle "Manage service and shop promotions together. Each section uses its own plans and requests." — then **two independent sections**: "Service promotions" (service panel) and "Shop promotions" (ecom panel).

**Load** (per panel): plans, my requests, cities, targets.
- Service: `GET /venue-vendor/promotion-plans`, `GET /venue-vendor/promotions`, `GET /public/cities?limit=500`, `GET /venue-vendor/venues?limit=100&status=active`.
- Ecom: `GET /vendor/promotion-plans`, `GET /vendor/promotions`, `GET /public/cities?limit=500`, `GET /vendor/products?limit=100`.
- Error text "Failed to load promotion plans". Loading "Loading plans…".

**Plan types** (`plan.planType`): `banner`, `product_presence_first`, `get_verified` (ecom). Service plans are always treated as **banner**.

**Form fields:**

| Field | Rules |
|---|---|
| Plan | required. Option text `"<name> (<planTypeLabel or 'Banner Promotion'>)"`. Changing plan clears duration. |
| Duration | required, disabled until a plan is chosen. Options from `plan.durationOptions[]`: `"<typeLabel or type> · <durationDays> day(s) · ₹<price>"`, value = `type`. |
| Start date | required, date picker, **min today**, default today (`YYYY-MM-DD`). |
| City | required, from cities. Changing city clears sub-district. |
| Sub-district | required, disabled until city; `GET /public/sub-districts?city=<id>&limit=500`. |
| Product to boost | **ecom + product_presence_first only**, required → "Select a product for Product Presence First." |
| Link to service / product (optional) | banner plans only (not presence). First option "None". |
| Banner image | banner plans only, **required** → "Banner image is required for banner promotions." Preview. Hint "Recommended about 1200×400px. Use the free daily banner plan for testing without payment." |

Info texts: get_verified → "Get Verified adds a trusted badge to your shop profile in the selected city area after admin approval." Presence with `presenceTopLimit` → "Your product appears in the top N results for its category in the selected city area." *(These are backend plan descriptions — show only when that plan is selected.)*

Missing required → "Select plan, duration, start date, city, and sub-district."

**Submit — button "Pay & submit for approval"** ("Submitting…"):
1. Subscribe (multipart):
   - Ecom `POST /vendor/promotion-plans/subscribe`: `planId, durationType, startDate, cityId, subDistrictId`, `file` (banner), plus presence → `productId=<target>`; banner with link → `targetProductId=<target>` + `targetType=product`.
   - Service `POST /venue-vendor/promotion-plans/subscribe`: same base fields, `file`, optional `targetVenueId`.
2. Response `unwrapOne` → if `requiresPayment` → Razorpay (§14) with description `checkout.description || "Banner promotion"` → confirm:
   - Ecom `POST /vendor/promotion-plans/confirm`, Service `POST /venue-vendor/promotion-plans/confirm` with `{subscriptionId, razorpay_order_id, razorpay_payment_id, razorpay_signature}`.
3. Success message: paid → "Payment received. Promotion is pending admin review."; free → "Promotion submitted for admin review." Clear banner, duration and target; reload.
4. Payment dismissed → "Payment cancelled. Try again when you are ready." Other errors → message / "Could not submit promotion".

Empty plans: ecom → "No e-commerce promotion plans are available yet. Run seed or ask admin to create plans with vendor type "E-commerce vendor"."; service → "No service Banner Promotion plans are available yet. Run seed or ask admin to create one with vendor type "Service vendor"." *(you may shorten to "No promotion plans are available yet. Please contact admin." — the meaning is the same.)*

**"Your requests"** list: banner thumbnail (if any), title `planName || planTypeLabel || "Promotion"`, line `"<planTypeLabel> · <cityName>/<subDistrictName> · <startDate> – <expiryDate> · ₹<amount>"`, badge `statusLabel || status || approvalStatus`. Empty "No promotion requests yet."

### 8.18 Profile

#### 8.18.1 Single-account profile (service mode or ecom mode)

- On open: `GET /venue-vendor/auth/me` or `GET /vendor/auth/me` (per mode) → fill form. Error dialog "Could not load profile". Loading "Loading profile…".
- Header "Profile", line "Approval status: **<user.approvalStatus or —>**".
- **4 tabs** (can be opened directly with a tab argument from the completion card): **Personal Details · Business Details · Bank Details · Documents Upload**.
- **Save profile** button ("Saving…") saves **only the active tab**. Validation runs on the active tab; on error switch to the failing tab and show "Validation error" / message.

| Tab | Field | Required | Rules |
|---|---|---|---|
| Personal | Profile photo (round avatar, "Choose image") | ❌ | image |
| | Full Name | ✅ | §10 name rules (2–40, letters/spaces) |
| | Email Address | ❌ | §10 email rules; saved lowercased |
| | Mobile Number | ✅ | 10 digits, 6–9 start |
| Business | Business Name | ✅ | 2–32 |
| | Business Mobile | ✅ | 10 digits, 6–9 start ("Business mobile number …" messages) |
| | Business Email | ❌ | no validation (dropped for ecom) |
| | Address | ✅ | 10–240 |
| | Description | ❌ | free text |
| | PAN Number | ❌ | uppercase alphanumeric, exactly 10 if filled; placeholder "ABCDE1234F"; full keyboard with caps |
| | GST Number | ❌ | uppercase alphanumeric, exactly 15 if filled; placeholder "22AAAAA0000A1Z5" |
| Bank | Bank Name | ✅ | letters/spaces, 2–32 |
| | Branch Name | ✅ | letters/spaces, 2–64 |
| | Account Type | ✅ | **Current** (default) / **Savings** |
| | Account Number | ✅ | digits, 9–18 |
| | IFSC Code | ✅ | `^[A-Z]{4}0[A-Z0-9]{6}$`, placeholder "SBIN0001234" |
| Documents | Aadhaar Front (max 5 MB) | ✅ if none on file | image/PDF ≤ 5 MB |
| | Aadhaar Back (max 5 MB) | ✅ if none on file | image/PDF ≤ 5 MB |
| | PAN Card (max 5 MB) | ❌ | image/PDF ≤ 5 MB |

Documents tab note: "Upload Aadhaar front and back (PDF or image, max 5 MB each). PAN card is optional." Existing documents show as previews (`aadhaarCardFront || aadhaarCard`, `aadhaarCardBack`, `panCard`).

**Payload per tab:**
- personal → `{name, email (lowercase), phone}` + file `file` (profile photo)
- business → `{businessName, businessPhone, businessEmail, businessAddress, businessDescription, panNumber (UPPER), gstNumber (UPPER)}`
- bank → `{bankName, branchName, accountType, accountNumber, ifscCode (UPPER)}`
- documents → files `aadhaarCardFront`, `aadhaarCardBack`, `panCard`

**Endpoints:**
- Service: `PATCH /venue-vendor/auth/me` — JSON, or multipart when any file is attached.
- Ecom: `PATCH /vendor/profile` — map field names (§5.4), JSON or multipart (`file`, `shopLogo`, `shopImages`, and — see §17 — `aadhaarCardFront`, `aadhaarCardBack`, `panCard`).
- Success toast "Profile updated" (1.5 s), update stored user, clear picked files. Error "Update failed" / message.

#### 8.18.2 Both-mode profile

- Loads **both** profiles in parallel (`/venue-vendor/auth/me` with service token, `/vendor/auth/me` with ecom token). Header line: "Service approval: **<x>** · Shop approval: **<y>**".
- Same 4 tabs and fields. Form values = service user, with empty fields filled from the ecom user (normalized).
- **Save sends the same tab payload to BOTH accounts in parallel** (`PATCH /venue-vendor/auth/me` + `PATCH /vendor/profile`), then reloads both profiles. Validation error dialog title: "Check your details". If neither token exists: "No vendor account is available to update."
- Avatar: service profile image → ecom profile image → initial.

### 8.19 Notifications (header bell)

- **Load** with `limit=20` on shell start, every **30 s**, and when the panel opens:
  - service mode → `GET /venue-vendor/notifications?page=1&limit=20`
  - ecom mode → `GET /vendor/notifications?page=1&limit=20`
  - both → both in parallel; merge, sort by `createdAt` desc, keep 20; unread = sum.
  - Response: `data[]`, `unreadCount`, `pagination`.
- Panel header "Notifications" + **Mark all read** (only if unread > 0) → `PATCH …/notifications/read-all` (both endpoints in both mode).
- Item: title ("Notification"), message, relative time ("Just now", "Nm ago", "Nh ago", "Nd ago", else "D Mon"); unread items highlighted.
- Tap item: if unread → `PATCH …/notifications/:id/read` (in both mode: ecom endpoint if the item has an ecom link, else service endpoint), decrement badge, then navigate:
  - **Ecom link**: `linkPath`/`metadata.linkPath` starting with `/vendor` → that screen; else type starts with `ecom_order` or has `orderId/order` → Orders; type contains `promotion` → Promotions.
  - **Service link**: `linkPath`/`metadata.linkPath` starting with `/` → that screen; type `venue_booking_placed` with `metadata.bookingId || orderId || order` → Booking Detail.
  - Map web paths to app screens (`/vendor/orders` → Orders, `/vendor/bookings/<id>` → Booking detail, `/vendor/promotions` → Promotions, etc.).
- Empty "No notifications yet."; loading "Loading…".

### 8.20 Static pages ("Pages" group)

- List: `GET /venue-vendor/app-settings` → `data[0].staticPages[] {title, slug}`; if empty or error → `GET /public/pages?app=venue_vendor` → `data[] {title, slug}`.
- Page: `GET /public/pages/<slug>?app=venue_vendor` → `data[0] {title, content(HTML)}` → render HTML in a WebView. Missing title or 404 → go to Dashboard. Other error: "Could not load this page." + "Back to dashboard". Loading "Loading page…".

### 8.21 Payments

`/vendor/payments` is a placeholder page in the panel and is **not in the navigation**. Do not build it.

> The panel also contains an older **Plans** page (`PlansPage.jsx` → `/venue-vendor/plans…`, single banner upload) that is **not routed** in the panel. Do not build it; Promotions (§8.17) is the live feature.

---

## 9. Shared dashboard widgets

### 9.1 Business Open / Closed switch (service & both dashboards)

- Initial: `user.isOpen !== false`, then `GET /venue-vendor/auth/shop-status` → `isOpen`.
- Card text: **"Business Open"** – "Users can see and book your services." / **"Business Closed"** – "Your services are hidden from users."
- Toggle → `PATCH /venue-vendor/auth/shop-status {isOpen: bool}` (service token) → update user (`result.user` or `isOpen` merged) → message "Business is open. Your services are visible to users." / "Business is closed. Your services are hidden from users." Error → message or "Could not update business status." Disabled while loading/toggling.

### 9.2 Phone visibility switch (all dashboards)

- Initial: ecom mode → `ecomUser.showPhoneOnApp ?? serviceUser.showPhoneOnApp`; others → service first. Treat anything except `false` as visible. In service/both mode also `GET /venue-vendor/auth/phone-visibility` → `showPhoneOnApp`.
- Text: **"Mobile visible on app"** – "Customers can see your business mobile on the user app." / **"Mobile hidden on app"** – "Your business mobile stays private on the user app."
- Toggle sends to **every account active for the mode**: ecom/both → `PATCH /vendor/profile/phone-visibility {showPhoneOnApp}`; service/both → `PATCH /venue-vendor/auth/phone-visibility {showPhoneOnApp}`. Update returned users.
- Message: "Your mobile number is visible to customers on the user app." / "Your mobile number is hidden from customers on the user app." Error → "Could not update phone visibility." Both mode hint: "Applies to both your service and shop profiles."

### 9.3 Admin banner carousel (all dashboards)

- `GET /public/banners?type=venue` → keep only banners **without a `source`** (admin "Banner Management (Venue)" banners, not paid promotions).
- Hidden while loading or when empty. Auto-advance every **5 s** when > 1, dot indicators (tap to jump). Image only (`image`, alt `title`). No click action.

### 9.4 Profile completion card

- Ring with `percent%` "Complete", copy per variant:
  - service: title "Profile completion"; complete "Your profile is complete. Customers can review your details with confidence."; incomplete "D of T details are filled. Finish the remaining modules to improve bookings."
  - ecom: "Shop profile completion"; "Your shop profile is complete. Customers can trust and discover your store."; "D of T details are filled. Finish the remaining modules to improve shop visibility."
  - both: "Profile completion"; "Your service and shop profiles are complete. Customers can book services and shop with confidence."; "D of T details are filled. Complete shared profile details plus services, shop images, and products."
- CTA: complete → **View profile**; incomplete → **Complete remaining** (goes to the first incomplete module's target).
- When complete it is **minimized** (✓, "All profile details are filled.", badge "Complete") with a **Show details / Minimize** toggle.
- Expanded: one row per module — label, `done/total`, progress bar, "Remaining: …" or "All set" / "Required done · Optional: …", link **Fill now** / **Review**.
- Algorithm in §12.

### 9.5 Shop Images panel (ecom & both dashboards)

- Title "Shop Images", hint "Add a shop logo and gallery photos so customers recognize your store.", status "N/5 gallery images · Logo added" / "· Logo optional".
- **Shop logo** slot (square; "Square logo works best"): **+ Add logo** / **Change logo**, **Remove**.
- **Gallery photos**: existing + new tiles, **max 5 total**, each with **Remove**; removed existing images show **Undo remove** buttons. Over limit → "Limit reached" / "You can upload up to 5 shop images."
- **Save shop images** (enabled only when something changed; "Saving…") → `PATCH /vendor/profile` multipart:
  - `shopImages` = **JSON string of kept existing URLs** (first part), then each new file as another `shopImages` part;
  - `shopLogo` = new file, or `""` (empty string) to remove the logo.
- Success "Shop media updated" → update ecom account user. Error "Upload failed" / "Could not update shop images."

---

## 10. Validation rules (master list)

| Rule | Value |
|---|---|
| Indian mobile | `^[6-9]\d{9}$`; input sanitizer: digits only, max 10, drop leading digits until first is 6–9 |
| Email | `^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(co\.in\|com\|in\|net)$` (case-insensitive), always optional |
| Full name | letters & spaces, 2–40 (sanitizer removes other chars, collapses spaces, cuts at 40) |
| Business name | 2–32 (cut at 32) |
| Address | 10–240 |
| PAN number | uppercase A–Z0–9, exactly 10 (optional) |
| GST number | uppercase A–Z0–9, exactly 15 (optional) |
| Bank name | letters & spaces, 2–32 |
| Branch name | letters & spaces, 2–64 |
| Account type | `Current` \| `Savings` |
| Account number | digits, 9–18 |
| IFSC | `^[A-Z]{4}0[A-Z0-9]{6}$` (sanitizer: A–Z0–9, uppercase, max 11) |
| Documents | image or PDF, ≤ 5 MB each; Aadhaar front + back required for service accounts |
| Shop images | images, ≤ 5 MB each, 1–5 |
| Product images | images, ≤ 5 MB each, 1–5 |
| Service photos | images, 1–6 |
| Service name / short desc | ≤ 80 / ≤ 200 |
| Service price / token | price > 0; 0 ≤ token ≤ price |
| Product price / stock | ≥ 1 (decimals ok) / ≥ 0 |
| Reel title | ≤ 32 |
| Reel video | required on create, ≤ 50 MB, ≤ 60 s |
| OTP | 4 digits |
| Promotion start date | ≥ today |
| Reset password | ≥ 8, confirm must match |

---

## 11. Status values and badge mapping

### 11.1 Bookings
- Booking status: `pending` (Pending, yellow), `confirmed` (Confirmed, green), `cancelled` (Cancelled, red); detail screen can also set `processing` (Processing).
- Payment status: `paid` Paid, `partially_paid` Partially paid, `pending` Pending, `refunded` Refunded (use `statusLabel` when provided).

### 11.2 Ecom orders
| status | Label | Tone |
|---|---|---|
| `new` | New | pending (yellow) |
| `pending` | Pending | pending |
| `accepted` | Accepted | confirmed (green) |
| `processing` | Processing | confirmed |
| `out_for_delivery` | Out for delivery | confirmed |
| `completed` | Completed | confirmed |
| `cancelled` | Cancelled | cancelled (red) |
Prefer API `statusLabel` when present.

### 11.3 Services & products
- Service: `adminApproved` falsy → **Pending approval**; `status=="inactive"` → **Inactive**; else **Active**.
- Product: `adminApproved === false` (explicitly false) → **Pending approval**; `status=="inactive"` → **Inactive**; else **Active**.
- Service enable switch only after admin approval; values `active` / `inactive`.

### 11.4 Reels
`active` → Active, `inactive` → Inactive.

### 11.5 Vendor account
`approvalStatus`: `pending`, `approved`, `rejected`, `suspended` (rejected/suspended cannot log in). `status`: `active`, `inactive`, `blocked`.

---

## 12. Profile completion algorithm

`filled(v)`: arrays → length > 0; numbers → > 0; else non-empty trimmed string.
Per module: track **required** fields (if a module has none, track all). `percent = round(done/total*100)`. Module complete when no required field is missing. Overall percent uses all required fields across modules. "Complete remaining" opens the first incomplete module's target.

Targets: `personal|business|bank|documents` → Profile tab; `venues/services` → Add Service; `products` → Add Product; `shopMedia` → Dashboard (scroll to Shop Images).

### 12.1 Service (`getVenueVendorProfileCompletion(user, {venueCount})`)
| Module | Required | Optional |
|---|---|---|
| Personal Details | name, phone | email, profileImage |
| Business Details | businessName, businessPhone, businessAddress | businessEmail, businessDescription, panNumber, gstNumber |
| Bank Details | bankName, branchName, accountType, accountNumber, ifscCode | — |
| Documents | Aadhaar front (`aadhaarCardFront||aadhaarCard`), aadhaarCardBack | panCard |
| Services | at least one service (`venueCount > 0`) | — |

### 12.2 Ecom (`getEcomVendorProfileCompletion(user, {productCount, serviceUser})`)
User = normalized ecom user (merged with service user if the vendor also has a service account; service value wins when filled).
| Module | Required | Optional |
|---|---|---|
| Personal Details | name, phone | email, profileImage |
| Shop Details | businessName (Shop name), businessPhone (Shop mobile), businessAddress, category | businessEmail, panNumber, gstNumber |
| Shop Images | shopImages (≥1) | shopLogo |
| Bank Details | 5 bank fields | — |
| Documents | Aadhaar front, Aadhaar back | panCard |
| Products | at least one product | — |

### 12.3 Both (`getCombinedVendorProfileCompletion(serviceUser, ecomUser, {venueCount, productCount})`)
Merged user (service first, ecom fallback). Modules: Personal · Business (incl. **category** required, businessDescription optional) · Bank · Documents · Services (≥1) · Shop Images (shopImages required, logo optional) · Products (≥1).

---

## 13. Service pricing rules

Stored fields: `priceType`, `basePrice`, `dayPrice`, `hourlyPrice`, `tokenAmount`, `tokenAmountPercentage`. Create/update sends `priceType` + `price`; the backend stores it in the right field.

`positiveAmount(...values)` = first value that is a finite number > 0, else 0.

| priceType | Amount | Unit | Label |
|---|---|---|---|
| `hourly` | positive(hourly, day, base) | hour | Hourly price |
| `day` | positive(day, base) | day | Day price |
| `full` | positive(base, day, hourly) | full | Price |
| missing | hourly-only → hourly; else day > 0 → day; else full | | |

Format: `₹N` (en-IN grouping); hour → `₹N/hr`; day → `₹N/day`; full → `₹N`.
Token display: `tokenAmount > 0` → `₹N`; else `tokenAmountPercentage > 0` → `N%`; else `—`.

---

## 14. Razorpay payment flow

Used by Promotions (both service and ecom).

1. Subscribe API returns (after `unwrapOne`):
   `{ requiresPayment: true, keyId, orderId, amountPaise, currency ("INR"), description, subscriptionId, planName? }`
   If `requiresPayment` is false → no payment (free plan) → done.
2. Open Razorpay **native** checkout:
   - `key = keyId`, `order_id = orderId`, `amount = amountPaise`, `currency`, `name = app-config app_name || "OHO E-Bazar"`, `description`,
   - `prefill = { name: user.name || user.businessName, email: user.email || user.businessEmail, contact: user.phone || user.businessPhone }`,
   - `theme.color = "#fe7000"`.
3. Success → `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` → POST confirm with `subscriptionId`.
4. User closes checkout → treat as error "Payment cancelled" → show the screen's cancel message.
5. `payment.failed` → error with `error.description || error.reason || "Payment failed"`.
6. Never mark anything paid on the client; the confirm API is the source of truth. Reload lists after confirm.

---

## 15. Complete API reference

All paths are relative to `{API_BASE}/api`. **Token** column: S = service token, E = ecom token, – = none.

### 15.1 Unified vendor-panel auth
| Method | Path | Token | Body / Query | Notes |
|---|---|:-:|---|---|
| POST | `/vendor-panel/auth/otp/send` | – | `{phone}` | → `data[0] {phone, expiresInSeconds, resendAfterSeconds, otp?}` |
| POST | `/vendor-panel/auth/otp/verify` | – | `{phone, otp, panelMode?}` | → session (top level) |
| POST | `/vendor-panel/auth/register` | – | multipart (§8.3) | → session + `approvalRequired` (201) |
| POST | `/vendor-panel/auth/refresh` | – | `{refreshToken, mode: "ecom"\|"service"}` | → `data[0] {token, refreshToken, …}` |

### 15.2 Profile / account
| Method | Path | Token | Body |
|---|---|:-:|---|
| GET | `/venue-vendor/auth/me` | S | → `user` |
| PATCH | `/venue-vendor/auth/me` | S | JSON or multipart (`file`, `aadhaarCardFront`, `aadhaarCardBack`, `panCard`) |
| GET / PATCH | `/venue-vendor/auth/shop-status` | S | `{isOpen}` |
| GET / PATCH | `/venue-vendor/auth/phone-visibility` | S | `{showPhoneOnApp}` |
| GET | `/vendor/auth/me` | E | → `user` (normalize) |
| PATCH | `/vendor/profile` | E | JSON or multipart (`file`, `shopLogo`, `shopImages[]`, `aadhaarCardFront`, `aadhaarCardBack`, `panCard`/`panCardFront`); mapped field names (§5.4) |
| PATCH | `/vendor/profile/phone-visibility` | E | `{showPhoneOnApp}` |
| POST | `/venue-vendor/auth/forgot-password` | – | `{email}` (not used in app UI) |
| POST | `/venue-vendor/auth/reset-password` | – | `{token, password}` (not used in app UI) |

### 15.3 Services (venues) & catalog
| Method | Path | Token | Notes |
|---|---|:-:|---|
| GET | `/venue-vendor/venues?page&limit&search&status` | S | → `{venues[], pagination}` |
| GET | `/venue-vendor/venues/:id` | S | → `{venue}` |
| POST | `/venue-vendor/venues` | S | multipart (§8.9) → `{venue}` |
| PATCH | `/venue-vendor/venues/:id` | S | multipart or JSON; `{status}` toggles |
| DELETE | `/venue-vendor/venues/:id` | S | |
| GET | `/venue-vendor/catalog/categories?limit&page&search` | S | service categories |
| GET | `/venue-vendor/catalog/sub-categories?mode=venue&category&limit&page` | S | (available, not used by the simplified form) |
| GET | `/venue-vendor/catalog/amenities?limit&page` | S | (available, not used by the simplified form) |

### 15.4 Bookings
| Method | Path | Token | Notes |
|---|---|:-:|---|
| GET | `/venue-vendor/bookings/dashboard?recentLimit=5` | S | → `{stats, recentBookings[]}` (unwrapOne) |
| GET | `/venue-vendor/bookings?page&limit&status&search` | S | → `{bookings[], pagination}` |
| GET | `/venue-vendor/bookings/:id` | S | → detail (unwrapOne / `booking`) |
| PATCH | `/venue-vendor/bookings/:id/status` | S | `{status}` → updated detail |
| GET | `/venue-vendor/bookings/:id/invoice?format=pdf` | S | binary PDF |

### 15.5 Ecom: dashboard, catalog, products, orders
| Method | Path | Token | Notes |
|---|---|:-:|---|
| GET | `/vendor/home` | E | → `{stats, newOrders[]}` |
| GET | `/vendor/categories?limit=100` | E | |
| GET | `/vendor/sub-categories?limit=100&category=<id>` | E | |
| GET | `/vendor/products?page&limit&status` | E | → `data[]`/`products[]` + `pagination` |
| POST | `/vendor/products` | E | multipart (§8.14) |
| DELETE | `/vendor/products/:id` | E | |
| GET | `/vendor/orders?page&limit&status` | E | → `data[]`/`orders[]` + `pagination` |

### 15.6 Reels
| Method | Path | Token |
|---|---|:-:|
| GET | `/venue-vendor/venue-video-feeds?page&limit` | S |
| POST | `/venue-vendor/venue-video-feed` (multipart: `title, venueId, status, video, thumbnail`) | S |
| PATCH / DELETE | `/venue-vendor/venue-video-feed/:id` | S |
| GET | `/vendor/product-video-feeds?page&limit` | E |
| POST | `/vendor/product-video-feed` (multipart: `title, productId, status, video, thumbnail`) | E |
| PATCH / DELETE | `/vendor/product-video-feed/:id` | E |

### 15.7 Promotions
| Method | Path | Token |
|---|---|:-:|
| GET | `/venue-vendor/promotion-plans` | S |
| POST | `/venue-vendor/promotion-plans/subscribe` (multipart) | S |
| POST | `/venue-vendor/promotion-plans/confirm` | S |
| GET | `/venue-vendor/promotions` | S |
| GET | `/vendor/promotion-plans?planType=` | E |
| POST | `/vendor/promotion-plans/subscribe` (multipart) | E |
| POST | `/vendor/promotion-plans/confirm` | E |
| GET | `/vendor/promotions` | E |

### 15.8 Notifications & announcements
| Method | Path | Token |
|---|---|:-:|
| GET | `/venue-vendor/notifications?page&limit&unreadOnly` | S |
| PATCH | `/venue-vendor/notifications/:id/read` | S |
| PATCH | `/venue-vendor/notifications/read-all` | S |
| GET | `/vendor/notifications?page&limit&unreadOnly` | E |
| PATCH | `/vendor/notifications/:id/read` | E |
| PATCH | `/vendor/notifications/read-all` | E |
| GET | `/venue-vendor/announcements` | S |

### 15.9 Public (no auth needed; panel sends the service token in both mode)
| Method | Path |
|---|---|
| GET | `/public/app-config` → `data[0] {app_name, admin_logo, user_logo, …}` |
| GET | `/public/categories?mode=venue\|ecom&limit&page&includeEmpty=true` |
| GET | `/public/sub-categories?mode&category&limit&page` |
| GET | `/public/amenities?limit&page` |
| GET | `/public/venue-types/all?limit&page` |
| GET | `/public/banners?type=venue&city=` |
| GET | `/public/cities?limit&search` |
| GET | `/public/sub-districts?city&limit&search` |
| GET | `/public/pages?app=venue_vendor` |
| GET | `/public/pages/:slug?app=venue_vendor` |
| GET | `/venue-vendor/app-settings` (S) → `data[0].staticPages[]` |

---

## 16. Data shapes used by the UI

Only fields the panel actually reads. Treat every field as optional and show "—" when missing.

### 16.1 Service user (`VenueVendor`)
`_id, name, email, phone, profileImage, businessName, businessPhone, businessEmail, businessAddress, businessDescription, panNumber, gstNumber, bankName, branchName, accountType, accountNumber, ifscCode, aadhaarCardFront, aadhaarCard (legacy), aadhaarCardBack, panCard, approvalStatus, isOpen, showPhoneOnApp, vendorPanelType`

### 16.2 Ecom user (`Vendor`) — normalize per §5.4
`_id, name, email, phone, profileImage, businessName, businessPhone, businessAddress, shopDescription, panCardNumber, gstin, bankName, branchName, accountType, accountNo, ifsc, category {_id,name}, shopLogo, shopImages[], aadhaarCardFront, aadhaarCardBack, panCardFront, approvalStatus, showPhoneOnApp, vendorPanelType`

### 16.3 Venue (service)
`_id, name, description, shortDescription, category {_id,name}, subCategory {name}, address, city, state, capacity, thumbnail, images[], amenities[] (object {name} or string), priceType, basePrice, dayPrice, hourlyPrice, tokenAmount, tokenAmountPercentage, status ("active"|"inactive"), adminApproved`

List mapping: `id=_id`, `category=category.name`, `location = "city, state" || address || "—"`, `image = thumbnail`, `enabled = status=="active"`, `priceLabel` per §13.

### 16.4 Booking — list row
`id (display), orderId (route id), customer, venue, date, amount, grandTotal, amountPaid, remainingAmount, status, paymentStatus, payment {amountPaid, remainingAmount}`

### 16.5 Booking — detail
```
id, status, orderStatus,
venue    { name, category, location, address },
customer { name, email, phone, address },
booking  { date, time, guests, bookedOn, specialRequests },
payment  { basePrice, taxFees, total, grandTotal, tokenAmountPercentage, tokenAmount,
           amountPaid, remainingAmount, amountDueNow, method, status, statusLabel, transactionId }
```

### 16.6 Bookings dashboard
`stats {total, pending, completed, cancelled}`, `recentBookings[]` (list row shape)

### 16.7 Ecom home
`stats {totalOrders, completedOrders, pendingOrders}`, `newOrders[]` (order shape)

### 16.8 Order
`orderId, id, orderDisplayId, orderNumber, customerName, productName, orderDate, totalAmount, totalAmountLabel, status, statusLabel`

### 16.9 Product
`_id, name, thumbnail, images[], category {name}, subCategory {name}, price, sellingPrice, status, adminApproved`

### 16.10 Reel
`_id, title, status, video, thumbnail, venue {_id, name, thumbnail}` | `product {_id, name, thumbnail}`

### 16.11 Promotion plan / request
Plan: `_id, name, planType, planTypeLabel, durationOptions[] {type, typeLabel, durationDays, price}, presenceTopLimit`
Request: `_id, bannerImage, planName, planTypeLabel, cityName, subDistrictName, startDate, expiryDate, amount, status, statusLabel, approvalStatus`

### 16.12 Notification
`_id, title, message, createdAt, isRead, type, linkPath, orderId, order, metadata {linkPath, bookingId}`

### 16.13 Category / city / sub-district / banner / page
Category `{_id, name, image}` · City `{_id, name}` · Sub-district `{_id, name}` · Banner `{_id, image, title, source}` · Page `{title, slug, content}`

---

## 17. Known panel behaviours and gaps

Read these before building, so "same as panel" is clear.

| # | Panel behaviour | What the app should do |
|---|---|---|
| 1 | **Ecom-mode Documents tab does not upload files.** The panel's ecom profile helper only attaches `file`, `shopLogo`, `shopImages`, so Aadhaar/PAN picked in ecom mode are silently dropped. Backend `PATCH /vendor/profile` **does accept** `aadhaarCardFront`, `aadhaarCardBack`, `panCard`/`panCardFront`. | Send the document files in ecom mode too (same field names). This matches the screen's intent and needs no backend change. Mention it to QA. |
| 2 | Service list "Total Bookings" is hard-coded to 0. | Show the same line, or hide the count. Do **not** invent a number. |
| 3 | Services list has a filter icon with no action. | Omit it. |
| 4 | Ecom orders are **view-only** (no detail, no accept/reject). Backend has `GET /vendor/orders/:orderId`, `POST /vendor/orders/:orderId/accept|reject|processing|out-for-delivery`, `PATCH /vendor/orders/:orderId/status`, `GET /vendor/orders/:orderId/invoice`. | Phase 1: view-only, same as panel. Order actions are a **Phase 2 item, only with product owner approval**. |
| 5 | Products: no edit and no status toggle. Backend has `GET/PATCH /vendor/products/:id` and `PATCH /vendor/products/status/:id`. | Same as panel in Phase 1. Phase 2 only with approval. |
| 6 | Removing an existing service photo in Edit Service only hides it locally; the API is not told to delete it. | Keep the same behaviour, and flag it to the backend team. |
| 7 | Forgot/Reset password screens exist but are not reachable (OTP login only). | Not in the app UI. |
| 8 | Payments page is a placeholder; the old Plans page is not routed. | Not in the app. |
| 9 | In **ecom-only** mode the panel still calls `/venue-vendor/announcements` and `/venue-vendor/app-settings` with the ecom token; they may fail and are then hidden or fall back. | Call them; on error hide the ticker / use the `/public/pages` fallback. |
| 10 | Dashboard "Completed Bookings" opens the bookings list filtered by `confirmed` (not `completed`). | Keep the same mapping. |
| 11 | Ecom profile drops `businessEmail` (no ecom field). | Same. In Both mode the value is saved on the service account only. |
| 12 | Login verify does not send `panelMode`; the backend picks `both` if both accounts exist, else the single account. | Same. |
| 13 | Register logs the user in even when approval is pending; service/both users see the pending banner. | Same. |

---

## 18. Mobile-only additions that use existing APIs

These are allowed because they use **existing** backend endpoints and add no fake data.

1. **Push notifications (FCM)**
   - After login and on token refresh from Firebase: `POST /venue-vendor/device-token {fcmToken}` (service token) and/or `POST /vendor/device-token {fcmToken}` (ecom token). On logout: `DELETE` the same path(s).
   - ⚠️ The backend keeps **one account per device token**: registering the token on one account removes it from every other User/Vendor/VenueVendor. So a **Both** vendor can receive pushes on only one account per device. Recommended: register on the account matching the current mode (service for `both`), and keep the 30 s in-app polling for the other. Raise with the backend team if both are needed.
   - Tapping a push opens the same screen as tapping the in-app notification (§8.19 link rules).
2. **Pull-to-refresh** on every list and dashboard (re-runs the same load).
3. **Tap-to-call / tap-to-email** for customer phone/email on Booking Detail.
4. **Camera capture** as an extra source wherever an image is picked (same limits).
5. **Open/share invoice PDF** after download.
6. **Biometric/app lock**: optional; must not change auth logic.

Other backend endpoints exist (`/vendor/wallet/*`, `/vendor/plans/*`, `/venue-vendor/enquiries/*`, `/vendor/profile/completion`, `/venue-vendor/auth/profile-completion`, `/vendor/recommendations`) but they are **not in the panel**, so they are out of scope.

---

## 19. Branding

From the panel CSS:
- Primary accent / active nav: **`#FFDB00`** (yellow) with dark text **`#141414`**.
- Dark buttons and dialog confirm colour: **`#141414`**.
- Action/payment orange: **`#FE7000`** (primary action buttons, Razorpay theme); profile dialogs use **`#EA580C`**.
- Destructive: **`#DC2626`**; neutral cancel: **`#6B7280`**.
- Badge tones: pending = yellow, confirmed/active = green, cancelled/inactive = red, blue = informational stats.
- Logo and app name always come from `GET /public/app-config` (`admin_logo` → `user_logo`, `app_name`; default name "Oho Ebazar"). Do not hard-code a logo.

---

## 20. QA acceptance checklist

### 20.1 Auth (all types)
- [ ] Unregistered phone → "No vendor account found…" shown.
- [ ] Invalid phone (starting 0–5 / < 10 digits) is blocked client-side.
- [ ] OTP: 4 boxes, paste works, autofill works, resend shows countdown from `resendAfterSeconds`, 429 "wait N seconds" respected.
- [ ] Dev OTP displayed only when API returns `otp`.
- [ ] Blocked / rejected / suspended account shows the backend 403 message.
- [ ] Session survives app kill; legacy session migrates to service.
- [ ] Expired access token → silent refresh → request succeeds. Expired refresh token → back to Login.
- [ ] Two parallel 401s trigger only one refresh call.
- [ ] Logout clears all tokens (and device token).

### 20.2 Registration
- [ ] E-commerce: category + 1–5 shop images required; no address and no Aadhaar step.
- [ ] Service: address + Aadhaar front/back required; PAN optional; no shop images.
- [ ] Both: address + Aadhaar + shop images required; no category picker (auto first ecom category).
- [ ] 5 MB limits enforced; > 5 shop images blocked.
- [ ] Pending vs approved success message; user lands on Dashboard.

### 20.3 Service vendor
- [ ] Dashboard: open/close switch, phone switch, admin banners, 4 stats with correct filters, completion card, recent bookings, add-service categories.
- [ ] Pending banner when service approval is pending.
- [ ] Services: list, search, enable switch disabled until approved, delete with confirm, add (1–6 photos, token ≤ price), edit pre-fill (price type inference), view (pricing labels).
- [ ] Bookings: server search (300 ms debounce), status filter, detail, status update, invoice PDF.
- [ ] Reels: 50 MB / 60 s limits, link to service, edit, delete.
- [ ] Promotions: plan → duration → date ≥ today → city → sub-district → banner required → Razorpay → confirm → appears in "Your requests".
- [ ] Profile: 4 tabs, per-tab save, all validations, documents required only when none on file.

### 20.4 E-commerce vendor
- [ ] Shop Dashboard: phone switch (no business switch), banners, 4 stats, completion card, Shop Images (logo add/change/remove, gallery max 5, undo remove, save only on change), recent orders, add-product categories.
- [ ] Products: list, search, status badges, delete, add (category → sub-category, price ≥ 1, 1–5 images).
- [ ] Orders: status filter values, client search, badges.
- [ ] Reels: product reels with active products dropdown.
- [ ] Promotions: banner / product_presence_first (product required, no banner) / get_verified.
- [ ] Profile: ecom field-name mapping works both ways; documents upload works (§17 #1).
- [ ] Notifications: order notifications open Orders, promotion ones open Promotions.

### 20.5 Both vendor
- [ ] Mode toggle Service | Both | Shop visible in header and drawer; switching resets to Dashboard and changes navigation.
- [ ] In Both mode `/vendor/*` calls use the ecom token and `/venue-vendor/*` calls use the service token (verify with a proxy).
- [ ] Combined dashboard with three segment toggles (add, stats, recent).
- [ ] Reels Service/Shop toggle.
- [ ] Promotions shows two independent sections.
- [ ] Profile shows both approval statuses and saves the tab to both accounts.
- [ ] Phone visibility updates both accounts.
- [ ] Notifications merged, unread count summed, mark-all-read hits both.
- [ ] Profile completion uses the combined algorithm.
- [ ] Screens not allowed in a single mode redirect to Dashboard after switching.

### 20.6 Data integrity
- [ ] No hard-coded counts, reviews, discounts or badges anywhere.
- [ ] Every empty state shows the specified text.
- [ ] All money uses ₹ with Indian grouping.

---

## 21. Suggested build milestones

| # | Milestone | Contents |
|---|---|---|
| 1 | Foundation | Config, HTTP client, envelope/unwrap helpers, error normalization, media URL builder, secure session store, token-by-URL interceptor, refresh queue, app-config, splash |
| 2 | Auth | Login (OTP), Register (3 steps, all 3 types), logout, resume refresh |
| 3 | Shell | Drawer, bottom nav per mode, header (mode toggle, bell, avatar), pending banner, announcement ticker, route guard, static pages |
| 4 | Service vendor | Service dashboard + widgets, Services CRUD, Bookings list/detail/status/invoice |
| 5 | Ecom vendor | Shop dashboard + Shop Images, Products list/add/delete, Orders |
| 6 | Both vendor | Combined dashboard, mode switching end-to-end, Both profile |
| 7 | Shared features | Reels (both kinds), Promotions + Razorpay, Profile (single), Notifications (+ FCM) |
| 8 | QA and polish | Full checklist §20 for each vendor type, empty/error states, accessibility, release builds |

---

*Prepared from the live code of `VenueVendorPanel/src` (pages, components, API modules, utils, store) and `Backend/` (vendor-panel auth controller, session builder, OTP utility, routes). If the panel changes, update this document together with it.*

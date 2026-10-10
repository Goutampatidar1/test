# OHO E-Bazar — Vendor App Integration Prompt

> Paste everything below this line into your AI coding assistant **inside the vendor app project**.
> This file covers the **shop (ecom) vendor app**, the **venue / service vendor app**, and vendors who are **both**.
> Customer-app work is in `APP_INTEGRATION_PROMPT_USER.md`. Do not implement that here.

---

## ROLE AND GOAL

You are integrating **new backend features** into the OHO E-Bazar **vendor apps**. The backend is already finished and deployed. **Do not change the backend.** Wire the endpoints below into the existing app with production-quality UI, state management and error handling, following the app's **existing architecture, folder structure, networking layer, models, theme and naming conventions**.

There are two vendor modes (they may live in one combined panel):

1. **Vendor app** (ecom sellers): products, orders, plans. API prefix `/vendor`.
2. **Venue / Service vendor app** (service providers): services (called "venues" in the API), bookings, enquiries, plans. API prefix `/venue-vendor`.
3. **Both:** one account that sells products and services. See the last section.

Work through every section that matches the app you are in. Skip a section only when that mode does not exist in this codebase.
At the end, produce a checklist of what you implemented and anything you could not wire.

---

## GLOBAL RULES (read first)

- **Base URL:** `https://ohoebazar.com:5012/api` — use the existing base-URL config, do not hardcode it again.
- **Auth:** `Authorization: Bearer <accessToken>` (existing token handling + refresh flow). Use the shop-vendor token on `/vendor` routes and the service-vendor token on `/venue-vendor` routes.
- **Response envelope (most endpoints):**
  ```json
  { "status": true, "message": "…", "data": [ … ] }
  ```
  `data` is **always an array**. When the endpoint returns a single object it is `data[0]`.
  `status` is `false` when `data` is empty — **that is not an error**, just an empty state.
  Some list endpoints add extra top-level keys next to `data` (e.g. `pagination`, `summary`, `imageWarnings`). Read them from the root.
- **Errors:** non-2xx with `{ "status": false, "message": "…", "code": "SOME_CODE" }`.
  `code` is optional. **Branch on `code`, show `message` to the user.** Codes used by the vendor apps:

  | code | meaning | what the app should do |
  |---|---|---|
  | `PHONE_PLAN_REQUIRED` | Vendor tried to show phone without a Show Number plan | Open the Show Number plans screen |
  | `VIDEO_DISABLED` | Video upload blocked (admin off, or this vendor turned videos off) | Show the message and link to video settings |
  | `THUMBNAIL_TOO_SMALL` | Uploaded thumbnail is under about 200–300 px | Ask for a bigger image |

- **Feature flags:** fetch once on app start (and on resume, max once per 5 min) from
  `GET /public/app-config` (and/or `GET /public/app-settings`). Both include a `features` object:
  ```json
  {
    "venueBookingMode": "enquiry",
    "enquiryBookingWindowHours": 24,
    "phonePlanRequired": true,
    "videoEnabledUser": true,
    "videoEnabledVendor": true,
    "hotDealsEnabled": true,
    "homeSections": [ { "key": "banners", "title": "Banners", "enabled": true } ]
  }
  ```
  Store it in a global config/state provider. **Hide video menus when `videoEnabledVendor` is false. Hide hot-deal opt-in when `hotDealsEnabled` is false.** Use safe defaults identical to the above if the fetch fails.
- **Images:** all image URLs from the API are absolute. Use the existing cached-image widget with placeholder + error fallback. Never crash on empty strings.
- **Money:** prices are numbers in INR. Prefer ready-made labels when the API sends them.
- **Dates:** ISO-8601 UTC strings. Show in device local time.
- **Countdowns:** when the API gives `holdSecondsRemaining` or `daysRemaining`, start a local timer from that value. Stop at 0 and refresh.
- Add every new endpoint to the existing API service/repository layer, create typed models with **null-safe parsing** (all new fields optional with defaults), and reuse existing loading/empty/error widgets.
- Pull-to-refresh on every new list. Pagination where indicated.
- No placeholder/dummy data in final code.

---

## PART B — SHOP VENDOR (ecom)

All paths in this part are under `/vendor`.

### B1. Recommendations screen (new home card / tab)

`GET /vendor/recommendations` → `data[0]`:
```json
{
  "summary": {
    "profilePercent": 65,
    "activePlans": [ { "planType": "show_phone", "label": "Show Number", "endDate": "…", "daysRemaining": 12 } ],
    "phone": { "planRequired": true, "hasActivePlan": false, "expiresAt": null, "daysRemaining": 0, "canToggle": false, "phoneVisibleToUsers": false }
  },
  "recommendations": [
    {
      "key": "buy_phone_plan",
      "type": "plan",
      "priority": 100,
      "title": "Your phone number is hidden",
      "description": "…",
      "screen": "plans",
      "planType": "show_phone",
      "progress": 65,
      "fromPrice": 199,
      "cta": { "label": "See Show Number plans", "screen": "plans", "planType": "show_phone", "filter": "discounted" },
      "action": null
    }
  ],
  "plans": [
    {
      "planType": "show_phone",
      "label": "Show Number",
      "pitch": "…",
      "isActive": false,
      "activeUntil": null,
      "daysRemaining": 0,
      "tiers": [
        {
          "_id": "…",
          "name": "Show Number Monthly",
          "price": 499,
          "durationDays": 30,
          "description": "…",
          "benefits": [],
          "badge": "Popular",
          "isRecommended": true,
          "action": { "type": "subscribe_plan", "label": "Buy for ₹499", "method": "POST", "path": "/api/vendor/plans/<id>/subscribe" }
        }
      ]
    }
  ]
}
```
`recommendations[].type` is one of `plan`, `profile`, `listing`, `hot_deal`, `video`, `discount`, `enquiry`. `action` is `{ type, method, path }` or `null`.

Build:
- A **"Recommended for you"** section on the vendor dashboard (top 3 cards) plus a full screen with all cards, sorted by `priority`.
- Card tap → navigate by `cta.screen` (map these names to your routes):
  `plans` (with optional `planType` to pre-select a tab), `profile_completion`, `add_product`, `products` (with `filter: "discounted"`), `videos`.
- A **Plans screen** grouped by `plans[].planType`: show `pitch`, active status + days left, and tier cards (name, price, `durationDays` → "30 days", `benefits` bullet list, `badge`, highlight `isRecommended`).
  Buy → `POST /vendor/plans/:planId/subscribe` → existing Razorpay checkout → `POST /vendor/plans/subscriptions/confirm` (existing flow; response `requiresPayment`).
  Refresh recommendations and phone state after success.

### B2. Show Number plan + phone visibility

- `GET /vendor/profile/phone-visibility` → `data[0] = { showPhoneOnApp, statusLabel, phonePlan: { planRequired, hasActivePlan, expiresAt, daysRemaining, canToggle, phoneVisibleToUsers }, phoneVisibleToUsers }`
- `PATCH /vendor/profile/phone-visibility` body `{ "showPhoneOnApp": true|false }`
- UI in profile/settings: "Show my number to customers" switch.
  - If `phonePlan.canToggle` is false → switch disabled, show "Your number is hidden. Buy a Show Number plan" + button → Plans (`show_phone`).
  - Show "Plan active · 12 days left" when active.
  - On `PHONE_PLAN_REQUIRED` → open Show Number plans.

### B3. Profile completion + benefits

`GET /vendor/profile/completion` → `data[0]`:
```json
{
  "percent": 65, "score": 65, "complete": false, "variant": "ecom",
  "modules": [
    { "id": "personal", "label": "Personal", "href": "…", "icon": "user", "color": "#6366f1", "image": "",
      "percent": 100, "doneCount": 4, "total": 4, "complete": true,
      "remaining": [], "optionalRemaining": [] }
  ],
  "nextStep": { "moduleId": "documents", "label": "Documents", "href": "…" },
  "benefits": {
    "tiers": [ { "minPercent": 40, "title": "Get discovered", "description": "…", "icon": "search", "perk": "ranking_boost", "image": "", "unlocked": true } ],
    "unlockedCount": 1,
    "nextBenefit": { "title": "Build trust", "percentToGo": 5 },
    "headline": "Complete 5% more to unlock \"Build trust\""
  }
}
```
`modules[].id` is one of `personal`, `business`, `bank`, `documents`, `shopMedia`, `products`, `services`. `remaining[]` items are `{ key, label }`.

Build a **Profile completion screen**:
- Circular progress with `percent`, `benefits.headline` under it.
- Module cards in a grid: coloured icon tile using `color` (map `icon` names to your icon set; if `image` is non-empty show that image instead), module % bar, "x of y done", list of `remaining` labels, tap → the matching edit screen.
- Benefit ladder: tiers with lock/unlock state, `minPercent`, title, description; highlight `nextBenefit`.
- Show a compact progress banner on the dashboard until `complete`. At 100% show "Free Show Number trial unlocked" (the backend grants it automatically).
- Re-fetch after any profile or product save.

### B4. Products: hot-deal opt-in + discount alerts + approval

- Add/Edit product form: add a switch **"Add this product to Hot Deals?"** → send `hotDealOptIn: true|false` with the existing create/update multipart. Hide this switch when `features.hotDealsEnabled` is false.
- Product list/detail: each product now has `hotDeal: { optIn, status: "none|pending|approved|rejected", rejectionReason }`. Show a chip: Pending review / In Hot Deals / Rejected (with the reason).
- Quick toggle from the product list: `POST /vendor/products/:id/hot-deal` body `{ "optIn": true|false }` → `data[0] = { productId, hotDeal: { optIn, status } }`. Show the response `message`.
- When the vendor increases a discount, customers are notified automatically — show a hint under the discount field: "Customers who saved this product will be notified."
- Already-approved vendors' products go live immediately; show the product `status` / `adminApproved` as before.
- **Image upload responses** may include root `imageWarnings: [ { field, file, message } ]` → show them as a non-blocking warning sheet after save. Handle `THUMBNAIL_TOO_SMALL`.
- Recommend a square thumbnail in the picker UI ("Best: square photo, at least 800×800").

### B5. Videos on/off

- `GET /vendor/video-settings` / `PATCH /vendor/video-settings` body `{ "videoEnabled": true|false }` → `{ adminEnabled, enabled, effective, lockedByAdmin }`.
- Toggle "Show my videos to customers" in settings. When `effective` is false, hide the upload button and show why. Handle `VIDEO_DISABLED` on upload.
- Hide all video menus when `features.videoEnabledVendor` is false.

### B6. Device token (push)

On login, app start and FCM token refresh: `PUT /vendor/device-token` body `{ "fcmToken": "<token>" }`. On logout: `DELETE /vendor/device-token`.

### B7. Push notifications

| type | open |
|---|---|
| `hot_deal_approved` / `hot_deal_rejected` | Product detail |
| `plan_expiring` (`screen=plans`, `planType`) | Plans screen on that plan type |
| `profile_reminder` | Profile completion |
| unknown | Notifications list |

---

## PART C — VENUE / SERVICE VENDOR

All paths in this part are under `/venue-vendor`.

### C1. Enquiries

- List: `GET /venue-vendor/enquiries?status=all|pending|accepted|rejected|converted|expired|cancelled&search=&page=1&limit=20`
  Root also has `summary: { pending, accepted, rejected, converted, expired, cancelled }` → show as tab badges.
- Detail: `GET /venue-vendor/enquiries/:id`
- Accept: `POST /venue-vendor/enquiries/:id/accept` body `{ "note": "Confirmed decoration", "bookingWindowHours": 24 }` (both optional)
- Reject: `POST /venue-vendor/enquiries/:id/reject` body `{ "reason": "Fully booked" }` (min 3 characters, required)
- Note: `PATCH /venue-vendor/enquiries/:id/note` body `{ "note": "…" }`

Vendor enquiry object includes the booking fields plus `customer: { _id, name, phone, countryCode, email }` and `canRespond`:
```json
{
  "_id": "…", "enquiryNumber": "ENQ-…",
  "status": "pending|accepted|rejected|cancelled|expired|converted",
  "statusLabel": "New enquiry", "source": "standard|quick",
  "venue": { "_id": "…", "name": "…", "thumbnail": "…", "city": "…", "address": "…" },
  "bookingType": "full_day", "bookingDates": [], "dateLabel": "…", "summaryLabel": "…",
  "startTime": "", "endTime": "", "slotLabel": "",
  "guestCount": 150, "eventType": "Wedding", "message": "…", "preferredCallTime": "Evening",
  "quote": { "grandTotal": 80000, "tokenAmount": 10000, "rateLabel": "…", "symbol": "₹" },
  "vendorNote": "", "rejectionReason": "", "responseDueAt": "…", "acceptedAt": null, "holdExpiresAt": null,
  "holdSecondsRemaining": 85000, "canRespond": true, "orderId": null,
  "customer": { "_id": "…", "name": "Rahul", "phone": "9876543210", "countryCode": "+91", "email": "" }
}
```

UI:
- **Enquiries tab** in the bottom nav (badge = `summary.pending`). Tabs: New (pending) / Accepted / Booked (converted) / Closed.
- Card: customer name, service name + thumbnail, `summaryLabel` / `dateLabel`, guests, event type, time since created, `responseDueAt` countdown ("Reply within 31h").
- Detail: big **Call customer** button (`tel:` with `countryCode` + `phone`), WhatsApp button, message, preferred call time, quote estimate, note field.
  - `canRespond` → **Accept** (dialog: optional note) / **Decline** (dialog: required reason).
  - accepted → "Waiting for customer to pay · expires in …" (`holdSecondsRemaining`).
  - converted → "View booking" (`orderId` → existing booking detail).
- Push `enquiry_received` → open enquiry detail; `enquiry_cancelled` → enquiry detail.

### C2. Service discounts ("Do you want to give a discount?")

- `GET /venue-vendor/venues/:id/discount` → `data[0] = { venueId, name, price, hasDiscount, current, configured, suggestions: [ { percent: 5, discountedPrice: 0 } ], customersNotified, alertMinPercent }`
- Set: `PUT /venue-vendor/venues/:id/discount` body
  `{ "discountType": "percentage|flat", "discountValue": 15, "label": "Diwali offer", "startsAt": "ISO or omit", "endsAt": "ISO or omit", "notifyUsers": true }`
  (percentage max 90; flat must be less than the price)
- Remove: `DELETE /venue-vendor/venues/:id/discount`
- UI: after creating or editing a service, and from the service detail, show a **"Want to offer a discount?"** bottom sheet: suggestion chips (5/10/15/20/25% with the resulting price), custom value, type switch, optional date range, "Notify interested customers" checkbox (default on). Show the current discount chip on the service card in "My services".

### C3. Services go live without a full profile

Services only need **name, thumbnail, category and price** to be listed. Update the add-service form: mark only these as required, show the others as optional ("Add more details to rank higher"). Show upload `imageWarnings` the same way as B4. Already-approved vendors' services are live immediately; edits to name, description, images or category re-trigger review only if the admin requires approval.

### C4. Recommendations, plans, phone, profile completion, videos, device token

Same screens as Part B, with these paths:

| Screen | Path |
|---|---|
| Recommendations | `GET /venue-vendor/recommendations` |
| Plans list | `GET /venue-vendor/plans` |
| Subscribe | `POST /venue-vendor/plans/:planId/subscribe` |
| Confirm payment | `POST /venue-vendor/plans/subscriptions/confirm` |
| My subscriptions | `GET /venue-vendor/plans/subscriptions` |
| Phone visibility | `GET` and `PATCH /venue-vendor/auth/phone-visibility` |
| Profile completion | `GET /venue-vendor/auth/profile-completion` |
| Video settings | `GET` and `PATCH /venue-vendor/video-settings` |
| Device token | `PUT` and `DELETE /venue-vendor/device-token` |

Extra recommendation card keys on the service side:
- `pending_enquiries` → screen `enquiries`
- `add_first_service` → screen `add_venue`
- `add_discount` → screen `venue_discount` (payload includes `suggestions`)

For a vendor whose `variant` is `both`, `GET /venue-vendor/auth/profile-completion` covers both the shop account and the service account.

---

## PART D — VENDORS WHO ARE BOTH

If this app supports vendors with `vendorPanelType: "both"`:

- Show both recommendation feeds merged (dedupe by `key`). Show the Enquiries tab and the Products tab.
- Use `GET /venue-vendor/auth/profile-completion` for the combined checklist (`variant` = `both`).
- Register the device token on **both** `PUT /vendor/device-token` and `PUT /venue-vendor/device-token`, each with that mode's session. Clear both on logout.

---

## IMPLEMENTATION ORDER

1. Networking: models + API methods for every endpoint above; error `code` parsing; feature-flag provider.
2. Shared widgets: countdown, status chip, plan tier card, recommendation card, profile-completion module card.
3. Service vendor: enquiries (C1) → discounts (C2) → service form (C3) → shared screens (C4).
4. Shop vendor: recommendations + plans (B1) → phone (B2) → profile completion (B3) → products (B4) → videos (B5) → device token (B6) → push (B7).
5. Both-mode: merge the two feeds and register both device tokens (Part D).
6. Test every flow end-to-end against the live API.

## ACCEPTANCE CHECKLIST

- [ ] App works when `videoEnabledVendor` and `hotDealsEnabled` are off (menus hidden, no crashes).
- [ ] Buy a Show Number plan → the phone toggle works. Without a plan the toggle is locked and opens plans. `PHONE_PLAN_REQUIRED` opens plans.
- [ ] Profile completion percent matches the API. Each module opens the correct edit screen.
- [ ] Hot-deal opt-in shows Pending / Approved / Rejected, including the rejection reason.
- [ ] Image warnings show after save and do not block a successful save. `THUMBNAIL_TOO_SMALL` asks for a larger photo.
- [ ] Service enquiries: list badges match `summary`, accept and reject work, call button uses the customer phone, converted enquiry opens the booking.
- [ ] Service discount sheet sets and removes a discount. Suggestion chips show the resulting price.
- [ ] Add-service form requires only name, thumbnail, category and price.
- [ ] Device tokens are registered on login and cleared on logout. A both-mode vendor registers both tokens.
- [ ] Push taps open the screen in the tables above.
- [ ] All new lists have loading, empty, error and pull-to-refresh states.

When done, output: the list of files changed, any endpoint you could not wire and why, and steps to verify each checklist item.

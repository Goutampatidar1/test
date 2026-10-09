# OHO E-Bazar — App Integration Prompt (User App + Vendor App + Venue/Service Vendor App)

> Paste everything below this line into your AI coding assistant **inside the mobile app project(s)**.
> Run it once per app, or once in a monorepo that contains all three apps.

---

## ROLE AND GOAL

You are integrating a set of **new backend features** into the OHO E-Bazar mobile apps. The backend is
already finished and deployed. **Do not change the backend.** Your job is to wire the new endpoints into the
existing apps with production-quality UI, state management and error handling, following the app's
**existing architecture, folder structure, networking layer, models, theme and naming conventions**.

There are three apps (some may live in the same codebase):

1. **User app** (customers): shopping (ecom products) + booking services/venues.
2. **Vendor app** (ecom sellers): products, orders, plans.
3. **Venue / Service vendor app** (service providers): services (called "venues" in the API), bookings, enquiries, plans.
   Some vendors are "both" (ecom + service) and use one combined panel.

Work through every section below. When a section does not apply to the app you are in, skip it.
At the end, produce a checklist of what you implemented and anything you could not wire.

---

## GLOBAL RULES (read first)

- **Base URL:** `https://ohoebazar.com:5017/api` — use the existing base-URL config, do not hardcode it again.
- **Auth:** `Authorization: Bearer <accessToken>` (existing token handling + refresh flow). Public routes work without a token, but **send the token when the user is logged in** — responses get personalised (wishlist flags, liked videos, suggestions).
- **Response envelope (most endpoints):**
  ```json
  { "status": true, "message": "…", "data": [ … ] }
  ```
  `data` is **always an array**. When the endpoint returns a single object it is `data[0]`.
  `status` is `false` when `data` is empty — **that is not an error**, just an empty state.
  Some list endpoints add extra top-level keys next to `data` (e.g. `pagination`, `summary`, `matchedVendors`, `suggestedVendors`, `videoEnabled`, `enabled`). Read them from the root.
- **Errors:** non-2xx with `{ "status": false, "message": "…", "code": "SOME_CODE" }`.
  `code` is optional. **Branch on `code`, show `message` to the user.** Codes used by the new features:

  | code | meaning | what the app should do |
  |---|---|---|
  | `ENQUIRY_REQUIRED` | Booking mode is "enquiry"; direct booking blocked | Open the enquiry form instead of checkout |
  | `ENQUIRY_ALREADY_OPEN` | User already has an open enquiry for this venue + date | Show message + button to open "My enquiries" |
  | `ENQUIRY_NOT_ACCEPTED` | Tried to book before vendor accepted | Show "Waiting for venue" state |
  | `ENQUIRY_EXPIRED` / `ENQUIRY_CLOSED` / `ENQUIRY_CONVERTED` | Enquiry can't be booked anymore | Refresh enquiry, offer "Send new enquiry" |
  | `DATES_HELD` | Dates temporarily held for another customer | Ask user to pick other dates |
  | `PHONE_PLAN_REQUIRED` | Vendor tried to show phone without Show Number plan | Open Show Number plans screen |
  | `VIDEO_DISABLED` | Vendor video upload blocked (admin off or vendor turned off) | Show message, link to video settings |
  | `THUMBNAIL_TOO_SMALL` | Uploaded thumbnail < ~200–300 px | Ask for a bigger image |

- **Feature flags:** fetch once on app start (and on resume, max once per 5 min) from
  `GET /public/app-config` (and/or `GET /public/app-settings`). Both include a `features` object:
  ```json
  {
    "venueBookingMode": "enquiry",        // "enquiry" | "direct"
    "enquiryBookingWindowHours": 24,
    "phonePlanRequired": true,
    "videoEnabledUser": true,
    "videoEnabledVendor": true,
    "hotDealsEnabled": true,
    "homeSections": [ { "key": "banners", "title": "Banners", "enabled": true }, … ]
  }
  ```
  Store it in a global config/state provider. **Every new feature below must respect these flags** (hide UI when off). Use safe defaults identical to the above if the fetch fails.
- **Images:** all image URLs from the API are absolute. Use the existing cached-image widget with placeholder + error fallback. Never crash on empty strings.
- **Money:** prices are numbers in INR; many responses also include ready-made labels (`priceLabel`, `discountLabel`, `savingsLabel`). Prefer the labels.
- **Dates:** ISO-8601 UTC strings. Show in device local time.
- **Countdowns:** when the API gives `remainingSeconds` / `holdSecondsRemaining`, start a local ticking timer from that value (do **not** trust the device clock against `endsAt`). Stop at 0 and refresh the item.
- Add every new endpoint to the existing API service/repository layer, create typed models with **null-safe parsing** (all new fields optional with defaults), and reuse existing loading/empty/error widgets.
- Pull-to-refresh on every new list. Pagination where indicated.
- No placeholder/dummy data in final code.

---

## PART A — USER APP

### A1. Home screen: one-call feed (replace/augment existing home)

`GET /public/home/feed` (optional auth)

Query (all optional): `city`, `subDistrictId` or `subDistrict`, `perCategory` (default 8), `maxCategories` (default 8), `videoLimit` (default 6).
If the user is logged in and has a saved area, you don't need to send location.

Response `data[0]`:
```json
{
  "area": { "city": "Indore", "subDistrict": "Vijay Nagar", "subDistrictId": "…", "label": "Vijay Nagar, Indore", "isSet": true },
  "order": ["banners", "categories", "video", "hotDeals", "products", "suggestions"],
  "sections": [
    { "key": "banners",    "title": "Banners",              "items": [Banner] },
    { "key": "categories", "title": "Categories",           "items": [ { "_id", "name", "image" } ] },
    { "key": "video",      "title": "Videos",               "enabled": true, "items": [VideoLite], "hasMore": true, "nextCursor": "…", "endpoint": "/api/public/video-feeds" },
    { "key": "hotDeals",   "title": "Hot deals of the day", "enabled": true, "items": [ProductCard] },
    { "key": "products",   "title": "Products",             "groups": [ { "category": { "_id", "name", "image" }, "items": [ProductCard], "total": 8 } ] },
    { "key": "suggestions","title": "Suggested for you",    "items": [ProductCard], "personalised": true, "vendors": [VendorCard] }
  ]
}
```

Build the home as a **vertical list rendered in exactly the order of `sections`** (admin controls the order and can disable sections — never hardcode the order). Map each `key` to a widget:

- `banners` → banner carousel (see A6).
- `categories` → horizontal category chips/icons → tap opens the category product list (existing screen, `GET /public/products?category=<id>`).
- `video` → horizontal reel strip (thumbnails, play icon). Tap opens full-screen reels player starting at that item and continues loading with the cursor (A4). Hide the section if `enabled` is false or `items` is empty.
- `hotDeals` → horizontal "Hot deals of the day" row **placed wherever it appears in the order (designed to sit between videos and products)**. Card shows hot-deal badge, `% OFF`, strike-through MRP, optional countdown if `hotDeal.endsAt`. "View all" → `GET /public/hot-deals`.
- `products` → **category-wise sections**: for each group, a header with category name + "See all" (→ category product list) and a horizontal product row.
- `suggestions` → "Suggested for you" product grid/row (title can say "Popular right now" when `personalised` is false) + a "Suggested shops" horizontal row from `vendors`.

Show a skeleton while loading. If the call fails, fall back to the old home endpoints already used by the app.

### A2. Area in the header (persisted)

- Header shows `area.label` (or "Select area" when `isSet` is false). Tap → area picker.
- Picker uses existing location endpoints: `GET /public/cities`, `GET /public/cities/:cityId/sub-districts`.
- Save (logged in): `PUT /user/area` body `{ "subDistrictId": "…" }` (or `{ "city": "Indore", "subDistrict": "Vijay Nagar" }`). Response `data[0]` = area object above.
- Read: `GET /user/area`.
- Guest users: store the selection locally and send `city` + `subDistrictId` as query params to the home feed and vendor lists.
- After change → reload home feed and nearby vendors.

### A3. Richer product cards (everywhere products are listed)

All product list endpoints (`/public/products`, home feed, hot deals, suggestions, recently viewed, vendor products) now return these **extra** fields on each card:
```json
{
  "price": 750, "mrp": 1000, "priceLabel": "₹750", "mrpLabel": "₹1,000",
  "hasDiscount": true, "discountPercent": 25, "discountLabel": "25% OFF",
  "savings": 250, "savingsLabel": "Save ₹250",
  "inStock": true, "lowStock": true, "isNew": true, "isHotDeal": true,
  "badges": [ { "key": "hot_deal", "label": "Hot Deal", "tone": "danger" },
              { "key": "discount", "label": "25% OFF", "tone": "success" },
              { "key": "new", "label": "New", "tone": "info" },
              { "key": "low_stock", "label": "Only 3 left", "tone": "warning" },
              { "key": "out_of_stock", "label": "Out of stock", "tone": "muted" } ],
  "vendor": { "_id", "name", "shopLogo" }, "rating": 4.3, "ratingCount": 12, "isWishlisted": false
}
```
Update the shared product-card widget once:
- Top-left: first 1–2 `badges` as chips (map `tone` → theme colours: danger=red, success=green, info=blue, warning=orange, muted=grey).
- Price row: `priceLabel` bold + `mrpLabel` strike-through + `discountLabel` in green.
- `savingsLabel` small text under price (optional, on detail/large cards).
- Shop name (`vendor.name`) + small logo under the title.
- Rating stars when `ratingCount > 0`.
- Disable "Add to cart" when `inStock` is false.

### A4. Videos (reels) — load reduction + on/off

**Listing (new cursor pagination):**
`GET /public/video-feeds?limit=6&lite=1[&cursor=<nextCursor>][&type=all|ecom|venue]`
Response root:
```json
{ "status": true, "data": [Video], "videoEnabled": true,
  "pagination": { "limit": 6, "hasMore": true, "nextCursor": "…" } }
```
- Do **not** send `page=` (that is the legacy mode).
- Load the next page when the user is ~2 items from the end; stop when `hasMore` is false.
- `lite=1` for the strip/thumbnails; for the full-screen player you may omit `lite` to get vendor location + product counts.
- If `videoEnabled` is false → hide all video UI (strip, tab, reels entry points) and show nothing.

**Player performance (important — "video load reduction"):**
- Only initialise the player for the **visible** item; preload at most the **next one**; dispose players that scroll off-screen.
- Show `thumbnail` as the poster until the first frame is ready.
- Do not autoplay on cellular data if the app has a data-saver setting; mute by default, tap to unmute.
- Cache thumbnails, not videos.

**User on/off switch:** in Settings add "Show videos" toggle.
- `GET /user/video-settings` → `data[0] = { adminEnabled, enabled, effective, lockedByAdmin }`
- `PATCH /user/video-settings` body `{ "videoEnabled": true|false }`
- If `lockedByAdmin` is true, show the toggle disabled with text "Videos are turned off by OHO".
- When `effective` is false, hide every video UI in the app.

Each item keeps the existing like/shop-now/book-now behaviour (`isLiked`, `shopNow`, `bookNow`, `product`, `venue`).

### A5. Vendor-aware search ("shiv shakti")

`GET /public/products?search=<text>` now also matches shop names (any word order, case-insensitive) and returns a root-level
```json
"matchedVendors": [ { "_id", "name", "shopLogo", "location" } ]
```
In the search results screen:
- If `matchedVendors` is non-empty, show a "Shops" horizontal row **above** products (tap → vendor profile screen: `GET /public/vendor-profile/:vendorId` + `GET /public/vendor-products/:vendorId`).
- Products below as usual (now ranked better for complete vendor profiles).
- Debounce typing 350 ms; cancel in-flight requests.

### A6. Banners — content, timer, correct sizing

Banner objects (home feed `banners` and `GET /public/banners?type=user`) now include:
```json
{ "_id", "title", "image", "subtitle", "description", "ctaText", "badge",
  "bgColor": "#FF6600", "textColor": "#FFFFFF", "displayOrder": 0,
  "imageWidth": 1200, "imageHeight": 450, "aspectRatio": 2.667,
  "related": "none|category|product|vendor", "relatedId": "…", "relatedEntity": { "_id", "name", "image" },
  "timer": { "enabled": true, "label": "Ends in", "endsAt": "…", "serverNow": "…", "remainingSeconds": 3600 } | null }
```
- **Fix banner image display:** size the banner container with `aspectRatio` when present (fallback `2.6`), use `BoxFit.cover`/`centerCrop`, rounded corners. No stretching, no layout jump.
- Overlay text (if non-empty): `badge` chip, `title`, `subtitle`, `ctaText` button; colours from `bgColor`/`textColor` when set (validate hex).
- **Timer:** if `timer` is not null, show a live countdown "Ends in 02h 14m 09s" from `remainingSeconds`; when it hits 0 remove that banner from the carousel.
- Tap: `related` = `category` → category products, `product` → product detail, `vendor` → vendor profile, `none` → nothing.

### A7. Suggestions + recently viewed

- `GET /user/suggestions?limit=12` (logged in) → `data` = product cards, root also has `personalised`, `vendors` (suggested shops), `enabled`.
- `GET /user/recently-viewed?limit=12` → product cards. Show a "Recently viewed" row on home (below suggestions) and in profile.
- Product detail views are recorded automatically by the backend when the user opens product detail **while logged in** (`GET /public/product-detail/:id` with the token). If your detail screen uses a different endpoint, also call `POST /user/recently-viewed` body `{ "productId": "…" }` (fire-and-forget).

### A8. Vendor list: suggested vendors

`GET /public/vendors` (View-all vendors) now returns root-level `suggestedVendors: [VendorCard]` on page 1 (no search).
VendorCard: `{ _id, name, shopLogo, coverImage, location, rating, ratingCount, productCount, discountBadge, isVerified, profileScore, isSuggested }`.
Show a "Suggested for you" horizontal strip at the top of the vendor list; `isVerified` → verified tick. Nearby vendors (`GET /public/nearby-vendors`) are now ranked by profile quality.

### A9. Hot deals screen

`GET /public/hot-deals?limit=20` → root `{ data: [ProductCard + { isHotDeal, discountPercent, hotDeal: { badge, ruleName, percentOff, endsAt } }], enabled }`.
Full-screen grid "Hot deals of the day". Hide all hot-deal UI if `features.hotDealsEnabled` is false or `enabled` is false. Show countdown when `hotDeal.endsAt` is set.

### A10. Services / venues: discounts on cards and checkout

Venue cards (`/public/venues`, category venues, venue detail, booking cards) now include:
```json
"hasDiscount": true, "originalPrice": 10000, "discountedPrice": 8000,
"discount": { "type": "percentage", "value": 20, "label": "20% OFF", "percentOff": 20, "amountOff": 2000, "endsAt": null },
"priceInfo": { "amount": 8000, "originalAmount": 10000, "hasDiscount": true, "discount": {…}, "unit": "day", "currency": "INR", "symbol": "₹" }
```
Show strike-through original price + discount chip. Booking preview/checkout `pricing.discountTotal` is already applied in totals — show it as a "Discount" line.

### A11. Service booking via ENQUIRY (new main flow)

Read `features.venueBookingMode`:
- `"enquiry"` (default): the venue detail primary button becomes **"Send enquiry"** (not "Book now").
- `"direct"`: keep the old direct booking flow (existing `POST /user/venue-booking/:venueId`).
- If any direct booking call returns `ENQUIRY_REQUIRED`, switch to the enquiry flow.

**Flow:** User sends enquiry → venue vendor calls & accepts → user gets push → user opens enquiry → "Confirm & pay token" → booking created.

Endpoints (all need login):

1. **Send enquiry (full form):** `POST /user/venue-enquiry/:venueId`
   Body (same date/time fields as existing booking):
   ```json
   { "bookingType": "full_day|hourly", "bookingDate": "2026-11-12",   // or "bookingDates": ["…","…"]
     "startTime": "10:00", "endTime": "14:00",                         // hourly only
     "guestCount": 150, "eventType": "Wedding", "message": "Need decoration too",
     "preferredCallTime": "Evening",
     "name": "Rahul", "mobileNumber": "9876543210", "countryCode": "+91", "email": "" }
   ```
   Name/phone default to the profile; prefill them, editable.
2. **Quick enquiry (shortcut, one tap, dates optional):** `POST /user/venue-enquiry/:venueId/quick` body `{}` or `{ "message": "Call me", "preferredCallTime": "Morning" }`.
   Add a secondary "Quick enquiry / Request callback" button on venue cards and venue detail.
3. **My enquiries list:** `GET /user/enquiries?status=all|open|pending|accepted|rejected|cancelled|expired|converted&page=1&limit=20`
4. **Detail:** `GET /user/enquiries/:id`
5. **Cancel:** `POST /user/enquiries/:id/cancel` body `{ "reason": "…" }`
6. **Booking preview (after accept):** `GET /user/enquiries/:id/booking-preview` (for flexible-date quick enquiries pass `bookingDate`, `bookingType`, `startTime`, `endTime` as query)
   → `{ available, availabilityMessage, holdExpiresAt, bookingWindowHours, totalAmount, amountDueNow, pricing: { venueFee, discountTotal, taxTotal, subTotal, grandTotal, tokenAmount, remainingAmount, usesTokenPayment, currency, symbol, rateLabel } }`
7. **Book (creates the booking + payment):** `POST /user/enquiries/:id/book` body: same contact/payment fields the existing booking API uses (address, payment method, etc.). Response is **identical to the existing create-booking response** → continue with the **existing Razorpay / payment-confirm flow** (`POST /user/venue-bookings/:id/confirm-payment`).

Enquiry object (user side):
```json
{ "_id", "enquiryNumber": "ENQ-…", "status": "pending|accepted|rejected|cancelled|expired|converted",
  "statusLabel": "Waiting for venue", "source": "standard|quick",
  "venue": { "_id", "name", "thumbnail", "city", "address" },
  "bookingType", "bookingDates": [], "dateLabel", "summaryLabel", "startTime", "endTime", "slotLabel",
  "guestCount", "eventType", "message", "preferredCallTime",
  "quote": { "grandTotal", "tokenAmount", "rateLabel", "symbol" },
  "vendorNote", "rejectionReason", "responseDueAt", "acceptedAt", "holdExpiresAt",
  "holdSecondsRemaining": 85000, "canCancel": true, "canBook": false, "orderId": null,
  "vendorContact": { "name", "phone", "phoneLabel", "canCall", "phoneLockedByPlan" } }
```
UI:
- **Enquiry form screen** (date picker reusing the booking date/slot widgets + guests + event type + message + contact). Show `quote` estimate if available.
- **My enquiries** screen (tabs: Open / Booked / Closed) with status chips coloured per status. Add entry in profile menu and in the bookings screen.
- **Enquiry detail**: timeline (Sent → Accepted → Booked), vendor note, rejection reason, `vendorContact` call button **only if `canCall`**.
  - `accepted` + `canBook` → big **"Confirm & pay ₹<tokenAmount>"** button + countdown from `holdSecondsRemaining` ("Complete within 23h 12m"). Opens booking-preview → payment.
  - `pending` → "Waiting for the venue to call you" + Cancel.
  - `rejected` / `expired` / `cancelled` → "Send new enquiry" button.
  - `converted` → "View booking" (→ booking detail with `orderId`).

### A12. Vendor phone visibility on user side

Public vendor/venue contact blocks now include `canCall`, `phone` (empty when hidden), `phoneLabel` (masked) and `phoneLockedByPlan`.
**Show the call button only when `canCall` is true.** Otherwise show "Send enquiry" / chat instead. Never display a number when `phone` is empty.

### A13. Push notifications (user)

Notification `data` payload contains `type`, `notificationId` and flat metadata (`event`, `enquiryId`, `venueId`, `productId`, `linkPath`, `percentOff`, …). Route taps:

| type | open |
|---|---|
| `enquiry_accepted` | Enquiry detail (`enquiryId`) — highlight "Confirm & pay" |
| `enquiry_rejected` / `enquiry_expired` | Enquiry detail |
| `discount_alert` (`kind=product`) | Product detail (`productId`) |
| `discount_alert` (`kind=venue`) | Venue detail (`venueId`) |
| unknown | Notifications list |

Users get `discount_alert` when an item they wishlisted/carted drops in price. Ensure the user FCM token is sent with the existing profile/login `fcm_id` field on login and on token refresh.

---

## PART B — VENDOR APP (ecom)

### B1. Recommendations screen (new home card / tab)

`GET /vendor/recommendations` → `data[0]`:
```json
{
  "summary": { "profilePercent": 65, "activePlans": [ { "planType", "label", "endDate", "daysRemaining" } ],
               "phone": { "planRequired", "hasActivePlan", "expiresAt", "daysRemaining", "canToggle", "phoneVisibleToUsers" } },
  "recommendations": [
    { "key": "buy_phone_plan", "type": "plan|profile|listing|hot_deal|video|discount|enquiry", "priority": 100,
      "title": "Your phone number is hidden", "description": "…", "screen": "plans",
      "planType": "show_phone", "progress": 65, "fromPrice": 199,
      "cta": { "label": "See Show Number plans", "screen": "plans", "planType": "show_phone", "filter": "discounted" },
      "action": { "type", "method", "path" } | null }
  ],
  "plans": [ { "planType": "show_phone", "label": "Show Number", "pitch": "…", "isActive": false, "activeUntil": null, "daysRemaining": 0,
               "tiers": [ { "_id", "name", "price", "durationDays", "description", "benefits": [], "badge": "Popular", "isRecommended": true,
                            "action": { "type": "subscribe_plan", "label": "Buy for ₹499", "method": "POST", "path": "/api/vendor/plans/<id>/subscribe" } } ] } ]
}
```
Build:
- A **"Recommended for you"** section on the vendor dashboard (top 3 cards) + full screen with all cards, sorted by `priority`.
- Card tap → navigate by `cta.screen` (map these names to your routes):
  `plans` (with optional `planType` to pre-select a tab), `profile_completion`, `add_product`, `products` (with `filter: "discounted"`), `videos`.
- A **Plans screen** grouped by `plans[].planType`: show `pitch`, active status + days left, and tier cards (name, price, `durationDays` → "30 days", `benefits` bullet list, `badge`, highlight `isRecommended`).
  Buy → `POST /vendor/plans/:planId/subscribe` → existing Razorpay checkout → `POST /vendor/plans/subscriptions/confirm` (existing flow; response `requiresPayment`).
  Refresh recommendations + phone state after success.

### B2. Show Number plan + phone visibility

- `GET /vendor/profile/phone-visibility` → `data[0] = { showPhoneOnApp, statusLabel, phonePlan: { planRequired, hasActivePlan, expiresAt, daysRemaining, canToggle, phoneVisibleToUsers }, phoneVisibleToUsers }`
- `PATCH /vendor/profile/phone-visibility` body `{ "showPhoneOnApp": true|false }`
- UI in profile/settings: "Show my number to customers" switch.
  - If `phonePlan.canToggle` is false → switch disabled, show "Your number is hidden. Buy a Show Number plan" + button → Plans (`show_phone`).
  - Show "Plan active · 12 days left" when active.
  - On `PHONE_PLAN_REQUIRED` error → open Show Number plans.

### B3. Profile completion + benefits

`GET /vendor/profile/completion` → `data[0]`:
```json
{ "percent": 65, "score": 65, "complete": false, "variant": "ecom",
  "modules": [ { "id": "personal|business|bank|documents|shopMedia|products|services", "label", "href",
                 "icon": "user", "color": "#6366f1", "image": "", "percent": 100, "doneCount", "total", "complete",
                 "remaining": [ { "key", "label" } ], "optionalRemaining": [] } ],
  "nextStep": { "moduleId", "label", "href" },
  "benefits": { "tiers": [ { "minPercent": 40, "title", "description", "icon", "perk", "image", "unlocked": true } ],
                "unlockedCount": 1, "nextBenefit": { …, "percentToGo": 5 }, "headline": "Complete 5% more to unlock \"Build trust\"" } }
```
Build an attractive **Profile completion screen**:
- Circular progress with `percent`, `benefits.headline` under it.
- Module cards in a grid: coloured icon tile using `color` (map `icon` names to your icon set; if `image` is non-empty show that image instead), module % bar, "x of y done", list of `remaining` labels, tap → the matching edit screen.
- Benefit ladder: tiers with lock/unlock state, `minPercent`, title, description; highlight `nextBenefit`.
- Show a compact progress banner on the dashboard until `complete`. At 100% show "🎁 Free Show Number trial unlocked" (backend grants it automatically).
- Re-fetch after any profile/product save.

### B4. Products: hot-deal opt-in + discount alerts + approval

- Add/Edit product form: add a switch **"Add this product to Hot Deals?"** → send `hotDealOptIn: true|false` with the existing create/update multipart.
- Product list/detail: each product now has `hotDeal: { optIn, status: "none|pending|approved|rejected", rejectionReason }`. Show chip: Pending review / In Hot Deals / Rejected (reason).
- Quick toggle from the product list: `POST /vendor/products/:id/hot-deal` body `{ "optIn": true|false }` → `data[0] = { productId, hotDeal: { optIn, status } }`. Show the response `message`.
- When the vendor increases a discount, customers are notified automatically — show a hint under the discount field: "Customers who saved this product will be notified."
- Already-approved vendors' products go live immediately; show the product `status`/`adminApproved` as before.
- **Image upload responses** may include root `imageWarnings: [ { field, file, message } ]` → show them as a non-blocking warning sheet after save. Handle `THUMBNAIL_TOO_SMALL`.
- Recommend a square thumbnail in the picker UI ("Best: square photo, at least 800×800").

### B5. Videos on/off (vendor)

- `GET /vendor/video-settings` / `PATCH /vendor/video-settings` body `{ "videoEnabled": bool }` → `{ adminEnabled, enabled, effective, lockedByAdmin }`.
- Toggle "Show my videos to customers" in settings. When `effective` is false, hide the upload button and show why. Handle `VIDEO_DISABLED` on upload.
- Hide all video menus when `features.videoEnabledVendor` is false.

### B6. Device token (push)

On login, app start and FCM token refresh: `PUT /vendor/device-token` body `{ "fcmToken": "<token>" }`. On logout: `DELETE /vendor/device-token`.

### B7. Push notifications (vendor)

| type | open |
|---|---|
| `hot_deal_approved` / `hot_deal_rejected` | Product detail |
| `plan_expiring` (`screen=plans`, `planType`) | Plans screen on that plan type |
| `profile_reminder` | Profile completion |
| unknown | Notifications list |

---

## PART C — VENUE / SERVICE VENDOR APP

All paths below are under `/venue-vendor`.

### C1. Enquiries (most important)

- List: `GET /venue-vendor/enquiries?status=all|pending|accepted|rejected|converted|expired|cancelled&search=&page=1&limit=20`
  Root also has `summary: { pending, accepted, rejected, converted, expired, cancelled }` → show as tab badges.
- Detail: `GET /venue-vendor/enquiries/:id`
- Accept: `POST /venue-vendor/enquiries/:id/accept` body `{ "note": "Confirmed decoration", "bookingWindowHours": 24 }` (both optional)
- Reject: `POST /venue-vendor/enquiries/:id/reject` body `{ "reason": "Fully booked" }` (min 3 chars, required)
- Note: `PATCH /venue-vendor/enquiries/:id/note` body `{ "note": "…" }`

Vendor enquiry object = user object (A11) + `customer: { _id, name, phone, countryCode, email }` + `canRespond`.

UI:
- **Enquiries tab** in bottom nav (badge = `summary.pending`). Tabs: New (pending) / Accepted / Booked (converted) / Closed.
- Card: customer name, service name + thumbnail, `summaryLabel`/`dateLabel`, guests, event type, time since created, `responseDueAt` countdown ("Reply within 31h").
- Detail: big **Call customer** button (`tel:` with `countryCode` + `phone`), WhatsApp button, message, preferred call time, quote estimate, note field.
  - `canRespond` → **Accept** (dialog: optional note) / **Decline** (dialog: required reason).
  - accepted → "Waiting for customer to pay · expires in …" (`holdSecondsRemaining`).
  - converted → "View booking" (`orderId` → existing booking detail).
- Push `enquiry_received` → open enquiry detail; `enquiry_cancelled` → enquiry detail.

### C2. Service discounts ("Do you want to give a discount?")

- `GET /venue-vendor/venues/:id/discount` → `data[0] = { venueId, name, price, hasDiscount, current, configured, suggestions: [ { percent: 5, discountedPrice } … ], customersNotified, alertMinPercent }`
- Set: `PUT /venue-vendor/venues/:id/discount` body
  `{ "discountType": "percentage|flat", "discountValue": 15, "label": "Diwali offer", "startsAt": "ISO (optional)", "endsAt": "ISO (optional)", "notifyUsers": true }`
  (percentage max 90; flat must be less than price)
- Remove: `DELETE /venue-vendor/venues/:id/discount`
- UI: after creating/editing a service, and from the service detail, show a **"Want to offer a discount?"** bottom sheet: suggestion chips (5/10/15/20/25% with the resulting price), custom value, type switch, optional date range, "Notify interested customers" checkbox (default on). Show current discount chip on the service card in "My services".

### C3. Services go live without full profile

Services only need **name, thumbnail, category and price** to be listed. Update the add-service form: mark only these as required, show the others as optional ("Add more details to rank higher"). Show upload `imageWarnings` like B4. Already-approved vendors' services are live immediately; edits to name/description/images/category re-trigger review only if the admin requires approval.

### C4. Recommendations, plans, phone, profile completion, videos, device token

Same as Part B with these paths:
- Recommendations: `GET /venue-vendor/recommendations` (extra card keys: `pending_enquiries` → screen `enquiries`, `add_first_service` → `add_venue`, `add_discount` → `venue_discount` with `suggestions`)
- Plans: `GET /venue-vendor/plans`, `POST /venue-vendor/plans/:planId/subscribe`, `POST /venue-vendor/plans/subscriptions/confirm`, `GET /venue-vendor/plans/subscriptions`
- Phone: `GET|PATCH /venue-vendor/auth/phone-visibility`
- Profile completion: `GET /venue-vendor/auth/profile-completion` (for "both" vendors it covers both accounts; `variant` = `both`)
- Videos: `GET|PATCH /venue-vendor/video-settings`
- Device token: `PUT|DELETE /venue-vendor/device-token`

---

## PART D — "BOTH" VENDORS (combined panel)

If the app supports vendors who are both ecom and service (`vendorPanelType: "both"`):
- Show both recommendation feeds merged (dedupe by `key`), Enquiries tab and Products tab.
- Use `/venue-vendor/auth/profile-completion` for the combined checklist.
- Register the device token on **both** `/vendor/device-token` and `/venue-vendor/device-token` with the matching tokens/sessions.

---

## IMPLEMENTATION ORDER

1. Networking: models + API methods for every endpoint above; error `code` parsing; feature-flag provider.
2. Shared widgets: product card (badges/discount), banner (aspect ratio + timer), countdown widget, status chip, plan tier card.
3. User app: home feed (A1) → area (A2) → enquiry flow (A11) → videos (A4) → search (A5) → suggestions/recent (A7) → vendor list (A8) → hot deals (A9) → venue discounts (A10) → phone (A12) → push routing (A13).
4. Venue vendor app: enquiries (C1) → discounts (C2) → service form (C3) → C4.
5. Vendor app: recommendations + plans (B1) → phone (B2) → profile completion (B3) → products (B4) → videos (B5) → device token (B6) → push (B7).
6. Test every flow end-to-end against the live API (see checklist).

## ACCEPTANCE CHECKLIST

- [ ] App works when every feature flag is off (no crashes, sections hidden).
- [ ] Home sections render in the API order; disabled sections absent.
- [ ] Changing area reloads home + vendors; guest area persists locally.
- [ ] Reels: only one active player, next one preloaded, cursor pagination stops at `hasMore=false`, user toggle hides videos everywhere.
- [ ] Banner images keep correct ratio; timers tick and remove expired banners.
- [ ] Search "shiv shakti" shows the shop row and its products.
- [ ] Enquiry: send → vendor accepts (push) → user pays token → booking appears in My bookings; expired/declined states handled; `ENQUIRY_REQUIRED` redirects.
- [ ] Phone/call buttons only shown when `canCall`.
- [ ] Vendor: buy Show Number plan → toggle works; without plan → toggle locked with CTA.
- [ ] Profile completion screen matches API %, modules tap through to the right edit screens.
- [ ] Hot-deal opt-in shows Pending/Approved/Rejected.
- [ ] Service discount sheet sets/removes discount; user app shows strike-through price.
- [ ] Device tokens registered on login and cleared on logout for all apps.
- [ ] All new lists have loading, empty, error and pull-to-refresh states.

When done, output: the list of files changed per app, any endpoint you could not wire and why, and screenshots/steps to verify each checklist item.

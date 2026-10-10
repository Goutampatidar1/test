# OHO E-Bazar — User App Integration Prompt

> Paste everything below this line into your AI coding assistant **inside the user (customer) app project**.
> This file is only for the customer app: shopping and service booking.
> Vendor and service-vendor work is in `APP_INTEGRATION_PROMPT_VENDOR.md`. Do not implement that here.

---

## ROLE AND GOAL

You are integrating **new backend features** into the OHO E-Bazar **user app** (customers). The backend is already finished and deployed. **Do not change the backend.** Wire the endpoints below into the existing app with production-quality UI, state management and error handling, following the app's **existing architecture, folder structure, networking layer, models, theme and naming conventions**.

The user app covers shopping (ecom products) and booking services/venues.

At the end, produce a checklist of what you implemented and anything you could not wire.

---

## GLOBAL RULES (read first)

- **Base URL:** `https://ohoebazar.com:5012/api` — use the existing base-URL config, do not hardcode it again.
- **Auth:** `Authorization: Bearer <accessToken>` (existing token handling + refresh flow). Public routes work without a token, but **send the token when the user is logged in** — responses get personalised (wishlist flags, liked videos, suggestions).
- **Response envelope (most endpoints):**
  ```json
  { "status": true, "message": "…", "data": [ … ] }
  ```
  `data` is **always an array**. When the endpoint returns a single object it is `data[0]`.
  `status` is `false` when `data` is empty — **that is not an error**, just an empty state.
  Some list endpoints add extra top-level keys next to `data` (e.g. `pagination`, `matchedVendors`, `suggestedVendors`, `videoEnabled`, `enabled`). Read them from the root.
- **Errors:** non-2xx with `{ "status": false, "message": "…", "code": "SOME_CODE" }`.
  `code` is optional. **Branch on `code`, show `message` to the user.** Codes used by the user app:

  | code | meaning | what the app should do |
  |---|---|---|
  | `ENQUIRY_REQUIRED` | Booking mode is "enquiry"; direct booking blocked | Open the enquiry form instead of checkout |
  | `ENQUIRY_ALREADY_OPEN` | User already has an open enquiry for this venue + date | Show message + button to open "My enquiries" |
  | `ENQUIRY_NOT_ACCEPTED` | Tried to book before vendor accepted | Show "Waiting for venue" state |
  | `ENQUIRY_EXPIRED` / `ENQUIRY_CLOSED` / `ENQUIRY_CONVERTED` | Enquiry can't be booked anymore | Refresh enquiry, offer "Send new enquiry" |
  | `DATES_HELD` | Dates temporarily held for another customer | Ask user to pick other dates |

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
  Store it in a global config/state provider. **Every feature below must respect these flags** (hide UI when off). Use safe defaults identical to the above if the fetch fails. The user app reads `venueBookingMode`, `videoEnabledUser`, `hotDealsEnabled` and `homeSections`.
- **Images:** all image URLs from the API are absolute. Use the existing cached-image widget with placeholder + error fallback. Never crash on empty strings.
- **Money:** prices are numbers in INR; many responses also include ready-made labels (`priceLabel`, `discountLabel`, `savingsLabel`). Prefer the labels.
- **Dates:** ISO-8601 UTC strings. Show in device local time.
- **Countdowns:** when the API gives `remainingSeconds` / `holdSecondsRemaining`, start a local ticking timer from that value (do **not** trust the device clock against `endsAt`). Stop at 0 and refresh the item.
- Add every new endpoint to the existing API service/repository layer, create typed models with **null-safe parsing** (all new fields optional with defaults), and reuse existing loading/empty/error widgets.
- Pull-to-refresh on every new list. Pagination where indicated.
- No placeholder/dummy data in final code.

---

## USER APP

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
  "timer": { "enabled": true, "label": "Ends in", "endsAt": "…", "serverNow": "…", "remainingSeconds": 3600 } }
```
`timer` may be `null`.
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
"priceInfo": { "amount": 8000, "originalAmount": 10000, "hasDiscount": true, "discount": {}, "unit": "day", "currency": "INR", "symbol": "₹" }
```
Show strike-through original price + discount chip. Booking preview/checkout `pricing.discountTotal` is already applied in totals — show it as a "Discount" line.

### A11. Service booking via ENQUIRY (new main flow)

Read `features.venueBookingMode`:
- `"enquiry"` (default): the venue detail primary button becomes **"Send enquiry"** (not "Book now").
- `"direct"`: keep the old direct booking flow (existing `POST /user/venue-booking/:venueId`).
- If any direct booking call returns `ENQUIRY_REQUIRED`, switch to the enquiry flow.

**Flow:** User sends enquiry → venue vendor calls and accepts → user gets push → user opens enquiry → "Confirm & pay token" → booking created.

Endpoints (all need login):

1. **Send enquiry (full form):** `POST /user/venue-enquiry/:venueId`
   Body (same date/time fields as existing booking):
   ```json
   { "bookingType": "full_day|hourly", "bookingDate": "2026-11-12",
     "bookingDates": ["2026-11-12"],
     "startTime": "10:00", "endTime": "14:00",
     "guestCount": 150, "eventType": "Wedding", "message": "Need decoration too",
     "preferredCallTime": "Evening",
     "name": "Rahul", "mobileNumber": "9876543210", "countryCode": "+91", "email": "" }
   ```
   `startTime` / `endTime` are hourly only. Name/phone default to the profile; prefill them, editable.
2. **Quick enquiry (shortcut, one tap, dates optional):** `POST /user/venue-enquiry/:venueId/quick` body `{}` or `{ "message": "Call me", "preferredCallTime": "Morning" }`.
   Add a secondary "Quick enquiry / Request callback" button on venue cards and venue detail.
3. **My enquiries list:** `GET /user/enquiries?status=all|open|pending|accepted|rejected|cancelled|expired|converted&page=1&limit=20`
4. **Detail:** `GET /user/enquiries/:id`
5. **Cancel:** `POST /user/enquiries/:id/cancel` body `{ "reason": "…" }`
6. **Booking preview (after accept):** `GET /user/enquiries/:id/booking-preview` (for flexible-date quick enquiries pass `bookingDate`, `bookingType`, `startTime`, `endTime` as query)
   → `{ available, availabilityMessage, holdExpiresAt, bookingWindowHours, totalAmount, amountDueNow, pricing: { venueFee, discountTotal, taxTotal, subTotal, grandTotal, tokenAmount, remainingAmount, usesTokenPayment, currency, symbol, rateLabel } }`
7. **Book (creates the booking + payment):** `POST /user/enquiries/:id/book` body: same contact/payment fields the existing booking API uses (address, payment method, etc.). Response is **identical to the existing create-booking response** → continue with the **existing Razorpay / payment-confirm flow** (`POST /user/venue-bookings/:id/confirm-payment`).

Enquiry object:
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

### A12. Vendor phone visibility

Public vendor/venue contact blocks now include `canCall`, `phone` (empty when hidden), `phoneLabel` (masked) and `phoneLockedByPlan`.
**Show the call button only when `canCall` is true.** Otherwise show "Send enquiry" / chat instead. Never display a number when `phone` is empty.

### A13. Push notifications

Notification `data` payload contains `type`, `notificationId` and flat metadata (`event`, `enquiryId`, `venueId`, `productId`, `linkPath`, `percentOff`, …). Route taps:

| type | open |
|---|---|
| `enquiry_accepted` | Enquiry detail (`enquiryId`) — highlight "Confirm & pay" |
| `enquiry_rejected` / `enquiry_expired` | Enquiry detail |
| `discount_alert` (`kind=product`) | Product detail (`productId`) |
| `discount_alert` (`kind=venue`) | Venue detail (`venueId`) |
| unknown | Notifications list |

Users get `discount_alert` when an item they wishlisted or added to cart drops in price. Ensure the user FCM token is sent with the existing profile/login `fcm_id` field on login and on token refresh.

---

## IMPLEMENTATION ORDER

1. Networking: models + API methods for every endpoint above; error `code` parsing; feature-flag provider.
2. Shared widgets: product card (badges/discount), banner (aspect ratio + timer), countdown widget, status chip.
3. Home feed (A1) → area (A2) → enquiry flow (A11) → videos (A4) → search (A5) → suggestions/recent (A7) → vendor list (A8) → hot deals (A9) → venue discounts (A10) → phone (A12) → push routing (A13).
4. Test every flow end-to-end against the live API.

## ACCEPTANCE CHECKLIST

- [ ] App works when every feature flag is off (no crashes, sections hidden).
- [ ] Home sections render in the API order; disabled sections absent.
- [ ] Changing area reloads home + vendors; guest area persists locally.
- [ ] Reels: only one active player, next one preloaded, cursor pagination stops at `hasMore=false`, user toggle hides videos everywhere.
- [ ] Banner images keep correct ratio; timers tick and remove expired banners.
- [ ] Search "shiv shakti" shows the shop row and its products.
- [ ] Enquiry: send → vendor accepts (push) → user pays token → booking appears in My bookings; expired/declined states handled; `ENQUIRY_REQUIRED` redirects.
- [ ] Phone/call buttons only shown when `canCall`.
- [ ] Venue cards show strike-through price when `hasDiscount` is true; checkout shows a Discount line.
- [ ] All new lists have loading, empty, error and pull-to-refresh states.

When done, output: the list of files changed, any endpoint you could not wire and why, and steps to verify each checklist item.

# Admin panel — known issues

Reviewed: 8 October 2026  
Scope: `AdminPannel` and the `/api/admin/*` backend it calls.

This note is the narrative companion to the tracking sheet in [ADMIN_BUG_SHEET.csv](./ADMIN_BUG_SHEET.csv). IDs match that sheet. Status is **Open** unless a row says otherwise.

Severity:

| Level | Meaning |
| --- | --- |
| Critical | Anyone can take over admin, or core money/order data is wrong |
| High | An admin is blocked from a real task, or a session dies unexpectedly |
| Medium | A screen lies, hides a feature, or loses data the admin expects to see |
| Low | Edge case, dead route, or awkward navigation |

## Summary

| Severity | Open |
| --- | --- |
| Critical | 1 |
| High | 3 |
| Medium | 4 |
| Low | 4 |

Fix **ADM-001** before the API is exposed on the public internet. Then **ADM-002**, **ADM-003**, and **ADM-004**.

## Critical

### ADM-001 — Anyone can create an admin account

`POST /api/admin/auth/register` is public. It does not check that the caller is already an admin, and it does not stop after the first admin exists. A successful call creates an admin and returns access and refresh tokens.

Evidence: `Backend/routes/adminRoutes/authRoutes.js` (register is not behind `protectAdmin`), `Backend/controllers/adminControllers/authController.js` `register`.

Workaround until this is closed: block `POST /api/admin/auth/register` at the reverse proxy, or allow it only from a private network.

## High

### ADM-002 — A refreshed login can be overwritten and the admin is logged out

When the access token expires, `AdminPannel/src/api.js` writes the new tokens into `localStorage` only. Redux still holds the old tokens. `setAdmin` (used when the layout loads the profile, and again when Admin Profile is saved) writes Redux’s old tokens back over the fresh ones.

The next request then sends the expired access token. If the old refresh token is also expired, the panel logs the admin out.

Evidence: `AdminPannel/src/api.js` `refreshAdminToken`, `AdminPannel/src/store/authSlice.js` `setAdmin`, call sites in `AdminLayout.jsx` and `AdminProfile.jsx`.

Workaround: log in again if the panel suddenly returns to the login screen after a long session or after saving the profile.

### ADM-003 — Enquiry notifications open the list and drop the enquiry

A new service enquiry notifies the admin with `linkPath` `/admin/enquiries/<id>`. The panel route for that path redirects to `/admin/venue-enquiries` and throws away the id. The bell opens the list, not that enquiry. The enquiry page also has no `?id=` open.

Evidence: `Backend/controllers/userControllers/venueEnquiryController.js` (admin `linkPath`), `AdminPannel/src/routes/adminRoutes.jsx` (`enquiries/:id` → list), `AdminPannel/src/components/HeaderNotifications.jsx`.

Workaround: search the enquiry number, name, or phone on Service Enquiries.

### ADM-004 — Forgot-password says an email was sent, and none is

`POST /api/admin/auth/forgot-password` stores a reset token and responds that instructions were sent. No mailer is called. The admin login screen has no forgot-password or reset-password page, so the panel cannot complete a reset.

In `NODE_ENV=development` the raw token is also returned in the JSON body (see ADM-010).

Evidence: `authController.js` `forgotPassword`; no forgot-password screen under `AdminPannel/src`.

Workaround: reset the admin password in the database, or use the dev-only token against `POST /api/admin/auth/reset-password`.

## Medium

### ADM-005 — Service enquiry quote amount is blank

When an enquiry includes dates, the API stores `quote.grandTotal`, `tokenAmount`, and `rateLabel`. The enquiry detail panel reads `quote.total` and `quote.note`, so the amount line is empty even when a price was calculated.

Evidence: `Backend/utils/venueEnquiry.js` `buildEnquiryFields`; `AdminPannel/src/pages/venues/VenueEnquiryPage.jsx` quote block.

Workaround: none in the panel. The amount is in the database under `quote.grandTotal`.

### ADM-006 — Promo codes are built but not in the menu

Coupon CRUD is routed at `/admin/promo` (list, create, edit, view). The sidebar Promotion group only links the paid advertising dashboard, plans, and requests. An admin who does not know the URL will not find promo codes.

Evidence: `AdminPannel/src/routes/adminRoutes.jsx` `promo`; `AdminPannel/src/data/navItems.js`.

Workaround: open `/admin/promo` directly.

### ADM-007 — Two sidebar groups do not follow the page you are on

- Service Enquiries is a child of Service Management, but `pathInGroup` does not include `venue-enquiries`. If that group was collapsed, it stays collapsed on the enquiry page.
- Promotion Management is never in the open-group state, and `pathInGroup` ignores `promotion-ads`, so the group stays collapsed on Dashboard, Plans, and Requests.
- Orders is a top-level item, but the Ecom group regex treats `/admin/orders` as inside Ecom, so Ecom highlights while you are on Orders.

Evidence: `AdminPannel/src/components/Sidebar.jsx` `pathInGroup` and initial `openGroups`.

Workaround: open the group by hand.

### ADM-008 — Child categories have an API and no admin screen

`/api/admin/child-categories` is mounted, and vendors can create child categories from the vendor catalog. The admin menu has Categories and Sub-Categories only. Product create and edit always send `childCategory: ""`, so an admin-created product is never filed under a child category.

Evidence: `Backend/routes/index.js` admin child-category mount; `AdminPannel/src/api/adminChildCategories.js` (unused by any page); `ProductAdd.jsx` / `ProductEdit.jsx` payload.

Workaround: manage child categories through the vendor catalog API, not the admin panel.

## Low

### ADM-009 — Three routes still say “Coming soon”

`/admin/commission`, `/admin/reports`, and `/admin/recharge` render `SectionPage` (“Coming soon…”). Their sidebar entries are commented out. Recharge history that does work lives under Mobile, Gas, and Fastag.

Evidence: `adminRoutes.jsx`; `SectionPage.jsx`; commented items in `navItems.js`.

### ADM-010 — Password reset token is stored and compared in plain text

The token saved on the admin document is the same string the client must send. A database copy is enough to reset that admin’s password until the token expires (one hour). Development responses also include the token (ADM-004).

Evidence: `authController.js` `forgotPassword` and `resetPassword`.

### ADM-011 — Setting a vendor back to “pending” does not turn the shop off

Approving sets `status` to `active`. Rejecting sets `status` to `inactive`. Sending `approvalStatus: "pending"` updates the approval field and leaves `status` as it was, so a previously approved vendor can stay active.

The edit form disables Approval Status and does not send it, so this is an API gap. Approve and reject on the vendor view page set both fields.

Evidence: `Backend/utils/vendorApproval.js` `applyVendorApprovalStatus`; `VendorAdd.jsx` (field disabled on edit).

### ADM-012 — Hot-deal hours accept a bad number as `NaN`

`dailyStartHour` and `dailyEndHour` are passed through `Number(...)` with no finite / 0–23 check. A non-numeric value becomes `NaN` and fails later as a validation error instead of a clear 400. The panel’s number inputs normally prevent this.

Evidence: `Backend/controllers/adminControllers/hotDealController.js` `buildRulePayload`.

## Modules reviewed and working

These areas match between the panel and the admin API. This is a code review, not a full click-through of a running server.

| Module | What lines up |
| --- | --- |
| Login, profile, change password | `/admin/auth/login`, `/me`, `/me/password` |
| Dashboard | `/admin/dashboard/stats` |
| Users | List, create, edit, view |
| Ecom vendors | List, filters, approve and reject on the view page |
| Service vendors, services, amenities | CRUD and view routes |
| Service enquiries | List, filters, accept / reject / cancel. Quote display is ADM-005. Deep link is ADM-003 |
| Delivery partners and driver COD | List and settle |
| Products | List, create, edit, approve / reject. Child category is ADM-008 |
| Categories, sub-categories, attributes, locations | Screens and APIs |
| Orders and bookings | Ecom and venue list, detail, status, driver assign, invoice |
| Payments | Revenue, order / booking / recharge payments, driver and vendor withdrawals |
| Banners | Create, filters, status |
| Hot deals | Rules, queue, preview, feature flags. Hour validation is ADM-012 |
| Reels | Ecom and venue feeds. The mixed “all” list pages correctly |
| Vendor plans | Plan CRUD |
| Promotion advertising | Dashboard, plans, requests |
| Promo codes | CRUD works at `/admin/promo` (ADM-006) |
| FAQ, static pages, notifications | Screens and APIs |
| App settings and feature controls | Load and save through app config |
| Recharge history | Mobile, gas, and Fastag lists are read-only on purpose |

## How to update this

When a bug is fixed, set its Status to `Fixed` in [ADMIN_BUG_SHEET.csv](./ADMIN_BUG_SHEET.csv) and move the matching section here to a short “Fixed” list with the date. Do not delete the ID.

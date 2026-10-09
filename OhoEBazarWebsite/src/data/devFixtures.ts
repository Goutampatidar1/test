/**
 * DEVELOPMENT FIXTURES — used only by `npm run dev` when the backend API is unreachable,
 * so the layout can be worked on offline. Never bundled into the production code path
 * (guarded by `import.meta.env.DEV`) and the UI shows a "development preview data" notice.
 * Names mirror the backend seed; no prices, ratings or discounts are invented here.
 */
import type { PublicCategory, PublicProduct, PublicVendor, PublicVenue } from "@/lib/types";

export const devEcomCategories: PublicCategory[] = [
  "Fashion",
  "Electronics",
  "Beauty & Personal Care",
  "Groceries",
  "Home & Kitchen",
  "Sports & Outdoors",
].map((name, i) => ({ _id: `dev-cat-${i}`, name, mode: "ecom" }));

export const devVenueCategories: PublicCategory[] = ["Catering", "DJ", "Tent", "Light Decoration", "Baggi", "Bhangra Team"].map(
  (name, i) => ({ _id: `dev-svc-${i}`, name, mode: "venue" }),
);

export const devProducts: PublicProduct[] = [
  { _id: "dev-p-1", name: "Men's Cotton T-Shirt (dev fixture)", category: { _id: "c", name: "Fashion" } },
  { _id: "dev-p-2", name: "Masala Potato Chips (dev fixture)", category: { _id: "c", name: "Groceries" } },
  { _id: "dev-p-3", name: "Organic Bananas (dev fixture)", category: { _id: "c", name: "Groceries" } },
];

export const devVendors: PublicVendor[] = [{ _id: "dev-v-1", name: "Dev fixture shop" }];

export const devVenues: PublicVenue[] = devVenueCategories.map((c, i) => ({
  _id: `dev-venue-${i}`,
  name: `${c.name} (dev fixture)`,
  category: { _id: c._id, name: c.name },
}));

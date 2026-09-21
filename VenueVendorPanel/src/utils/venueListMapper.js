import { mediaUrl } from "../media.js";
import { formatVenuePrice, resolveVenuePrice } from "./venuePricing.js";

export { formatVenuePrice } from "./venuePricing.js";

export function formatInr(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

/** Map API venue document to list card shape */
export function mapVenueForList(v, index = 0) {
  const categoryName =
    v.category && typeof v.category === "object" ? v.category.name : v.category || "—";
  const location = [v.city, v.state].filter((s) => String(s || "").trim()).join(", ") || v.address || "—";
  const rawId = v?._id ?? v?.id;
  const id = rawId != null && String(rawId).trim() !== "" ? String(rawId) : `venue-${index}`;
  const resolved = resolveVenuePrice(v);

  return {
    id,
    name: v.name,
    category: categoryName,
    location,
    capacity: Number(v.capacity) || 0,
    pricePerDay: resolved.amount,
    priceUnit: resolved.unit,
    priceLabel: formatVenuePrice(resolved.amount, resolved.unit),
    hourlyPrice: Number(v.hourlyPrice) || 0,
    adminApproved: Boolean(v.adminApproved),
    status: v.status === "active" ? "available" : "inactive",
    enabled: v.status === "active",
    image: mediaUrl(v.thumbnail),
    totalBookings: 0,
  };
}

/** Map all API rows; never drops the full list because one row failed to map */
export function mapVenuesForList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    try {
      return mapVenueForList(row, index);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

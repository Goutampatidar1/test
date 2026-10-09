const VenueVendor = require("../models/entity/venueVendor");
const { getVenueDisplayPrice } = require("./venuePricing");

/**
 * Venues shown on the user app need only the essentials: approved, active, a name, a photo,
 * a category and a price. Address, city and amenities are optional so a vendor's service is
 * visible (and can receive enquiries) without a fully completed profile.
 */
function activePublicVenueListingFilter(extra = {}) {
  return {
    status: "active",
    adminApproved: { $eq: true },
    name: { $exists: true, $nin: ["", null] },
    thumbnail: { $exists: true, $nin: ["", null] },
    category: { $exists: true, $ne: null },
    $or: [{ dayPrice: { $gt: 0 } }, { hourlyPrice: { $gt: 0 } }, { basePrice: { $gt: 0 } }],
    ...extra,
  };
}

function isVenueListable(doc) {
  if (!doc) return false;
  if (doc.status !== "active" || doc.adminApproved !== true) return false;
  if (!String(doc.name || "").trim()) return false;
  if (!String(doc.thumbnail || "").trim()) return false;
  if (!doc.category) return false;
  return getVenueDisplayPrice(doc).amount > 0;
}

/** Venue-vendor accounts that are closed → hide their venues from users. */
async function getClosedVenueVendorIds() {
  const rows = await VenueVendor.find({ isOpen: false }).select("_id").lean();
  return rows.map((row) => row._id);
}

async function activePublicVenueListingFilterOpen(extra = {}) {
  const closedIds = await getClosedVenueVendorIds();
  const filter = activePublicVenueListingFilter(extra);
  if (closedIds.length === 0) return filter;

  const closedClause = {
    $nor: [{ role: "VenueVendor", addedById: { $in: closedIds } }],
  };

  if (Array.isArray(filter.$and)) {
    filter.$and.push(closedClause);
    return filter;
  }

  return {
    ...filter,
    $and: [closedClause],
  };
}

module.exports = {
  activePublicVenueListingFilter,
  activePublicVenueListingFilterOpen,
  getClosedVenueVendorIds,
  isVenueListable,
};

const { AppConfig } = require("../models");

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function getVenueVendorCommissionPercent() {
  const config = await AppConfig.findOne().select("commissions").lean();
  const row = (config?.commissions ?? []).find((entry) => entry.type === "VenueVendor");
  return Number(row?.percentage) || 0;
}

/**
 * Platform commission on a service (venue) booking.
 * Only VenueVendor-owned services use App Settings "Service vendor commission".
 * Admin-owned services keep the full booking amount (no vendor payout).
 */
function buildVenueBookingCommission({ grandTotal, venue, commissionPercent }) {
  const total = money(grandTotal);
  const isServiceVendor = String(venue?.role || "") === "VenueVendor" && Boolean(venue?.addedById);

  if (!isServiceVendor || total <= 0) {
    return {
      vendor: isServiceVendor ? venue.addedById : null,
      adminCommissionPercent: 0,
      adminCommissionAmount: 0,
      vendorEarnings: 0,
      appliesCommission: false,
    };
  }

  const percent = Math.min(100, Math.max(0, Number(commissionPercent) || 0));
  const adminCommissionAmount = money((total * percent) / 100);
  const vendorEarnings = money(Math.max(0, total - adminCommissionAmount));

  return {
    vendor: venue.addedById,
    adminCommissionPercent: percent,
    adminCommissionAmount,
    vendorEarnings,
    appliesCommission: percent > 0,
  };
}

async function resolveVenueBookingCommission(venue, grandTotal) {
  const commissionPercent = await getVenueVendorCommissionPercent();
  return buildVenueBookingCommission({ grandTotal, venue, commissionPercent });
}

function commissionFieldsFromOrder(order = {}) {
  const grandTotal = money(order.grandTotal);
  const hasSnapshot =
    order.adminCommissionPercent != null ||
    order.adminCommissionAmount != null ||
    order.vendorEarnings != null ||
    order.vendor != null;

  if (!hasSnapshot) {
    return {
      adminCommissionPercent: 0,
      adminCommissionAmount: 0,
      vendorEarnings: 0,
      appliesCommission: false,
    };
  }

  const percent = Number(order.adminCommissionPercent);
  const amount = Number(order.adminCommissionAmount);
  const earnings = Number(order.vendorEarnings);

  const adminCommissionPercent = Number.isFinite(percent) ? percent : 0;
  let adminCommissionAmount = Number.isFinite(amount) ? money(amount) : null;
  let vendorEarnings = Number.isFinite(earnings) ? money(earnings) : null;

  if (adminCommissionAmount == null && adminCommissionPercent > 0 && grandTotal > 0) {
    adminCommissionAmount = money((grandTotal * adminCommissionPercent) / 100);
  }
  if (adminCommissionAmount == null) adminCommissionAmount = 0;

  if (vendorEarnings == null) {
    vendorEarnings = order.vendor
      ? money(Math.max(0, grandTotal - adminCommissionAmount))
      : 0;
  }

  return {
    adminCommissionPercent,
    adminCommissionAmount,
    vendorEarnings,
    appliesCommission: adminCommissionPercent > 0 && adminCommissionAmount > 0,
  };
}

module.exports = {
  getVenueVendorCommissionPercent,
  buildVenueBookingCommission,
  resolveVenueBookingCommission,
  commissionFieldsFromOrder,
  money,
};

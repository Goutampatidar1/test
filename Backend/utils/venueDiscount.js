const AppError = require("./AppError");
const { getVenueDisplayPrice } = require("./venuePricing");

const DISCOUNT_TYPES = new Set(["percentage", "flat"]);

function isActiveWindow(venue, now = new Date()) {
  const starts = venue?.discountStartsAt ? new Date(venue.discountStartsAt) : null;
  const ends = venue?.discountEndsAt ? new Date(venue.discountEndsAt) : null;
  if (starts && starts.getTime() > now.getTime()) return false;
  if (ends && ends.getTime() < now.getTime()) return false;
  return true;
}

/** Round to whole rupees like the product discount helper. */
function discountAmountFor(base, type, value) {
  const amount = Number(base) || 0;
  const discount = Number(value) || 0;
  if (amount <= 0 || discount <= 0) return 0;
  if (type === "flat") return Math.min(amount, Math.round(discount));
  const pct = Math.min(100, discount);
  return Math.min(amount, Math.round((amount * pct) / 100));
}

/**
 * Current discount on a venue (null when none / expired).
 * `percentOff` is always populated so apps can render a "20% OFF" badge for flat discounts too.
 */
function getActiveVenueDiscount(venue, now = new Date()) {
  const value = Number(venue?.discountValue) || 0;
  if (value <= 0 || !isActiveWindow(venue, now)) return null;

  const type = DISCOUNT_TYPES.has(venue?.discountType) ? venue.discountType : "percentage";
  const display = getVenueDisplayPrice(venue);
  const base = display.amount;
  const off = discountAmountFor(base, type, value);
  if (off <= 0) return null;

  return {
    type,
    value,
    label: venue.discountLabel || (type === "percentage" ? `${value}% OFF` : `₹${value} OFF`),
    startsAt: venue.discountStartsAt || null,
    endsAt: venue.discountEndsAt || null,
    amountOff: off,
    percentOff: Math.round((off / base) * 100),
    originalAmount: base,
    discountedAmount: Math.max(0, base - off),
  };
}

/** Discount applied to a booking fee. Percentage scales with the fee, flat is once per booking. */
function calculateBookingDiscount(venue, venueFee, now = new Date()) {
  const active = getActiveVenueDiscount(venue, now);
  if (!active) return 0;
  return discountAmountFor(venueFee, active.type, active.value);
}

/** Presenter block shared by list cards and detail. */
function toVenuePriceBlock(venue, now = new Date()) {
  const display = getVenueDisplayPrice(venue);
  const discount = getActiveVenueDiscount(venue, now);
  return {
    amount: discount ? discount.discountedAmount : display.amount,
    originalAmount: display.amount,
    hasDiscount: Boolean(discount),
    discount: discount
      ? {
          type: discount.type,
          value: discount.value,
          label: discount.label,
          percentOff: discount.percentOff,
          amountOff: discount.amountOff,
          endsAt: discount.endsAt,
        }
      : null,
    unit: display.unit,
    currency: "INR",
    symbol: "₹",
  };
}

/** Validate and normalise vendor/admin discount input. Returns fields to $set. */
function parseDiscountInput(body = {}, venue = null) {
  const type = String(body.discountType ?? body.type ?? "percentage").trim().toLowerCase();
  if (!DISCOUNT_TYPES.has(type)) {
    throw new AppError("discountType must be percentage or flat", 400);
  }
  const value = Number(body.discountValue ?? body.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError("discountValue must be greater than 0", 400);
  }
  if (type === "percentage" && value > 90) {
    throw new AppError("Percentage discount cannot exceed 90%", 400);
  }
  if (venue) {
    const base = getVenueDisplayPrice(venue).amount;
    if (type === "flat" && base > 0 && value >= base) {
      throw new AppError("Flat discount must be less than the price", 400);
    }
  }

  const startsRaw = body.startsAt ?? body.discountStartsAt;
  const endsRaw = body.endsAt ?? body.discountEndsAt;
  const startsAt = startsRaw ? new Date(startsRaw) : new Date();
  const endsAt = endsRaw ? new Date(endsRaw) : null;
  if (Number.isNaN(startsAt.getTime())) throw new AppError("Invalid startsAt", 400);
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new AppError("Invalid endsAt", 400);
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new AppError("endsAt must be after startsAt", 400);
  }

  return {
    discountType: type,
    discountValue: value,
    discountLabel: String(body.label ?? body.discountLabel ?? "").trim().slice(0, 60),
    discountStartsAt: startsAt,
    discountEndsAt: endsAt,
  };
}

module.exports = {
  getActiveVenueDiscount,
  calculateBookingDiscount,
  toVenuePriceBlock,
  parseDiscountInput,
  discountAmountFor,
};

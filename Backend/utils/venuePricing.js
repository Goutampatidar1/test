/** Prefer a positive amount; `0` must not block fallback (unlike `??`). */
function positiveAmount(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Day / full booking rate. Full priceType stores the amount in basePrice with dayPrice=0.
 */
function getVenueDayPrice(venue) {
  return positiveAmount(venue?.dayPrice, venue?.basePrice);
}

function getVenueHourlyPrice(venue) {
  return positiveAmount(venue?.hourlyPrice);
}

function getVenueDisplayPrice(venue) {
  const priceType = String(venue?.priceType || "")
    .trim()
    .toLowerCase();
  if (priceType === "hourly") {
    return {
      amount: positiveAmount(venue?.hourlyPrice, venue?.dayPrice, venue?.basePrice),
      unit: "hour",
      priceType: "hourly",
    };
  }
  if (priceType === "day") {
    return {
      amount: positiveAmount(venue?.dayPrice, venue?.basePrice),
      unit: "day",
      priceType: "day",
    };
  }
  if (priceType === "full") {
    return {
      amount: positiveAmount(venue?.basePrice, venue?.dayPrice, venue?.hourlyPrice),
      unit: "full",
      priceType: "full",
    };
  }
  const hourly = Number(venue?.hourlyPrice) || 0;
  const day = Number(venue?.dayPrice) || 0;
  const base = Number(venue?.basePrice) || 0;
  if (hourly > 0 && day <= 0 && base <= 0) {
    return { amount: hourly, unit: "hour", priceType: "hourly" };
  }
  if (day > 0) return { amount: day, unit: "day", priceType: "day" };
  return { amount: positiveAmount(base, day, hourly), unit: "full", priceType: "full" };
}

module.exports = {
  positiveAmount,
  getVenueDayPrice,
  getVenueHourlyPrice,
  getVenueDisplayPrice,
};

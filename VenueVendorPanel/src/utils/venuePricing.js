/** Prefer a positive amount; `0` must not block fallback (unlike `??`). */
export function positiveAmount(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Resolve the display price for a service/venue from priceType + stored fields.
 * Full booking stores amount in basePrice with dayPrice=0.
 */
export function resolveVenuePrice(venue) {
  const priceType = String(venue?.priceType || "")
    .trim()
    .toLowerCase();
  const hourly = Number(venue?.hourlyPrice) || 0;
  const day = Number(venue?.dayPrice) || 0;
  const base = Number(venue?.basePrice) || 0;

  if (priceType === "hourly") {
    return {
      amount: positiveAmount(hourly, day, base),
      unit: "hour",
      label: "Hourly price",
      priceType: "hourly",
    };
  }

  if (priceType === "day") {
    return {
      amount: positiveAmount(day, base),
      unit: "day",
      label: "Day price",
      priceType: "day",
    };
  }

  if (priceType === "full") {
    return {
      amount: positiveAmount(base, day, hourly),
      unit: "full",
      label: "Price",
      priceType: "full",
    };
  }

  if (hourly > 0 && day <= 0 && base <= 0) {
    return { amount: hourly, unit: "hour", label: "Hourly price", priceType: "hourly" };
  }
  if (day > 0) {
    return { amount: day, unit: "day", label: "Day price", priceType: "day" };
  }
  return {
    amount: positiveAmount(base, day, hourly),
    unit: "full",
    label: "Price",
    priceType: "full",
  };
}

export function formatVenuePrice(amount, unit = "day") {
  const formatted = `₹${Number(amount || 0).toLocaleString("en-IN")}`;
  if (unit === "hour") return `${formatted}/hr`;
  if (unit === "day") return `${formatted}/day`;
  return formatted;
}

export function formatVenueToken(venue) {
  const flat = Number(venue?.tokenAmount) || 0;
  if (flat > 0) return `₹${flat.toLocaleString("en-IN")}`;
  const pct = Number(venue?.tokenAmountPercentage) || 0;
  if (pct > 0) return `${pct}%`;
  return "—";
}

const VenueOrder = require("../models/other/venueOrder");
const AppError = require("./AppError");
const { parseDateOnly, formatDateOnly } = require("./dateOnly");

const MAX_BOOKING_DAYS = 60;
const BLOCKED_ORDER_STATUSES = ["cancelled", "refunded"];
const BOOKING_TYPES = new Set(["hourly", "full_day"]);

function startOfUtcDay(value) {
  const d = value instanceof Date ? value : parseDateOnly(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(value) {
  const d = value instanceof Date ? value : parseDateOnly(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function expandDateRange(startValue, endValue) {
  let cur = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (!cur || !end) throw new AppError("Invalid booking date range", 400);
  if (cur.getTime() > end.getTime()) {
    throw new AppError("bookingEndDate must be on or after bookingStartDate", 400);
  }

  const dates = [];
  while (cur.getTime() <= end.getTime()) {
    dates.push(formatDateOnly(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1, 12, 0, 0, 0));
  }
  if (dates.length > MAX_BOOKING_DAYS) {
    throw new AppError(`Cannot book more than ${MAX_BOOKING_DAYS} days at once`, 400);
  }
  return dates;
}

function normalizeBookingType(value) {
  const raw = String(value || "full_day")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "fullday" || raw === "full") return "full_day";
  if (raw === "hour" || raw === "hours") return "hourly";
  if (BOOKING_TYPES.has(raw)) return raw;
  throw new AppError("bookingType must be hourly or full_day", 400);
}

function parseTimeInput(value) {
  if (value === undefined || value === null || value === "") return null;

  // Accept "10:00AM" / "4:00PM" (no space) from mobile query strings
  const raw = String(value)
    .trim()
    .toUpperCase()
    .replace(/(AM|PM)$/i, " $1")
    .replace(/\s+/g, " ")
    .trim();
  const amPmMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)$/);
  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2] || 0);
    const meridiem = amPmMatch[4];
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      throw new AppError("Invalid time value", 400);
    }
    if (meridiem === "AM") {
      if (hours === 12) hours = 0;
    } else if (hours !== 12) {
      hours += 12;
    }
    return { hours, minutes };
  }

  const twentyFourMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFourMatch) {
    const hours = Number(twentyFourMatch[1]);
    const minutes = Number(twentyFourMatch[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new AppError("Invalid time value", 400);
    }
    return { hours, minutes };
  }

  throw new AppError("Invalid time value. Use formats like 10:00 AM or 16:00", 400);
}

function timeToMinutes({ hours, minutes }) {
  return hours * 60 + minutes;
}

function minutesToTime24(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatTime12(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function parseBookingDates(body) {
  if (Array.isArray(body?.bookingDates) && body.bookingDates.length > 0) {
    const dates = [...new Set(body.bookingDates.map((d) => formatDateOnly(parseDateOnly(d))))].filter(Boolean);
    dates.sort();
    if (dates.length === 0) throw new AppError("Invalid bookingDates", 400);
    if (dates.length > MAX_BOOKING_DAYS) {
      throw new AppError(`Cannot book more than ${MAX_BOOKING_DAYS} days at once`, 400);
    }
    return dates;
  }

  const start = body?.bookingStartDate ?? body?.bookingDate;
  const end = body?.bookingEndDate ?? start;
  if (start) {
    return expandDateRange(start, end);
  }

  throw new AppError(
    "bookingDate (or bookingStartDate) is required; use bookingEndDate for a date range",
    400
  );
}

function assertBookingDateNotPast(bookingDates) {
  const today = formatDateOnly(new Date());
  for (const dateStr of bookingDates) {
    if (dateStr < today) {
      throw new AppError("Cannot book a date in the past", 400);
    }
  }
}

function parseHourlySlot(body) {
  const startTimeRaw = body?.startTime;
  const endTimeRaw = body?.endTime;
  if (!startTimeRaw || !endTimeRaw) {
    throw new AppError("startTime and endTime are required for hourly booking", 400);
  }

  const startMinutes = timeToMinutes(parseTimeInput(startTimeRaw));
  const endMinutes = timeToMinutes(parseTimeInput(endTimeRaw));
  if (endMinutes <= startMinutes) {
    throw new AppError("endTime must be after startTime", 400);
  }

  const durationMinutes = endMinutes - startMinutes;
  if (durationMinutes % 60 !== 0) {
    throw new AppError("Hourly booking duration must be in whole hours", 400);
  }

  const durationHours = durationMinutes / 60;
  if (durationHours < 1) {
    throw new AppError("Minimum hourly booking duration is 1 hour", 400);
  }

  return {
    startTime: minutesToTime24(startMinutes),
    endTime: minutesToTime24(endMinutes),
    startMinutes,
    endMinutes,
    durationHours,
    slotLabel: `${formatTime12(startMinutes)} - ${formatTime12(endMinutes)}`,
    durationLabel: `${durationHours} hour${durationHours === 1 ? "" : "s"}`,
  };
}

function parseBookingRequest(body = {}) {
  const bookingType = normalizeBookingType(body.bookingType);
  const bookingDates = parseBookingDates(body);
  assertBookingDateNotPast(bookingDates);

  if (bookingType === "hourly") {
    if (bookingDates.length !== 1) {
      throw new AppError("Hourly booking supports one date at a time", 400);
    }
    const slot = parseHourlySlot(body);
    return {
      bookingType,
      bookingDates,
      ...slot,
    };
  }

  return {
    bookingType,
    bookingDates,
    startTime: "",
    endTime: "",
    startMinutes: null,
    endMinutes: null,
    durationHours: bookingDates.length * 24,
    slotLabel: "",
    durationLabel: bookingDates.length === 1 ? "Full day" : `${bookingDates.length} days`,
  };
}

/** Same as parseBookingRequest, but past dates stay in the list for calendar checks. */
function parseAvailabilityRequest(body = {}) {
  const bookingType = normalizeBookingType(body.bookingType);
  const bookingDates = parseBookingDates(body);

  if (bookingType === "hourly") {
    const slot = parseHourlySlot(body);
    return {
      bookingType,
      bookingDates,
      ...slot,
    };
  }

  return {
    bookingType,
    bookingDates,
    startTime: "",
    endTime: "",
    startMinutes: null,
    endMinutes: null,
    durationHours: bookingDates.length * 24,
    slotLabel: "",
    durationLabel: bookingDates.length === 1 ? "Full day" : `${bookingDates.length} days`,
  };
}

function generateVenueOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VO-${ts}-${rnd}`;
}

function getVenueDayPrice(venue) {
  return Number(venue.dayPrice ?? venue.basePrice) || 0;
}

function getVenueHourlyPrice(venue) {
  const hourly = Number(venue.hourlyPrice);
  if (hourly > 0) return hourly;
  return 0;
}

function assertHourlyBookingAllowed(venue) {
  const hourlyRate = getVenueHourlyPrice(venue);
  if (hourlyRate > 0) return hourlyRate;
  throw new AppError(
    "This venue has no hourly rate configured. Set hourlyPrice on the venue (admin or vendor panel), then try again.",
    400
  );
}

function assertFullDayBookingAllowed(venue) {
  const dayRate = getVenueDayPrice(venue);
  if (dayRate > 0) return dayRate;
  throw new AppError(
    "This venue has no day rate configured. Set dayPrice on the venue (admin or vendor panel), then try again.",
    400
  );
}

function normalizeTokenAmountPercentage(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function calculateTokenAmount(grandTotal, percentage) {
  const pct = normalizeTokenAmountPercentage(percentage);
  if (pct <= 0) return 0;
  const total = Number(grandTotal) || 0;
  if (total <= 0) return 0;
  return Math.min(total, Math.round((total * pct) / 100));
}

function attachTokenPaymentToPricing(pricing, venue) {
  const grandTotal = Number(pricing.grandTotal) || 0;
  const flatToken = Number(venue?.tokenAmount) || 0;
  let tokenAmountPercentage = normalizeTokenAmountPercentage(venue?.tokenAmountPercentage);
  let tokenAmount = 0;

  if (flatToken > 0) {
    tokenAmount = Math.min(grandTotal, Math.round(flatToken));
    if (grandTotal > 0) {
      tokenAmountPercentage = Math.min(100, Math.round((tokenAmount / grandTotal) * 100));
    }
  } else {
    tokenAmount = calculateTokenAmount(grandTotal, tokenAmountPercentage);
  }

  const usesToken = tokenAmount > 0;
  const remainingAmount = usesToken ? grandTotal - tokenAmount : grandTotal;
  const amountDueNow = usesToken ? tokenAmount : grandTotal;

  return {
    ...pricing,
    tokenAmountPercentage,
    tokenAmount,
    remainingAmount,
    amountDueNow,
    usesTokenPayment: usesToken,
  };
}

function calculateVenueBookingPricing(venue, bookingRequest) {
  const discountTotal = 0;
  const taxTotal = 0;

  if (bookingRequest.bookingType === "hourly") {
    const hourlyRate = assertHourlyBookingAllowed(venue);
    const venueFee = hourlyRate * bookingRequest.durationHours;
    const subTotal = venueFee;
    const grandTotal = subTotal + taxTotal - discountTotal;

    return {
      bookingType: "hourly",
      hourlyRate,
      dayRate: getVenueDayPrice(venue),
      durationHours: bookingRequest.durationHours,
      days: 0,
      unitPrice: hourlyRate,
      venueFee,
      discountTotal,
      taxTotal,
      subTotal,
      grandTotal,
      currency: "INR",
      symbol: "₹",
      rateLabel: `${bookingRequest.durationHours} hr × ₹${hourlyRate}`,
    };
  }

  const dayRate = assertFullDayBookingAllowed(venue);
  const days = bookingRequest.bookingDates.length;
  const venueFee = dayRate * days;
  const subTotal = venueFee;
  const grandTotal = subTotal + taxTotal - discountTotal;

  return {
    bookingType: "full_day",
    hourlyRate: getVenueHourlyPrice(venue),
    dayRate,
    durationHours: 0,
    days,
    unitPrice: dayRate,
    venueFee,
    discountTotal,
    taxTotal,
    subTotal,
    grandTotal,
    currency: "INR",
    symbol: "₹",
    rateLabel: days === 1 ? "1 day" : `${days} days`,
  };
}

function calculateVenueBookingPricingWithToken(venue, bookingRequest) {
  return attachTokenPaymentToPricing(calculateVenueBookingPricing(venue, bookingRequest), venue);
}

function buildOrderItems(venue, bookingRequest, pricing) {
  if (bookingRequest.bookingType === "hourly") {
    const dateStr = bookingRequest.bookingDates[0];
    return [
      {
        venue: venue._id,
        name: venue.name,
        quantity: bookingRequest.durationHours,
        unitPrice: pricing.unitPrice,
        discountValue: 0,
        taxValue: 0,
        totalPrice: pricing.venueFee,
        bookingDate: parseDateOnly(dateStr),
        bookingType: "hourly",
        startTime: bookingRequest.startTime,
        endTime: bookingRequest.endTime,
        durationHours: bookingRequest.durationHours,
        bookingSlot: `${bookingRequest.slotLabel} · ${bookingRequest.durationLabel}`,
      },
    ];
  }

  const unitPrice = pricing.unitPrice;
  return bookingRequest.bookingDates.map((dateStr) => ({
    venue: venue._id,
    name: venue.name,
    quantity: 1,
    unitPrice,
    discountValue: 0,
    taxValue: 0,
    totalPrice: unitPrice,
    bookingDate: parseDateOnly(dateStr),
    bookingType: "full_day",
    startTime: "",
    endTime: "",
    durationHours: 0,
    bookingSlot: "Full day",
  }));
}

function itemCoversFullDay(item) {
  return item.bookingType === "full_day" || (!item.bookingType && !item.startTime && !item.endTime);
}

function itemTimeRangeMinutes(item) {
  if (item.startTime && item.endTime) {
    const start = timeToMinutes(parseTimeInput(item.startTime));
    const end = timeToMinutes(parseTimeInput(item.endTime));
    return { start, end };
  }

  const slot = String(item.bookingSlot || "");
  const rangeMatch = slot.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (rangeMatch) {
    const start = timeToMinutes(parseTimeInput(rangeMatch[1]));
    const end = timeToMinutes(parseTimeInput(rangeMatch[2]));
    return { start, end };
  }

  return null;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

async function assertVenueAvailableForBooking(venueId, bookingRequest) {
  for (const dateStr of bookingRequest.bookingDates) {
    const dayStart = startOfUtcDay(dateStr);
    const dayEnd = endOfUtcDay(dateStr);

    const orders = await VenueOrder.find({
      orderStatus: { $nin: BLOCKED_ORDER_STATUSES },
      items: {
        $elemMatch: {
          venue: venueId,
          bookingDate: { $gte: dayStart, $lte: dayEnd },
        },
      },
    })
      .select("orderNumber items")
      .lean();

    for (const order of orders) {
      for (const item of order.items || []) {
        if (String(item.venue) !== String(venueId)) continue;

        const itemDate = formatDateOnly(item.bookingDate);
        if (itemDate !== dateStr) continue;

        if (bookingRequest.bookingType === "full_day" || itemCoversFullDay(item)) {
          throw new AppError(`Venue is not available on ${dateStr}`, 409);
        }

        const existingRange = itemTimeRangeMinutes(item);
        if (!existingRange) {
          throw new AppError(`Venue is not available on ${dateStr}`, 409);
        }

        if (
          rangesOverlap(
            bookingRequest.startMinutes,
            bookingRequest.endMinutes,
            existingRange.start,
            existingRange.end
          )
        ) {
          throw new AppError(`Selected time slot is not available on ${dateStr}`, 409);
        }
      }
    }
  }
}

function dateAvailabilityConflict(item, bookingRequest, dateStr) {
  if (bookingRequest.bookingType === "full_day" || itemCoversFullDay(item)) {
    return `Venue is not available on ${dateStr}`;
  }

  const existingRange = itemTimeRangeMinutes(item);
  if (!existingRange) {
    return `Venue is not available on ${dateStr}`;
  }

  if (
    rangesOverlap(
      bookingRequest.startMinutes,
      bookingRequest.endMinutes,
      existingRange.start,
      existingRange.end
    )
  ) {
    return `Selected time slot is not available on ${dateStr}`;
  }

  return null;
}

async function getVenueAvailabilityByDates(venueId, bookingRequest) {
  const bookingDates = bookingRequest.bookingDates || [];
  if (!bookingDates.length) {
    throw new AppError("bookingDate (or bookingStartDate / bookingEndDate) is required", 400);
  }

  const today = formatDateOnly(new Date());
  const rangeStart = startOfUtcDay(bookingDates[0]);
  const rangeEnd = endOfUtcDay(bookingDates[bookingDates.length - 1]);

  const orders = await VenueOrder.find({
    orderStatus: { $nin: BLOCKED_ORDER_STATUSES },
    items: {
      $elemMatch: {
        venue: venueId,
        bookingDate: { $gte: rangeStart, $lte: rangeEnd },
      },
    },
  })
    .select("items")
    .lean();

  const itemsByDate = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      if (String(item.venue) !== String(venueId)) continue;
      const itemDate = formatDateOnly(item.bookingDate);
      if (!itemDate) continue;
      if (!itemsByDate.has(itemDate)) itemsByDate.set(itemDate, []);
      itemsByDate.get(itemDate).push(item);
    }
  }

  const dates = bookingDates.map((dateStr) => {
    if (dateStr < today) {
      return {
        date: dateStr,
        available: false,
        message: "Cannot book a date in the past",
      };
    }

    const items = itemsByDate.get(dateStr) || [];
    for (const item of items) {
      const conflict = dateAvailabilityConflict(item, bookingRequest, dateStr);
      if (conflict) {
        return { date: dateStr, available: false, message: conflict };
      }
    }

    return {
      date: dateStr,
      available: true,
      message:
        bookingRequest.bookingType === "hourly"
          ? `Selected time slot is available on ${dateStr}`
          : `Venue is available on ${dateStr}`,
    };
  });

  const available = dates.every((row) => row.available);
  const firstUnavailable = dates.find((row) => !row.available);
  const startDate = bookingDates[0];
  const endDate = bookingDates[bookingDates.length - 1];
  const rangeLabel = startDate === endDate ? `on ${startDate}` : `from ${startDate} to ${endDate}`;

  return {
    available,
    dates,
    message: available
      ? bookingRequest.bookingType === "hourly"
        ? `Selected time slot is available ${rangeLabel}`
        : `Venue is available ${rangeLabel}`
      : firstUnavailable?.message || `Venue is not available ${rangeLabel}`,
  };
}

async function checkVenueAvailabilityForBooking(venueId, bookingRequest) {
  const result = await getVenueAvailabilityByDates(venueId, bookingRequest);
  return { available: result.available, message: result.message, dates: result.dates };
}

/** @deprecated use assertVenueAvailableForBooking */
async function assertVenueAvailableForDates(venueId, bookingDates) {
  await assertVenueAvailableForBooking(venueId, {
    bookingType: "full_day",
    bookingDates,
    startMinutes: null,
    endMinutes: null,
  });
}

function formatBookingDateLabel(bookingDates) {
  if (!bookingDates.length) return "";
  if (bookingDates.length === 1) return bookingDates[0];
  return `${bookingDates[0]} – ${bookingDates[bookingDates.length - 1]}`;
}

function formatBookingSummaryLabel(bookingRequest) {
  const dateLabel = formatBookingDateLabel(bookingRequest.bookingDates);
  if (bookingRequest.bookingType === "hourly") {
    return `${dateLabel} · ${bookingRequest.slotLabel} · ${bookingRequest.durationLabel}`;
  }
  return dateLabel;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseBookingCustomer(body = {}, user = {}) {
  const snapshot =
    body.addressSnapshot && typeof body.addressSnapshot === "object"
      ? body.addressSnapshot
      : null;
  const customer =
    body.customer && typeof body.customer === "object" ? body.customer : null;
  const source = snapshot ?? customer ?? body;

  const fullName = String(
    source.fullName ?? source.name ?? user.name ?? ""
  ).trim();
  const countryCode = String(source.countryCode ?? source.dialCode ?? "+91").trim() || "+91";
  const rawMobile = String(
    source.mobileNumber ?? source.mobile ?? source.phone ?? user.phone ?? ""
  ).trim();
  const address = String(source.address ?? source.fullAddress ?? "").trim();
  const email = String(source.email ?? user.email ?? "").trim();

  if (!fullName) throw new AppError("Customer full name is required", 400);
  if (!rawMobile) throw new AppError("Customer mobile number is required", 400);
  if (!address) throw new AppError("Customer address is required", 400);

  let phone = normalizePhoneDigits(rawMobile);
  const codeDigits = normalizePhoneDigits(countryCode);
  if (codeDigits && phone.startsWith(codeDigits)) {
    phone = phone.slice(codeDigits.length);
  }
  if (phone.length === 11 && phone.startsWith("0")) {
    phone = phone.slice(1);
  }
  if (phone.length < 10 || phone.length > 15) {
    throw new AppError("Invalid mobile number", 400);
  }

  return {
    name: fullName,
    phone,
    email,
    address,
    countryCode,
  };
}

function assertTotalAmount(clientAmount, expectedTotal) {
  if (clientAmount === undefined || clientAmount === null || clientAmount === "") {
    throw new AppError("totalAmount is required", 400);
  }
  const amount = Number(clientAmount);
  if (Number.isNaN(amount) || amount < 0) {
    throw new AppError("Invalid totalAmount", 400);
  }
  if (amount !== expectedTotal) {
    throw new AppError(
      `totalAmount does not match server calculation (expected ${expectedTotal}, got ${amount})`,
      400
    );
  }
}

/**
 * Amount the client is paying in this request.
 * totalAmount = full booking total; payableAmount = pay-now (token or full).
 * Server pricing always wins for order totals — client fields are not strictly validated.
 */
function resolvePaymentAmountFromBody(body = {}, pricing = {}) {
  const grandTotal = Number(pricing.grandTotal) || 0;
  const amountDueNow = Number(pricing.amountDueNow) || grandTotal;

  const payableRaw = body.payableAmount ?? body.paidAmount ?? body.amountPaid;
  if (payableRaw !== undefined && payableRaw !== null && payableRaw !== "") {
    const payable = Number(payableRaw);
    if (!Number.isNaN(payable) && payable >= 0) {
      return Math.min(payable, grandTotal || payable);
    }
  }

  const totalRaw = body.totalAmount;
  if (totalRaw !== undefined && totalRaw !== null && totalRaw !== "") {
    const total = Number(totalRaw);
    if (!Number.isNaN(total) && total >= 0) {
      if (total === grandTotal) return amountDueNow;
      if (total < grandTotal) return total;
      return amountDueNow;
    }
  }

  return amountDueNow;
}

function buildOrderPaymentSnapshot(pricing) {
  return {
    tokenAmountPercentage: pricing.tokenAmountPercentage ?? 0,
    tokenAmount: pricing.tokenAmount ?? 0,
    remainingAmount: pricing.remainingAmount ?? pricing.grandTotal ?? 0,
    amountPaid: 0,
  };
}

function resolvePayableAmountForOrder(order) {
  const grandTotal = Number(order.grandTotal) || 0;
  const amountPaid = Number(order.amountPaid) || 0;
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();

  if (paymentStatus === "paid") return 0;
  if (paymentStatus === "partially_paid") {
    return Math.max(0, grandTotal - amountPaid);
  }

  const tokenPct = Number(order.tokenAmountPercentage) || 0;
  const tokenAmount = Number(order.tokenAmount) || 0;
  if (tokenPct > 0 && tokenAmount > 0) return tokenAmount;
  return grandTotal;
}

function formatInrAmountLabel(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Normalize payment fields for API responses (supports legacy orders without token/amountPaid).
 */
function buildBookingPaymentSummary(order) {
  const grandTotal = Number(order?.grandTotal) || 0;
  const subTotal = Number(order?.subTotal) || grandTotal;
  const discountTotal = Number(order?.discountTotal) || 0;
  const taxTotal = Number(order?.taxTotal) || 0;
  const tokenAmountPercentage = normalizeTokenAmountPercentage(order?.tokenAmountPercentage);
  let tokenAmount = Number(order?.tokenAmount) || 0;
  let amountPaid = Number(order?.amountPaid);
  const paymentStatus = String(order?.paymentStatus || "pending").toLowerCase();
  const paymentMethod = String(order?.paymentMethod || "online").toLowerCase();

  if (tokenAmountPercentage > 0 && tokenAmount <= 0 && grandTotal > 0) {
    tokenAmount = calculateTokenAmount(grandTotal, tokenAmountPercentage);
  }

  if (Number.isNaN(amountPaid)) {
    if (paymentStatus === "paid") {
      amountPaid = grandTotal;
    } else if (paymentStatus === "partially_paid") {
      amountPaid = tokenAmount > 0 ? tokenAmount : 0;
    } else {
      amountPaid = 0;
    }
  }

  let remainingAmount = Number(order?.remainingAmount);
  if (Number.isNaN(remainingAmount)) {
    remainingAmount = Math.max(0, grandTotal - amountPaid);
  } else if (paymentStatus === "paid") {
    remainingAmount = 0;
  } else {
    remainingAmount = Math.max(0, Math.min(grandTotal, remainingAmount));
  }

  const normalizedOrder = {
    ...order,
    grandTotal,
    tokenAmountPercentage,
    tokenAmount,
    amountPaid,
    remainingAmount,
    paymentStatus,
  };

  const amountDueNow = resolvePayableAmountForOrder(normalizedOrder);
  const usesTokenPayment = tokenAmountPercentage > 0 && tokenAmount > 0 && tokenAmount < grandTotal;

  return {
    subTotal,
    discountTotal,
    taxTotal,
    grandTotal,
    totalAmount: grandTotal,
    tokenAmountPercentage,
    tokenAmount,
    amountPaid,
    remainingAmount,
    amountDueNow,
    usesTokenPayment,
    paymentStatus,
    paymentMethod,
    currency: "INR",
    symbol: "₹",
    subTotalLabel: formatInrAmountLabel(subTotal),
    grandTotalLabel: formatInrAmountLabel(grandTotal),
    totalAmountLabel: formatInrAmountLabel(grandTotal),
    tokenAmountLabel: formatInrAmountLabel(tokenAmount),
    amountPaidLabel: formatInrAmountLabel(amountPaid),
    remainingAmountLabel: formatInrAmountLabel(remainingAmount),
    amountDueNowLabel: formatInrAmountLabel(amountDueNow),
  };
}

module.exports = {
  parseBookingDates,
  parseBookingRequest,
  parseAvailabilityRequest,
  parseTimeInput,
  generateVenueOrderNumber,
  calculateVenueBookingPricing,
  calculateVenueBookingPricingWithToken,
  attachTokenPaymentToPricing,
  normalizeTokenAmountPercentage,
  calculateTokenAmount,
  buildOrderItems,
  buildOrderPaymentSnapshot,
  resolvePayableAmountForOrder,
  resolvePaymentAmountFromBody,
  buildBookingPaymentSummary,
  formatInrAmountLabel,
  assertVenueAvailableForBooking,
  getVenueAvailabilityByDates,
  checkVenueAvailabilityForBooking,
  assertVenueAvailableForDates,
  formatBookingDateLabel,
  formatBookingSummaryLabel,
  formatDateOnly,
  getVenueDayPrice,
  getVenueHourlyPrice,
  assertHourlyBookingAllowed,
  assertFullDayBookingAllowed,
  parseBookingCustomer,
  assertTotalAmount,
};

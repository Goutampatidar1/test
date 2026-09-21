const AppError = require("./AppError");

/**
 * Parse YYYY-MM-DD (or ISO string) as a calendar date without timezone day shift.
 * Stored as UTC noon on that calendar day.
 */
function parseDateOnly(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
      throw new AppError("Invalid date of birth", 400);
    }
    return date;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Invalid date of birth", 400);
  }

  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12, 0, 0, 0)
  );
}

/** Format stored date as YYYY-MM-DD for mobile clients. */
function formatDateOnly(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfUtcDay(value) {
  const d = value instanceof Date ? value : parseDateOnly(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(value) {
  const d = value instanceof Date ? value : parseDateOnly(value);
  if (!d) return null;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
  );
}

/** Default IST (+5:30) — matches admin date pickers / toLocaleDateString in India. */
function getListDateOffsetMinutes() {
  const raw = process.env.LIST_DATE_OFFSET_MINUTES ?? process.env.ADMIN_DATE_OFFSET_MINUTES;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 330;
}

/** ISO-8601 in IST so clients that print the clock time (and ignore Z) show India time. */
function toIstIsoString(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}.${pad(ist.getUTCMilliseconds(), 3)}+05:30`;
}

/**
 * Format an instant for API display in app timezone (default IST / Asia-Kolkata).
 * Example: Jul 1, 2026, 3:48 PM
 */
function formatDateTimeLabel(value, timeZone = "Asia/Kolkata") {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const month = get("month");
  const day = String(Number(get("day")) || get("day"));
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod").toUpperCase();

  return `${month} ${day}, ${year}, ${hour}:${minute} ${dayPeriod}`;
}

function startOfOffsetDay(value, offsetMinutes = getListDateOffsetMinutes()) {
  const d = value instanceof Date ? value : parseDateOnly(value);
  if (!d) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMinutes * 60 * 1000);
}

function endOfOffsetDay(value, offsetMinutes = getListDateOffsetMinutes()) {
  const start = startOfOffsetDay(value, offsetMinutes);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** List filters — calendar dates interpreted in app timezone (default IST). */
function parseListDateRangeFromQuery(query = {}, offsetMinutes = getListDateOffsetMinutes()) {
  const singleDate = query.date ?? query.filterDate ?? query.groupDate;
  const startRaw =
    query.startDate ??
    query.start_date ??
    query.dateFrom ??
    query.fromDate ??
    query.from ??
    singleDate;
  const endRaw =
    query.endDate ??
    query.end_date ??
    query.dateTo ??
    query.toDate ??
    query.to ??
    singleDate;

  if (!startRaw && !endRaw) return null;

  const start = startRaw ? startOfOffsetDay(startRaw, offsetMinutes) : null;
  const end = endRaw ? endOfOffsetDay(endRaw, offsetMinutes) : null;

  if (startRaw && !start) throw new AppError("Invalid startDate", 400);
  if (endRaw && !end) throw new AppError("Invalid endDate", 400);
  if (start && end && start.getTime() > end.getTime()) {
    throw new AppError("startDate must be on or before endDate", 400);
  }

  const range = {};
  if (start) range.$gte = start;
  if (end) range.$lte = end;

  return {
    mongoRange: Object.keys(range).length ? range : null,
    startDate: startRaw ? formatDateOnly(start ?? startRaw) : null,
    endDate: endRaw ? formatDateOnly(end ?? endRaw) : null,
  };
}

/** Parse startDate/endDate (and common aliases) from query for list filters. */
function parseDateRangeFromQuery(query = {}) {
  const singleDate = query.date ?? query.filterDate ?? query.groupDate;
  const startRaw =
    query.startDate ??
    query.start_date ??
    query.dateFrom ??
    query.fromDate ??
    query.from ??
    singleDate;
  const endRaw =
    query.endDate ??
    query.end_date ??
    query.dateTo ??
    query.toDate ??
    query.to ??
    singleDate;

  if (!startRaw && !endRaw) return null;

  const start = startRaw ? startOfUtcDay(startRaw) : null;
  const end = endRaw ? endOfUtcDay(endRaw) : null;

  if (startRaw && !start) throw new AppError("Invalid startDate", 400);
  if (endRaw && !end) throw new AppError("Invalid endDate", 400);
  if (start && end && start.getTime() > end.getTime()) {
    throw new AppError("startDate must be on or before endDate", 400);
  }

  const range = {};
  if (start) range.$gte = start;
  if (end) range.$lte = end;

  return {
    mongoRange: Object.keys(range).length ? range : null,
    startDate: startRaw ? formatDateOnly(start ?? startRaw) : null,
    endDate: endRaw ? formatDateOnly(end ?? endRaw) : null,
  };
}

module.exports = {
  parseDateOnly,
  formatDateOnly,
  startOfUtcDay,
  endOfUtcDay,
  getListDateOffsetMinutes,
  formatDateTimeLabel,
  toIstIsoString,
  startOfOffsetDay,
  endOfOffsetDay,
  parseDateRangeFromQuery,
  parseListDateRangeFromQuery,
};

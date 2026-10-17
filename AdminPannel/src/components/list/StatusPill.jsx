const TONES = {
  green: ["approved", "active", "delivered", "accepted", "converted", "live", "success", "paid", "completed", "settled", "open"],
  amber: ["pending", "pending_review", "processing", "scheduled", "partial", "outside_hours", "initiated", "requested"],
  blue: ["confirmed", "shipped", "out_for_delivery", "ecom", "user"],
  purple: ["venue", "service"],
  red: ["rejected", "blocked", "cancelled", "canceled", "failed", "suspended", "closed"],
  grey: ["inactive", "expired", "refunded", "unpaid", "draft", "hidden"],
};

const TONE_BY_STATUS = Object.fromEntries(
  Object.entries(TONES).flatMap(([tone, statuses]) => statuses.map((s) => [s, tone]))
);

const LABELS = {
  converted: "Booked",
  venue: "Service",
  ecom: "E-commerce",
  pending_review: "Pending review",
  outside_hours: "Outside hours",
  out_for_delivery: "Out for delivery",
};

export function statusLabel(status) {
  const key = String(status || "").toLowerCase();
  return LABELS[key] || key.replace(/_/g, " ");
}

/** One status pill for every list; `tone` / `label` override the built-in mapping. */
export function StatusPill({ status, label, tone }) {
  const key = String(status || "").toLowerCase();
  if (!key && !label) return <span className="data-table__muted">—</span>;
  const resolvedTone = tone || TONE_BY_STATUS[key] || "grey";
  return <span className={`pill list-pill list-pill--${resolvedTone}`}>{label || statusLabel(key)}</span>;
}

const LABELS = {
  new: "New",
  accepted: "Accepted",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Pending",
  processing: "Processing",
};

const TONE_MAP = {
  new: "pending",
  pending: "pending",
  accepted: "confirmed",
  processing: "confirmed",
  out_for_delivery: "confirmed",
  completed: "confirmed",
  cancelled: "cancelled",
};

export function OrderStatusBadge({ status, label }) {
  const key = String(status ?? "").toLowerCase();
  const tone = TONE_MAP[key] || "pending";
  const text = label || LABELS[key] || status || "—";
  return <span className={`vendor-dash-badge vendor-dash-badge--${tone}`}>{text}</span>;
}

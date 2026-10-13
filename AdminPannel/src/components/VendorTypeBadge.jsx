const VENDOR_TYPE_LABELS = {
  ecom: "E-commerce",
  service: "Service",
  both: "Both",
};

const VENDOR_TYPE_TITLES = {
  ecom: "E-commerce vendor",
  service: "Service vendor",
  both: "E-commerce + Service",
};

/** `fallback` covers older records saved before vendorPanelType existed. */
export function VendorTypeBadge({ type, fallback }) {
  const key = String(type || fallback || "").toLowerCase();
  if (!VENDOR_TYPE_LABELS[key]) return <span className="user-cell__muted">—</span>;
  return (
    <span className={`pill pill--type-${key}`} title={VENDOR_TYPE_TITLES[key]}>
      {VENDOR_TYPE_LABELS[key]}
    </span>
  );
}

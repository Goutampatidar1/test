export function DashboardSegmentToggle({
  value = "service",
  onChange,
  compact = true,
  ariaLabel = "Switch between service and shop",
}) {
  return (
    <div
      className={`vendor-mode-toggle vendor-mode-toggle--dual${compact ? " vendor-mode-toggle--compact" : ""}`}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`vendor-mode-toggle__btn${value === "service" ? " is-active" : ""}`}
        onClick={() => onChange?.("service")}
      >
        Service
      </button>
      <button
        type="button"
        className={`vendor-mode-toggle__btn${value === "shop" ? " is-active" : ""}`}
        onClick={() => onChange?.("shop")}
      >
        Shop
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const COPY = {
  service: {
    title: "Profile completion",
    complete: "Your profile is complete. Customers can review your details with confidence.",
    incomplete: (done, total) =>
      `${done} of ${total} details are filled. Finish the remaining modules to improve bookings.`,
  },
  ecom: {
    title: "Shop profile completion",
    complete: "Your shop profile is complete. Customers can trust and discover your store.",
    incomplete: (done, total) =>
      `${done} of ${total} details are filled. Finish the remaining modules to improve shop visibility.`,
  },
  both: {
    title: "Profile completion",
    complete: "Your service and shop profiles are complete. Customers can book services and shop with confidence.",
    incomplete: (done, total) =>
      `${done} of ${total} details are filled. Complete shared profile details plus services, shop images, and products.`,
  },
};

export function ProfileCompletionCard({ completion, variant = "service", embedded = false, combined = false }) {
  const { percent, doneCount, total, complete, modules } = completion ?? {};
  const [expanded, setExpanded] = useState(() => !complete);

  useEffect(() => {
    if (complete) setExpanded(false);
  }, [complete]);

  if (!completion) return null;

  const copy = COPY[variant] ?? COPY.service;
  const title = embedded ? (variant === "ecom" ? "Shop profile" : "Service profile") : copy.title;
  const minimized = complete && !expanded;

  return (
    <section
      className={`vendor-profile-complete${embedded ? " vendor-profile-complete--embedded" : ""}${
        combined ? " vendor-profile-complete--combined" : ""
      }${minimized ? " is-minimized" : ""}${complete ? " is-complete" : ""}`}
      aria-label={title}
    >
      <div className="vendor-profile-complete__overview">
        <div
          className={`vendor-profile-complete__ring${complete ? " is-complete" : ""}`}
          style={{ "--pct": percent }}
          role="img"
          aria-label={`${percent} percent complete`}
        >
          <span className="vendor-profile-complete__ring-inner">
            {minimized ? (
              <span className="vendor-profile-complete__check" aria-hidden="true">
                ✓
              </span>
            ) : (
              <>
                <strong>{percent}%</strong>
                <small>Complete</small>
              </>
            )}
          </span>
        </div>
        <div className="vendor-profile-complete__copy">
          {!embedded && !minimized ? <h2 className="vendor-dash-panel__title">{copy.title}</h2> : null}
          {minimized ? (
            <>
              <p className="vendor-profile-complete__minimized-title">
                {embedded ? title : copy.title}
                <span className="vendor-profile-complete__badge">Complete</span>
              </p>
              <p className="vendor-profile-complete__minimized-text">All profile details are filled.</p>
            </>
          ) : (
            <p>
              {embedded ? (
                <>
                  <strong className="vendor-profile-complete__embedded-label">{title}</strong>
                  <br />
                </>
              ) : null}
              {complete ? copy.complete : copy.incomplete(doneCount, total)}
            </p>
          )}
          <div className="vendor-profile-complete__actions">
            {complete ? (
              <Link to="/vendor/profile" className="vendor-profile-complete__cta">
                View profile
              </Link>
            ) : (
              <Link
                to={completion.remainingModules[0]?.href || "/vendor/profile"}
                className="vendor-profile-complete__cta"
              >
                Complete remaining
              </Link>
            )}
            {complete ? (
              <button
                type="button"
                className="vendor-profile-complete__toggle"
                aria-expanded={expanded}
                onClick={() => setExpanded((open) => !open)}
              >
                {expanded ? "Minimize" : "Show details"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!minimized ? (
        <ul className="vendor-profile-complete__modules">
          {modules.map((mod) => (
            <li key={mod.id} className={`vendor-profile-complete__module${mod.complete ? " is-done" : ""}`}>
              <div className="vendor-profile-complete__module-head">
                <span>{mod.label}</span>
                <strong>
                  {mod.doneCount}/{mod.total}
                </strong>
              </div>
              <div className="vendor-profile-complete__bar" aria-hidden>
                <span style={{ width: `${mod.percent}%` }} />
              </div>
              {mod.complete ? (
                <p className="vendor-profile-complete__remaining is-done">
                  {mod.optionalRemaining?.length
                    ? `Required done · Optional: ${mod.optionalRemaining.map((field) => field.label).join(", ")}`
                    : "All set"}
                </p>
              ) : (
                <p className="vendor-profile-complete__remaining">
                  Remaining: {mod.remaining.map((field) => field.label).join(", ")}
                </p>
              )}
              <Link to={mod.href} className="vendor-profile-complete__module-link">
                {mod.complete ? "Review" : "Fill now"}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

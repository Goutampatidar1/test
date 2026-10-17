import { ProfileImagePlaceholder } from "../ProfileImagePlaceholder.jsx";
import { mediaUrl } from "../../media.js";
import { imageOrDefault } from "../../utils/imageFallback.js";

/** Two-line cell: bold primary text with a muted, truncated second line. */
export function TextCell({ primary, sub, mono = false }) {
  return (
    <div className="list-cell__text">
      <div className={`list-cell__primary${mono ? " list-cell__primary--mono" : ""}`} title={typeof primary === "string" ? primary : undefined}>
        {primary || "—"}
      </div>
      {sub !== undefined ? (
        <div className="list-cell__sub" title={typeof sub === "string" ? sub : undefined}>
          {sub || "—"}
        </div>
      ) : null}
    </div>
  );
}

/** Avatar (person placeholder) or `square` thumbnail (default image) with a two-line label. */
export function MediaCell({ image, primary, sub, square = false }) {
  const src = square ? imageOrDefault(image) : mediaUrl(image);
  return (
    <div className="list-cell">
      <span className={`list-cell__media${square ? " list-cell__media--square" : ""}`} aria-hidden="true">
        {src ? <img src={src} alt="" /> : <ProfileImagePlaceholder size={20} />}
      </span>
      {primary !== undefined ? <TextCell primary={primary} sub={sub} /> : null}
    </div>
  );
}

export function StatusSwitch({ active, onToggle, disabled = false, label }) {
  return (
    <button
      type="button"
      className={`settings-switch${active ? " settings-switch--on" : ""}`}
      role="switch"
      aria-checked={active}
      aria-label={label}
      title={active ? "Deactivate" : "Activate"}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="settings-switch__knob" aria-hidden />
    </button>
  );
}

import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { selectCapabilities, selectHasBothCapabilities, selectPanelMode, setPanelMode } from "../store/authSlice.js";

export function PanelModeToggle({ compact = false }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const panelMode = useSelector(selectPanelMode);
  const capabilities = useSelector(selectCapabilities);
  const hasBoth = useSelector(selectHasBothCapabilities);

  if (!hasBoth) return null;

  const switchMode = (nextMode) => {
    if (nextMode === panelMode) return;
    if (nextMode === "both") {
      if (!hasBoth) return;
      dispatch(setPanelMode("both"));
      navigate("/vendor/dashboard", { replace: true });
      return;
    }
    if (!capabilities.includes(nextMode)) return;
    dispatch(setPanelMode(nextMode));
    navigate("/vendor/dashboard", { replace: true });
  };

  return (
    <div
      className={`vendor-mode-toggle vendor-mode-toggle--triple${compact ? " vendor-mode-toggle--compact" : ""}`}
      role="group"
      aria-label="Switch vendor mode"
    >
      <button
        type="button"
        className={`vendor-mode-toggle__btn${panelMode === "service" ? " is-active" : ""}`}
        onClick={() => switchMode("service")}
      >
        Service
      </button>
      <button
        type="button"
        className={`vendor-mode-toggle__btn${panelMode === "both" ? " is-active" : ""}`}
        onClick={() => switchMode("both")}
      >
        Both
      </button>
      <button
        type="button"
        className={`vendor-mode-toggle__btn${panelMode === "ecom" ? " is-active" : ""}`}
        onClick={() => switchMode("ecom")}
      >
        Shop
      </button>
    </div>
  );
}

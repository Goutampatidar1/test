import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { vendorEcomUpdatePhoneVisibility } from "../api/vendorEcom.js";
import {
  venueVendorGetPhoneVisibility,
  venueVendorUpdatePhoneVisibility,
} from "../api/venueVendorAuth.js";
import { selectHasBothCapabilities, selectPanelMode, setAccountUser, setUser } from "../store/authSlice.js";

export function PhoneVisibilityToggle() {
  const dispatch = useDispatch();
  const panelMode = useSelector(selectPanelMode);
  const hasBoth = useSelector(selectHasBothCapabilities);
  const serviceToken = useSelector((s) => s.auth.accounts?.service?.token || s.auth.token);
  const ecomToken = useSelector((s) => s.auth.accounts?.ecom?.token);
  const serviceUser = useSelector((s) => s.auth.accounts?.service?.user || s.auth.user);
  const ecomUser = useSelector((s) => s.auth.accounts?.ecom?.user);

  const derivedVisible =
    panelMode === "ecom"
      ? ecomUser?.showPhoneOnApp ?? serviceUser?.showPhoneOnApp
      : serviceUser?.showPhoneOnApp ?? ecomUser?.showPhoneOnApp;

  const [visible, setVisible] = useState(derivedVisible !== false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setVisible(derivedVisible !== false);
  }, [derivedVisible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (panelMode !== "ecom" && serviceToken) {
          const data = await venueVendorGetPhoneVisibility(serviceToken);
          if (!cancelled && typeof data?.showPhoneOnApp === "boolean") {
            setVisible(data.showPhoneOnApp);
          }
        }
      } catch {
        /* keep derived state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panelMode, serviceToken]);

  const onToggle = async () => {
    if (toggling || loading) return;
    const next = !visible;
    setToggling(true);
    setMessage("");
    try {
      const tasks = [];
      const modes = [];

      if ((panelMode === "ecom" || panelMode === "both") && ecomToken) {
        tasks.push(vendorEcomUpdatePhoneVisibility(next));
        modes.push("ecom");
      }
      if ((panelMode === "service" || panelMode === "both") && serviceToken) {
        tasks.push(venueVendorUpdatePhoneVisibility(serviceToken, next));
        modes.push("service");
      }

      if (!tasks.length) {
        throw new Error("No vendor account is available to update.");
      }

      const results = await Promise.all(tasks);
      setVisible(next);

      results.forEach((result, index) => {
        const mode = modes[index];
        const user = result?.user;
        if (!user) return;
        dispatch(setAccountUser({ mode, user }));
        if (panelMode === mode || (panelMode === "both" && mode === "service")) {
          dispatch(setUser(user));
        }
      });

      setMessage(
        next
          ? "Your mobile number is visible to customers on the user app."
          : "Your mobile number is hidden from customers on the user app.",
      );
    } catch (err) {
      setMessage(err?.message || "Could not update phone visibility.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="vendor-phone-visibility">
      <div className={`vendor-shop-toggle vendor-phone-toggle${visible ? " is-visible" : " is-hidden"}`}>
        <div className="vendor-shop-toggle__copy">
          <strong>{visible ? "Mobile visible on app" : "Mobile hidden on app"}</strong>
          <span>
            {visible
              ? "Customers can see your business mobile on the user app."
              : "Your business mobile stays private on the user app."}
          </span>
        </div>
        <button
          type="button"
          className={`vendor-shop-switch${visible ? " is-on" : ""}`}
          role="switch"
          aria-checked={visible}
          aria-label={visible ? "Hide mobile on user app" : "Show mobile on user app"}
          disabled={toggling || loading || (!serviceToken && !ecomToken)}
          onClick={onToggle}
        >
          <span className="vendor-shop-switch__knob" aria-hidden />
        </button>
      </div>
      {message ? <p className="vendor-phone-toggle__msg">{message}</p> : null}
      {hasBoth && panelMode === "both" ? (
        <p className="vendor-phone-toggle__hint">Applies to both your service and shop profiles.</p>
      ) : null}
    </div>
  );
}

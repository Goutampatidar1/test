import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  venueVendorClearPlanBanner,
  venueVendorConfirmPlanPayment,
  venueVendorGetBannerSubscription,
  venueVendorListPlans,
  venueVendorSubscribePlan,
  venueVendorUploadPlanBanner,
} from "../api/vendorPlans.js";
import { mediaUrl } from "../media.js";
import { selectAppDisplayName } from "../store/appConfigSelectors.js";
import { openRazorpayCheckout } from "../utils/razorpayCheckout.js";

function formatInr(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function PlanRow({ plan, active, busy, onSubscribe }) {
  return (
    <li className="vendor-plans__item">
      <div className="vendor-plans__item-copy">
        <strong>{plan.name}</strong>
        <span>
          {plan.planTypeLabel || plan.planType} · {formatInr(plan.price)} · {formatDate(plan.startDate)} –{" "}
          {formatDate(plan.endDate)}
          {Number(plan.price) > 0 ? " · Pay via Razorpay" : " · Free"}
        </span>
      </div>
      {active ? (
        <span className="vendor-dash-badge vendor-dash-badge--confirmed">Active</span>
      ) : (
        <button
          type="button"
          className="vendor-btn vendor-btn--primary"
          disabled={busy}
          onClick={() => onSubscribe(plan._id)}
        >
          {busy
            ? Number(plan.price) > 0
              ? "Opening payment…"
              : "Subscribing…"
            : Number(plan.price) > 0
              ? "Pay & subscribe"
              : "Subscribe"}
        </button>
      )}
    </li>
  );
}

export function PlansPage() {
  const user = useSelector((s) => s.auth.user);
  const appName = useSelector(selectAppDisplayName) || "OHO E-Bazar";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [activePlanTypes, setActivePlanTypes] = useState(() => new Set());
  const [subscribingId, setSubscribingId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerFile, setBannerFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [planList, sub] = await Promise.all([
        venueVendorListPlans(),
        venueVendorGetBannerSubscription(),
      ]);
      setPlans(Array.isArray(planList) ? planList : []);
      setSubscription(sub || null);
      setBannerTitle(sub?.bannerTitle || "");
      const types = new Set();
      if (sub?.status === "active" && sub?.planType) types.add(sub.planType);
      setActivePlanTypes(types);
    } catch (err) {
      setError(err?.message || "Failed to load plans");
      setPlans([]);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!bannerFile) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(bannerFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile]);

  const bannerPlans = plans.filter((p) => p.planType === "banner");
  const otherPlans = plans.filter((p) => p.planType !== "banner");
  const hasBannerSub = Boolean(subscription?.canUploadBanner || subscription?.status === "active");

  const onSubscribe = async (planId) => {
    if (!planId || subscribingId) return;
    setSubscribingId(String(planId));
    setMessage("");
    setError("");
    try {
      const checkout = await venueVendorSubscribePlan(planId);

      if (!checkout?.requiresPayment) {
        const sub = checkout?.subscription || checkout || null;
        if (sub?.planType === "banner") setSubscription(sub);
        if (sub?.planType) {
          setActivePlanTypes((prev) => new Set([...prev, sub.planType]));
        }
        setMessage("Plan activated successfully.");
        return;
      }

      const payment = await openRazorpayCheckout({
        keyId: checkout.keyId,
        orderId: checkout.orderId,
        amountPaise: checkout.amountPaise,
        currency: checkout.currency || "INR",
        name: appName,
        description: checkout.description || `Plan: ${checkout.planName || ""}`,
        prefill: {
          name: user?.name || user?.businessName || "",
          email: user?.email || user?.businessEmail || "",
          contact: user?.phone || user?.businessPhone || "",
        },
      });

      const sub = await venueVendorConfirmPlanPayment({
        subscriptionId: checkout.subscriptionId,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,
      });

      if (sub?.planType === "banner") setSubscription(sub);
      if (sub?.planType) {
        setActivePlanTypes((prev) => new Set([...prev, sub.planType]));
      }
      setMessage("Payment successful. Plan activated.");
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("cancelled")) {
        setError("Payment cancelled. Subscribe again when you are ready.");
      } else {
        setError(err?.message || "Subscribe / payment failed");
      }
    } finally {
      setSubscribingId("");
    }
  };

  const onUpload = async (event) => {
    event.preventDefault();
    if (!bannerFile || uploading) return;
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const sub = await venueVendorUploadPlanBanner({
        file: bannerFile,
        title: bannerTitle,
      });
      setSubscription(sub || null);
      setBannerFile(null);
      setMessage("Banner saved. Only one banner is allowed — uploading again replaces it.");
    } catch (err) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onClear = async () => {
    if (uploading) return;
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const sub = await venueVendorClearPlanBanner();
      setSubscription(sub || null);
      setBannerFile(null);
      setMessage("Banner image removed. Your plan stays active.");
    } catch (err) {
      setError(err?.message || "Could not remove banner");
    } finally {
      setUploading(false);
    }
  };

  const currentPreview = previewUrl || (subscription?.bannerImage ? mediaUrl(subscription.bannerImage) : "");

  return (
    <div className="vendor-dashboard vendor-plans">
      <header className="vendor-dashboard__head">
        <div>
          <h1 className="vendor-dashboard__title">Plans</h1>
          <p className="vendor-dashboard__subtitle">
            Pay with Razorpay to activate a Banner plan, then upload one promotional banner.
          </p>
        </div>
      </header>

      {error ? (
        <p className="vendor-plans__alert vendor-plans__alert--error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="vendor-plans__alert vendor-plans__alert--ok" role="status">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="vendor-dashboard__subtitle">Loading plans…</p>
      ) : (
        <>
          <section className="vendor-dash-panel vendor-plans__panel">
            <h2 className="vendor-dash-panel__title">Banner plans</h2>
            {bannerPlans.length === 0 ? (
              <p className="vendor-dashboard__subtitle">No Banner plans are available right now.</p>
            ) : (
              <ul className="vendor-plans__list">
                {bannerPlans.map((plan) => (
                  <PlanRow
                    key={plan._id}
                    plan={plan}
                    active={activePlanTypes.has("banner") || hasBannerSub}
                    busy={subscribingId === String(plan._id)}
                    onSubscribe={onSubscribe}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="vendor-dash-panel vendor-plans__panel">
            <h2 className="vendor-dash-panel__title">Your banner (1 only)</h2>
            {!hasBannerSub ? (
              <p className="vendor-dashboard__subtitle">
                Complete Razorpay payment for a Banner plan above to unlock a single banner upload.
              </p>
            ) : (
              <form className="vendor-plans__upload" onSubmit={onUpload}>
                <p className="vendor-dashboard__subtitle">
                  Plan: <strong>{subscription.planName || "Banner"}</strong> · valid until{" "}
                  {formatDate(subscription.endDate)}. Re-upload replaces the existing image.
                </p>
                {currentPreview ? (
                  <div className="vendor-plans__preview">
                    <img src={currentPreview} alt={subscription.bannerTitle || "Banner preview"} />
                  </div>
                ) : null}
                <label className="vendor-plans__label">
                  Title (optional)
                  <input
                    type="text"
                    value={bannerTitle}
                    maxLength={120}
                    onChange={(e) => setBannerTitle(e.target.value)}
                    placeholder="Promo title"
                  />
                </label>
                <label className="vendor-plans__label">
                  Banner image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                  />
                </label>
                <p className="vendor-plans__hint">Recommended about 1200×400px (3:1).</p>
                <div className="vendor-plans__actions">
                  <button
                    type="submit"
                    className="vendor-btn vendor-btn--primary"
                    disabled={!bannerFile || uploading}
                  >
                    {uploading ? "Saving…" : subscription?.hasBanner ? "Replace banner" : "Upload banner"}
                  </button>
                  {subscription?.hasBanner ? (
                    <button
                      type="button"
                      className="vendor-btn"
                      disabled={uploading}
                      onClick={onClear}
                    >
                      Remove image
                    </button>
                  ) : null}
                </div>
              </form>
            )}
          </section>

          {otherPlans.length > 0 ? (
            <section className="vendor-dash-panel vendor-plans__panel">
              <h2 className="vendor-dash-panel__title">Other plans</h2>
              <ul className="vendor-plans__list">
                {otherPlans.map((plan) => (
                  <PlanRow
                    key={plan._id}
                    plan={plan}
                    active={activePlanTypes.has(plan.planType)}
                    busy={subscribingId === String(plan._id)}
                    onSubscribe={onSubscribe}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { publicListCities, publicListSubDistricts } from "../api/publicLocations.js";
import { vendorEcomListProducts } from "../api/vendorEcom.js";
import {
  vendorEcomConfirmPromotionPayment,
  vendorEcomListMyPromotions,
  vendorEcomListPromotionPlans,
  vendorEcomSubscribePromotion,
} from "../api/vendorEcomPromotions.js";
import { vendorListVenues } from "../api/vendorVenues.js";
import {
  venueVendorConfirmPromotionPayment,
  venueVendorListMyPromotions,
  venueVendorListPromotionPlans,
  venueVendorSubscribePromotion,
} from "../api/venueVendorPromotions.js";
import { AppImage } from "../components/AppImage.jsx";
import { selectAppDisplayName } from "../store/appConfigSelectors.js";
import { selectPanelMode } from "../store/authSlice.js";
import { openRazorpayCheckout } from "../utils/razorpayCheckout.js";

function formatInr(amount) {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function PromotionPlansPanel({ forcedMode = null, embedded = false }) {
  const user = useSelector((s) => s.auth.user);
  const panelModeFromStore = useSelector(selectPanelMode);
  const panelMode = forcedMode || panelModeFromStore;
  const isEcom = panelMode === "ecom";
  const appName = useSelector(selectAppDisplayName) || "OHO E-Bazar";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [plans, setPlans] = useState([]);
  const [myPromos, setMyPromos] = useState([]);
  const [cities, setCities] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [targets, setTargets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [form, setForm] = useState({
    planId: "",
    durationType: "",
    startDate: todayInputValue(),
    cityId: "",
    subDistrictId: "",
    targetId: "",
    bannerFile: null,
  });

  const selectedPlan = useMemo(
    () => plans.find((p) => String(p._id) === String(form.planId)) || null,
    [plans, form.planId],
  );

  const selectedPlanType = selectedPlan?.planType || null;
  const isBannerPlan = !isEcom || selectedPlanType === "banner";
  const isProductPresencePlan = selectedPlanType === "product_presence_first";
  const isGetVerifiedPlan = selectedPlanType === "get_verified";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const planListPromise = isEcom
        ? vendorEcomListPromotionPlans()
        : venueVendorListPromotionPlans();
      const promoListPromise = isEcom ? vendorEcomListMyPromotions() : venueVendorListMyPromotions();
      const targetPromise = isEcom
        ? vendorEcomListProducts({ limit: 100 }).then((result) => result?.items ?? [])
        : vendorListVenues({ limit: 100, status: "active" }).then((result) => result?.venues ?? []);

      const [planList, promoList, cityList, targetList] = await Promise.all([
        planListPromise,
        promoListPromise,
        publicListCities({ limit: 500 }),
        targetPromise,
      ]);

      setPlans(Array.isArray(planList) ? planList : []);
      setMyPromos(Array.isArray(promoList) ? promoList : []);
      setCities(Array.isArray(cityList) ? cityList : []);
      setTargets(Array.isArray(targetList) ? targetList : []);
    } catch (err) {
      setError(err?.message || "Failed to load promotion plans");
    } finally {
      setLoading(false);
    }
  }, [isEcom]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setForm({
      planId: "",
      durationType: "",
      startDate: todayInputValue(),
      cityId: "",
      subDistrictId: "",
      targetId: "",
      bannerFile: null,
    });
    setMessage("");
    setError("");
  }, [isEcom]);

  useEffect(() => {
    let cancelled = false;
    if (!form.cityId) {
      setSubDistricts([]);
      return undefined;
    }
    publicListSubDistricts({ city: form.cityId, limit: 500 })
      .then((rows) => {
        if (!cancelled) setSubDistricts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setSubDistricts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.cityId]);

  useEffect(() => {
    if (!form.bannerFile) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(form.bannerFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.bannerFile]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setMessage("");

    if (!form.planId || !form.durationType || !form.startDate || !form.cityId || !form.subDistrictId) {
      setError("Select plan, duration, start date, city, and sub-district.");
      return;
    }
    if (isBannerPlan && !form.bannerFile) {
      setError("Banner image is required for banner promotions.");
      return;
    }
    if (isProductPresencePlan && !form.targetId) {
      setError("Select a product for Product Presence First.");
      return;
    }

    setSaving(true);
    try {
      const subscribePayload = {
        planId: form.planId,
        durationType: form.durationType,
        startDate: form.startDate,
        cityId: form.cityId,
        subDistrictId: form.subDistrictId,
        bannerFile: form.bannerFile,
      };

      if (isEcom && isProductPresencePlan && form.targetId) {
        subscribePayload.productId = form.targetId;
      } else if (isEcom && isBannerPlan && form.targetId) {
        subscribePayload.targetProductId = form.targetId;
        subscribePayload.targetType = "product";
      }
      if (!isEcom && form.targetId) {
        subscribePayload.targetVenueId = form.targetId;
      }

      const checkout = isEcom
        ? await vendorEcomSubscribePromotion(subscribePayload)
        : await venueVendorSubscribePromotion(subscribePayload);

      if (checkout?.requiresPayment) {
        const payment = await openRazorpayCheckout({
          keyId: checkout.keyId,
          orderId: checkout.orderId,
          amountPaise: checkout.amountPaise,
          currency: checkout.currency || "INR",
          name: appName,
          description: checkout.description || "Banner promotion",
          prefill: {
            name: user?.name || user?.businessName || "",
            email: user?.email || user?.businessEmail || "",
            contact: user?.phone || user?.businessPhone || "",
          },
        });
        const confirmPayload = {
          subscriptionId: checkout.subscriptionId,
          razorpay_order_id: payment.razorpay_order_id,
          razorpay_payment_id: payment.razorpay_payment_id,
          razorpay_signature: payment.razorpay_signature,
        };
        if (isEcom) {
          await vendorEcomConfirmPromotionPayment(confirmPayload);
        } else {
          await venueVendorConfirmPromotionPayment(confirmPayload);
        }
      }

      setMessage(
        checkout?.requiresPayment
          ? "Payment received. Promotion is pending admin review."
          : "Promotion submitted for admin review.",
      );
      setForm((prev) => ({ ...prev, bannerFile: null, durationType: "", targetId: "" }));
      await load();
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("cancelled")) {
        setError("Payment cancelled. Try again when you are ready.");
      } else {
        setError(err?.message || "Could not submit promotion");
      }
    } finally {
      setSaving(false);
    }
  };

  const emptyPlanMessage = isEcom
    ? "No e-commerce promotion plans are available yet. Run seed or ask admin to create plans with vendor type “E-commerce vendor”."
    : "No service Banner Promotion plans are available yet. Run seed or ask admin to create one with vendor type “Service vendor”.";

  return (
    <div className={`vendor-dashboard vendor-plans${embedded ? " vendor-plans--embedded" : ""}`}>
      {!embedded ? (
        <header className="vendor-dashboard__head">
          <div>
            <h1 className="vendor-dashboard__title">{isEcom ? "Promotions" : "Banner Promotions"}</h1>
            <p className="vendor-dashboard__subtitle">
              {isEcom
                ? "Buy banner ads, get verified, or boost product visibility in the user app. All plans require admin approval."
                : "Promote your services in the user app. Choose a city, upload a banner, and submit for admin approval."}
            </p>
          </div>
        </header>
      ) : null}

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
            <h2 className="vendor-dash-panel__title">
              {isEcom ? "Buy Promotion Plan" : "Buy Banner Promotion"}
            </h2>
            {plans.length === 0 ? (
              <p className="vendor-dashboard__subtitle">{emptyPlanMessage}</p>
            ) : (
              <form className="vendor-promo-form" onSubmit={onSubmit}>
                <label className="vendor-plans__label">
                  Plan
                  <select
                    className="form-select"
                    value={form.planId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, planId: e.target.value, durationType: "" }))
                    }
                    required
                  >
                    <option value="">Select a plan</option>
                    {plans.map((plan) => (
                      <option key={plan._id} value={plan._id}>
                        {plan.name} ({plan.planTypeLabel || "Banner Promotion"})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="vendor-plans__label">
                  Duration
                  <select
                    className="form-select"
                    value={form.durationType}
                    onChange={(e) => setForm((p) => ({ ...p, durationType: e.target.value }))}
                    required
                    disabled={!selectedPlan}
                  >
                    <option value="">Select duration</option>
                    {(selectedPlan?.durationOptions || []).map((opt) => (
                      <option key={opt.type} value={opt.type}>
                        {opt.typeLabel || opt.type} · {opt.durationDays} day(s) · {formatInr(opt.price)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="vendor-plans__label">
                  Start date
                  <input
                    className="form-control"
                    type="date"
                    min={todayInputValue()}
                    value={form.startDate}
                    onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    required
                  />
                </label>

                <label className="vendor-plans__label">
                  City
                  <select
                    className="form-select"
                    value={form.cityId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, cityId: e.target.value, subDistrictId: "" }))
                    }
                    required
                  >
                    <option value="">Select city</option>
                    {cities.map((city) => (
                      <option key={city._id} value={city._id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="vendor-plans__label">
                  Sub-district
                  <select
                    className="form-select"
                    value={form.subDistrictId}
                    onChange={(e) => setForm((p) => ({ ...p, subDistrictId: e.target.value }))}
                    required
                    disabled={!form.cityId}
                  >
                    <option value="">Select sub-district</option>
                    {subDistricts.map((row) => (
                      <option key={row._id} value={row._id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                {isEcom && isProductPresencePlan ? (
                  <label className="vendor-plans__label">
                    Product to boost
                    <select
                      className="form-select"
                      value={form.targetId}
                      onChange={(e) => setForm((p) => ({ ...p, targetId: e.target.value }))}
                      required
                    >
                      <option value="">Select product</option>
                      {targets.map((item) => (
                        <option key={item._id || item.id} value={item._id || item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {selectedPlan && isBannerPlan && !isProductPresencePlan ? (
                  <label className="vendor-plans__label">
                    {isEcom ? "Link to product (optional)" : "Link to service (optional)"}
                    <select
                      className="form-select"
                      value={form.targetId}
                      onChange={(e) => setForm((p) => ({ ...p, targetId: e.target.value }))}
                    >
                      <option value="">None</option>
                      {targets.map((item) => (
                        <option key={item._id || item.id} value={item._id || item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {selectedPlan && isBannerPlan && !isProductPresencePlan ? (
                  <div className="vendor-promo-form__full">
                    <label className="vendor-plans__label">
                      Banner image
                      <input
                        className="form-control"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setForm((p) => ({ ...p, bannerFile: e.target.files?.[0] || null }))}
                        required={isBannerPlan}
                      />
                    </label>
                    {previewUrl ? (
                      <div className="vendor-plans__preview vendor-promo-form__preview">
                        <img src={previewUrl} alt="Banner preview" />
                      </div>
                    ) : null}
                    <p className="vendor-plans__hint">
                      Recommended about 1200×400px. Use the free daily banner plan for testing without payment.
                    </p>
                  </div>
                ) : null}

                {isEcom && isGetVerifiedPlan ? (
                  <p className="vendor-plans__hint vendor-promo-form__full">
                    Get Verified adds a trusted badge to your shop profile in the selected city area after admin
                    approval.
                  </p>
                ) : null}

                {isEcom && isProductPresencePlan && selectedPlan?.presenceTopLimit ? (
                  <p className="vendor-plans__hint vendor-promo-form__full">
                    Your product appears in the top {selectedPlan.presenceTopLimit} results for its category in the
                    selected city area.
                  </p>
                ) : null}

                <div className="vendor-plans__actions vendor-promo-form__full">
                  <button type="submit" className="vendor-btn vendor-btn--primary" disabled={saving}>
                    {saving ? "Submitting…" : "Pay & submit for approval"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="vendor-dash-panel vendor-plans__panel">
            <h2 className="vendor-dash-panel__title">Your requests</h2>
            {myPromos.length === 0 ? (
              <p className="vendor-dashboard__subtitle">No promotion requests yet.</p>
            ) : (
              <ul className="vendor-plans__list vendor-promo-requests">
                {myPromos.map((row) => (
                  <li key={row._id} className="vendor-plans__item vendor-promo-requests__item">
                    {row.bannerImage ? (
                      <div className="vendor-promo-requests__thumb">
                        <AppImage src={row.bannerImage} alt="" />
                      </div>
                    ) : null}
                    <div className="vendor-plans__item-copy">
                      <strong>{row.planName || row.planTypeLabel || "Promotion"}</strong>
                      <span>
                        {row.planTypeLabel ? `${row.planTypeLabel} · ` : ""}
                        {row.cityName || "—"} / {row.subDistrictName || "—"} · {formatDate(row.startDate)} –{" "}
                        {formatDate(row.expiryDate)} · {formatInr(row.amount)}
                      </span>
                    </div>
                    <span className="vendor-dash-badge">{row.statusLabel || row.status || row.approvalStatus}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function PromotionPlansPage() {
  const panelMode = useSelector(selectPanelMode);

  if (panelMode === "both") {
    return (
      <div className="vendor-dashboard vendor-plans vendor-plans--both">
        <header className="vendor-dashboard__head">
          <div>
            <h1 className="vendor-dashboard__title">Promotions</h1>
            <p className="vendor-dashboard__subtitle">
              Manage service and shop promotions together. Each section uses its own plans and requests.
            </p>
          </div>
        </header>
        <section className="vendor-dash-panel vendor-plans__panel">
          <h2 className="vendor-dash-panel__title">Service promotions</h2>
          <PromotionPlansPanel forcedMode="service" embedded />
        </section>
        <section className="vendor-dash-panel vendor-plans__panel">
          <h2 className="vendor-dash-panel__title">Shop promotions</h2>
          <PromotionPlansPanel forcedMode="ecom" embedded />
        </section>
      </div>
    );
  }

  return <PromotionPlansPanel />;
}

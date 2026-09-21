import api, { normalizeApiError } from "../api.js";

function unwrapList(data) {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.plans)) return data.plans;
  if (Array.isArray(data)) return data;
  return [];
}

function unwrapOne(data) {
  if (Array.isArray(data?.data)) return data.data[0] ?? null;
  if (data?.data && typeof data.data === "object") return data.data;
  return data?.subscription ?? data ?? null;
}

/** Active plans for venue vendors */
export async function venueVendorListPlans() {
  try {
    const { data } = await api.get("/venue-vendor/plans");
    return unwrapList(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

/** Active Banner subscription for this vendor (or null) */
export async function venueVendorGetBannerSubscription() {
  try {
    const { data } = await api.get("/venue-vendor/plans/banner-subscription");
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

/**
 * Start subscription.
 * Free → { requiresPayment: false, subscription }
 * Paid → Razorpay checkout fields + requiresPayment: true
 */
export async function venueVendorSubscribePlan(planId) {
  try {
    const { data } = await api.post(`/venue-vendor/plans/${encodeURIComponent(planId)}/subscribe`);
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

/** Confirm Razorpay payment after Checkout success */
export async function venueVendorConfirmPlanPayment(payload) {
  try {
    const { data } = await api.post("/venue-vendor/plans/banner-subscription/confirm", payload);
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

/** Upload / replace the single subscription banner (field: file) */
export async function venueVendorUploadPlanBanner({ file, title = "" } = {}) {
  if (!(file instanceof File)) {
    throw new Error("Banner image file is required");
  }
  const fd = new FormData();
  fd.append("file", file);
  if (title) fd.append("title", String(title).trim());
  try {
    const { data } = await api.post("/venue-vendor/plans/banner", fd);
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorClearPlanBanner() {
  try {
    const { data } = await api.delete("/venue-vendor/plans/banner");
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

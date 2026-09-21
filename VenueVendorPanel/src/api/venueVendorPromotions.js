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

export async function venueVendorListPromotionPlans() {
  try {
    const { data } = await api.get("/venue-vendor/promotion-plans");
    return unwrapList(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorSubscribePromotion({
  planId,
  durationType,
  startDate,
  cityId,
  subDistrictId,
  targetVenueId,
  bannerFile,
} = {}) {
  const fd = new FormData();
  fd.append("planId", planId);
  fd.append("durationType", durationType);
  fd.append("startDate", startDate);
  fd.append("cityId", cityId);
  fd.append("subDistrictId", subDistrictId);
  if (targetVenueId) fd.append("targetVenueId", targetVenueId);
  if (bannerFile) fd.append("file", bannerFile);
  try {
    const { data } = await api.post("/venue-vendor/promotion-plans/subscribe", fd);
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorConfirmPromotionPayment(payload) {
  try {
    const { data } = await api.post("/venue-vendor/promotion-plans/confirm", payload);
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorListMyPromotions() {
  try {
    const { data } = await api.get("/venue-vendor/promotions");
    return unwrapList(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

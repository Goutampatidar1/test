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

export async function vendorEcomListPromotionPlans({ planType } = {}) {
  const q = planType ? `?planType=${encodeURIComponent(planType)}` : "";
  try {
    const { data } = await api.get(`/vendor/promotion-plans${q}`);
    return unwrapList(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomSubscribePromotion({
  planId,
  durationType,
  startDate,
  cityId,
  subDistrictId,
  targetProductId,
  productId,
  targetType,
  bannerFile,
} = {}) {
  const fd = new FormData();
  fd.append("planId", planId);
  fd.append("durationType", durationType);
  fd.append("startDate", startDate);
  fd.append("cityId", cityId);
  fd.append("subDistrictId", subDistrictId);
  if (targetProductId) fd.append("targetProductId", targetProductId);
  if (productId) fd.append("productId", productId);
  if (targetType) fd.append("targetType", targetType);
  if (bannerFile) fd.append("file", bannerFile);
  try {
    const { data } = await api.post("/vendor/promotion-plans/subscribe", fd);
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomConfirmPromotionPayment(payload) {
  try {
    const { data } = await api.post("/vendor/promotion-plans/confirm", payload);
    return unwrapOne(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomListMyPromotions() {
  try {
    const { data } = await api.get("/vendor/promotions");
    return unwrapList(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

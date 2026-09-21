import api, { authHeader, normalizeApiError } from "../api.js";

function promotionsBase() {
  return "/admin/promotions";
}

export async function adminGetPromotionById(token, id) {
  try {
    const { data } = await api.get(`${promotionsBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return data.promotion;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListPromotions(token, { page = 1, limit = 10, status, search, discountType } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (discountType) q.set("discountType", discountType);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`${promotionsBase()}?${q}`, { headers: authHeader(token) });
    return {
      promotions: Array.isArray(data.promotions) ? data.promotions : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreatePromotion(token, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    fd.append("promoCode", String(fields.promoCode ?? "").trim());
    fd.append("displayMessage", String(fields.displayMessage ?? "").trim());
    fd.append("discountType", String(fields.discountType ?? "").trim());
    fd.append("discountValue", String(fields.discountValue ?? ""));
    fd.append("minimumOrderAmount", String(fields.minimumOrderAmount ?? ""));
    fd.append("maximumDiscountAmount", String(fields.maximumDiscountAmount ?? ""));
    fd.append("totalUsageLimit", String(fields.totalUsageLimit ?? ""));
    fd.append("startDate", String(fields.startDate ?? ""));
    fd.append("endDate", String(fields.endDate ?? ""));
    fd.append("status", String(fields.status || "active"));
    fd.append("file", file);
    try {
      const { data } = await api.post(promotionsBase(), fd, { headers: authHeader(token) });
      return data.promotion;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.post(
      promotionsBase(),
      {
        promoCode: String(fields.promoCode ?? "").trim(),
        displayMessage: String(fields.displayMessage ?? "").trim(),
        image: String(fields.image ?? "").trim(),
        discountType: String(fields.discountType ?? "").trim(),
        discountValue: Number(fields.discountValue ?? 0),
        minimumOrderAmount: fields.minimumOrderAmount === "" ? undefined : Number(fields.minimumOrderAmount),
        maximumDiscountAmount: fields.maximumDiscountAmount === "" ? undefined : Number(fields.maximumDiscountAmount),
        totalUsageLimit: Number(fields.totalUsageLimit ?? 0),
        startDate: String(fields.startDate ?? ""),
        endDate: String(fields.endDate ?? ""),
        status: String(fields.status || "active"),
      },
      { headers: authHeader(token) }
    );
    return data.promotion;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdatePromotion(token, id, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    if (fields.promoCode !== undefined) fd.append("promoCode", String(fields.promoCode).trim());
    if (fields.displayMessage !== undefined) fd.append("displayMessage", String(fields.displayMessage).trim());
    if (fields.discountType !== undefined) fd.append("discountType", String(fields.discountType).trim());
    if (fields.discountValue !== undefined) fd.append("discountValue", String(fields.discountValue));
    if (fields.minimumOrderAmount !== undefined) fd.append("minimumOrderAmount", String(fields.minimumOrderAmount));
    if (fields.maximumDiscountAmount !== undefined) fd.append("maximumDiscountAmount", String(fields.maximumDiscountAmount));
    if (fields.totalUsageLimit !== undefined) fd.append("totalUsageLimit", String(fields.totalUsageLimit));
    if (fields.startDate !== undefined) fd.append("startDate", String(fields.startDate));
    if (fields.endDate !== undefined) fd.append("endDate", String(fields.endDate));
    if (fields.status !== undefined) fd.append("status", String(fields.status));
    fd.append("file", file);
    try {
      const { data } = await api.patch(`${promotionsBase()}/${encodeURIComponent(id)}`, fd, { headers: authHeader(token) });
      return data.promotion;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  const payload = {};
  if (fields.promoCode !== undefined) payload.promoCode = String(fields.promoCode).trim();
  if (fields.displayMessage !== undefined) payload.displayMessage = String(fields.displayMessage).trim();
  if (fields.image !== undefined) payload.image = String(fields.image).trim();
  if (fields.discountType !== undefined) payload.discountType = String(fields.discountType).trim();
  if (fields.discountValue !== undefined) payload.discountValue = Number(fields.discountValue);
  if (fields.minimumOrderAmount !== undefined) payload.minimumOrderAmount = fields.minimumOrderAmount === "" ? "" : Number(fields.minimumOrderAmount);
  if (fields.maximumDiscountAmount !== undefined) payload.maximumDiscountAmount = fields.maximumDiscountAmount === "" ? "" : Number(fields.maximumDiscountAmount);
  if (fields.totalUsageLimit !== undefined) payload.totalUsageLimit = Number(fields.totalUsageLimit);
  if (fields.startDate !== undefined) payload.startDate = String(fields.startDate);
  if (fields.endDate !== undefined) payload.endDate = String(fields.endDate);
  if (fields.status !== undefined) payload.status = String(fields.status);

  try {
    const { data } = await api.patch(`${promotionsBase()}/${encodeURIComponent(id)}`, payload, { headers: authHeader(token) });
    return data.promotion;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeletePromotion(token, id) {
  try {
    await api.delete(`${promotionsBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}

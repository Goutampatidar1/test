import api, { authHeader, normalizeApiError } from "../api.js";

function hotDealsBase() {
  return "/admin/hot-deals";
}

export async function adminListHotDealRules(token, { status } = {}) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  try {
    const { data } = await api.get(`${hotDealsBase()}/rules?${q}`, { headers: authHeader(token) });
    return Array.isArray(data.rules) ? data.rules : [];
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateHotDealRule(token, fields) {
  try {
    const { data } = await api.post(`${hotDealsBase()}/rules`, fields, { headers: authHeader(token) });
    return data.rule;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateHotDealRule(token, id, fields) {
  try {
    const { data } = await api.patch(`${hotDealsBase()}/rules/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.rule;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteHotDealRule(token, id) {
  try {
    await api.delete(`${hotDealsBase()}/rules/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListHotDealQueue(token, { page = 1, limit = 10, status = "pending" } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  try {
    const { data } = await api.get(`${hotDealsBase()}/queue?${q}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.data) ? data.data : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminApproveHotDeal(token, productId) {
  try {
    const { data } = await api.post(
      `${hotDealsBase()}/queue/${encodeURIComponent(productId)}/approve`,
      {},
      { headers: authHeader(token) }
    );
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminRejectHotDeal(token, productId, reason) {
  try {
    const { data } = await api.post(
      `${hotDealsBase()}/queue/${encodeURIComponent(productId)}/reject`,
      { reason },
      { headers: authHeader(token) }
    );
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminPreviewHotDeals(token, { limit } = {}) {
  const q = new URLSearchParams();
  if (limit) q.set("limit", String(limit));
  try {
    const { data } = await api.get(`${hotDealsBase()}/preview?${q}`, { headers: authHeader(token) });
    return Array.isArray(data.data) ? data.data : [];
  } catch (error) {
    normalizeApiError(error);
  }
}

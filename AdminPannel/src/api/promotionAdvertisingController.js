import api, { authHeader, normalizeApiError } from "../api.js";

const PLANS = "/admin/promotion-plans";
const REQUESTS = "/admin/promotion-requests";
const DASHBOARD = "/admin/promotion-dashboard";

export async function adminListPromotionPlans(
  token,
  { page = 1, limit = 50, status, search, planType, vendorType } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (planType) q.set("planType", planType);
  if (vendorType) q.set("vendorType", vendorType);
  if (search?.trim()) q.set("search", search.trim());
  try {
    const { data } = await api.get(`${PLANS}?${q}`, { headers: authHeader(token) });
    return {
      plans: Array.isArray(data.plans) ? data.plans : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreatePromotionPlan(token, fields) {
  try {
    const { data } = await api.post(PLANS, fields, { headers: authHeader(token) });
    return data.plan;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdatePromotionPlan(token, id, fields) {
  try {
    const { data } = await api.patch(`${PLANS}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.plan;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeletePromotionPlan(token, id) {
  try {
    await api.delete(`${PLANS}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListPromotionRequests(
  token,
  { page = 1, limit = 20, status, approvalStatus, planType, search, ownerType } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (approvalStatus) q.set("approvalStatus", approvalStatus);
  if (planType) q.set("planType", planType);
  if (ownerType) q.set("ownerType", ownerType);
  if (search?.trim()) q.set("search", search.trim());
  try {
    const { data } = await api.get(`${REQUESTS}?${q}`, { headers: authHeader(token) });
    return {
      requests: Array.isArray(data.requests) ? data.requests : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminApprovePromotionRequest(token, id) {
  try {
    const { data } = await api.patch(
      `${REQUESTS}/${encodeURIComponent(id)}/approve`,
      {},
      { headers: authHeader(token) }
    );
    return data.request;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminRejectPromotionRequest(token, id, reason = "") {
  try {
    const { data } = await api.patch(
      `${REQUESTS}/${encodeURIComponent(id)}/reject`,
      { reason },
      { headers: authHeader(token) }
    );
    return data.request;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetPromotionDashboard(token) {
  try {
    const { data } = await api.get(DASHBOARD, { headers: authHeader(token) });
    return data.dashboard ?? data;
  } catch (error) {
    normalizeApiError(error);
  }
}

import api, { authHeader, normalizeApiError } from "../api.js";

function plansBase() {
  return "/admin/plans";
}

export async function adminListPlans(
  token,
  { page = 1, limit = 50, status, search, planType, vendorType } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (planType) q.set("planType", planType);
  if (vendorType) q.set("vendorType", vendorType);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`${plansBase()}?${q}`, { headers: authHeader(token) });
    return {
      plans: Array.isArray(data.plans) ? data.plans : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreatePlan(token, fields) {
  try {
    const { data } = await api.post(plansBase(), fields, { headers: authHeader(token) });
    return data.plan;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdatePlan(token, id, fields) {
  try {
    const { data } = await api.patch(`${plansBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.plan;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeletePlan(token, id) {
  try {
    await api.delete(`${plansBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}

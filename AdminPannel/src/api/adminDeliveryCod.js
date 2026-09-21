import api, { authHeader, normalizeApiError } from "../api.js";

function buildQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (!str) return;
    q.set(key, str);
  });
  return q.toString();
}

export async function adminListDriversCod(token, { page = 1, limit = 20, search, onlyPending } = {}) {
  const query = buildQuery({ page, limit, search, onlyPending: onlyPending ? "true" : undefined });
  try {
    const { data } = await api.get(`/admin/delivery-cod?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.items) ? data.items : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetDriverCodDetail(token, driverId) {
  try {
    const { data } = await api.get(`/admin/delivery-cod/${encodeURIComponent(driverId)}`, {
      headers: authHeader(token),
    });
    return data ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListDriverCodPendingOrders(token, driverId, { page = 1, limit = 10 } = {}) {
  const query = buildQuery({ page, limit });
  try {
    const { data } = await api.get(`/admin/delivery-cod/${encodeURIComponent(driverId)}/pending-orders?${query}`, {
      headers: authHeader(token),
    });
    return {
      rows: Array.isArray(data.items) ? data.items : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListDriverCodSettlements(token, driverId, { page = 1, limit = 10 } = {}) {
  const query = buildQuery({ page, limit });
  try {
    const { data } = await api.get(`/admin/delivery-cod/${encodeURIComponent(driverId)}/settlements?${query}`, {
      headers: authHeader(token),
    });
    return {
      rows: Array.isArray(data.items) ? data.items : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminSettleDriverCod(token, driverId, { amount, adminNote } = {}) {
  try {
    const { data } = await api.post(
      `/admin/delivery-cod/${encodeURIComponent(driverId)}/settle`,
      { amount, adminNote },
      { headers: authHeader(token) }
    );
    return data ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

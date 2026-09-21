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

export async function adminListDeliveryWithdrawals(token, { page = 1, limit = 10, search, status } = {}) {
  const query = buildQuery({ page, limit, search, status });
  try {
    const { data } = await api.get(`/admin/delivery-withdrawals?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.items) ? data.items : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetDeliveryWithdrawal(token, id) {
  try {
    const { data } = await api.get(`/admin/delivery-withdrawals/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return data ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateDeliveryWithdrawal(token, id, payload) {
  try {
    const { data } = await api.patch(`/admin/delivery-withdrawals/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return data ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

import api, { authHeader, normalizeApiError } from "../api.js";

function asPagination(data, page, limit) {
  return data?.pagination ?? { page, limit, total: 0, pages: 1 };
}

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

export async function adminListEcomTransactions(token, { page = 1, limit = 10, search } = {}) {
  const query = buildQuery({ page, limit, search });
  try {
    const { data } = await api.get(`/admin/ecom/transactions?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.transactions) ? data.transactions : [],
      pagination: asPagination(data, page, limit),
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListVenueTransactions(token, { page = 1, limit = 10, search } = {}) {
  const query = buildQuery({ page, limit, search });
  try {
    const { data } = await api.get(`/admin/venue/transactions?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.transactions) ? data.transactions : [],
      pagination: asPagination(data, page, limit),
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListRechargeTransactions(token, { page = 1, limit = 10, search } = {}) {
  const query = buildQuery({ page, limit, search });
  try {
    const { data } = await api.get(`/admin/recharges/transactions?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.transactions) ? data.transactions : [],
      pagination: asPagination(data, page, limit),
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListRevenueHistory(token, { page = 1, limit = 10, search } = {}) {
  const query = buildQuery({ page, limit, search });
  try {
    const { data } = await api.get(`/admin/payments/revenue?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.rows) ? data.rows : [],
      pagination: asPagination(data, page, limit),
      totals: data.totals ?? { inflow: 0, outflow: 0, net: 0 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListEcomOrders(token, { page = 1, limit = 10, search, orderStatus, dateFrom, dateTo, vendorId } = {}) {
  const query = buildQuery({ page, limit, search, orderStatus, dateFrom, dateTo, vendorId });
  try {
    const { data } = await api.get(`/admin/ecom/orders?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.orders) ? data.orders : [],
      pagination: asPagination(data, page, limit),
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListVenueOrders(token, { page = 1, limit = 10, search, orderStatus, dateFrom, dateTo, venueVendorId } = {}) {
  const query = buildQuery({ page, limit, search, orderStatus, dateFrom, dateTo, venueVendorId });
  try {
    const { data } = await api.get(`/admin/venue/orders?${query}`, { headers: authHeader(token) });
    return {
      rows: Array.isArray(data.orders) ? data.orders : [],
      pagination: asPagination(data, page, limit),
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetEcomOrderInvoicePdf(token, id) {
  try {
    const response = await api.get(`/admin/ecom/orders/${encodeURIComponent(id)}/invoice`, {
      headers: authHeader(token),
      params: { format: "pdf" },
      responseType: "blob",
    });
    const blob = response.data;
    const contentType = String(response.headers?.["content-type"] || blob?.type || "");
    if (contentType.includes("application/json")) {
      const text = await blob.text();
      let message = "Invoice PDF not found";
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) message = parsed.message;
      } catch {
        /* ignore */
      }
      const err = new Error(message);
      err.status = 404;
      throw err;
    }
    return blob;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetEcomOrderById(token, id) {
  try {
    const { data } = await api.get(`/admin/ecom/orders/${encodeURIComponent(id)}`, { headers: authHeader(token) });
    return data?.order ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateEcomOrderStatus(token, orderId, { status, reason } = {}) {
  try {
    const { data } = await api.patch(
      `/admin/ecom/orders/${encodeURIComponent(orderId)}/status`,
      { status, reason },
      { headers: authHeader(token) }
    );
    return data?.order ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListAssignableDriversForOrder(token, orderId) {
  try {
    const { data } = await api.get(`/admin/ecom/orders/${encodeURIComponent(orderId)}/assignable-drivers`, {
      headers: authHeader(token),
    });
    return data ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminAssignDriverToOrder(token, orderId, deliveryBoyId) {
  try {
    const { data } = await api.patch(
      `/admin/ecom/orders/${encodeURIComponent(orderId)}/assign-driver`,
      { deliveryBoyId },
      { headers: authHeader(token) }
    );
    return data ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetVenueOrderById(token, id) {
  try {
    const { data } = await api.get(`/admin/venue/orders/${encodeURIComponent(id)}`, { headers: authHeader(token) });
    return data?.order ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetEcomTransactionById(token, id) {
  try {
    const { data } = await api.get(`/admin/ecom/transactions/${encodeURIComponent(id)}`, { headers: authHeader(token) });
    return data?.transaction ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetVenueTransactionById(token, id) {
  try {
    const { data } = await api.get(`/admin/venue/transactions/${encodeURIComponent(id)}`, { headers: authHeader(token) });
    return data?.transaction ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetRechargeTransactionById(token, id) {
  try {
    const { data } = await api.get(`/admin/recharges/transactions/${encodeURIComponent(id)}`, { headers: authHeader(token) });
    return data?.transaction ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

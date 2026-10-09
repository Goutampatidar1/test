import api, { authHeader, normalizeApiError } from "../api.js";

function enquiriesBase() {
  return "/admin/venue/enquiries";
}

export async function adminListVenueEnquiries(token, { page = 1, limit = 10, status, search, venueId } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (venueId) q.set("venueId", venueId);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`${enquiriesBase()}?${q}`, { headers: authHeader(token) });
    return {
      enquiries: Array.isArray(data.data) ? data.data : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetVenueEnquiry(token, id) {
  try {
    const { data } = await api.get(`${enquiriesBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
    return Array.isArray(data.data) ? data.data[0] : data.data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateVenueEnquiryStatus(token, id, { status, reason } = {}) {
  try {
    const { data } = await api.patch(
      `${enquiriesBase()}/${encodeURIComponent(id)}/status`,
      { status, ...(reason ? { reason } : {}) },
      { headers: authHeader(token) }
    );
    return Array.isArray(data.data) ? data.data[0] : data.data;
  } catch (error) {
    normalizeApiError(error);
  }
}

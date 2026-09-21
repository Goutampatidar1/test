import api, { normalizeApiError } from "../api.js";

export async function vendorGetDashboard({ recentLimit = 5 } = {}) {
  const q = new URLSearchParams();
  q.set("recentLimit", String(recentLimit));
  try {
    const { data } = await api.get(`/venue-vendor/bookings/dashboard?${q}`);
    return data.data?.[0] ?? data.data ?? data.dashboard ?? data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorListBookings({ page = 1, limit = 50, status, search } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status && status !== "all") q.set("status", status);
  if (search?.trim()) q.set("search", search.trim());

  try {
    const { data } = await api.get(`/venue-vendor/bookings?${q}`);
    return {
      bookings: Array.isArray(data.bookings) ? data.bookings : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorGetBookingById(id) {
  try {
    const { data } = await api.get(`/venue-vendor/bookings/${encodeURIComponent(id)}`);
    return data.data?.[0] ?? data.data ?? data.booking ?? data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorUpdateBookingStatus(id, status) {
  try {
    const { data } = await api.patch(`/venue-vendor/bookings/${encodeURIComponent(id)}/status`, {
      status,
    });
    return data.data?.[0] ?? data.data ?? data.booking ?? data;
  } catch (error) {
    normalizeApiError(error);
  }
}

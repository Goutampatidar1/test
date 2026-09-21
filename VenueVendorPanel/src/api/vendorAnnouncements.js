import api, { normalizeApiError } from "../api.js";

export async function venueVendorListAnnouncements() {
  try {
    const { data } = await api.get("/venue-vendor/announcements");
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.announcements)) return data.announcements;
    return [];
  } catch (error) {
    normalizeApiError(error);
  }
}

import api, { normalizeApiError } from "../api.js";

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unwrapSettings(payload) {
  if (!payload || typeof payload !== "object") return null;
  const { data } = payload;
  if (Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object") {
    return data[0];
  }
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  return null;
}

function unwrapPageList(payload) {
  if (!payload || typeof payload !== "object") return [];
  return asArray(payload.data).filter((row) => row && typeof row === "object");
}

/** List static pages for Venue Vendor App (title + slug). */
export async function listVenueVendorStaticPages() {
  try {
    const { data } = await api.get("/venue-vendor/app-settings");
    const settings = unwrapSettings(data);
    const fromSettings = Array.isArray(settings?.staticPages) ? settings.staticPages : [];
    if (fromSettings.length) return fromSettings;
  } catch {
    /* try public pages list */
  }

  try {
    const { data } = await api.get("/public/pages?app=venue_vendor");
    return unwrapPageList(data).map((page) => ({
      title: page.title,
      slug: page.slug,
    }));
  } catch {
    return [];
  }
}

/** Fetch a single static page by slug (includes HTML content). */
export async function getVenueVendorStaticPage(slug) {
  try {
    const { data } = await api.get(
      `/public/pages/${encodeURIComponent(slug)}?app=venue_vendor`,
    );
    const rows = unwrapPageList(data);
    return rows[0] ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

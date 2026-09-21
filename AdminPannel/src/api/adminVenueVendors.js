import api, { authHeader, normalizeApiError } from "../api.js";

function base() {
  return "/admin/venue-vendors";
}

export async function adminListVenueVendors(token, { page = 1, limit = 20, status, approvalStatus, search } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (approvalStatus) q.set("approvalStatus", approvalStatus);
  if (search && String(search).trim()) q.set("search", String(search).trim());

  try {
    const { data: body } = await api.get(`${base()}?${q}`, { headers: authHeader(token) });
    return {
      venueVendors: Array.isArray(body.venueVendors) ? body.venueVendors : [],
      pagination: body.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetVenueVendor(token, id) {
  try {
    const { data: body } = await api.get(`${base()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return body.venueVendor ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

function appendFields(fd, fields) {
  const keys = [
    "name",
    "email",
    "password",
    "phone",
    "businessName",
    "businessPhone",
    "businessEmail",
    "businessAddress",
    "businessDescription",
    "panNumber",
    "gstNumber",
    "bankName",
    "branchName",
    "accountType",
    "accountNumber",
    "ifscCode",
    "aadhaarCardFront",
    "aadhaarCardBack",
    "aadhaarCard",
    "panCard",
    "status",
    "approvalStatus",
    "rejectionReason",
    "profileImage",
    "fcm_id",
  ];

  keys.forEach((k) => {
    if (fields[k] === undefined || fields[k] === null) return;
    // Skip empty document paths so they don't conflict with multipart file fields.
    if (
      ["aadhaarCardFront", "aadhaarCardBack", "aadhaarCard", "panCard", "profileImage"].includes(k) &&
      String(fields[k]).trim() === ""
    ) {
      return;
    }
    fd.append(k, String(fields[k]));
  });
}

function appendFiles(fd, files = {}) {
  const keys = ["file", "aadhaarCardFront", "aadhaarCardBack", "aadhaarCard", "panCard"];
  keys.forEach((k) => {
    if (files[k] instanceof File) fd.append(k, files[k]);
  });
}

function hasAnyFile(files = {}) {
  return Object.values(files).some((f) => f instanceof File);
}

export async function adminCreateVenueVendor(token, fields, files = {}) {
  if (hasAnyFile(files)) {
    const fd = new FormData();
    appendFields(fd, fields);
    appendFiles(fd, files);
    try {
      const { data: body } = await api.post(base(), fd, { headers: authHeader(token) });
      return body.venueVendor;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data: body } = await api.post(base(), fields, { headers: authHeader(token) });
    return body.venueVendor;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateVenueVendor(token, id, fields, files = {}) {
  if (hasAnyFile(files)) {
    const fd = new FormData();
    appendFields(fd, fields);
    appendFiles(fd, files);
    try {
      const { data: body } = await api.patch(`${base()}/${encodeURIComponent(id)}`, fd, {
        headers: authHeader(token),
      });
      return body.venueVendor;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data: body } = await api.patch(`${base()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return body.venueVendor;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteVenueVendor(token, id) {
  try {
    await api.delete(`${base()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}

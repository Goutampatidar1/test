import api, { authHeader, normalizeApiError } from "../api.js";

function vendorsBase() {
  return "/admin/vendors";
}

export async function adminListVendors(token, { page = 1, limit = 20, status, approvalStatus, search } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (approvalStatus) q.set("approvalStatus", approvalStatus);
  if (search && String(search).trim()) q.set("search", String(search).trim());

  try {
    const { data: body } = await api.get(`${vendorsBase()}?${q}`, {
      headers: authHeader(token),
    });
    return {
      vendors: Array.isArray(body.vendors) ? body.vendors : [],
      pagination: body.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetVendor(token, id) {
  try {
    const { data: body } = await api.get(`${vendorsBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return body.vendor ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

function appendVendorFields(fd, fields) {
  const keys = [
    "name",
    "email",
    "password",
    "phone",
    "businessName",
    "businessPhone",
    "gstin",
    "panCardNumber",
    "businessAddress",
    "shopDescription",
    "aadhaarCardFront",
    "aadhaarCardBack",
    "panCard",
    "shopLogo",
    "shopImages",
    "shopVideos",
    "shopBanner",
    "bankName",
    "branchName",
    "accountNo",
    "ifsc",
    "accountType",
    "dob",
    "gender",
    "fcm_id",
    "profileImage",
    "status",
    "approvalStatus",
    "rejectionReason",
    "city",
    "subDistrict",
  ];
  keys.forEach((k) => {
    if (fields[k] === undefined) return;
    const v = fields[k];
    if (Array.isArray(v)) {
      fd.append(k, JSON.stringify(v));
      return;
    }
    fd.append(k, v == null ? "" : String(v));
  });
}

function appendVendorFiles(fd, files = {}) {
  const singleKeys = ["file", "aadhaarCardFront", "aadhaarCardBack", "panCard", "shopLogo", "shopBanner"];
  singleKeys.forEach((k) => {
    if (files[k] instanceof File) fd.append(k, files[k]);
  });
  ["shopImages", "shopVideos"].forEach((k) => {
    const list = files[k];
    if (!Array.isArray(list)) return;
    list.forEach((f) => {
      if (f instanceof File) fd.append(k, f);
    });
  });
}

function hasAnyVendorFile(files = {}) {
  return Object.entries(files).some(([, v]) => {
    if (v instanceof File) return true;
    if (Array.isArray(v)) return v.some((x) => x instanceof File);
    return false;
  });
}

export async function adminCreateVendor(token, fields, files = {}) {
  if (hasAnyVendorFile(files)) {
    const fd = new FormData();
    appendVendorFields(fd, fields);
    appendVendorFiles(fd, files);
    try {
      const { data: body } = await api.post(vendorsBase(), fd, {
        headers: authHeader(token),
      });
      return body.vendor;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data: body } = await api.post(vendorsBase(), fields, {
      headers: authHeader(token),
    });
    return body.vendor;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateVendor(token, id, fields, files = {}) {
  if (hasAnyVendorFile(files)) {
    const fd = new FormData();
    appendVendorFields(fd, fields);
    appendVendorFiles(fd, files);
    try {
      const { data: body } = await api.patch(`${vendorsBase()}/${encodeURIComponent(id)}`, fd, {
        headers: authHeader(token),
      });
      return body.vendor;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data: body } = await api.patch(`${vendorsBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return body.vendor;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteVendor(token, id) {
  try {
    await api.delete(`${vendorsBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}

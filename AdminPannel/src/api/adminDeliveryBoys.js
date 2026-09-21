import api, { authHeader, normalizeApiError } from "../api.js";

function deliveryBase() {
  return "/admin/delivery-boys";
}

export async function adminListDeliveryBoys(token, { page = 1, limit = 20, status, approvalStatus, search } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (approvalStatus) q.set("approvalStatus", approvalStatus);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data: body } = await api.get(`${deliveryBase()}?${q}`, {
      headers: authHeader(token),
    });
    return {
      deliveryBoys: Array.isArray(body.deliveryBoys) ? body.deliveryBoys : [],
      pagination: body.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetDeliveryBoy(token, id) {
  try {
    const { data: body } = await api.get(`${deliveryBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return body.deliveryBoy ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

function appendFields(fd, fields = {}) {
  const keys = [
    "name",
    "email",
    "password",
    "phone",
    "city",
    "address",
    "dob",
    "gender",
    "fcm_id",
    "profileImage",
    "vehicleRegistrationNumber",
    "licenseNumber",
    "vehicleType",
    "drivingLicenseFront",
    "drivingLicenseBack",
    "aadhaarCardFront",
    "aadhaarCardBack",
    "bankAccountName",
    "accountNumber",
    "bankName",
    "branchName",
    "ifscCode",
    "subDistrict",
    "subDistrictId",
    "status",
    "approvalStatus",
  ];
  keys.forEach((k) => {
    if (fields[k] === undefined) return;
    fd.append(k, fields[k] == null ? "" : String(fields[k]));
  });
}

export async function adminCreateDeliveryBoy(token, fields, file) {
  const files = typeof file === "object" && !(file instanceof File) ? file : { file };
  const hasAnyFile = Object.values(files || {}).some((f) => f instanceof File);
  if (hasAnyFile) {
    const fd = new FormData();
    appendFields(fd, fields);
    if (files.file instanceof File) fd.append("file", files.file);
    if (files.drivingLicenseFront instanceof File) fd.append("drivingLicenseFront", files.drivingLicenseFront);
    if (files.drivingLicenseBack instanceof File) fd.append("drivingLicenseBack", files.drivingLicenseBack);
    if (files.aadhaarCardFront instanceof File) fd.append("aadhaarCardFront", files.aadhaarCardFront);
    if (files.aadhaarCardBack instanceof File) fd.append("aadhaarCardBack", files.aadhaarCardBack);
    try {
      const { data: body } = await api.post(deliveryBase(), fd, { headers: authHeader(token) });
      return body.deliveryBoy;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data: body } = await api.post(deliveryBase(), fields, { headers: authHeader(token) });
    return body.deliveryBoy;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateDeliveryBoy(token, id, fields, file) {
  const files = typeof file === "object" && !(file instanceof File) ? file : { file };
  const hasAnyFile = Object.values(files || {}).some((f) => f instanceof File);
  if (hasAnyFile) {
    const fd = new FormData();
    appendFields(fd, fields);
    if (files.file instanceof File) fd.append("file", files.file);
    if (files.drivingLicenseFront instanceof File) fd.append("drivingLicenseFront", files.drivingLicenseFront);
    if (files.drivingLicenseBack instanceof File) fd.append("drivingLicenseBack", files.drivingLicenseBack);
    if (files.aadhaarCardFront instanceof File) fd.append("aadhaarCardFront", files.aadhaarCardFront);
    if (files.aadhaarCardBack instanceof File) fd.append("aadhaarCardBack", files.aadhaarCardBack);
    try {
      const { data: body } = await api.patch(`${deliveryBase()}/${encodeURIComponent(id)}`, fd, {
        headers: authHeader(token),
      });
      return body.deliveryBoy;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data: body } = await api.patch(`${deliveryBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return body.deliveryBoy;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteDeliveryBoy(token, id) {
  try {
    await api.delete(`${deliveryBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}

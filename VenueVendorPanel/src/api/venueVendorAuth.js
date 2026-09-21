import api, { authHeader, normalizeApiError } from "../api.js";

export async function venueVendorSendOtp({ phone }) {
  try {
    const { data } = await api.post("/venue-vendor/auth/otp/send", { phone });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorVerifyOtp({ phone, otp }) {
  try {
    const { data } = await api.post("/venue-vendor/auth/otp/verify", { phone, otp });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

/** Legacy email/password login — panel uses OTP instead */
export async function venueVendorLogin({ phone, password }) {
  try {
    const { data } = await api.post("/venue-vendor/auth/login", { phone, password });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorRegister(fields, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      fd.append(key, String(value).trim());
    }
  });
  if (files.profileFile instanceof File) fd.append("file", files.profileFile);
  if (files.aadhaarCardFront instanceof File) fd.append("aadhaarCardFront", files.aadhaarCardFront);
  if (files.aadhaarCardBack instanceof File) fd.append("aadhaarCardBack", files.aadhaarCardBack);
  if (files.panCard instanceof File) fd.append("panCard", files.panCard);

  try {
    const { data } = await api.post("/venue-vendor/auth/register", fd);
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorGetMe(token) {
  try {
    const { data } = await api.get("/venue-vendor/auth/me", { headers: authHeader(token) });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorGetShopStatus(token) {
  try {
    const { data } = await api.get("/venue-vendor/auth/shop-status", { headers: authHeader(token) });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorUpdateShopStatus(token, isOpen) {
  try {
    const { data } = await api.patch(
      "/venue-vendor/auth/shop-status",
      { isOpen: Boolean(isOpen) },
      { headers: authHeader(token) }
    );
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorGetPhoneVisibility(token) {
  try {
    const { data } = await api.get("/venue-vendor/auth/phone-visibility", { headers: authHeader(token) });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorUpdatePhoneVisibility(token, showPhoneOnApp) {
  try {
    const { data } = await api.patch(
      "/venue-vendor/auth/phone-visibility",
      { showPhoneOnApp: Boolean(showPhoneOnApp) },
      { headers: authHeader(token) }
    );
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorUpdateMe(token, fields, files = {}) {
  const hasFiles =
    files.profileFile instanceof File ||
    files.aadhaarCardFront instanceof File ||
    files.aadhaarCardBack instanceof File ||
    files.panCard instanceof File;

  if (hasFiles) {
    const fd = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) fd.append(key, String(value));
    });
    if (files.profileFile instanceof File) fd.append("file", files.profileFile);
    if (files.aadhaarCardFront instanceof File) fd.append("aadhaarCardFront", files.aadhaarCardFront);
    if (files.aadhaarCardBack instanceof File) fd.append("aadhaarCardBack", files.aadhaarCardBack);
    if (files.panCard instanceof File) fd.append("panCard", files.panCard);
    try {
      const { data } = await api.patch("/venue-vendor/auth/me", fd, { headers: authHeader(token) });
      return data;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.patch("/venue-vendor/auth/me", fields, { headers: authHeader(token) });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorForgotPassword({ email }) {
  try {
    const { data } = await api.post("/venue-vendor/auth/forgot-password", { email });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorResetPassword({ token, password }) {
  try {
    const { data } = await api.post("/venue-vendor/auth/reset-password", { token, password });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

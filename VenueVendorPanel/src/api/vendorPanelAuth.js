import api, { authHeader, normalizeApiError } from "../api.js";
import { normalizeEcomProfileUser } from "./vendorEcom.js";

export async function vendorPanelSendOtp({ phone }) {
  try {
    const { data } = await api.post("/vendor-panel/auth/otp/send", { phone });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorPanelVerifyOtp({ phone, otp, panelMode }) {
  try {
    const { data } = await api.post("/vendor-panel/auth/otp/verify", { phone, otp, panelMode });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorPanelRegister(fields, files = {}) {
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
  if (Array.isArray(files.shopImages)) {
    files.shopImages.forEach((file) => {
      if (file instanceof File) fd.append("shopImages", file);
    });
  }

  try {
    const { data } = await api.post("/vendor-panel/auth/register", fd);
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorPanelRefresh(refreshToken, mode) {
  try {
    const { data } = await api.post("/vendor-panel/auth/refresh", { refreshToken, mode });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorPanelGetMe(token, mode) {
  try {
    const path = mode === "ecom" ? "/vendor/auth/me" : "/venue-vendor/auth/me";
    const { data } = await api.get(path, { headers: authHeader(token) });
    if (data?.user) {
      return {
        user: mode === "ecom" ? normalizeEcomProfileUser(data.user) : data.user,
      };
    }
    const nested = Array.isArray(data?.data) ? data.data[0]?.user : data?.data?.user;
    const user = nested || data?.data || data;
    return { user: mode === "ecom" ? normalizeEcomProfileUser(user) : user };
  } catch (error) {
    normalizeApiError(error);
  }
}

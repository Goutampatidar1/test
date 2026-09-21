import api, { normalizeApiError } from "../api.js";

function unwrapList(data) {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.orders)) return data.orders;
  if (Array.isArray(data)) return data;
  return [];
}

export async function vendorEcomGetDashboard() {
  try {
    const { data } = await api.get("/vendor/home");
    return data?.data ?? data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomListCategories({ limit = 100 } = {}) {
  try {
    const { data } = await api.get(`/vendor/categories?limit=${limit}`);
    return unwrapList(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomListSubCategories({ category, limit = 100 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (category) q.set("category", String(category));
  try {
    const { data } = await api.get(`/vendor/sub-categories?${q}`);
    return unwrapList(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomCreateProduct(fields, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      fd.append(key, String(value).trim());
    }
  });
  fd.append("variantType", "single");
  if (Array.isArray(files.images)) {
    files.images.forEach((file) => {
      if (file instanceof File) fd.append("images", file);
    });
  }
  try {
    const { data } = await api.post("/vendor/products", fd);
    return data?.data ?? data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomDeleteProduct(productId) {
  try {
    const { data } = await api.delete(`/vendor/products/${productId}`);
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomListProducts({ page = 1, limit = 20, status } = {}) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) q.set("status", status);
  try {
    const { data } = await api.get(`/vendor/products?${q}`);
    const items = unwrapList(data);
    const pagination = data?.pagination ?? data?.data?.pagination ?? null;
    return { items, pagination };
  } catch (error) {
    normalizeApiError(error);
  }
}

function unwrapProfileUser(data) {
  if (data?.user) return { user: normalizeEcomProfileUser(data.user) };
  const nested = Array.isArray(data?.data) ? data.data[0] : data?.data;
  const user = nested?.user || nested;
  return { user: normalizeEcomProfileUser(user) };
}

/** Map venue-vendor form field names to ecom vendor API field names. */
export function normalizeEcomProfileUser(user) {
  if (!user || typeof user !== "object") return user;
  return {
    ...user,
    panNumber: user.panNumber ?? user.panCardNumber ?? "",
    gstNumber: user.gstNumber ?? user.gstin ?? "",
    accountNumber: user.accountNumber ?? user.accountNo ?? "",
    ifscCode: user.ifscCode ?? user.ifsc ?? "",
    businessDescription: user.businessDescription ?? user.shopDescription ?? "",
    panCard: user.panCard ?? user.panCardFront ?? "",
    showPhoneOnApp: user.showPhoneOnApp !== false,
  };
}

function mapEcomProfileFields(fields = {}) {
  const mapped = { ...fields };
  if (mapped.panNumber !== undefined) {
    mapped.panCardNumber = mapped.panNumber;
    delete mapped.panNumber;
  }
  if (mapped.gstNumber !== undefined) {
    mapped.gstin = mapped.gstNumber;
    delete mapped.gstNumber;
  }
  if (mapped.accountNumber !== undefined) {
    mapped.accountNo = mapped.accountNumber;
    delete mapped.accountNumber;
  }
  if (mapped.ifscCode !== undefined) {
    mapped.ifsc = mapped.ifscCode;
    delete mapped.ifscCode;
  }
  if (mapped.businessDescription !== undefined) {
    mapped.shopDescription = mapped.businessDescription;
    delete mapped.businessDescription;
  }
  if (mapped.businessEmail !== undefined) {
    delete mapped.businessEmail;
  }
  return mapped;
}

function buildVendorProfileFormData(fields = {}, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) fd.append(key, String(value));
  });
  if (files.profileFile instanceof File) fd.append("file", files.profileFile);
  if (files.shopLogo instanceof File) fd.append("shopLogo", files.shopLogo);
  if (Array.isArray(files.shopImages)) {
    files.shopImages.forEach((file) => {
      if (file instanceof File) fd.append("shopImages", file);
    });
  }
  return fd;
}

export async function vendorEcomUpdateMe(fields, files = {}) {
  const payload = mapEcomProfileFields(fields);
  const hasFiles =
    files.profileFile instanceof File ||
    files.shopLogo instanceof File ||
    (Array.isArray(files.shopImages) && files.shopImages.some((file) => file instanceof File));

  if (hasFiles) {
    try {
      const { data } = await api.patch("/vendor/profile", buildVendorProfileFormData(payload, files));
      return unwrapProfileUser(data);
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.patch("/vendor/profile", payload);
    return unwrapProfileUser(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomUpdatePhoneVisibility(showPhoneOnApp) {
  try {
    const { data } = await api.patch("/vendor/profile/phone-visibility", {
      showPhoneOnApp: Boolean(showPhoneOnApp),
    });
    return unwrapProfileUser(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomUpdateShopImages({
  keepUrls = [],
  newFiles = [],
  shopLogoFile,
  removeLogo = false,
} = {}) {
  const fd = new FormData();
  fd.append("shopImages", JSON.stringify(keepUrls));
  (newFiles || []).forEach((file) => {
    if (file instanceof File) fd.append("shopImages", file);
  });
  if (shopLogoFile instanceof File) {
    fd.append("shopLogo", shopLogoFile);
  } else if (removeLogo) {
    fd.append("shopLogo", "");
  }
  try {
    const { data } = await api.patch("/vendor/profile", fd);
    return unwrapProfileUser(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomListOrders({ page = 1, limit = 20, status } = {}) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) q.set("status", status);
  try {
    const { data } = await api.get(`/vendor/orders?${q}`);
    const items = unwrapList(data);
    const pagination = data?.pagination ?? data?.data?.pagination ?? null;
    return { items, pagination };
  } catch (error) {
    normalizeApiError(error);
  }
}

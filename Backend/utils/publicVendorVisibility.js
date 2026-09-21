/**
 * Public storefront visibility for vendors / venue vendors.
 * isOpen false → hide products / venues from end users.
 * Missing isOpen (legacy docs) is treated as open.
 */

function activePublicVendorFilter(extra = {}) {
  return {
    status: "active",
    approvalStatus: "approved",
    isOpen: { $ne: false },
    ...extra,
  };
}

function isPublicVendorVisible(doc) {
  if (!doc) return false;
  if (doc.status !== "active") return false;
  if (doc.approvalStatus !== "approved") return false;
  if (doc.isOpen === false) return false;
  return true;
}

function parseIsOpenInput(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: false, error: "isOpen is required" };
  }
  if (typeof value === "boolean") {
    return { ok: true, isOpen: value };
  }
  const raw = String(value).trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "on" || raw === "open") {
    return { ok: true, isOpen: true };
  }
  if (raw === "false" || raw === "0" || raw === "off" || raw === "closed") {
    return { ok: true, isOpen: false };
  }
  return { ok: false, error: "isOpen must be true or false" };
}

module.exports = {
  activePublicVendorFilter,
  isPublicVendorVisible,
  parseIsOpenInput,
};

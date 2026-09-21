const { maskPhone } = require("./toPublicProfile");

function resolveVendorContactPhone(vendor) {
  const raw = String(vendor?.businessPhone || vendor?.phone || "").trim();
  const showPhoneOnApp = vendor?.showPhoneOnApp !== false;

  return {
    showPhoneOnApp,
    phone: showPhoneOnApp ? raw : "",
    phoneLabel: showPhoneOnApp && raw ? maskPhone(raw) : "",
    canCall: showPhoneOnApp && Boolean(raw),
  };
}

function parseShowPhoneOnAppInput(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return null;
}

module.exports = {
  resolveVendorContactPhone,
  parseShowPhoneOnAppInput,
};

const { maskPhone } = require("./toPublicProfile");
const { isPhonePlanSatisfied } = require("./phonePlan");

/**
 * Phone shown to app users. Hidden unless the vendor
 *   1. keeps the "show phone" toggle on, AND
 *   2. holds an active Show Number plan (when the admin requires one).
 * `vendor` must include phonePlanUntil (select it wherever vendors are loaded for presenters).
 */
function resolveVendorContactPhone(vendor) {
  const raw = String(vendor?.businessPhone || vendor?.phone || "").trim();
  const toggledOn = vendor?.showPhoneOnApp !== false;
  const planOk = isPhonePlanSatisfied(vendor);
  const showPhoneOnApp = toggledOn && planOk;

  return {
    showPhoneOnApp,
    phone: showPhoneOnApp ? raw : "",
    phoneLabel: showPhoneOnApp && raw ? maskPhone(raw) : "",
    canCall: showPhoneOnApp && Boolean(raw),
    /** true when the number is hidden only because no Show Number plan is active */
    phoneLockedByPlan: toggledOn && !planOk && Boolean(raw),
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
  resolveVenueVendorContact: resolveVendorContactPhone,
  parseShowPhoneOnAppInput,
};

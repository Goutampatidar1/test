const { toMobileUserProfile } = require("./toPublicProfile");
const { resolveAddressSubDistrictStatus } = require("./shippingAddress");

/**
 * Mobile user profile with resolved sub-district id and e-commerce availability.
 * Prefer subDistrictId over name when checking shipping / e-com (names can collide across cities).
 */
async function enrichMobileUserProfile(doc, req) {
  const profile = toMobileUserProfile(doc, req);
  if (!profile) return null;

  const location = await resolveAddressSubDistrictStatus({
    subDistrict: profile.subDistrict,
    subDistrictId: profile.subDistrictId,
    city: profile.city,
  });

  return {
    ...profile,
    city: profile.city || "",
    cityId: location.cityId ?? profile.cityId ?? null,
    subDistrict: location.subDistrict || profile.subDistrict || "",
    subDistrictId: location.subDistrictId ?? profile.subDistrictId ?? null,
    subDistrictEnabled: location.subDistrictEnabled,
    ecomAvailable: location.ecomAvailable,
    ecomUnavailableReason: location.ecomUnavailableReason,
    walletBalance: normalizeWalletAmount(profile.walletBalance),
    walletBalanceLabel: formatWalletAmount(profile.walletBalance),
  };
}

function normalizeWalletAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

function formatWalletAmount(value) {
  const amount = normalizeWalletAmount(value);
  return `₹${amount.toLocaleString("en-IN")}`;
}

module.exports = {
  enrichMobileUserProfile,
};

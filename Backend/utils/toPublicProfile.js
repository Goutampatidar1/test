const { formatDateOnly } = require("./dateOnly");
const { toAbsoluteUploadUrl } = require("./mediaUrl");

/**
 * Strip sensitive fields from a Mongoose document or plain object for API responses.
 */
function toPublicProfile(doc, options = {}) {
  if (!doc) {
    return null;
  }
  const o =
    typeof doc.toObject === "function"
      ? doc.toObject({ virtuals: false })
      : { ...doc };
  delete o.password;
  delete o.passwordHash;
  delete o.otp;
  delete o.otpExpire;
  delete o.resetPasswordToken;
  delete o.resetPasswordExpire;

  if (options.forMobile) {
    if (o.dob) {
      o.dob = formatDateOnly(o.dob);
    }
    if (o.profileImage) {
      o.profileImage = toAbsoluteUploadUrl(o.profileImage, options.baseUrl);
    }
  }

  return o;
}

/** Mobile user profile: YYYY-MM-DD dob + full profile image URL. */
function toMobileUserProfile(doc, req) {
  const { getPublicBaseUrl } = require("./mediaUrl");
  return toPublicProfile(doc, {
    forMobile: true,
    baseUrl: getPublicBaseUrl(req),
  });
}

const VENDOR_MEDIA_FIELDS = [
  "profileImage",
  "aadhaarCardFront",
  "aadhaarCardBack",
  "panCardFront",
  "shopLogo",
  "shopBanner",
  "shopImages",
  "shopVideos",
];

/** E-commerce vendor profile for mobile app (absolute media URLs). */
function toMobileVendorProfile(doc, req) {
  const { getPublicBaseUrl } = require("./mediaUrl");
  const baseUrl = getPublicBaseUrl(req);
  const profile = toPublicProfile(doc, { forMobile: true, baseUrl });
  if (!profile) return null;

  for (const field of VENDOR_MEDIA_FIELDS) {
    if (field === "shopImages" || field === "shopVideos") {
      if (Array.isArray(profile[field])) {
        profile[field] = profile[field].map((u) =>
          toAbsoluteUploadUrl(u, baseUrl)
        );
      }
      continue;
    }
    if (profile[field]) {
      profile[field] = toAbsoluteUploadUrl(profile[field], baseUrl);
    }
  }

  if (profile.category && typeof profile.category === "object") {
    profile.category = {
      _id: profile.category._id,
      name: profile.category.name,
      mode: profile.category.mode,
    };
  }

  return profile;
}

const DELIVERY_MEDIA_FIELDS = [
  "profileImage",
  "drivingLicenseFront",
  "drivingLicenseBack",
  "aadhaarCardFront",
  "aadhaarCardBack",
  "aadhaarCard",
];

/** Delivery partner profile for driver mobile app (absolute media URLs). */
function toMobileDeliveryProfile(doc, req) {
  const { getPublicBaseUrl } = require("./mediaUrl");
  const { formatRatingValue } = require("./productRating");
  const baseUrl = getPublicBaseUrl(req);
  const profile = toPublicProfile(doc, { forMobile: true, baseUrl });
  if (!profile) return null;

  for (const field of DELIVERY_MEDIA_FIELDS) {
    if (profile[field]) {
      profile[field] = toAbsoluteUploadUrl(profile[field], baseUrl);
    }
  }

  if (!profile.aadhaarCardFront && profile.aadhaarCard) {
    profile.aadhaarCardFront = profile.aadhaarCard;
  }

  profile.rating = formatRatingValue(doc.averageRating, doc.ratingCount);
  profile.ratingCount = Number(doc.ratingCount) || 0;
  profile.averageRating = Number(doc.averageRating) || 0;

  return profile;
}

function maskPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (!last4) return "";
  return `+91 •••••• ${last4}`;
}

module.exports = {
  toPublicProfile,
  toMobileUserProfile,
  toMobileVendorProfile,
  toMobileDeliveryProfile,
  maskPhone,
};

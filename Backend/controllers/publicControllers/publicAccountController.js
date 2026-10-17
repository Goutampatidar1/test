const { User, Vendor, DeliveryBoy } = require("../../models");
const PhoneOtp = require("../../models/other/phoneOtp");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { normalizePhone, phoneLookupValues } = require("../../utils/phone");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");

function readMobileFromBody(body = {}) {
  return (
    body.mobileNo ??
    body.mobileno ??
    body.mobile_no ??
    body.mobileNumber ??
    body.mobile ??
    body.phone ??
    body.phoneNumber ??
    ""
  );
}

function cleanupUrls(urls = []) {
  const unique = new Set(urls.filter(Boolean));
  unique.forEach((url) => deleteUploadFileByPublicUrl(url));
}

/**
 * Play Store / public account deletion — no auth token.
 * Body: { mobileNo } | { mobile } | { phone }
 */
exports.deleteAccountByMobile = asyncHandler(async (req, res) => {
  const rawMobile = readMobileFromBody(req.body);
  const phoneNorm = normalizePhone(rawMobile);
  const lookup = phoneLookupValues(phoneNorm);

  const user = await User.findOne({ phone: { $in: lookup } });
  if (!user) {
    throw new AppError("No account found with this mobile number", 404);
  }

  cleanupUrls([user.profileImage]);
  await User.findByIdAndDelete(user._id);
  await PhoneOtp.deleteMany({ phone: { $in: lookup } });

  sendSuccess(res, "Account deleted successfully", {
    deleted: true,
    role: "user",
    phone: phoneNorm,
  });
});

/** Play Store: delete vendor account by mobile (no auth token). */
exports.deleteVendorAccountByMobile = asyncHandler(async (req, res) => {
  const rawMobile = readMobileFromBody(req.body);
  const phoneNorm = normalizePhone(rawMobile);
  const lookup = phoneLookupValues(phoneNorm);

  const vendor = await Vendor.findOne({ phone: { $in: lookup } });
  if (!vendor) {
    throw new AppError("No vendor account found with this mobile number", 404);
  }

  cleanupUrls([
    vendor.profileImage,
    vendor.aadhaarCard,
    vendor.panCard,
    vendor.shopLogo,
    ...(vendor.shopImages || []),
    ...(vendor.shopVideos || []),
    vendor.shopBanner,
  ]);
  await Vendor.findByIdAndDelete(vendor._id);
  await PhoneOtp.deleteMany({ phone: { $in: lookup } });

  sendSuccess(res, "Vendor account deleted successfully", {
    deleted: true,
    role: "vendor",
    phone: phoneNorm,
  });
});

/** Play Store: delete delivery driver account by mobile (no auth token). */
exports.deleteDeliveryAccountByMobile = asyncHandler(async (req, res) => {
  const rawMobile = readMobileFromBody(req.body);
  const phoneNorm = normalizePhone(rawMobile);
  const lookup = phoneLookupValues(phoneNorm);

  const deliveryBoy = await DeliveryBoy.findOne({ phone: { $in: lookup } });
  if (!deliveryBoy) {
    throw new AppError("No delivery partner account found with this mobile number", 404);
  }

  cleanupUrls([
    deliveryBoy.profileImage,
    deliveryBoy.drivingLicenseFront,
    deliveryBoy.drivingLicenseBack,
  ]);
  await DeliveryBoy.findByIdAndDelete(deliveryBoy._id);
  await PhoneOtp.deleteMany({ phone: { $in: lookup } });

  sendSuccess(res, "Delivery account deleted successfully", {
    deleted: true,
    role: "delivery",
    phone: phoneNorm,
  });
});

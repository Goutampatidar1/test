const { Vendor } = require("../../models");
const Category = require("../../models/other/category");
const PhoneOtp = require("../../models/other/phoneOtp");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signVendorRegistrationToken,
  verifyVendorRegistrationToken,
  withTokenExpiryMeta,
} = require("../../utils/jwt");
const { toMobileVendorProfile, maskPhone } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { normalizePhone } = require("../../utils/phone");
const { resolveVendorApprovalRequired } = require("../../utils/vendorApproval");
const { queueNotifyAllAdmins } = require("../../utils/adminInbox");
const { generateOtp, otpExpiryDate, registrationSessionExpiryDate, isOtpExpired, OTP_TTL_MS, REGISTER_SESSION_TTL_MS, devOnlyOtp } = require("../../utils/otp");
const { sendSuccess } = require("../../utils/apiResponse");
const { assertObjectId } = require("../../utils/assertObjectId");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const {
  VENDOR_UPLOAD_DIR,
  uploadPathFromFiles,
  uploadPathsFromFiles,
  uploadPathFromFieldAliases,
  uploadPathsFromFieldAliases,
  parseStringArrayField,
  cleanupUploadedVendorFiles,
} = require("../../utils/vendorFileUpload");

const MAX_SHOP_IMAGES = 5;
const OTP_PURPOSE_REGISTER = "vendor_register";
const OTP_PURPOSE_LOGIN = "vendor_login";
const ALLOWED_OTP_PURPOSES = new Set([OTP_PURPOSE_REGISTER, OTP_PURPOSE_LOGIN]);
const ALLOWED_GENDERS = new Set(["male", "female", "other"]);

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeOptionalEmail(email) {
  if (email === undefined || email === null) return undefined;
  const norm = String(email).trim().toLowerCase();
  return norm || undefined;
}

function normalizeOptionalGender(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!ALLOWED_GENDERS.has(normalized)) {
    throw new AppError("Invalid gender. Use male, female, or other", 400);
  }
  return normalized;
}

/** Mobile login: allow pending approval; block rejected/suspended/blocked/inactive. */
function assertVendorCanAuthenticate(vendor) {
  if (vendor.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }
  if (vendor.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
  if (vendor.approvalStatus === "rejected") {
    const reason = String(vendor.rejectionReason || "").trim();
    throw new AppError(
      reason ? `Vendor application was rejected: ${reason}` : "Vendor application was rejected",
      403
    );
  }
  if (vendor.approvalStatus === "suspended") {
    throw new AppError("Vendor account is suspended", 403);
  }
}

async function findVendorByPhone(phoneRaw) {
  const phoneNorm = normalizePhone(phoneRaw);
  let vendor = await Vendor.findOne({ phone: phoneNorm });
  if (vendor) {
    return { vendor, phoneNorm };
  }

  const digits = String(phoneRaw ?? "").replace(/\D/g, "");
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    const variants = [last10, `91${last10}`, `+91${last10}`, `0${last10}`];
    vendor = await Vendor.findOne({ phone: { $in: variants } });
    if (vendor) {
      return { vendor, phoneNorm: last10 };
    }
  }

  return { vendor: null, phoneNorm };
}

async function saveVendorPhoneOtp(phoneNorm, otpPurpose, otp, otpExpire) {
  return PhoneOtp.findOneAndUpdate(
    { phone: phoneNorm },
    { phone: phoneNorm, otp, otpExpire, purpose: otpPurpose, verified: false },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function verifyVendorLoginOtp(phoneNorm, otpValue) {
  const record = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: OTP_PURPOSE_LOGIN,
  });
  if (!record || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.deleteOne({ _id: record._id });
}

async function verifyVendorRegisterOtp(phoneNorm, otpValue) {
  const record = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: OTP_PURPOSE_REGISTER,
  });
  if (!record || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.findOneAndUpdate(
    { _id: record._id },
    {
      $set: {
        verified: true,
        otpExpire: registrationSessionExpiryDate(),
      },
      $unset: { otp: "" },
    }
  );
}

async function assertVendorRegisterPhoneVerified(phoneNorm) {
  const record = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: OTP_PURPOSE_REGISTER,
    verified: true,
  });
  if (!record) {
    throw new AppError("Please verify OTP first", 400);
  }
  if (isOtpExpired(record.otpExpire)) {
    await PhoneOtp.deleteOne({ _id: record._id });
    throw new AppError(
      "Registration session expired. Please verify your mobile number again",
      400
    );
  }
}

async function assertActiveEcomCategory(categoryId) {
  assertObjectId(categoryId, "Invalid category");
  const cat = await Category.findOne({
    _id: categoryId,
    status: "active",
    mode: "ecom",
  })
    .select("_id name mode")
    .lean();
  if (!cat) {
    throw new AppError("Category not found", 404);
  }
  return cat;
}

function issueAuthTokens(vendor) {
  const payload = {
    sub: vendor._id.toString(),
    role: "vendor",
  };
  return withTokenExpiryMeta({
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
}

function authSuccessResponse(req, res, statusCode, message, vendor) {
  const tokens = issueAuthTokens(vendor);
  return res.status(statusCode).json({
    status: true,
    message: message || "",
    data: [{ user: vendor ? toMobileVendorProfile(vendor, req) : null }],
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
  });
}

function collectRegisterUploads(req, body) {
  const aadhaarCardFront = uploadPathFromFieldAliases(req, [
    "aadhaarCardFront",
    "aadhaarCard",
  ]);
  const panCardFront = uploadPathFromFieldAliases(req, ["panCardFront", "panCard"]);
  const shopLogo = uploadPathFromFiles(req, "shopLogo");
  const shopImagesFromFiles = uploadPathsFromFieldAliases(req, [
    "shopImages",
    "shop_banner_Images",
    "shop_banner_images",
  ]);
  const shopImagesFromBody =
    parseStringArrayField(body.shopImages) ??
    parseStringArrayField(body.shop_banner_Images);
  const shopImages = [...(shopImagesFromBody ?? []), ...shopImagesFromFiles];

  if (shopImages.length > MAX_SHOP_IMAGES) {
    throw new AppError(`You can upload at most ${MAX_SHOP_IMAGES} shop images`, 400);
  }

  return {
    profileImage:
      uploadPathFromFieldAliases(req, ["profile_image", "profileImage", "file"]) ??
      publicUploadPathFromFile(req, VENDOR_UPLOAD_DIR),
    aadhaarCardFront,
    aadhaarCardBack: uploadPathFromFiles(req, "aadhaarCardBack"),
    panCardFront,
    shopLogo,
    shopImages,
    shopBanner: uploadPathFromFiles(req, "shopBanner"),
  };
}

async function createVendorFromRegister(req, phoneNorm, body) {
  const name = normalizeRequired(body.name);
  const businessName = normalizeRequired(body.businessName);
  const categoryRaw = body.category;
  let categoryId = null;

  if (!name) throw new AppError("Full name is required", 400);
  if (!businessName) throw new AppError("Shop name is required", 400);

  if (
    categoryRaw !== undefined &&
    categoryRaw !== null &&
    String(categoryRaw).trim() !== ""
  ) {
    await assertActiveEcomCategory(categoryRaw);
    categoryId = categoryRaw;
  }

  const uploads = collectRegisterUploads(req, body);
  if (!uploads.shopImages.length) {
    cleanupUploadedVendorFiles(req);
    throw new AppError("At least one shop or banner image is required", 400);
  }

  const emailNorm = normalizeOptionalEmail(body.email);
  const phoneTaken = await Vendor.findOne({ phone: phoneNorm });
  if (phoneTaken) {
    cleanupUploadedVendorFiles(req);
    throw new AppError("Phone number is already registered", 409);
  }

  if (emailNorm) {
    const emailTaken = await Vendor.findOne({ email: emailNorm });
    if (emailTaken) {
      cleanupUploadedVendorFiles(req);
      throw new AppError("Email is already registered", 409);
    }
  }

  const businessPhone = body.businessPhone
    ? normalizePhone(body.businessPhone)
    : phoneNorm;

  const gender = normalizeOptionalGender(body.gender);
  const { approvalStatus } = await resolveVendorApprovalRequired();

  try {
    return await Vendor.create({
      name,
      ...(emailNorm ? { email: emailNorm } : {}),
      phone: phoneNorm,
      businessName,
      ...(categoryId ? { category: categoryId } : {}),
      businessPhone,
      ...(gender ? { gender } : {}),
      gstin: normalizeOptional(body.gstin),
      businessAddress: normalizeOptional(body.businessAddress),
      country: normalizeOptional(body.country),
      state: normalizeOptional(body.state),
      city: normalizeOptional(body.city),
      subDistrict: normalizeOptional(body.subDistrict ?? body.sub_district),
      pincode: normalizeOptional(body.pincode),
      aadhaarCardFront: uploads.aadhaarCardFront,
      aadhaarCardBack: uploads.aadhaarCardBack,
      panCardFront: uploads.panCardFront,
      shopLogo: uploads.shopLogo,
      shopImages: uploads.shopImages,
      shopBanner: uploads.shopBanner,
      profileImage: uploads.profileImage,
      fcm_id: normalizeOptional(body.fcm_id),
      approvalStatus,
      status: "active",
      isOpen: true,
    });
  } catch (err) {
    cleanupUploadedVendorFiles(req);
    throw err;
  }
}

exports.sendOtp = asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body || {};
  const phoneNorm = normalizePhone(phone);
  const otpPurpose = String(purpose ?? OTP_PURPOSE_REGISTER).trim().toLowerCase();

  if (!ALLOWED_OTP_PURPOSES.has(otpPurpose)) {
    throw new AppError("Invalid purpose. Use vendor_register or vendor_login", 400);
  }

  const { vendor: existing } = await findVendorByPhone(phone);

  if (otpPurpose === OTP_PURPOSE_LOGIN) {
    if (!existing) {
      throw new AppError("No account found with this phone number. Please sign up", 404);
    }
    assertVendorCanAuthenticate(existing);
  }

  if (otpPurpose === OTP_PURPOSE_REGISTER && existing) {
    throw new AppError("Phone number is already registered. Please log in", 409);
  }

  const otp = generateOtp();
  const otpExpire = otpExpiryDate();
  await saveVendorPhoneOtp(phoneNorm, otpPurpose, otp, otpExpire);

  sendSuccess(res, "OTP sent successfully", {
    phone: phoneNorm,
    purpose: otpPurpose,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendAfterSeconds: 30,
    otp: devOnlyOtp(otp),
  });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp, purpose, fcm_id } = req.body || {};
  const phoneNorm = normalizePhone(phone);
  const otpPurpose = String(purpose ?? OTP_PURPOSE_REGISTER).trim().toLowerCase();
  const otpValue = String(otp ?? "").trim();

  if (!otpValue) {
    throw new AppError("OTP is required", 400);
  }
  if (!ALLOWED_OTP_PURPOSES.has(otpPurpose)) {
    throw new AppError("Invalid purpose. Use vendor_register or vendor_login", 400);
  }

  if (otpPurpose === OTP_PURPOSE_LOGIN) {
    await verifyVendorLoginOtp(phoneNorm, otpValue);
    const { vendor } = await findVendorByPhone(phone);
    if (!vendor) {
      throw new AppError("Account not found", 404);
    }
    assertVendorCanAuthenticate(vendor);
    if (fcm_id !== undefined) {
      vendor.fcm_id = normalizeOptional(fcm_id);
      await vendor.save();
    }
    const fresh = await Vendor.findById(vendor._id).populate("category", "name mode");
    authSuccessResponse(req, res, 200, "Login successful", fresh);
    return;
  }

  const phoneTaken = await Vendor.findOne({ phone: phoneNorm });
  if (phoneTaken) {
    throw new AppError("Phone number is already registered. Please log in", 409);
  }

  await verifyVendorRegisterOtp(phoneNorm, otpValue);
  const registrationToken = signVendorRegistrationToken(phoneNorm);

  sendSuccess(res, "OTP verified", {
    phone: phoneNorm,
    phoneMasked: maskPhone(phoneNorm),
    otpVerified: true,
    profileComplete: false,
    registrationToken,
    verifiedExpiresInSeconds: Math.floor(REGISTER_SESSION_TTL_MS / 1000),
  });
});

exports.completeRegister = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { phone, registrationToken, token } = body;

  let phoneNorm;
  if (phone) {
    phoneNorm = normalizePhone(phone);
    await assertVendorRegisterPhoneVerified(phoneNorm);
  } else {
    const registrationTokenValue = registrationToken || token;
    if (!registrationTokenValue) {
      throw new AppError("phone is required (same number used for OTP)", 400);
    }
    try {
      const payload = verifyVendorRegistrationToken(registrationTokenValue);
      phoneNorm = normalizePhone(payload.phone);
      await assertVendorRegisterPhoneVerified(phoneNorm);
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError("Registration session expired. Please verify OTP again", 401);
    }
  }

  const vendor = await createVendorFromRegister(req, phoneNorm, body);
  await PhoneOtp.deleteMany({ phone: phoneNorm, purpose: OTP_PURPOSE_REGISTER });

  queueNotifyAllAdmins({
    type: "vendor_registered",
    title: "New vendor registered",
    message: `${vendor.businessName || vendor.name || "A vendor"} submitted a registration request.`,
    metadata: {
      vendorId: String(vendor._id),
      linkPath: `/admin/vendors/${vendor._id}`,
    },
  });

  const populated = await Vendor.findById(vendor._id).populate("category", "name mode");
  authSuccessResponse(req, res, 201, "Registration submitted successfully", populated);
});

exports.checkAvailability = asyncHandler(async (req, res) => {
  const { email, phone } = req.body || {};
  const result = {};

  if (email !== undefined && String(email).trim()) {
    const emailNorm = String(email).trim().toLowerCase();
    const exists = await Vendor.findOne({ email: emailNorm }).select("_id").lean();
    result.email = { available: !exists };
  }

  if (phone !== undefined && String(phone).trim()) {
    const phoneNorm = normalizePhone(phone);
    const exists = await Vendor.findOne({ phone: phoneNorm }).select("_id").lean();
    result.phone = { available: !exists };
  }

  if (!result.email && !result.phone) {
    throw new AppError("Provide email and/or phone to check", 400);
  }

  sendSuccess(res, "Availability checked", result);
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    throw new AppError("Refresh token is required", 400);
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  if (payload.role !== "vendor") {
    throw new AppError("Forbidden", 403);
  }

  const vendor = await Vendor.findById(payload.sub);
  if (!vendor) {
    throw new AppError("Account not found", 401);
  }

  assertVendorCanAuthenticate(vendor);

  const tokens = issueAuthTokens(vendor);
  sendSuccess(res, "Token refreshed", tokens);
});

exports.getMeMobile = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.user._id).populate("category", "name mode");
  sendSuccess(res, "Profile fetched", { user: toMobileVendorProfile(vendor, req) });
});

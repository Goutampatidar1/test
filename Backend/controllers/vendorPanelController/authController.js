const Category = require("../../models/other/category");
const PhoneOtp = require("../../models/other/phoneOtp");
const SubDistrict = require("../../models/other/subDistrict");
const { Vendor, VenueVendor } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { normalizePhone } = require("../../utils/phone");
const { resolveVendorApprovalRequired } = require("../../utils/vendorApproval");
const { queueNotifyAllAdmins } = require("../../utils/adminInbox");
const {
  resolveOtpForPhone,
  otpExpiryDate,
  registrationSessionExpiryDate,
  isOtpExpired,
  OTP_TTL_MS,
  REGISTER_SESSION_TTL_MS,
  devOnlyOtp,
} = require("../../utils/otp");
const { sendSuccess } = require("../../utils/apiResponse");
const { verifyRefreshToken } = require("../../utils/jwt");
const {
  cleanupUploadedVendorFiles,
  uploadPathFromFieldAliases,
  uploadPathFromFiles,
  uploadPathsFromFieldAliases,
  parseStringArrayField,
  VENDOR_UPLOAD_DIR,
} = require("../../utils/vendorFileUpload");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const {
  VENDOR_PANEL_OTP_PURPOSE,
  normalizeVendorPanelType,
  needsEcomAccount,
  needsServiceAccount,
  findPanelAccountsByPhone,
  assertPanelAccountCanAuthenticate,
  buildPanelSession,
  issueEcomTokens,
  issueServiceTokens,
} = require("../../utils/vendorPanelAccount");

const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SHOP_IMAGES = 5;
const REGISTER_OTP_PURPOSE = "vendor_panel_register";

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

function cleanupAllUploadedFiles(req) {
  cleanupUploadedVendorFiles(req);
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

function collectEcomUploads(req, body) {
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
    aadhaarCardFront: uploadPathFromFieldAliases(req, ["aadhaarCardFront", "aadhaarCard"]),
    aadhaarCardBack: uploadPathFromFiles(req, "aadhaarCardBack"),
    panCardFront: uploadPathFromFieldAliases(req, ["panCardFront", "panCard"]),
    shopLogo: uploadPathFromFiles(req, "shopLogo"),
    shopImages,
    shopBanner: uploadPathFromFiles(req, "shopBanner"),
  };
}

async function savePanelPhoneOtp(phoneNorm, otp, otpExpire, purpose = VENDOR_PANEL_OTP_PURPOSE) {
  return PhoneOtp.findOneAndUpdate(
    { phone: phoneNorm },
    {
      phone: phoneNorm,
      otp,
      otpExpire,
      purpose,
      verified: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function assertCanResendPanelOtp(phoneNorm, purpose = VENDOR_PANEL_OTP_PURPOSE) {
  const existing = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose,
  });
  if (!existing) return;

  const elapsed = Date.now() - new Date(existing.updatedAt).getTime();
  if (elapsed < RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    throw new AppError(
      `Please wait ${waitSeconds} seconds before requesting a new OTP`,
      429
    );
  }
}

async function verifyPanelPhoneOtp(phoneNorm, otpValue) {
  const record = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: VENDOR_PANEL_OTP_PURPOSE,
  });
  if (!record || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.deleteOne({ _id: record._id });
}

function parseRegisterPhone(raw) {
  try {
    return normalizePhone(raw);
  } catch {
    throw new AppError("Invalid phone number. Use a 10-digit mobile number", 400);
  }
}

async function assertPhoneFreeForPanelType(phoneNorm, vendorPanelType) {
  const { vendor, venueVendor } = await findPanelAccountsByPhone(phoneNorm);
  if (needsEcomAccount(vendorPanelType) && vendor) {
    throw new AppError("An e-commerce vendor account already exists for this phone number. Please log in", 409);
  }
  if (needsServiceAccount(vendorPanelType) && venueVendor) {
    throw new AppError("A service provider account already exists for this phone number. Please log in", 409);
  }
}

async function assertRegisterPhoneVerified(phoneNorm) {
  const record = await PhoneOtp.findOne({ phone: phoneNorm, purpose: REGISTER_OTP_PURPOSE, verified: true });
  if (!record) {
    throw new AppError("Please verify your mobile number with OTP first", 400);
  }
  if (isOtpExpired(record.otpExpire)) {
    await PhoneOtp.deleteOne({ _id: record._id });
    throw new AppError("Registration session expired. Please verify your mobile number again", 400);
  }
}

/** City + sub-district picked from the admin's master list; names are stored the way the user app matches them. */
async function resolveRegisterLocation(body) {
  const subDistrictId = String(body.subDistrictId ?? body.sub_district_id ?? "").trim();
  if (!subDistrictId) throw new AppError("Sub-district is required", 400);
  assertObjectId(subDistrictId, "Invalid sub-district");

  const row = await SubDistrict.findOne({ _id: subDistrictId, status: "active" })
    .populate({ path: "city", select: "name state status", populate: { path: "state", select: "name" } })
    .lean();
  if (!row || !row.city || row.city.status === "inactive") {
    throw new AppError("Sub-district not found", 404);
  }

  const cityId = String(body.cityId ?? body.city_id ?? "").trim();
  if (cityId && cityId !== String(row.city._id)) {
    throw new AppError("Sub-district does not belong to the selected city", 400);
  }

  return {
    state: row.city.state?.name || null,
    city: row.city.name,
    subDistrict: row.name,
  };
}

async function createEcomAccount(req, phoneNorm, body, vendorPanelType, location) {
  const name = normalizeRequired(body.name);
  const businessName = normalizeRequired(body.businessName);
  const categoryRaw = body.category;

  if (!name) throw new AppError("Full name is required", 400);
  if (!businessName) throw new AppError("Shop name is required", 400);
  if (vendorPanelType !== "both") {
    if (!categoryRaw) throw new AppError("Shop category is required", 400);
    await assertActiveEcomCategory(categoryRaw);
  } else if (categoryRaw) {
    await assertActiveEcomCategory(categoryRaw);
  }

  const uploads = collectEcomUploads(req, body);
  if (!uploads.shopImages.length) {
    throw new AppError("At least one shop image is required", 400);
  }

  const emailNorm = normalizeOptionalEmail(body.email);
  const { vendor: existing } = await findPanelAccountsByPhone(phoneNorm);
  if (existing) {
    throw new AppError("An e-commerce vendor account already exists for this phone number", 409);
  }

  if (emailNorm) {
    const emailTaken = await Vendor.findOne({ email: emailNorm });
    if (emailTaken) {
      throw new AppError("Email is already registered", 409);
    }
  }

  const { approvalStatus } = await resolveVendorApprovalRequired();

  return Vendor.create({
    name,
    ...(emailNorm ? { email: emailNorm } : {}),
    phone: phoneNorm,
    businessName,
    ...(categoryRaw ? { category: categoryRaw } : {}),
    businessPhone: body.businessPhone ? normalizePhone(body.businessPhone) : phoneNorm,
    businessAddress: normalizeOptional(body.businessAddress),
    ...location,
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
    vendorPanelType,
  });
}

async function createServiceAccount(req, phoneNorm, body, vendorPanelType, location) {
  const name = normalizeRequired(body.name);
  const businessName = normalizeRequired(body.businessName);
  const emailNorm = normalizeOptionalEmail(body.email);

  if (!name) throw new AppError("Full name is required", 400);
  if (!businessName) throw new AppError("Business name is required", 400);
  if (!normalizeOptional(body.businessAddress)) {
    throw new AppError("Business address is required", 400);
  }

  const { venueVendor: existing } = await findPanelAccountsByPhone(phoneNorm);
  if (existing) {
    throw new AppError("A service provider account already exists for this phone number", 409);
  }

  if (emailNorm) {
    const emailTaken = await VenueVendor.findOne({ email: emailNorm });
    if (emailTaken) {
      throw new AppError("Email is already registered", 409);
    }
  }

  const documentUploads = {
    aadhaarCardFront: uploadPathFromFieldAliases(req, ["aadhaarCardFront", "aadhaarCard"]),
    aadhaarCardBack: uploadPathFromFiles(req, "aadhaarCardBack"),
    panCard: uploadPathFromFieldAliases(req, ["panCardFront", "panCard"]),
    profileImage:
      uploadPathFromFieldAliases(req, ["file", "profileImage"]) ??
      publicUploadPathFromFile(req, VENDOR_UPLOAD_DIR),
  };

  if (!documentUploads.aadhaarCardFront || !documentUploads.aadhaarCardBack) {
    throw new AppError("Aadhaar front and back images are required", 400);
  }

  const { approvalStatus } = await resolveVendorApprovalRequired();

  // Set phoneCanonical explicitly so login lookups never miss service-only accounts
  // (field is select:false; rely on it being persisted, not only via pre-validate).
  const created = await VenueVendor.create({
    name,
    ...(emailNorm ? { email: emailNorm } : {}),
    phone: phoneNorm,
    phoneCanonical: phoneNorm,
    businessName,
    businessPhone: normalizeOptional(body.businessPhone) || phoneNorm,
    businessEmail: normalizeOptional(body.businessEmail)?.toLowerCase() ?? null,
    businessAddress: normalizeOptional(body.businessAddress),
    businessDescription: normalizeOptional(body.businessDescription),
    ...location,
    aadhaarCardFront: documentUploads.aadhaarCardFront,
    aadhaarCardBack: documentUploads.aadhaarCardBack,
    aadhaarCard: documentUploads.aadhaarCardFront,
    panCard: documentUploads.panCard,
    profileImage: documentUploads.profileImage,
    fcm_id: normalizeOptional(body.fcm_id),
    approvalStatus,
    status: "active",
    isOpen: true,
    vendorPanelType,
  });

  // Re-fetch so callers always see persisted phone fields used by OTP login.
  return VenueVendor.findById(created._id);
}

function panelAuthResponse(res, statusCode, message, session, extra = {}) {
  return res.status(statusCode).json({
    status: true,
    message,
    ...session,
    ...extra,
  });
}

exports.register = asyncHandler(async (req, res) => {
  const body = req.body || {};

  let phoneNorm;
  let vendorPanelType;
  let location;
  try {
    phoneNorm = parseRegisterPhone(body.phone);
    vendorPanelType = normalizeVendorPanelType(body.vendorPanelType ?? body.vendorType);
    await assertRegisterPhoneVerified(phoneNorm);
    location = await resolveRegisterLocation(body);
  } catch (err) {
    cleanupAllUploadedFiles(req);
    throw err;
  }

  const wantsEcom = needsEcomAccount(vendorPanelType);
  const wantsService = needsServiceAccount(vendorPanelType);

  let vendor = null;
  let venueVendor = null;

  try {
    if (wantsEcom) {
      vendor = await createEcomAccount(req, phoneNorm, body, vendorPanelType, location);
    }
    if (wantsService) {
      venueVendor = await createServiceAccount(req, phoneNorm, body, vendorPanelType, location);
    }
  } catch (err) {
    cleanupAllUploadedFiles(req);
    throw err;
  }

  await PhoneOtp.deleteMany({ phone: phoneNorm, purpose: REGISTER_OTP_PURPOSE });

  if (vendor && venueVendor) {
    queueNotifyAllAdmins({
      type: "vendor_registered",
      title: "New vendor registered (E-commerce + Service)",
      message: `${vendor.businessName || vendor.name || "A vendor"} submitted a registration request for both e-commerce and service.`,
      metadata: {
        vendorId: String(vendor._id),
        venueVendorId: String(venueVendor._id),
        vendorPanelType,
        linkPath: `/admin/vendors/${vendor._id}`,
      },
    });
  } else if (vendor) {
    queueNotifyAllAdmins({
      type: "vendor_registered",
      title: "New e-commerce vendor registered",
      message: `${vendor.businessName || vendor.name || "A vendor"} submitted a registration request.`,
      metadata: {
        vendorId: String(vendor._id),
        linkPath: `/admin/vendors/${vendor._id}`,
      },
    });
  } else if (venueVendor) {
    queueNotifyAllAdmins({
      type: "venue_vendor_registered",
      title: "New service provider registered",
      message: `${venueVendor.businessName || venueVendor.name || "A service provider"} submitted a registration request.`,
      metadata: {
        venueVendorId: String(venueVendor._id),
        linkPath: `/admin/venue-vendors/${venueVendor._id}`,
      },
    });
  }

  if (vendor) {
    vendor = await Vendor.findById(vendor._id).populate("category", "name mode");
  }

  const session = buildPanelSession({ vendor, venueVendor, req });
  const { approvalRequired } = await resolveVendorApprovalRequired();

  panelAuthResponse(res, 201, "Registration submitted successfully", session, {
    approvalRequired,
  });
});

/** Registration step 2: OTP to a number that has no account yet for the chosen vendor type. */
exports.sendRegisterOtp = asyncHandler(async (req, res) => {
  const { phone, mobile } = req.body || {};
  const phoneRaw = phone ?? mobile;
  if (!phoneRaw) throw new AppError("Mobile number is required", 400);

  const phoneNorm = parseRegisterPhone(phoneRaw);
  const vendorPanelType = normalizeVendorPanelType(req.body.vendorPanelType ?? req.body.vendorType);
  await assertPhoneFreeForPanelType(phoneNorm, vendorPanelType);
  await assertCanResendPanelOtp(phoneNorm, REGISTER_OTP_PURPOSE);

  const otp = resolveOtpForPhone(phoneNorm);
  await savePanelPhoneOtp(phoneNorm, otp, otpExpiryDate(), REGISTER_OTP_PURPOSE);

  sendSuccess(res, "OTP sent successfully", {
    phone: phoneNorm,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otp: devOnlyOtp(otp),
  });
});

exports.verifyRegisterOtp = asyncHandler(async (req, res) => {
  const { phone, mobile, otp } = req.body || {};
  const phoneRaw = phone ?? mobile;
  const otpValue = String(otp ?? "").trim();
  if (!phoneRaw) throw new AppError("Mobile number is required", 400);
  if (!otpValue) throw new AppError("OTP is required", 400);

  const phoneNorm = parseRegisterPhone(phoneRaw);
  const record = await PhoneOtp.findOne({ phone: phoneNorm, purpose: REGISTER_OTP_PURPOSE });
  if (!record || record.verified || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.updateOne(
    { _id: record._id },
    { $set: { verified: true, otpExpire: registrationSessionExpiryDate() }, $unset: { otp: "" } }
  );

  sendSuccess(res, "Mobile number verified", {
    phone: phoneNorm,
    otpVerified: true,
    verifiedExpiresInSeconds: Math.floor(REGISTER_SESSION_TTL_MS / 1000),
  });
});

exports.sendOtp = asyncHandler(async (req, res) => {
  const { phone, mobile } = req.body || {};
  const phoneRaw = phone ?? mobile;
  if (!phoneRaw) {
    throw new AppError("Mobile number is required", 400);
  }

  const { vendor, venueVendor, phoneNorm } = await findPanelAccountsByPhone(phoneRaw);
  if (!vendor && !venueVendor) {
    throw new AppError("No vendor account found with this mobile number", 404);
  }

  assertPanelAccountCanAuthenticate(vendor, "E-commerce account");
  assertPanelAccountCanAuthenticate(venueVendor, "Service provider account");

  await assertCanResendPanelOtp(phoneNorm);

  const otp = resolveOtpForPhone(phoneNorm);
  const otpExpire = otpExpiryDate();
  await savePanelPhoneOtp(phoneNorm, otp, otpExpire);

  sendSuccess(res, "OTP sent successfully", {
    phone: phoneNorm,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otp: devOnlyOtp(otp),
  });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, mobile, otp, panelMode } = req.body || {};
  const phoneRaw = phone ?? mobile;
  const otpValue = String(otp ?? "").trim();

  if (!phoneRaw) {
    throw new AppError("Mobile number is required", 400);
  }
  if (!otpValue) {
    throw new AppError("OTP is required", 400);
  }

  const { vendor, venueVendor, phoneNorm } = await findPanelAccountsByPhone(phoneRaw);
  if (!vendor && !venueVendor) {
    throw new AppError("Account not found", 404);
  }

  await verifyPanelPhoneOtp(phoneNorm, otpValue);
  assertPanelAccountCanAuthenticate(vendor, "E-commerce account");
  assertPanelAccountCanAuthenticate(venueVendor, "Service provider account");

  let populatedVendor = vendor;
  if (populatedVendor) {
    populatedVendor = await Vendor.findById(vendor._id).populate("category", "name mode");
  }

  const session = buildPanelSession({
    vendor: populatedVendor,
    venueVendor,
    panelMode,
    req,
  });

  panelAuthResponse(res, 200, "Login successful", session);
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken, mode } = req.body || {};
  if (!refreshToken) {
    throw new AppError("Refresh token is required", 400);
  }

  const panelMode = String(mode ?? "service").trim().toLowerCase();
  if (panelMode !== "ecom" && panelMode !== "service") {
    throw new AppError("Invalid mode. Use ecom or service", 400);
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  if (panelMode === "ecom") {
    if (payload.role !== "vendor") {
      throw new AppError("Forbidden", 403);
    }
    const vendor = await Vendor.findById(payload.sub).populate("category", "name mode");
    if (!vendor) {
      throw new AppError("Account not found", 401);
    }
    assertPanelAccountCanAuthenticate(vendor, "E-commerce account");
    sendSuccess(res, "Token refreshed", issueEcomTokens(vendor));
    return;
  }

  if (payload.role !== "venueVendor") {
    throw new AppError("Forbidden", 403);
  }
  const venueVendor = await VenueVendor.findById(payload.sub);
  if (!venueVendor) {
    throw new AppError("Account not found", 401);
  }
  assertPanelAccountCanAuthenticate(venueVendor, "Service provider account");
  sendSuccess(res, "Token refreshed", issueServiceTokens(venueVendor));
});

exports.getSession = asyncHandler(async (req, res) => {
  const { vendor, venueVendor } = await findPanelAccountsByPhone(req.body?.phone || req.query?.phone);
  if (!vendor && !venueVendor) {
    throw new AppError("Account not found", 404);
  }

  let populatedVendor = vendor;
  if (populatedVendor) {
    populatedVendor = await Vendor.findById(vendor._id).populate("category", "name mode");
  }

  const session = buildPanelSession({
    vendor: populatedVendor,
    venueVendor,
    panelMode: req.body?.panelMode || req.query?.panelMode,
    req,
  });

  sendSuccess(res, "Session fetched", session);
});

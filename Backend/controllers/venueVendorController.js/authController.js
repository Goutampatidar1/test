const crypto = require("crypto");
const { VenueVendor } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword, comparePassword } = require("../../utils/password");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  withTokenExpiryMeta,
} = require("../../utils/jwt");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { normalizePhone, phoneLookupValues } = require("../../utils/phone");
const PhoneOtp = require("../../models/other/phoneOtp");
const { generateOtp, otpExpiryDate, isOtpExpired, OTP_TTL_MS, devOnlyOtp } = require("../../utils/otp");
const { sendSuccess } = require("../../utils/apiResponse");
const {
  resolveVenueVendorDocumentUploads,
  listVenueVendorUploadedPaths,
  assignVenueVendorAadhaarFront,
  assignVenueVendorAadhaarBack,
  assignVenueVendorPanCard,
} = require("../../utils/venueVendorDocuments");
const { resolveVendorApprovalRequired } = require("../../utils/vendorApproval");
const { queueNotifyAllAdmins } = require("../../utils/adminInbox");
const { isValidEmail } = require("../../utils/email");

const VENUE_VENDOR_OTP_PURPOSE = "venue_vendor_login";
const RESEND_COOLDOWN_MS = 30 * 1000;

const REQUIRED_FIELDS = ["name", "phone", "businessName"];
const UPLOAD_FOLDER = "venue-vendor";

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function uploadPathFromFiles(req, field) {
  const file = req.files?.[field]?.[0];
  if (!file) return undefined;
  return `/uploads/${UPLOAD_FOLDER}/${file.filename}`;
}

function uploadedPaths(req) {
  return listVenueVendorUploadedPaths(req, UPLOAD_FOLDER);
}

function cleanupUploadedFiles(req) {
  uploadedPaths(req).forEach((u) => deleteUploadFileByPublicUrl(u));
}

async function saveVenueVendorPhoneOtp(phoneNorm, otp, otpExpire) {
  return PhoneOtp.findOneAndUpdate(
    { phone: phoneNorm },
    {
      phone: phoneNorm,
      otp,
      otpExpire,
      purpose: VENUE_VENDOR_OTP_PURPOSE,
      verified: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function assertCanResendVenueVendorOtp(phoneNorm) {
  const existing = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: VENUE_VENDOR_OTP_PURPOSE,
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

async function verifyVenueVendorPhoneOtp(phoneNorm, otpValue) {
  const record = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: VENUE_VENDOR_OTP_PURPOSE,
  });
  if (!record || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.deleteOne({ _id: record._id });
  return record;
}

function assertVenueVendorCanLogin(venueVendor) {
  if (venueVendor.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }
  if (venueVendor.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
  if (venueVendor.approvalStatus === "pending") {
    throw new AppError("Account is pending approval", 403);
  }
  if (venueVendor.approvalStatus === "rejected") {
    const reason = String(venueVendor.rejectionReason || "").trim();
    throw new AppError(
      reason ? `Venue vendor application was rejected: ${reason}` : "Venue vendor application was rejected",
      403
    );
  }
  if (venueVendor.approvalStatus === "suspended") {
    throw new AppError("Venue vendor account is suspended", 403);
  }
  if (venueVendor.approvalStatus !== "approved") {
    throw new AppError("Venue vendor account is not approved", 403);
  }
}

/** Lookup in `venuevendors` (VenueVendor model) by normalized or legacy phone formats. */
async function findVenueVendorByPhone(phoneRaw) {
  const phoneNorm = normalizePhone(phoneRaw);
  const venueVendor = await VenueVendor.findOne({
    $or: [
      { phoneCanonical: phoneNorm },
      { phone: { $in: phoneLookupValues(phoneNorm) } },
    ],
  });
  return { venueVendor, phoneNorm };
}

function issueAuthTokens(venueVendor) {
  const payload = {
    sub: venueVendor._id.toString(),
    role: "venueVendor",
  };
  return withTokenExpiryMeta({
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
}

function authSuccessResponse(res, statusCode, message, venueVendor) {
  const tokens = issueAuthTokens(venueVendor);
  return res.status(statusCode).json({
    status: true,
    message: message || "",
    user: toPublicProfile(venueVendor),
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
  });
}

exports.register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    businessName,
    businessPhone,
    businessEmail,
    businessAddress,
    businessDescription,
    panNumber,
    gstNumber,
    bankName,
    branchName,
    accountType,
    accountNumber,
    ifscCode,
    aadhaarCardFront,
    aadhaarCardBack,
    aadhaarCard,
    panCard,
    fcm_id,
  } = req.body;

  let phoneNorm;
  try {
    phoneNorm = normalizePhone(phone);
  } catch {
    cleanupUploadedFiles(req);
    throw new AppError("Invalid phone number. Use a 10-digit mobile number", 400);
  }

  const emailNorm = normalizeOptional(email)?.toLowerCase() || "";

  const payload = {
    name: normalizeRequired(name),
    email: emailNorm,
    password: String(password ?? ""),
    phone: phoneNorm,
    businessName: normalizeRequired(businessName),
  };

  const missing = REQUIRED_FIELDS.some((k) => !payload[k]);
  if (missing) {
    cleanupUploadedFiles(req);
    throw new AppError("Name, phone, and business name are required", 400);
  }

  const { venueVendor: existingPhone } = await findVenueVendorByPhone(payload.phone);
  if (existingPhone) {
    cleanupUploadedFiles(req);
    throw new AppError("Phone is already registered", 409);
  }

  if (payload.email) {
    const existing = await VenueVendor.findOne({ email: payload.email });
    if (existing) {
      cleanupUploadedFiles(req);
      throw new AppError("Email is already registered", 409);
    }
  }

  const passwordHash = payload.password ? await hashPassword(payload.password) : undefined;
  const profileImageFromFile =
    uploadPathFromFiles(req, "file") ?? publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const documentUploads = resolveVenueVendorDocumentUploads(
    req,
    { aadhaarCardFront, aadhaarCardBack, aadhaarCard, panCard },
    UPLOAD_FOLDER
  );

  const { approvalStatus, approvalRequired } = await resolveVendorApprovalRequired();

  let venueVendor;
  try {
    venueVendor = await VenueVendor.create({
      name: payload.name,
      ...(payload.email ? { email: payload.email } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      phone: payload.phone,
      businessName: payload.businessName,
      businessPhone: normalizeOptional(businessPhone),
      businessEmail: normalizeOptional(businessEmail)?.toLowerCase() ?? null,
      businessAddress: normalizeOptional(businessAddress),
      businessDescription: normalizeOptional(businessDescription),
      panNumber: normalizeOptional(panNumber),
      gstNumber: normalizeOptional(gstNumber),
      bankName: normalizeOptional(bankName),
      branchName: normalizeOptional(branchName),
      accountType,
      accountNumber: normalizeOptional(accountNumber),
      ifscCode: normalizeOptional(ifscCode),
      aadhaarCardFront: documentUploads.aadhaarCardFront,
      aadhaarCardBack: documentUploads.aadhaarCardBack,
      aadhaarCard: documentUploads.aadhaarCard,
      panCard: documentUploads.panCard,
      profileImage: profileImageFromFile,
      fcm_id: normalizeOptional(fcm_id),
      approvalStatus,
      status: "active",
      isOpen: true,
    });
  } catch (err) {
    cleanupUploadedFiles(req);
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || err.keyValue || {})[0];
      if (key === "email") {
        throw new AppError("Email is already registered", 409);
      }
      if (key === "phone" || key === "phoneCanonical") {
        throw new AppError("Phone is already registered", 409);
      }
      throw new AppError("Account already exists", 409);
    }
    throw err;
  }

  const tokens = issueAuthTokens(venueVendor);

  queueNotifyAllAdmins({
    type: "venue_vendor_registered",
    title: approvalRequired ? "New venue vendor registered" : "New venue vendor joined",
    message: approvalRequired
      ? `${venueVendor.businessName || venueVendor.name || "A venue vendor"} submitted a registration request.`
      : `${venueVendor.businessName || venueVendor.name || "A venue vendor"} registered and was auto-approved.`,
    metadata: {
      venueVendorId: String(venueVendor._id),
      linkPath: `/admin/venue-vendors/${venueVendor._id}`,
    },
  });

  res.status(201).json({
    status: true,
    message: approvalRequired ? "Registration submitted successfully" : "Registered successfully",
    user: toPublicProfile(venueVendor),
    approvalRequired,
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
  });
});

exports.sendOtp = asyncHandler(async (req, res) => {
  const { phone, mobile } = req.body || {};
  const phoneRaw = phone ?? mobile;
  if (!phoneRaw) {
    throw new AppError("Mobile number is required", 400);
  }

  const { venueVendor, phoneNorm } = await findVenueVendorByPhone(phoneRaw);
  if (!venueVendor) {
    throw new AppError("No venue vendor account found with this mobile number", 404);
  }

  assertVenueVendorCanLogin(venueVendor);

  await assertCanResendVenueVendorOtp(phoneNorm);

  const otp = generateOtp();
  const otpExpire = otpExpiryDate();
  await saveVenueVendorPhoneOtp(phoneNorm, otp, otpExpire);

  res.json({
    message: "OTP sent successfully",
    phone: phoneNorm,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otp: devOnlyOtp(otp),
  });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, mobile, otp } = req.body || {};
  const phoneRaw = phone ?? mobile;
  const otpValue = String(otp ?? "").trim();

  if (!phoneRaw) {
    throw new AppError("Mobile number is required", 400);
  }
  if (!otpValue) {
    throw new AppError("OTP is required", 400);
  }

  const { venueVendor, phoneNorm } = await findVenueVendorByPhone(phoneRaw);
  if (!venueVendor) {
    throw new AppError("Account not found", 404);
  }

  await verifyVenueVendorPhoneOtp(phoneNorm, otpValue);
  assertVenueVendorCanLogin(venueVendor);

  const { fcm_id } = req.body || {};
  if (fcm_id !== undefined) {
    venueVendor.fcm_id = normalizeOptional(fcm_id);
    await venueVendor.save();
  }

  authSuccessResponse(res, 200, "Login successful", venueVendor);
});

exports.login = asyncHandler(async (req, res) => {
  const { phone, mobile, email, password } = req.body;
  const phoneRaw = phone ?? mobile;

  if (!password) {
    throw new AppError("Password is required", 400);
  }
  if (!phoneRaw && !email) {
    throw new AppError("Mobile number and password are required", 400);
  }

  let venueVendor;
  if (phoneRaw) {
    ({ venueVendor } = await findVenueVendorByPhone(phoneRaw));
  } else {
    venueVendor = await VenueVendor.findOne({
      email: String(email).toLowerCase(),
    });
  }

  if (!venueVendor || !venueVendor.passwordHash) {
    throw new AppError("Invalid mobile number or password", 401);
  }

  const ok = await comparePassword(password, venueVendor.passwordHash);
  if (!ok) {
    throw new AppError("Invalid mobile number or password", 401);
  }

  assertVenueVendorCanLogin(venueVendor);

  authSuccessResponse(res, 200, "Login successful", venueVendor);
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

  if (payload.role !== "venueVendor") {
    throw new AppError("Forbidden", 403);
  }

  const venueVendor = await VenueVendor.findById(payload.sub);
  if (!venueVendor) {
    throw new AppError("Account not found", 401);
  }

  assertVenueVendorCanLogin(venueVendor);

  const tokens = issueAuthTokens(venueVendor);
  sendSuccess(res, "Token refreshed", tokens);
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new AppError("Email is required", 400);
  }

  const venueVendor = await VenueVendor.findOne({
    email: String(email).toLowerCase(),
  });
  if (!venueVendor) {
    res.json({
      message:
        "If an account exists for that email, password reset instructions have been sent.",
    });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  venueVendor.resetPasswordToken = resetToken;
  venueVendor.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
  await venueVendor.save();

  res.json({
    message:
      "If an account exists for that email, password reset instructions have been sent.",
    resetToken: process.env.NODE_ENV === "development" ? resetToken : undefined,
  });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    throw new AppError("Token and new password are required", 400);
  }

  const venueVendor = await VenueVendor.findOne({
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: new Date() },
  });
  if (!venueVendor) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  venueVendor.passwordHash = await hashPassword(password);
  venueVendor.resetPasswordToken = undefined;
  venueVendor.resetPasswordExpire = undefined;
  await venueVendor.save();

  res.json({ message: "Password has been reset" });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.json({ user: toPublicProfile(req.user) });
});

/** GET /api/venue-vendor/auth/shop-status */
exports.getShopStatus = asyncHandler(async (req, res) => {
  const venueVendor = await VenueVendor.findById(req.user._id).select("isOpen businessName").lean();
  if (!venueVendor) {
    throw new AppError("Account not found", 404);
  }
  const isOpen = venueVendor.isOpen !== false;
  res.json({
    message: "Shop status fetched",
    isOpen,
    statusLabel: isOpen ? "open" : "closed",
    businessName: venueVendor.businessName ?? null,
  });
});

/** GET /api/venue-vendor/auth/phone-visibility */
exports.getPhoneVisibility = asyncHandler(async (req, res) => {
  const venueVendor = await VenueVendor.findById(req.user._id)
    .select("showPhoneOnApp businessPhone phone")
    .lean();
  if (!venueVendor) {
    throw new AppError("Account not found", 404);
  }
  const showPhoneOnApp = venueVendor.showPhoneOnApp !== false;
  res.json({
    message: "Phone visibility fetched",
    showPhoneOnApp,
    statusLabel: showPhoneOnApp ? "visible" : "hidden",
  });
});

/** PATCH /api/venue-vendor/auth/phone-visibility */
exports.updatePhoneVisibility = asyncHandler(async (req, res) => {
  const { parseShowPhoneOnAppInput } = require("../../utils/publicVendorContact");
  const parsed = parseShowPhoneOnAppInput(
    req.body?.showPhoneOnApp ?? req.body?.showPhone ?? req.body?.visible
  );
  if (parsed === null) {
    throw new AppError("showPhoneOnApp must be true or false", 400);
  }

  const venueVendor = await VenueVendor.findById(req.user._id);
  if (!venueVendor) {
    throw new AppError("Account not found", 404);
  }

  venueVendor.showPhoneOnApp = parsed;
  await venueVendor.save();

  res.json({
    message: parsed
      ? "Your mobile number is visible on the user app."
      : "Your mobile number is hidden on the user app.",
    showPhoneOnApp: venueVendor.showPhoneOnApp !== false,
    statusLabel: venueVendor.showPhoneOnApp !== false ? "visible" : "hidden",
    user: toPublicProfile(venueVendor),
  });
});

/** PATCH /api/venue-vendor/auth/shop-status — toggle open/close for venue vendor */
exports.updateShopStatus = asyncHandler(async (req, res) => {
  const { parseIsOpenInput } = require("../../utils/publicVendorVisibility");
  const parsed = parseIsOpenInput(req.body?.isOpen ?? req.body?.shopOpen ?? req.body?.open);
  if (!parsed.ok) {
    throw new AppError(parsed.error, 400);
  }

  const venueVendor = await VenueVendor.findById(req.user._id);
  if (!venueVendor) {
    throw new AppError("Account not found", 404);
  }

  venueVendor.isOpen = parsed.isOpen;
  await venueVendor.save();

  res.json({
    message: parsed.isOpen
      ? "Business opened. Your venues are visible to users."
      : "Business closed. Your venues are hidden from users.",
    isOpen: venueVendor.isOpen !== false,
    statusLabel: venueVendor.isOpen !== false ? "open" : "closed",
    businessName: venueVendor.businessName ?? null,
    user: toPublicProfile(venueVendor),
  });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const venueVendor = await VenueVendor.findById(req.user._id);
  if (!venueVendor) {
    throw new AppError("Account not found", 404);
  }

  const {
    name,
    email,
    phone,
    businessName,
    businessPhone,
    businessEmail,
    businessAddress,
    businessDescription,
    panNumber,
    gstNumber,
    bankName,
    branchName,
    accountType,
    accountNumber,
    ifscCode,
    aadhaarCardFront,
    aadhaarCardBack,
    aadhaarCard,
    panCard,
    profileImage,
    fcm_id,
    showPhoneOnApp,
  } = req.body;

  const profileImageFromFile =
    uploadPathFromFiles(req, "file") ?? publicUploadPathFromFile(req, UPLOAD_FOLDER);
  if (profileImageFromFile) {
    deleteUploadFileByPublicUrl(venueVendor.profileImage);
    venueVendor.profileImage = profileImageFromFile;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
    if (profileImage === "" || profileImage === null) {
      deleteUploadFileByPublicUrl(venueVendor.profileImage);
      venueVendor.profileImage = null;
    } else if (profileImage !== venueVendor.profileImage) {
      deleteUploadFileByPublicUrl(venueVendor.profileImage);
      venueVendor.profileImage = normalizeOptional(profileImage);
    }
  }

  if (name !== undefined) {
    const normalized = normalizeRequired(name);
    if (!normalized) throw new AppError("Name cannot be empty", 400);
    venueVendor.name = normalized;
  }
  if (email !== undefined) {
    const emailNorm = normalizeOptional(email)?.toLowerCase() || "";
    if (emailNorm) {
      if (!isValidEmail(emailNorm)) {
        throw new AppError(
          "Please enter a valid email ending with .com, .net, .co.in, or .in",
          400
        );
      }
      const taken = await VenueVendor.findOne({
        email: emailNorm,
        _id: { $ne: venueVendor._id },
      }).select("_id");
      if (taken) {
        throw new AppError("Email is already registered", 409);
      }
      venueVendor.email = emailNorm;
    } else {
      venueVendor.email = undefined;
    }
  }
  if (phone !== undefined) {
    const normalized = normalizePhone(phone);
    const phoneTaken = await VenueVendor.findOne({
      _id: { $ne: venueVendor._id },
      $or: [
        { phoneCanonical: normalized },
        { phone: { $in: phoneLookupValues(normalized) } },
      ],
    }).select("_id");
    if (phoneTaken) throw new AppError("Phone is already registered", 409);
    venueVendor.phone = normalized;
  }
  if (businessName !== undefined) {
    const normalized = normalizeRequired(businessName);
    if (!normalized) throw new AppError("Business name cannot be empty", 400);
    venueVendor.businessName = normalized;
  }
  if (businessPhone !== undefined) venueVendor.businessPhone = normalizeOptional(businessPhone);
  if (businessEmail !== undefined) {
    venueVendor.businessEmail =
      normalizeOptional(businessEmail)?.toLowerCase() ?? null;
  }
  if (businessAddress !== undefined) venueVendor.businessAddress = normalizeOptional(businessAddress);
  if (businessDescription !== undefined) {
    venueVendor.businessDescription = normalizeOptional(businessDescription);
  }
  if (panNumber !== undefined) venueVendor.panNumber = normalizeOptional(panNumber);
  if (gstNumber !== undefined) venueVendor.gstNumber = normalizeOptional(gstNumber);
  if (bankName !== undefined) venueVendor.bankName = normalizeOptional(bankName);
  if (branchName !== undefined) venueVendor.branchName = normalizeOptional(branchName);
  if (accountType !== undefined) venueVendor.accountType = accountType;
  if (accountNumber !== undefined) venueVendor.accountNumber = normalizeOptional(accountNumber);
  if (ifscCode !== undefined) venueVendor.ifscCode = normalizeOptional(ifscCode);

  const documentUploads = resolveVenueVendorDocumentUploads(
    req,
    { aadhaarCardFront, aadhaarCardBack, aadhaarCard, panCard },
    UPLOAD_FOLDER
  );
  if (documentUploads.aadhaarCardFront) {
    assignVenueVendorAadhaarFront(venueVendor, documentUploads.aadhaarCardFront);
  } else if (aadhaarCardFront !== undefined || aadhaarCard !== undefined) {
    assignVenueVendorAadhaarFront(venueVendor, normalizeOptional(aadhaarCardFront ?? aadhaarCard));
  }
  if (documentUploads.aadhaarCardBack) {
    assignVenueVendorAadhaarBack(venueVendor, documentUploads.aadhaarCardBack);
  } else if (aadhaarCardBack !== undefined) {
    assignVenueVendorAadhaarBack(venueVendor, normalizeOptional(aadhaarCardBack));
  }
  if (documentUploads.panCard) {
    assignVenueVendorPanCard(venueVendor, documentUploads.panCard);
  } else if (panCard !== undefined) {
    assignVenueVendorPanCard(venueVendor, normalizeOptional(panCard));
  }

  if (fcm_id !== undefined) venueVendor.fcm_id = normalizeOptional(fcm_id);
  if (showPhoneOnApp !== undefined) {
    const { parseShowPhoneOnAppInput } = require("../../utils/publicVendorContact");
    const parsed = parseShowPhoneOnAppInput(showPhoneOnApp);
    if (parsed === null) {
      throw new AppError("Invalid showPhoneOnApp value", 400);
    }
    venueVendor.showPhoneOnApp = parsed;
  }

  try {
    await venueVendor.save();
  } catch (err) {
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || err.keyValue || {})[0];
      if (key === "email") throw new AppError("Email is already registered", 409);
      if (key === "phone" || key === "phoneCanonical") {
        throw new AppError("Phone is already registered", 409);
      }
      throw new AppError("Account already exists", 409);
    }
    throw err;
  }
  res.json({
    message: "Profile updated",
    user: toPublicProfile(await VenueVendor.findById(venueVendor._id)),
  });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const venueVendor = await VenueVendor.findById(req.user._id);
  if (!venueVendor) {
    throw new AppError("Account not found", 404);
  }
  [
    venueVendor.profileImage,
    venueVendor.aadhaarCardFront,
    venueVendor.aadhaarCardBack,
    venueVendor.aadhaarCard,
    venueVendor.panCard,
  ].forEach((u) => deleteUploadFileByPublicUrl(u));
  await VenueVendor.findByIdAndDelete(req.user._id);
  res.json({ message: "Account deleted" });
});

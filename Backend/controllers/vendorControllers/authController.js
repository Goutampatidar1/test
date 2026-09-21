const crypto = require("crypto");
const { Vendor } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword, comparePassword } = require("../../utils/password");
const { signAccessToken } = require("../../utils/jwt");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const mobileAuth = require("./vendorMobileAuth");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { resolveVendorApprovalRequired } = require("../../utils/vendorApproval");
const { queueNotifyAllAdmins } = require("../../utils/adminInbox");

const VENDOR_UPLOAD_DIR = "vendor";
const REQUIRED_VENDOR_FIELDS = ["name", "email", "phone", "businessName"];

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function parseStringArrayField(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return [];
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function profilePathFromFile(req) {
  if (!req.file) {
    return undefined;
  }
  return `/uploads/${VENDOR_UPLOAD_DIR}/${req.file.filename}`;
}

function assertVendorCanLogin(vendor) {
  if (vendor.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }
  if (vendor.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
  if (vendor.approvalStatus === "pending") {
    throw new AppError("Account is pending approval", 403);
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

exports.register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    businessName,
    businessPhone,
    gstin,
    businessAddress,
    aadhaarCard,
    panCard,
    shopLogo,
    shopImages,
    shopVideos,
    shopBanner,
    bankName,
    branchName,
    accountNo,
    ifsc,
    accountType,
    dob,
    gender,
    fcm_id,
    profileImage,
  } = req.body;

  const payload = {
    name: normalizeRequired(name),
    email: normalizeRequired(email).toLowerCase(),
    password: String(password ?? ""),
    phone: normalizeRequired(phone),
    businessName: normalizeRequired(businessName),
  };

  const missing = REQUIRED_VENDOR_FIELDS.some((k) => !payload[k]);
  if (missing) {
    deleteUploadFileByPublicUrl(profilePathFromFile(req));
    throw new AppError(
      "Name, email, phone, and business name are required",
      400
    );
  }

  const existing = await Vendor.findOne({ email: payload.email });
  if (existing) {
    deleteUploadFileByPublicUrl(profilePathFromFile(req));
    throw new AppError("Email is already registered", 409);
  }

  const passwordHash = payload.password ? await hashPassword(payload.password) : undefined;
  const fromFile = profilePathFromFile(req);
  const { approvalStatus } = await resolveVendorApprovalRequired();
  let vendor;
  try {
    vendor = await Vendor.create({
      name: payload.name,
      email: payload.email,
      ...(passwordHash ? { passwordHash } : {}),
      phone: payload.phone,
      businessName: payload.businessName,
      businessPhone: normalizeOptional(businessPhone),
      gstin: normalizeOptional(gstin),
      businessAddress: normalizeOptional(businessAddress),
      aadhaarCard: normalizeOptional(aadhaarCard),
      panCard: normalizeOptional(panCard),
      shopLogo: normalizeOptional(shopLogo),
      shopImages: parseStringArrayField(shopImages) ?? [],
      shopVideos: parseStringArrayField(shopVideos) ?? [],
      shopBanner: normalizeOptional(shopBanner),
      bankName: normalizeOptional(bankName),
      branchName: normalizeOptional(branchName),
      accountNo: normalizeOptional(accountNo),
      ifsc: normalizeOptional(ifsc),
      accountType,
      dob: dob === "" ? null : dob,
      gender,
      fcm_id: normalizeOptional(fcm_id),
      profileImage: fromFile ?? normalizeOptional(profileImage),
      approvalStatus,
      status: "active",
      isOpen: true,
    });
  } catch (err) {
    deleteUploadFileByPublicUrl(fromFile);
    throw err;
  }

  const token = signAccessToken({
    sub: vendor._id.toString(),
    role: "vendor",
  });

  queueNotifyAllAdmins({
    type: "vendor_registered",
    title: "New vendor registered",
    message: `${vendor.businessName || vendor.name || "A vendor"} submitted a registration request.`,
    metadata: {
      vendorId: String(vendor._id),
      linkPath: `/admin/vendors/${vendor._id}`,
    },
  });

  res.status(201).json({
    message: "Registered successfully",
    user: toPublicProfile(vendor),
    token,
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const vendor = await Vendor.findOne({ email: String(email).toLowerCase() });
  if (!vendor) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!vendor.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  const ok = await comparePassword(password, vendor.passwordHash);
  if (!ok) {
    throw new AppError("Invalid email or password", 401);
  }

  assertVendorCanLogin(vendor);

  const token = signAccessToken({
    sub: vendor._id.toString(),
    role: "vendor",
  });

  res.json({
    message: "Login successful",
    user: toPublicProfile(vendor),
    token,
  });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new AppError("Email is required", 400);
  }

  const vendor = await Vendor.findOne({ email: String(email).toLowerCase() });
  if (!vendor) {
    res.json({
      message:
        "If an account exists for that email, password reset instructions have been sent.",
    });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  vendor.resetPasswordToken = resetToken;
  vendor.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
  await vendor.save();

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

  const vendor = await Vendor.findOne({
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: new Date() },
  });

  if (!vendor) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  vendor.passwordHash = await hashPassword(password);
  vendor.resetPasswordToken = undefined;
  vendor.resetPasswordExpire = undefined;
  await vendor.save();

  res.json({ message: "Password has been reset" });
});

exports.getMe = asyncHandler(async (req, res) => {
  const accept = String(req.headers.accept || "");
  const mobile =
    req.query.format === "mobile" || String(req.headers["x-client"] || "") === "mobile";
  if (mobile) {
    return mobileAuth.getMeMobile(req, res);
  }
  res.json({ user: toPublicProfile(req.user) });
});

exports.sendOtp = mobileAuth.sendOtp;
exports.verifyOtp = mobileAuth.verifyOtp;
exports.completeRegister = mobileAuth.completeRegister;
exports.checkAvailability = mobileAuth.checkAvailability;
exports.refresh = mobileAuth.refresh;

exports.updateMe = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.user._id);
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }

  const {
    name,
    phone,
    businessName,
    businessPhone,
    gstin,
    businessAddress,
    aadhaarCard,
    panCard,
    shopLogo,
    shopImages,
    shopVideos,
    shopBanner,
    bankName,
    branchName,
    accountNo,
    ifsc,
    accountType,
    dob,
    gender,
    fcm_id,
    profileImage,
  } = req.body;

  if (req.file) {
    deleteUploadFileByPublicUrl(vendor.profileImage);
    vendor.profileImage = profilePathFromFile(req);
  } else if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
    if (profileImage === "" || profileImage === null) {
      deleteUploadFileByPublicUrl(vendor.profileImage);
      vendor.profileImage = null;
    } else if (profileImage !== vendor.profileImage) {
      deleteUploadFileByPublicUrl(vendor.profileImage);
      vendor.profileImage = profileImage;
    }
  }

  if (name !== undefined) {
    const normalized = normalizeRequired(name);
    if (!normalized) throw new AppError("Name cannot be empty", 400);
    vendor.name = normalized;
  }
  if (phone !== undefined) {
    const normalized = normalizeRequired(phone);
    if (!normalized) throw new AppError("Phone cannot be empty", 400);
    vendor.phone = normalized;
  }
  if (businessName !== undefined) {
    const normalized = normalizeRequired(businessName);
    if (!normalized) throw new AppError("Business name cannot be empty", 400);
    vendor.businessName = normalized;
  }
  if (businessPhone !== undefined) {
    vendor.businessPhone = normalizeOptional(businessPhone);
  }
  if (gstin !== undefined) {
    vendor.gstin = normalizeOptional(gstin);
  }
  if (businessAddress !== undefined) {
    vendor.businessAddress = normalizeOptional(businessAddress);
  }
  if (aadhaarCard !== undefined) {
    vendor.aadhaarCard = normalizeOptional(aadhaarCard);
  }
  if (panCard !== undefined) {
    vendor.panCard = normalizeOptional(panCard);
  }
  if (shopLogo !== undefined) {
    vendor.shopLogo = normalizeOptional(shopLogo);
  }
  if (shopImages !== undefined) {
    const next = parseStringArrayField(shopImages);
    if (next !== undefined) {
      const prev = [...(vendor.shopImages || [])];
      prev.filter((u) => u && !next.includes(u)).forEach((u) => deleteUploadFileByPublicUrl(u));
      vendor.shopImages = next;
    }
  }
  if (shopVideos !== undefined) {
    const next = parseStringArrayField(shopVideos);
    if (next !== undefined) {
      const prev = [...(vendor.shopVideos || [])];
      prev.filter((u) => u && !next.includes(u)).forEach((u) => deleteUploadFileByPublicUrl(u));
      vendor.shopVideos = next;
    }
  }
  if (shopBanner !== undefined) {
    vendor.shopBanner = normalizeOptional(shopBanner);
  }
  if (bankName !== undefined) {
    vendor.bankName = normalizeOptional(bankName);
  }
  if (branchName !== undefined) {
    vendor.branchName = normalizeOptional(branchName);
  }
  if (accountNo !== undefined) {
    vendor.accountNo = normalizeOptional(accountNo);
  }
  if (ifsc !== undefined) {
    vendor.ifsc = normalizeOptional(ifsc);
  }
  if (accountType !== undefined) {
    vendor.accountType = accountType;
  }
  if (dob !== undefined) {
    vendor.dob = dob === "" ? null : dob;
  }
  if (gender !== undefined) {
    vendor.gender = gender;
  }
  if (fcm_id !== undefined) {
    vendor.fcm_id = normalizeOptional(fcm_id);
  }

  await vendor.save();
  const fresh = await Vendor.findById(vendor._id).select("-passwordHash");
  res.json({
    message: "Profile updated",
    user: toPublicProfile(fresh),
  });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.user._id);
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }
  [
    vendor.profileImage,
    vendor.aadhaarCard,
    vendor.panCard,
    vendor.shopLogo,
    ...(vendor.shopImages || []),
    ...(vendor.shopVideos || []),
    vendor.shopBanner,
  ].forEach((u) => deleteUploadFileByPublicUrl(u));
  await Vendor.findByIdAndDelete(req.user._id);
  res.json({ message: "Account deleted" });
});

const { Vendor } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword } = require("../../utils/password");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { assertObjectId } = require("../../utils/assertObjectId");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { applyVendorApprovalStatus } = require("../../utils/vendorApproval");

const UPLOAD_FOLDER = "vendor";
const ALLOWED_GENDERS = new Set(["male", "female", "other"]);

function normalizeGender(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!ALLOWED_GENDERS.has(normalized)) {
    throw new AppError("Invalid gender. Use male, female, or other", 400);
  }
  return normalized;
}

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

const SHOP_DESCRIPTION_MAX = 100;

function normalizeShopDescription(value) {
  const normalized = normalizeOptional(value);
  if (normalized && normalized.length > SHOP_DESCRIPTION_MAX) {
    throw new AppError(`Shop description cannot exceed ${SHOP_DESCRIPTION_MAX} characters`, 400);
  }
  return normalized;
}

function uploadPathFromFiles(req, field) {
  const file = req.files?.[field]?.[0];
  if (!file) return undefined;
  return `/uploads/${UPLOAD_FOLDER}/${file.filename}`;
}

function uploadPathsFromFiles(req, field) {
  const list = req.files?.[field];
  if (!Array.isArray(list) || !list.length) return [];
  return list.map((f) => `/uploads/${UPLOAD_FOLDER}/${f.filename}`);
}

/** Accepts JSON array string (multipart), plain array (JSON body), or undefined. */
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

function uploadedVendorPaths(req) {
  return [
    uploadPathFromFiles(req, "file") ?? publicUploadPathFromFile(req, UPLOAD_FOLDER),
    uploadPathFromFiles(req, "aadhaarCardFront"),
    uploadPathFromFiles(req, "aadhaarCardBack"),
    uploadPathFromFiles(req, "panCardFront") ?? uploadPathFromFiles(req, "panCard"),
    uploadPathFromFiles(req, "shopLogo"),
    ...uploadPathsFromFiles(req, "shopImages"),
    ...uploadPathsFromFiles(req, "shopVideos"),
    uploadPathFromFiles(req, "shopBanner"),
  ].filter(Boolean);
}

function cleanupUploadedVendorFiles(req) {
  uploadedVendorPaths(req).forEach((u) => deleteUploadFileByPublicUrl(u));
}

exports.listVendors = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, approvalStatus, search } = req.query;

  const filter = {};
  if (status) {
    filter.status = status;
  }
  if (approvalStatus) {
    filter.approvalStatus = approvalStatus;
  }
  const searchOr = searchFilter(search, [
    "name",
    "email",
    "phone",
    "businessName",
    "businessPhone",
    "gstin",
    "businessAddress",
    "bankName",
    "branchName",
    "accountNo",
    "ifsc",
  ]);
  if (searchOr) {
    Object.assign(filter, searchOr);
  }

  const [vendors, total] = await Promise.all([
    Vendor.find(filter)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Vendor.countDocuments(filter),
  ]);

  res.json({
    vendors: vendors.map((v) => toPublicProfile(v)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getVendorById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const vendor = await Vendor.findById(req.params.id).select("-passwordHash");
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }
  res.json({ vendor: toPublicProfile(vendor) });
});

exports.createVendor = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    businessName,
    businessPhone,
    gstin,
    businessAddress,
    shopDescription,
    aadhaarCardFront,
    aadhaarCardBack,
    panCardNumber,
    panCardFront,
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
    status,
    approvalStatus,
    rejectionReason,
    city,
    subDistrict,
  } = req.body;

  const payload = {
    name: normalizeRequired(name),
    email: normalizeOptional(email)?.toLowerCase() || "",
    password: String(password ?? ""),
    phone: normalizeRequired(phone),
    businessName: normalizeRequired(businessName),
    businessPhone: normalizeRequired(businessPhone),
    businessAddress: normalizeRequired(businessAddress),
    city: normalizeRequired(city),
  };

  const fromFile = uploadPathFromFiles(req, "file") ?? publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const aadhaarCardFrontFromFile = uploadPathFromFiles(req, "aadhaarCardFront");
  const aadhaarCardBackFromFile = uploadPathFromFiles(req, "aadhaarCardBack");
  const panCardFromFile =
    uploadPathFromFiles(req, "panCardFront") ?? uploadPathFromFiles(req, "panCard");
  const shopLogoFromFile = uploadPathFromFiles(req, "shopLogo");
  const shopImagesFromFiles = uploadPathsFromFiles(req, "shopImages");
  const shopVideosFromFiles = uploadPathsFromFiles(req, "shopVideos");
  const shopImagesFromBody = parseStringArrayField(shopImages);
  const shopVideosFromBody = parseStringArrayField(shopVideos);
  const shopBannerFromFile = uploadPathFromFiles(req, "shopBanner");
  const shopBannerPath = shopBannerFromFile ?? normalizeOptional(shopBanner);

  const missingRequired =
    !payload.name ||
    !payload.phone ||
    !payload.businessName ||
    !payload.businessPhone ||
    !payload.businessAddress ||
    !payload.city ||
    !shopBannerPath;
  if (missingRequired) {
    cleanupUploadedVendorFiles(req);
    throw new AppError(
      "Full name, mobile, shop name, business mobile, address, city, and shop banner are required",
      400
    );
  }

  if (payload.email) {
    const existing = await Vendor.findOne({ email: payload.email });
    if (existing) {
      cleanupUploadedVendorFiles(req);
      throw new AppError("Email is already in use", 409);
    }
  }
  const existingPhone = await Vendor.findOne({ phone: payload.phone });
  if (existingPhone) {
    cleanupUploadedVendorFiles(req);
    throw new AppError("Phone number is already in use", 409);
  }

  const passwordHash = payload.password ? await hashPassword(payload.password) : undefined;
  const approvalDraft = { approvalStatus: approvalStatus || "pending", rejectionReason: null };
  applyVendorApprovalStatus(approvalDraft, {
    approvalStatus: approvalStatus || "pending",
    rejectionReason,
  });
  let vendor;
  try {
    vendor = await Vendor.create({
      name: payload.name,
      ...(payload.email ? { email: payload.email } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      phone: payload.phone,
      businessName: payload.businessName,
      businessPhone: payload.businessPhone,
      gstin: normalizeOptional(gstin),
      panCardNumber: normalizeOptional(panCardNumber),
      businessAddress: payload.businessAddress,
      shopDescription: normalizeShopDescription(shopDescription),
      aadhaarCardFront: aadhaarCardFrontFromFile ?? normalizeOptional(aadhaarCardFront),
      aadhaarCardBack: aadhaarCardBackFromFile ?? normalizeOptional(aadhaarCardBack),
      panCardFront: panCardFromFile ?? normalizeOptional(panCardFront ?? panCard),
      shopLogo: shopLogoFromFile ?? normalizeOptional(shopLogo),
      shopImages: [...(shopImagesFromBody ?? []), ...shopImagesFromFiles],
      shopVideos: [...(shopVideosFromBody ?? []), ...shopVideosFromFiles],
      shopBanner: shopBannerPath,
      bankName: normalizeOptional(bankName),
      branchName: normalizeOptional(branchName),
      accountNo: normalizeOptional(accountNo),
      ifsc: normalizeOptional(ifsc),
      accountType,
      dob: dob === "" ? null : dob,
      gender: normalizeGender(gender),
      fcm_id: normalizeOptional(fcm_id),
      status: status || "active",
      approvalStatus: approvalDraft.approvalStatus,
      rejectionReason: approvalDraft.rejectionReason,
      profileImage: fromFile ?? normalizeOptional(profileImage),
      city: payload.city,
      subDistrict: normalizeOptional(subDistrict),
    });
  } catch (err) {
    cleanupUploadedVendorFiles(req);
    throw err;
  }

  res.status(201).json({
    message: "Vendor created",
    vendor: toPublicProfile(await Vendor.findById(vendor._id)),
  });
});

exports.updateVendor = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  const {
    name,
    email,
    password,
    phone,
    businessName,
    businessPhone,
    gstin,
    businessAddress,
    shopDescription,
    aadhaarCardFront,
    aadhaarCardBack,
    panCardNumber,
    panCardFront,
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
    status,
    approvalStatus,
    rejectionReason,
    city,
    subDistrict,
  } = req.body;

  if (email !== undefined) {
    const emailNorm = normalizeRequired(email).toLowerCase();
    if (!emailNorm) {
      vendor.email = undefined;
    } else {
      const taken = await Vendor.findOne({
        email: emailNorm,
        _id: { $ne: vendor._id },
      });
      if (taken) {
        deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
        throw new AppError("Email is already in use", 409);
      }
      vendor.email = emailNorm;
    }
  }
  if (phone !== undefined) {
    const phoneNorm = normalizeRequired(phone);
    if (!phoneNorm) throw new AppError("Phone cannot be empty", 400);
    const phoneTaken = await Vendor.findOne({
      phone: phoneNorm,
      _id: { $ne: vendor._id },
    });
    if (phoneTaken) {
      cleanupUploadedVendorFiles(req);
      throw new AppError("Phone number is already in use", 409);
    }
    vendor.phone = phoneNorm;
  }

  const profileImageFromFile = uploadPathFromFiles(req, "file") ?? publicUploadPathFromFile(req, UPLOAD_FOLDER);
  if (profileImageFromFile) {
    deleteUploadFileByPublicUrl(vendor.profileImage);
    vendor.profileImage = profileImageFromFile;
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
  if (businessName !== undefined) {
    const shopName = normalizeRequired(businessName);
    if (!shopName) throw new AppError("Shop name is required", 400);
    vendor.businessName = shopName;
  }
  if (businessPhone !== undefined) {
    const shopPhone = normalizeRequired(businessPhone);
    if (!shopPhone) throw new AppError("Business mobile is required", 400);
    vendor.businessPhone = shopPhone;
  }
  if (gstin !== undefined) {
    vendor.gstin = normalizeOptional(gstin);
  }
  if (panCardNumber !== undefined) {
    vendor.panCardNumber = normalizeOptional(panCardNumber);
  }
  if (businessAddress !== undefined) {
    const address = normalizeRequired(businessAddress);
    if (!address) throw new AppError("Address is required", 400);
    vendor.businessAddress = address;
  }
  if (shopDescription !== undefined) {
    vendor.shopDescription = normalizeShopDescription(shopDescription);
  }
  const aadhaarCardFrontFromFile = uploadPathFromFiles(req, "aadhaarCardFront");
  if (aadhaarCardFrontFromFile) {
    deleteUploadFileByPublicUrl(vendor.aadhaarCardFront);
    vendor.aadhaarCardFront = aadhaarCardFrontFromFile;
  } else if (aadhaarCardFront !== undefined) {
    vendor.aadhaarCardFront = normalizeOptional(aadhaarCardFront);
  }
  const aadhaarCardBackFromFile = uploadPathFromFiles(req, "aadhaarCardBack");
  if (aadhaarCardBackFromFile) {
    deleteUploadFileByPublicUrl(vendor.aadhaarCardBack);
    vendor.aadhaarCardBack = aadhaarCardBackFromFile;
  } else if (aadhaarCardBack !== undefined) {
    vendor.aadhaarCardBack = normalizeOptional(aadhaarCardBack);
  }
  const panCardFromFile =
    uploadPathFromFiles(req, "panCardFront") ?? uploadPathFromFiles(req, "panCard");
  if (panCardFromFile) {
    deleteUploadFileByPublicUrl(vendor.panCardFront);
    vendor.panCardFront = panCardFromFile;
  } else if (panCardFront !== undefined || panCard !== undefined) {
    vendor.panCardFront = normalizeOptional(panCardFront ?? panCard);
  }
  const shopLogoFromFile = uploadPathFromFiles(req, "shopLogo");
  if (shopLogoFromFile) {
    deleteUploadFileByPublicUrl(vendor.shopLogo);
    vendor.shopLogo = shopLogoFromFile;
  } else if (shopLogo !== undefined) {
    vendor.shopLogo = normalizeOptional(shopLogo);
  }
  const shopImagesFromFiles = uploadPathsFromFiles(req, "shopImages");
  const shopVideosFromFiles = uploadPathsFromFiles(req, "shopVideos");
  const parsedShopImages = parseStringArrayField(shopImages);
  const parsedShopVideos = parseStringArrayField(shopVideos);

  if (shopImagesFromFiles.length || parsedShopImages !== undefined) {
    const prev = [...(vendor.shopImages || [])];
    let next;
    if (shopImagesFromFiles.length) {
      const base =
        parsedShopImages !== undefined ? parsedShopImages : [...(vendor.shopImages || [])];
      next = [...base, ...shopImagesFromFiles];
    } else {
      next = parsedShopImages;
    }
    prev.filter((u) => u && !next.includes(u)).forEach((u) => deleteUploadFileByPublicUrl(u));
    vendor.shopImages = next;
  }

  if (shopVideosFromFiles.length || parsedShopVideos !== undefined) {
    const prev = [...(vendor.shopVideos || [])];
    let next;
    if (shopVideosFromFiles.length) {
      const base =
        parsedShopVideos !== undefined ? parsedShopVideos : [...(vendor.shopVideos || [])];
      next = [...base, ...shopVideosFromFiles];
    } else {
      next = parsedShopVideos;
    }
    prev.filter((u) => u && !next.includes(u)).forEach((u) => deleteUploadFileByPublicUrl(u));
    vendor.shopVideos = next;
  }
  const shopBannerFromFile = uploadPathFromFiles(req, "shopBanner");
  if (shopBannerFromFile) {
    deleteUploadFileByPublicUrl(vendor.shopBanner);
    vendor.shopBanner = shopBannerFromFile;
  } else if (shopBanner !== undefined) {
    const nextBanner = normalizeOptional(shopBanner);
    if (!nextBanner) throw new AppError("Shop banner image is required", 400);
    vendor.shopBanner = nextBanner;
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
    vendor.gender = normalizeGender(gender);
  }
  if (fcm_id !== undefined) {
    vendor.fcm_id = normalizeOptional(fcm_id);
  }
  if (status !== undefined) {
    vendor.status = status;
  }
  if (approvalStatus !== undefined) {
    applyVendorApprovalStatus(vendor, { approvalStatus, rejectionReason });
  }
  if (city !== undefined) {
    const cityNorm = normalizeRequired(city);
    if (!cityNorm) throw new AppError("City is required", 400);
    vendor.city = cityNorm;
  }
  if (subDistrict !== undefined) {
    vendor.subDistrict = normalizeOptional(subDistrict);
  }
  if (password) {
    vendor.passwordHash = await hashPassword(password);
  }

  await vendor.save();
  res.json({
    message: "Vendor updated",
    vendor: toPublicProfile(await Vendor.findById(vendor._id)),
  });
});

exports.deleteVendor = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }
  const uploadUrls = [
    vendor.profileImage,
    vendor.aadhaarCardFront,
    vendor.aadhaarCardBack,
    vendor.panCardFront,
    vendor.shopLogo,
    ...(vendor.shopImages || []),
    ...(vendor.shopVideos || []),
    vendor.shopBanner,
  ];
  uploadUrls.forEach((u) => deleteUploadFileByPublicUrl(u));
  await Vendor.findByIdAndDelete(req.params.id);
  res.json({ message: "Vendor deleted" });
});

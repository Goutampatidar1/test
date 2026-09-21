const { Vendor } = require("../../models");
const Category = require("../../models/other/category");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { toMobileVendorProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { assertObjectId } = require("../../utils/assertObjectId");
const { normalizePhone } = require("../../utils/phone");
const { parseDateOnly } = require("../../utils/dateOnly");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const {
  VENDOR_UPLOAD_DIR,
  filesForField,
  uploadPathFromFiles,
  uploadPathsFromFiles,
  uploadPathFromFieldAliases,
  uploadPathsFromFieldAliases,
  parseStringArrayField,
  cleanupUploadedVendorFiles,
} = require("../../utils/vendorFileUpload");

const PROFILE_IMAGE_FIELD_ALIASES = ["profile_image", "profileImage", "file"];

function countProfileImageUploads(req) {
  if (!req.files) return 0;
  if (Array.isArray(req.files)) {
    return req.files.filter((f) => PROFILE_IMAGE_FIELD_ALIASES.includes(f.fieldname)).length;
  }
  return PROFILE_IMAGE_FIELD_ALIASES.reduce(
    (sum, field) => sum + filesForField(req, field).length,
    0
  );
}

const MAX_SHOP_IMAGES = 5;
const ALLOWED_GENDERS = new Set(["male", "female", "other"]);
const ALLOWED_ACCOUNT_TYPES = new Set(["Current", "Savings"]);

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

async function loadVendorProfile(id) {
  return Vendor.findById(id).populate("category", "name mode status");
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

/** Parse shopImages only when the client sent a non-empty value (avoid wiping on blank form fields). */
function shopImagesFromBody(shopImages, shopBannerImages) {
  if (shopImages !== undefined && shopImages !== null && String(shopImages).trim() !== "") {
    return parseStringArrayField(shopImages);
  }
  if (
    shopBannerImages !== undefined &&
    shopBannerImages !== null &&
    String(shopBannerImages).trim() !== ""
  ) {
    return parseStringArrayField(shopBannerImages);
  }
  return undefined;
}

function assignSingleMedia(vendor, field, filePath, bodyValue) {
  if (filePath) {
    deleteUploadFileByPublicUrl(vendor[field]);
    vendor[field] = filePath;
    return;
  }
  if (bodyValue === undefined) return;
  if (bodyValue === "" || bodyValue === null) {
    deleteUploadFileByPublicUrl(vendor[field]);
    vendor[field] = null;
  } else {
    const next = normalizeOptional(bodyValue);
    if (next !== vendor[field]) {
      deleteUploadFileByPublicUrl(vendor[field]);
      vendor[field] = next;
    }
  }
}

/** GET /api/vendor/profile — logged-in ecom vendor profile (mobile envelope) */
exports.getProfile = asyncHandler(async (req, res) => {
  const vendor = await loadVendorProfile(req.user._id);
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }
  sendSuccess(res, "Profile fetched", { user: toMobileVendorProfile(vendor, req) });
});

/** PATCH /api/vendor/profile — update profile (JSON or multipart) */
exports.updateProfile = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.user._id);
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }

  const body = req.body || {};
  const {
    name,
    email,
    businessName,
    category,
    businessPhone,
    gstin,
    panCardNumber,
    businessAddress,
    country,
    state,
    city,
    subDistrict,
    pincode,
    aadhaarCardFront,
    aadhaarCardBack,
    aadhaarCard,
    panCardFront,
    panCard,
    shopLogo,
    shopImages,
    shop_banner_Images,
    shopVideos,
    shopBanner,
    bankName,
    branchName,
    accountHolderName,
    account_holder_name,
    accountNo,
    ifsc,
    accountType,
    dob,
    gender,
    fcm_id,
    profileImage,
    profile_image,
    showPhoneOnApp,
  } = body;

  try {
    if (email !== undefined) {
      const emailNorm = normalizeOptionalEmail(email);
      if (emailNorm) {
        const taken = await Vendor.findOne({
          email: emailNorm,
          _id: { $ne: vendor._id },
        });
        if (taken) {
          throw new AppError("Email is already in use", 409);
        }
        vendor.email = emailNorm;
      } else {
        vendor.email = undefined;
      }
    }

    if (name !== undefined) {
      const normalized = normalizeRequired(name);
      if (!normalized) throw new AppError("Name cannot be empty", 400);
      vendor.name = normalized;
    }
    if (businessName !== undefined) {
      const normalized = normalizeRequired(businessName);
      if (!normalized) throw new AppError("Business name cannot be empty", 400);
      vendor.businessName = normalized;
    }
    if (category !== undefined) {
      if (category === "" || category === null) {
        vendor.category = null;
      } else {
        await assertActiveEcomCategory(category);
        vendor.category = category;
      }
    }
    if (businessPhone !== undefined) {
      vendor.businessPhone = businessPhone
        ? normalizePhone(businessPhone)
        : null;
    }
    if (gstin !== undefined) vendor.gstin = normalizeOptional(gstin);
    if (panCardNumber !== undefined) {
      vendor.panCardNumber = normalizeOptional(panCardNumber);
    }
    if (businessAddress !== undefined) {
      vendor.businessAddress = normalizeOptional(businessAddress);
    }
    if (country !== undefined) vendor.country = normalizeOptional(country);
    if (state !== undefined) vendor.state = normalizeOptional(state);
    if (city !== undefined) vendor.city = normalizeOptional(city);
    if (subDistrict !== undefined) vendor.subDistrict = normalizeOptional(subDistrict);
    if (pincode !== undefined) vendor.pincode = normalizeOptional(pincode);

    const profileImageUploadCount = countProfileImageUploads(req);
    if (profileImageUploadCount > 1) {
      throw new AppError("Only one profile image is allowed (use field profile_image)", 400);
    }

    const profileImageFromFile =
      uploadPathFromFieldAliases(req, PROFILE_IMAGE_FIELD_ALIASES) ??
      publicUploadPathFromFile(req, VENDOR_UPLOAD_DIR);
    const profileImageBody =
      profile_image !== undefined ? profile_image : profileImage;
    assignSingleMedia(vendor, "profileImage", profileImageFromFile, profileImageBody);

    const aadhaarFrontFile = uploadPathFromFieldAliases(req, [
      "aadhaarCardFront",
      "aadhaarCard",
    ]);
    assignSingleMedia(
      vendor,
      "aadhaarCardFront",
      aadhaarFrontFile,
      aadhaarCardFront ?? aadhaarCard
    );

    const aadhaarBackFile = uploadPathFromFiles(req, "aadhaarCardBack");
    assignSingleMedia(vendor, "aadhaarCardBack", aadhaarBackFile, aadhaarCardBack);

    const panFrontFile = uploadPathFromFieldAliases(req, ["panCardFront", "panCard"]);
    assignSingleMedia(vendor, "panCardFront", panFrontFile, panCardFront ?? panCard);

    const shopLogoFile = uploadPathFromFiles(req, "shopLogo");
    assignSingleMedia(vendor, "shopLogo", shopLogoFile, shopLogo);

    const shopBannerFile = uploadPathFromFiles(req, "shopBanner");
    assignSingleMedia(vendor, "shopBanner", shopBannerFile, shopBanner);

    const shopImagesFromFiles = uploadPathsFromFieldAliases(req, [
      "shopImages",
      "shop_banner_Images",
      "shop_banner_images",
    ]);
    const parsedShopImages = shopImagesFromBody(shopImages, shop_banner_Images);

    if (shopImagesFromFiles.length || parsedShopImages !== undefined) {
      const prev = [...(vendor.shopImages || [])];
      let next;

      if (parsedShopImages !== undefined && shopImagesFromFiles.length) {
        // Keep URLs from body + add newly uploaded files
        next = [...parsedShopImages, ...shopImagesFromFiles];
      } else if (parsedShopImages !== undefined) {
        // Replace list from client (JSON array of URLs)
        next = parsedShopImages;
      } else {
        // Files only — replace shop images (do not append to existing DB images)
        next = shopImagesFromFiles;
      }

      if (next.length > MAX_SHOP_IMAGES) {
        throw new AppError(
          `Maximum ${MAX_SHOP_IMAGES} shop images allowed. Remove extra images or send shopImages with only the URLs you want to keep.`,
          400
        );
      }
      prev.filter((u) => u && !next.includes(u)).forEach((u) => deleteUploadFileByPublicUrl(u));
      vendor.shopImages = next;
    }

    const shopVideosFromFiles = uploadPathsFromFiles(req, "shopVideos");
    const parsedShopVideos =
      shopVideos !== undefined && shopVideos !== null && String(shopVideos).trim() !== ""
        ? parseStringArrayField(shopVideos)
        : undefined;
    if (shopVideosFromFiles.length || parsedShopVideos !== undefined) {
      const prev = [...(vendor.shopVideos || [])];
      let next;
      if (parsedShopVideos !== undefined && shopVideosFromFiles.length) {
        next = [...parsedShopVideos, ...shopVideosFromFiles];
      } else if (parsedShopVideos !== undefined) {
        next = parsedShopVideos;
      } else {
        next = shopVideosFromFiles;
      }
      prev.filter((u) => u && !next.includes(u)).forEach((u) => deleteUploadFileByPublicUrl(u));
      vendor.shopVideos = next;
    }

    if (bankName !== undefined) vendor.bankName = normalizeOptional(bankName);
    if (branchName !== undefined) vendor.branchName = normalizeOptional(branchName);
    const accountHolderNameValue =
      accountHolderName !== undefined ? accountHolderName : account_holder_name;
    if (accountHolderNameValue !== undefined) {
      vendor.accountHolderName = normalizeOptional(accountHolderNameValue);
    }
    if (accountNo !== undefined) vendor.accountNo = normalizeOptional(accountNo);
    if (ifsc !== undefined) vendor.ifsc = normalizeOptional(ifsc);
    if (accountType !== undefined) {
      if (accountType && !ALLOWED_ACCOUNT_TYPES.has(String(accountType))) {
        throw new AppError("Invalid account type. Use Current or Savings", 400);
      }
      vendor.accountType = accountType;
    }
    if (dob !== undefined) {
      vendor.dob = dob === "" || dob === null ? null : parseDateOnly(dob);
    }
    if (gender !== undefined) {
      if (gender && !ALLOWED_GENDERS.has(String(gender))) {
        throw new AppError("Invalid gender. Use male, female, or other", 400);
      }
      vendor.gender = gender;
    }
    if (fcm_id !== undefined) vendor.fcm_id = normalizeOptional(fcm_id);
    if (showPhoneOnApp !== undefined) {
      const { parseShowPhoneOnAppInput } = require("../../utils/publicVendorContact");
      const parsed = parseShowPhoneOnAppInput(showPhoneOnApp);
      if (parsed === null) {
        throw new AppError("Invalid showPhoneOnApp value", 400);
      }
      vendor.showPhoneOnApp = parsed;
    }

    await vendor.save();
  } catch (err) {
    cleanupUploadedVendorFiles(req);
    throw err;
  }

  const fresh = await loadVendorProfile(vendor._id);
  sendSuccess(res, "Profile updated", { user: toMobileVendorProfile(fresh, req) });
});

/** GET /api/vendor/profile/shop-status — current shop open/close */
exports.getShopStatus = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.user._id).select("isOpen businessName").lean();
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }
  const isOpen = vendor.isOpen !== false;
  sendSuccess(res, "Shop status fetched", {
    isOpen,
    statusLabel: isOpen ? "open" : "closed",
    businessName: vendor.businessName ?? null,
  });
});

/** GET /api/vendor/profile/phone-visibility */
exports.getPhoneVisibility = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.user._id).select("showPhoneOnApp businessPhone phone").lean();
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }
  const showPhoneOnApp = vendor.showPhoneOnApp !== false;
  sendSuccess(res, "Phone visibility fetched", {
    showPhoneOnApp,
    statusLabel: showPhoneOnApp ? "visible" : "hidden",
  });
});

/** PATCH /api/vendor/profile/phone-visibility */
exports.updatePhoneVisibility = asyncHandler(async (req, res) => {
  const { parseShowPhoneOnAppInput } = require("../../utils/publicVendorContact");
  const parsed = parseShowPhoneOnAppInput(
    req.body?.showPhoneOnApp ?? req.body?.showPhone ?? req.body?.visible
  );
  if (parsed === null) {
    throw new AppError("showPhoneOnApp must be true or false", 400);
  }

  const vendor = await Vendor.findById(req.user._id);
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }

  vendor.showPhoneOnApp = parsed;
  await vendor.save();

  const fresh = await loadVendorProfile(vendor._id);
  sendSuccess(
    res,
    parsed
      ? "Your mobile number is visible on the user app."
      : "Your mobile number is hidden on the user app.",
    {
      showPhoneOnApp: vendor.showPhoneOnApp !== false,
      statusLabel: vendor.showPhoneOnApp !== false ? "visible" : "hidden",
      user: toMobileVendorProfile(fresh, req),
    }
  );
});

/** PATCH /api/vendor/profile/shop-status — toggle shop open/close for ecom vendor */
exports.updateShopStatus = asyncHandler(async (req, res) => {
  const { parseIsOpenInput } = require("../../utils/publicVendorVisibility");
  const parsed = parseIsOpenInput(req.body?.isOpen ?? req.body?.shopOpen ?? req.body?.open);
  if (!parsed.ok) {
    throw new AppError(parsed.error, 400);
  }

  const vendor = await Vendor.findById(req.user._id);
  if (!vendor) {
    throw new AppError("Account not found", 404);
  }

  vendor.isOpen = parsed.isOpen;
  await vendor.save();

  sendSuccess(
    res,
    parsed.isOpen
      ? "Shop opened. Your products are visible to users."
      : "Shop closed. Your products are hidden from users.",
    {
      isOpen: vendor.isOpen !== false,
      statusLabel: vendor.isOpen !== false ? "open" : "closed",
      businessName: vendor.businessName ?? null,
    }
  );
});

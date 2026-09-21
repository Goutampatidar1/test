const { VenueVendor } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword } = require("../../utils/password");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { assertObjectId } = require("../../utils/assertObjectId");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { applyVendorApprovalStatus } = require("../../utils/vendorApproval");
const { isValidEmail } = require("../../utils/email");
const { normalizePhone, phoneLookupValues } = require("../../utils/phone");
const {
  resolveVenueVendorDocumentUploads,
  listVenueVendorUploadedPaths,
  assignVenueVendorAadhaarFront,
  assignVenueVendorAadhaarBack,
  assignVenueVendorPanCard,
} = require("../../utils/venueVendorDocuments");

const UPLOAD_FOLDER = "venue-vendor";
const REQUIRED_FIELDS = ["name", "phone"];
const ALLOWED_ACCOUNT_TYPES = new Set(["Current", "Savings"]);

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeAccountType(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim();
  if (!ALLOWED_ACCOUNT_TYPES.has(normalized)) {
    throw new AppError("Invalid account type. Use Current or Savings", 400);
  }
  return normalized;
}

function uploadPathFromFiles(req, field) {
  const file = req.files?.[field]?.[0];
  if (!file) return undefined;
  return `/uploads/${UPLOAD_FOLDER}/${file.filename}`;
}

function uploadedVenueVendorPaths(req) {
  return listVenueVendorUploadedPaths(req, UPLOAD_FOLDER);
}

function cleanupUploadedVenueVendorFiles(req) {
  uploadedVenueVendorPaths(req).forEach((u) => deleteUploadFileByPublicUrl(u));
}

exports.listVenueVendors = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, approvalStatus, search } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (approvalStatus) filter.approvalStatus = approvalStatus;

  const searchOr = searchFilter(search, [
    "name",
    "email",
    "phone",
    "businessName",
    "businessPhone",
    "businessEmail",
    "businessAddress",
    "panNumber",
    "gstNumber",
    "bankName",
    "branchName",
    "accountNumber",
    "ifscCode",
  ]);
  if (searchOr) Object.assign(filter, searchOr);

  const [venueVendors, total] = await Promise.all([
    VenueVendor.find(filter)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueVendor.countDocuments(filter),
  ]);

  res.json({
    venueVendors: venueVendors.map((v) => toPublicProfile(v)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getVenueVendorById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const venueVendor = await VenueVendor.findById(req.params.id).select("-passwordHash");
  if (!venueVendor) {
    throw new AppError("Venue vendor not found", 404);
  }
  res.json({ venueVendor: toPublicProfile(venueVendor) });
});

exports.createVenueVendor = asyncHandler(async (req, res) => {
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
    status,
    approvalStatus,
    rejectionReason,
  } = req.body;

  const phoneRaw = normalizeRequired(phone);
  let phoneNorm = phoneRaw;
  if (phoneRaw) {
    try {
      phoneNorm = normalizePhone(phoneRaw);
    } catch (err) {
      cleanupUploadedVenueVendorFiles(req);
      throw err;
    }
  }

  const payload = {
    name: normalizeRequired(name),
    email: normalizeOptional(email)?.toLowerCase() ?? "",
    password: String(password ?? ""),
    phone: phoneNorm,
    businessName: normalizeRequired(businessName),
    businessAddress: normalizeRequired(businessAddress),
  };

  const missing = REQUIRED_FIELDS.some((k) => !payload[k]);
  if (missing) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError("Name and phone are required", 400);
  }

  if (!payload.businessName || !payload.businessAddress) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError("Business name and address are required", 400);
  }

  if (payload.email && !isValidEmail(payload.email)) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError(
      "Please enter a valid email ending with .com, .net, .co.in, or .in",
      400
    );
  }

  const businessEmailNorm = normalizeOptional(businessEmail)?.toLowerCase() ?? null;
  if (businessEmailNorm && !isValidEmail(businessEmailNorm)) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError(
      "Please enter a valid business email ending with .com, .net, .co.in, or .in",
      400
    );
  }

  if (payload.email) {
    const existing = await VenueVendor.findOne({ email: payload.email });
    if (existing) {
      cleanupUploadedVenueVendorFiles(req);
      throw new AppError("Email is already in use", 409);
    }
  }

  const existingPhone = await VenueVendor.findOne({
    $or: [
      { phoneCanonical: payload.phone },
      { phone: { $in: phoneLookupValues(payload.phone) } },
    ],
  });
  if (existingPhone) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError("Phone number is already in use", 409);
  }

  const profileImageFromFile =
    uploadPathFromFiles(req, "file") ?? publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const documentUploads = resolveVenueVendorDocumentUploads(
    req,
    { aadhaarCardFront, aadhaarCardBack, aadhaarCard, panCard },
    UPLOAD_FOLDER
  );
  if (!documentUploads.aadhaarCardFront || !documentUploads.aadhaarCardBack) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError("Aadhaar front and back are required", 400);
  }
  const passwordHash = payload.password ? await hashPassword(payload.password) : null;
  const approvalDraft = { approvalStatus: approvalStatus || "pending", rejectionReason: null };
  applyVendorApprovalStatus(approvalDraft, {
    approvalStatus: approvalStatus || "pending",
    rejectionReason,
  });

  let venueVendor;
  try {
    venueVendor = await VenueVendor.create({
      name: payload.name,
      email: payload.email || undefined,
      passwordHash,
      phone: payload.phone,
      businessName: payload.businessName,
      businessPhone: normalizeOptional(businessPhone),
      businessEmail: businessEmailNorm,
      businessAddress: payload.businessAddress,
      businessDescription: normalizeOptional(businessDescription),
      panNumber: normalizeOptional(panNumber),
      gstNumber: normalizeOptional(gstNumber),
      bankName: normalizeOptional(bankName),
      branchName: normalizeOptional(branchName),
      accountType: normalizeAccountType(accountType),
      accountNumber: normalizeOptional(accountNumber),
      ifscCode: normalizeOptional(ifscCode),
      aadhaarCardFront: documentUploads.aadhaarCardFront,
      aadhaarCardBack: documentUploads.aadhaarCardBack,
      aadhaarCard: documentUploads.aadhaarCard,
      panCard: documentUploads.panCard,
      profileImage: profileImageFromFile,
      fcm_id: normalizeOptional(fcm_id),
      status: status || "active",
      approvalStatus: approvalDraft.approvalStatus,
      rejectionReason: approvalDraft.rejectionReason,
    });
  } catch (err) {
    cleanupUploadedVenueVendorFiles(req);
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || err.keyValue || {})[0];
      if (key === "email") throw new AppError("Email is already in use", 409);
      if (key === "phone" || key === "phoneCanonical") {
        throw new AppError("Phone number is already in use", 409);
      }
      throw new AppError("Account already exists", 409);
    }
    throw err;
  }

  res.status(201).json({
    message: "Venue vendor created",
    venueVendor: toPublicProfile(await VenueVendor.findById(venueVendor._id)),
  });
});

exports.updateVenueVendor = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const venueVendor = await VenueVendor.findById(req.params.id);
  if (!venueVendor) {
    throw new AppError("Venue vendor not found", 404);
  }

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
    profileImage,
    fcm_id,
    status,
    approvalStatus,
    rejectionReason,
  } = req.body;

  if (email !== undefined) {
    const emailNorm = normalizeOptional(email)?.toLowerCase() ?? "";
    if (emailNorm && !isValidEmail(emailNorm)) {
      cleanupUploadedVenueVendorFiles(req);
      throw new AppError(
        "Please enter a valid email ending with .com, .net, .co.in, or .in",
        400
      );
    }
    if (emailNorm) {
      const taken = await VenueVendor.findOne({
        email: emailNorm,
        _id: { $ne: venueVendor._id },
      });
      if (taken) {
        cleanupUploadedVenueVendorFiles(req);
        throw new AppError("Email is already in use", 409);
      }
      venueVendor.email = emailNorm;
    } else {
      venueVendor.email = undefined;
      if (venueVendor._doc) delete venueVendor._doc.email;
    }
  }

  if (phone !== undefined) {
    const phoneRaw = normalizeRequired(phone);
    if (!phoneRaw) throw new AppError("Phone cannot be empty", 400);
    let phoneNorm;
    try {
      phoneNorm = normalizePhone(phoneRaw);
    } catch (err) {
      cleanupUploadedVenueVendorFiles(req);
      throw err;
    }
    const phoneTaken = await VenueVendor.findOne({
      _id: { $ne: venueVendor._id },
      $or: [
        { phoneCanonical: phoneNorm },
        { phone: { $in: phoneLookupValues(phoneNorm) } },
      ],
    });
    if (phoneTaken) {
      cleanupUploadedVenueVendorFiles(req);
      throw new AppError("Phone number is already in use", 409);
    }
    venueVendor.phone = phoneNorm;
  }

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
  if (businessName !== undefined) {
    const nextName = normalizeRequired(businessName);
    if (!nextName) throw new AppError("Business name is required", 400);
    venueVendor.businessName = nextName;
  }
  if (businessPhone !== undefined) venueVendor.businessPhone = normalizeOptional(businessPhone);
  if (businessEmail !== undefined) {
    const businessEmailNorm = normalizeOptional(businessEmail)?.toLowerCase() ?? null;
    if (businessEmailNorm && !isValidEmail(businessEmailNorm)) {
      throw new AppError(
        "Please enter a valid business email ending with .com, .net, .co.in, or .in",
        400
      );
    }
    venueVendor.businessEmail = businessEmailNorm;
  }
  if (businessAddress !== undefined) {
    const nextAddress = normalizeRequired(businessAddress);
    if (!nextAddress) throw new AppError("Address is required", 400);
    venueVendor.businessAddress = nextAddress;
  }
  if (businessDescription !== undefined) {
    venueVendor.businessDescription = normalizeOptional(businessDescription);
  }
  if (panNumber !== undefined) venueVendor.panNumber = normalizeOptional(panNumber);
  if (gstNumber !== undefined) venueVendor.gstNumber = normalizeOptional(gstNumber);
  if (bankName !== undefined) venueVendor.bankName = normalizeOptional(bankName);
  if (branchName !== undefined) venueVendor.branchName = normalizeOptional(branchName);
  if (accountType !== undefined) {
    venueVendor.accountType = normalizeAccountType(accountType);
  }
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

  if (!venueVendor.aadhaarCardFront && !venueVendor.aadhaarCard) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError("Aadhaar front is required", 400);
  }
  if (!venueVendor.aadhaarCardBack) {
    cleanupUploadedVenueVendorFiles(req);
    throw new AppError("Aadhaar back is required", 400);
  }

  if (fcm_id !== undefined) venueVendor.fcm_id = normalizeOptional(fcm_id);
  if (status !== undefined) venueVendor.status = status;
  if (approvalStatus !== undefined) {
    applyVendorApprovalStatus(venueVendor, { approvalStatus, rejectionReason });
  }
  if (password) venueVendor.passwordHash = await hashPassword(password);

  try {
    await venueVendor.save();
  } catch (err) {
    cleanupUploadedVenueVendorFiles(req);
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || err.keyValue || {})[0];
      if (key === "email") throw new AppError("Email is already in use", 409);
      if (key === "phone" || key === "phoneCanonical") {
        throw new AppError("Phone number is already in use", 409);
      }
      throw new AppError("Account already exists", 409);
    }
    throw err;
  }
  res.json({
    message: "Venue vendor updated",
    venueVendor: toPublicProfile(await VenueVendor.findById(venueVendor._id)),
  });
});

exports.deleteVenueVendor = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const venueVendor = await VenueVendor.findById(req.params.id);
  if (!venueVendor) {
    throw new AppError("Venue vendor not found", 404);
  }
  [
    venueVendor.profileImage,
    venueVendor.aadhaarCardFront,
    venueVendor.aadhaarCardBack,
    venueVendor.aadhaarCard,
    venueVendor.panCard,
  ].forEach((u) => deleteUploadFileByPublicUrl(u));
  await VenueVendor.findByIdAndDelete(req.params.id);
  res.json({ message: "Venue vendor deleted" });
});

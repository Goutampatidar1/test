const { DeliveryBoy } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword } = require("../../utils/password");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { assertObjectId } = require("../../utils/assertObjectId");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { loadActiveSubDistrict } = require("../../utils/shippingAddress");
const {
  assertDeliveryVehicleFields,
  assertDeliveryBankFields,
  assertDeliveryDocumentsPresent,
} = require("../../utils/deliveryBoyValidation");

const UPLOAD_FOLDER = "delivery";
const ALLOWED_STATUS = new Set(["active", "inactive", "blocked"]);
const ALLOWED_APPROVAL_STATUS = new Set(["pending", "approved", "rejected", "suspended"]);

function uploadedDeliveryFiles(req) {
  const files = req.files || {};
  const pick = (names) => {
    for (const name of names) {
      if (files[name]?.[0]) {
        return `/uploads/${UPLOAD_FOLDER}/${files[name][0].filename}`;
      }
    }
    return undefined;
  };

  return {
    profileImage: files.file?.[0] ? `/uploads/${UPLOAD_FOLDER}/${files.file[0].filename}` : publicUploadPathFromFile(req, UPLOAD_FOLDER),
    drivingLicenseFront: pick(["drivingLicenseFront", "driving_license_front", "driving_license"]),
    drivingLicenseBack: pick(["drivingLicenseBack", "driving_license_back"]),
    aadhaarCardFront: pick(["aadhaarCardFront", "aadharCardFront", "aadhaarCard", "aadharCard", "aadhar_card", "aadhaar_card"]),
    aadhaarCardBack: pick(["aadhaarCardBack", "aadharCardBack"]),
  };
}

function uploadedDeliveryPaths(uploaded = {}) {
  return [
    uploaded.profileImage,
    uploaded.drivingLicenseFront,
    uploaded.drivingLicenseBack,
    uploaded.aadhaarCardFront,
    uploaded.aadhaarCardBack,
  ];
}

async function resolveDeliverySubDistrictFields(body) {
  const subDistrictId = body.subDistrictId ?? body.sub_district_id;
  const subDistrictName = body.subDistrict ?? body.sub_district;

  if (subDistrictId === "" || subDistrictId === null) {
    return { subDistrict: null, subDistrictId: null };
  }

  if (subDistrictId === undefined && subDistrictName === undefined) {
    return null;
  }

  const subDistrictDoc = await loadActiveSubDistrict({
    subDistrictId: subDistrictId || "",
    subDistrictName: subDistrictName || "",
    cityName: body.city || "",
  });

  if (!subDistrictDoc) {
    throw new AppError("Valid sub-district is required", 400);
  }

  return {
    subDistrict: subDistrictDoc.name,
    subDistrictId: subDistrictDoc._id,
    city: subDistrictDoc.city?.name || body.city || null,
  };
}

function deleteUploaded(paths = []) {
  const unique = new Set(paths.filter(Boolean));
  unique.forEach((path) => deleteUploadFileByPublicUrl(path));
}

exports.listDeliveryBoys = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, approvalStatus, search, subDistrictId } = req.query;

  const filter = {};
  if (status) {
    filter.status = status;
  }
  if (approvalStatus) {
    filter.approvalStatus = approvalStatus;
  }
  if (subDistrictId) {
    assertObjectId(subDistrictId, "Invalid subDistrictId filter");
    filter.subDistrictId = subDistrictId;
  }
  const searchOr = searchFilter(search, [
    "name",
    "email",
    "phone",
    "city",
    "licenseNumber",
    "vehicleRegistrationNumber",
    "vehicleType",
  ]);
  if (searchOr) {
    Object.assign(filter, searchOr);
  }

  const [deliveryBoys, total] = await Promise.all([
    DeliveryBoy.find(filter)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DeliveryBoy.countDocuments(filter),
  ]);

  res.json({
    deliveryBoys: deliveryBoys.map((d) => toPublicProfile(d)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

function toAdminDeliveryBoyProfile(deliveryBoy) {
  const profile = toPublicProfile(deliveryBoy);
  if (!profile) return null;

  const subDistrictRef = deliveryBoy.subDistrictId;
  if (subDistrictRef && typeof subDistrictRef === "object" && subDistrictRef._id) {
    profile.subDistrictId = subDistrictRef._id;
    profile.subDistrict = subDistrictRef.name || profile.subDistrict || "";
    profile.cityId = subDistrictRef.city?._id || null;
    if (subDistrictRef.city?.name) {
      profile.city = subDistrictRef.city.name;
    }
  }

  return profile;
}

exports.getDeliveryBoyById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const deliveryBoy = await DeliveryBoy.findById(req.params.id)
    .select("-passwordHash")
    .populate({
      path: "subDistrictId",
      select: "name city",
      populate: { path: "city", select: "name state" },
    })
    .lean();
  if (!deliveryBoy) {
    throw new AppError("Delivery partner not found", 404);
  }
  res.json({ deliveryBoy: toAdminDeliveryBoyProfile(deliveryBoy) });
});

exports.createDeliveryBoy = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    dob,
    gender,
    fcm_id,
    city,
    subDistrict,
    subDistrictId,
    address,
    profileImage,
    vehicleRegistrationNumber,
    licenseNumber,
    vehicleType,
    drivingLicenseFront,
    drivingLicenseBack,
    aadhaarCardFront,
    aadhaarCardBack,
    aadhaarCard,
    bankAccountName,
    accountNumber,
    bankName,
    branchName,
    ifscCode,
    status,
    approvalStatus,
  } = req.body;

  const uploaded = uploadedDeliveryFiles(req);

  if (!name || !email || !phone) {
    deleteUploaded(uploadedDeliveryPaths(uploaded));
    throw new AppError("Name, email, and phone are required", 400);
  }

  if (!subDistrictId && !subDistrict) {
    deleteUploaded(uploadedDeliveryPaths(uploaded));
    throw new AppError("Sub-district is required", 400);
  }

  const emailNorm = String(email).toLowerCase().trim();
  const existing = await DeliveryBoy.findOne({ email: emailNorm });
  if (existing) {
    deleteUploaded(uploadedDeliveryPaths(uploaded));
    throw new AppError("Email is already in use", 409);
  }

  const passwordNorm = String(password ?? "").trim();
  if (!passwordNorm || passwordNorm.length < 8) {
    deleteUploaded(uploadedDeliveryPaths(uploaded));
    throw new AppError("Password is required and must be at least 8 characters", 400);
  }

  const passwordHash = await hashPassword(passwordNorm);
  let deliveryBoy;
  try {
    const normalizedStatus = status || "active";
    const normalizedApprovalStatus = approvalStatus || "pending";
    if (!ALLOWED_STATUS.has(normalizedStatus)) throw new AppError("Invalid status", 400);
    if (!ALLOWED_APPROVAL_STATUS.has(normalizedApprovalStatus)) throw new AppError("Invalid approval status", 400);

    const vehicleFields = assertDeliveryVehicleFields(req.body, { requireAll: true });
    const bankFields = assertDeliveryBankFields(req.body, { requireAll: true });

    const subDistrictFields =
      subDistrictId || subDistrict ? await resolveDeliverySubDistrictFields(req.body) : null;

    const resolvedDrivingLicenseFront = uploaded.drivingLicenseFront ?? drivingLicenseFront ?? null;
    const resolvedDrivingLicenseBack = uploaded.drivingLicenseBack ?? drivingLicenseBack ?? null;
    const resolvedAadhaarCardFront =
      uploaded.aadhaarCardFront ?? aadhaarCardFront ?? aadhaarCard ?? null;
    const resolvedAadhaarCardBack = uploaded.aadhaarCardBack ?? aadhaarCardBack ?? null;

    assertDeliveryDocumentsPresent(
      {
        drivingLicenseFront: resolvedDrivingLicenseFront,
        drivingLicenseBack: resolvedDrivingLicenseBack,
        aadhaarCardFront: resolvedAadhaarCardFront,
        aadhaarCardBack: resolvedAadhaarCardBack,
      },
      { requireAll: true }
    );

    deliveryBoy = await DeliveryBoy.create({
      name,
      email: emailNorm,
      passwordHash,
      phone,
      dob: dob === "" ? undefined : dob,
      gender,
      fcm_id,
      city: subDistrictFields?.city ?? city ?? null,
      subDistrict: subDistrictFields?.subDistrict ?? null,
      subDistrictId: subDistrictFields?.subDistrictId ?? null,
      address: address ?? null,
      vehicleRegistrationNumber: vehicleFields.vehicleRegistrationNumber,
      licenseNumber: vehicleFields.licenseNumber,
      vehicleType: vehicleFields.vehicleType,
      drivingLicenseFront: resolvedDrivingLicenseFront,
      drivingLicenseBack: resolvedDrivingLicenseBack,
      aadhaarCardFront: resolvedAadhaarCardFront,
      aadhaarCardBack: resolvedAadhaarCardBack,
      aadhaarCard: resolvedAadhaarCardFront,
      bankAccountName: bankFields.bankAccountName,
      accountNumber: bankFields.accountNumber,
      bankName: bankFields.bankName,
      branchName: bankFields.branchName,
      ifscCode: bankFields.ifscCode,
      status: normalizedStatus,
      approvalStatus: normalizedApprovalStatus,
      profileImage: uploaded.profileImage ?? profileImage ?? null,
    });
  } catch (err) {
    deleteUploaded(uploadedDeliveryPaths(uploaded));
    throw err;
  }

  res.status(201).json({
    message: "Delivery partner created",
    deliveryBoy: toPublicProfile(
      await DeliveryBoy.findById(deliveryBoy._id).select("-passwordHash")
    ),
  });
});

exports.updateDeliveryBoy = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const deliveryBoy = await DeliveryBoy.findById(req.params.id);
  if (!deliveryBoy) {
    throw new AppError("Delivery partner not found", 404);
  }

  const {
    name,
    email,
    password,
    phone,
    dob,
    gender,
    fcm_id,
    city,
    subDistrict,
    subDistrictId,
    address,
    profileImage,
    vehicleRegistrationNumber,
    licenseNumber,
    vehicleType,
    drivingLicenseFront,
    drivingLicenseBack,
    aadhaarCardFront,
    aadhaarCardBack,
    aadhaarCard,
    bankAccountName,
    accountNumber,
    bankName,
    branchName,
    ifscCode,
    status,
    approvalStatus,
  } = req.body;
  const uploaded = uploadedDeliveryFiles(req);

  if (email !== undefined) {
    const emailNorm = String(email).toLowerCase().trim();
    const taken = await DeliveryBoy.findOne({
      email: emailNorm,
      _id: { $ne: deliveryBoy._id },
    });
    if (taken) {
      deleteUploaded(uploadedDeliveryPaths(uploaded));
      throw new AppError("Email is already in use", 409);
    }
    deliveryBoy.email = emailNorm;
  }

  if (uploaded.profileImage) {
    deleteUploadFileByPublicUrl(deliveryBoy.profileImage);
    deliveryBoy.profileImage = uploaded.profileImage;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
    if (profileImage === "" || profileImage === null) {
      deleteUploadFileByPublicUrl(deliveryBoy.profileImage);
      deliveryBoy.profileImage = null;
    } else if (profileImage !== deliveryBoy.profileImage) {
      deleteUploadFileByPublicUrl(deliveryBoy.profileImage);
      deliveryBoy.profileImage = profileImage;
    }
  }

  if (name !== undefined) {
    deliveryBoy.name = name;
  }
  if (phone !== undefined) {
    deliveryBoy.phone = phone;
  }
  if (dob !== undefined) {
    deliveryBoy.dob = dob === "" ? null : dob;
  }
  if (gender !== undefined) {
    deliveryBoy.gender = gender;
  }
  if (fcm_id !== undefined) {
    deliveryBoy.fcm_id = fcm_id;
  }
  if (city !== undefined) {
    deliveryBoy.city = city === "" ? null : city;
  }
  if (
    subDistrictId !== undefined ||
    subDistrict !== undefined ||
    Object.prototype.hasOwnProperty.call(req.body, "sub_district_id") ||
    Object.prototype.hasOwnProperty.call(req.body, "sub_district")
  ) {
    const subDistrictFields = await resolveDeliverySubDistrictFields(req.body);
    if (subDistrictFields) {
      deliveryBoy.subDistrict = subDistrictFields.subDistrict;
      deliveryBoy.subDistrictId = subDistrictFields.subDistrictId;
      if (subDistrictFields.city) deliveryBoy.city = subDistrictFields.city;
    }
  }
  if (address !== undefined) {
    deliveryBoy.address = address === "" ? null : address;
  }

  const vehicleFields = assertDeliveryVehicleFields(req.body, { requireAll: false });
  if (vehicleFields.vehicleRegistrationNumber !== undefined) {
    deliveryBoy.vehicleRegistrationNumber = vehicleFields.vehicleRegistrationNumber;
  } else if (vehicleRegistrationNumber !== undefined) {
    deliveryBoy.vehicleRegistrationNumber = vehicleRegistrationNumber === "" ? null : vehicleRegistrationNumber;
  }
  if (vehicleFields.licenseNumber !== undefined) {
    deliveryBoy.licenseNumber = vehicleFields.licenseNumber;
  } else if (licenseNumber !== undefined) {
    deliveryBoy.licenseNumber = licenseNumber === "" ? null : licenseNumber;
  }
  if (vehicleFields.vehicleType !== undefined) {
    deliveryBoy.vehicleType = vehicleFields.vehicleType;
  } else if (vehicleType !== undefined) {
    deliveryBoy.vehicleType = vehicleType === "" ? null : vehicleType;
  }

  const bankFields = assertDeliveryBankFields(req.body, { requireAll: false });
  if (bankFields.ifscCode !== undefined) {
    deliveryBoy.ifscCode = bankFields.ifscCode;
  } else if (ifscCode !== undefined) {
    deliveryBoy.ifscCode = ifscCode === "" ? null : ifscCode;
  }
  if (bankFields.accountNumber !== undefined) {
    deliveryBoy.accountNumber = bankFields.accountNumber;
  } else if (accountNumber !== undefined) {
    deliveryBoy.accountNumber = accountNumber === "" ? null : accountNumber;
  }
  if (bankFields.bankAccountName !== undefined) {
    deliveryBoy.bankAccountName = bankFields.bankAccountName;
  } else if (bankAccountName !== undefined) {
    deliveryBoy.bankAccountName = bankAccountName === "" ? null : bankAccountName;
  }
  if (bankFields.bankName !== undefined) {
    deliveryBoy.bankName = bankFields.bankName;
  } else if (bankName !== undefined) {
    deliveryBoy.bankName = bankName === "" ? null : bankName;
  }
  if (bankFields.branchName !== undefined) {
    deliveryBoy.branchName = bankFields.branchName;
  } else if (branchName !== undefined) {
    deliveryBoy.branchName = branchName === "" ? null : branchName;
  }

  if (drivingLicenseFront !== undefined) {
    deliveryBoy.drivingLicenseFront = drivingLicenseFront === "" ? null : drivingLicenseFront;
  }
  if (uploaded.drivingLicenseFront) {
    deleteUploadFileByPublicUrl(deliveryBoy.drivingLicenseFront);
    deliveryBoy.drivingLicenseFront = uploaded.drivingLicenseFront;
  }
  if (drivingLicenseBack !== undefined) {
    deliveryBoy.drivingLicenseBack = drivingLicenseBack === "" ? null : drivingLicenseBack;
  }
  if (uploaded.drivingLicenseBack) {
    deleteUploadFileByPublicUrl(deliveryBoy.drivingLicenseBack);
    deliveryBoy.drivingLicenseBack = uploaded.drivingLicenseBack;
  }
  if (aadhaarCardFront !== undefined) {
    deliveryBoy.aadhaarCardFront = aadhaarCardFront === "" ? null : aadhaarCardFront;
  }
  if (uploaded.aadhaarCardFront) {
    deleteUploadFileByPublicUrl(deliveryBoy.aadhaarCardFront);
    deliveryBoy.aadhaarCardFront = uploaded.aadhaarCardFront;
    deliveryBoy.aadhaarCard = uploaded.aadhaarCardFront;
  } else if (aadhaarCard !== undefined) {
    deliveryBoy.aadhaarCardFront = aadhaarCard === "" ? null : aadhaarCard;
    deliveryBoy.aadhaarCard = aadhaarCard === "" ? null : aadhaarCard;
  }
  if (aadhaarCardBack !== undefined) {
    deliveryBoy.aadhaarCardBack = aadhaarCardBack === "" ? null : aadhaarCardBack;
  }
  if (uploaded.aadhaarCardBack) {
    deleteUploadFileByPublicUrl(deliveryBoy.aadhaarCardBack);
    deliveryBoy.aadhaarCardBack = uploaded.aadhaarCardBack;
  }

  assertDeliveryBankFields(
    {
      bankAccountName: deliveryBoy.bankAccountName,
      accountNumber: deliveryBoy.accountNumber,
      bankName: deliveryBoy.bankName,
      branchName: deliveryBoy.branchName,
      ifscCode: deliveryBoy.ifscCode,
    },
    { requireAll: true }
  );

  if (status !== undefined) {
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    deliveryBoy.status = status;
  }
  if (approvalStatus !== undefined) {
    if (!ALLOWED_APPROVAL_STATUS.has(approvalStatus)) throw new AppError("Invalid approval status", 400);
    deliveryBoy.approvalStatus = approvalStatus;
  }
  if (password) {
    deliveryBoy.passwordHash = await hashPassword(password);
  }

  await deliveryBoy.save();
  res.json({
    message: "Delivery partner updated",
    deliveryBoy: toPublicProfile(
      await DeliveryBoy.findById(deliveryBoy._id).select("-passwordHash")
    ),
  });
});

exports.deleteDeliveryBoy = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const deliveryBoy = await DeliveryBoy.findById(req.params.id);
  if (!deliveryBoy) {
    throw new AppError("Delivery partner not found", 404);
  }
  deleteUploaded([
    deliveryBoy.profileImage,
    deliveryBoy.drivingLicenseFront,
    deliveryBoy.drivingLicenseBack,
    deliveryBoy.aadhaarCardFront,
    deliveryBoy.aadhaarCardBack,
    deliveryBoy.aadhaarCard,
  ]);
  await DeliveryBoy.findByIdAndDelete(req.params.id);
  res.json({ message: "Delivery partner deleted" });
});

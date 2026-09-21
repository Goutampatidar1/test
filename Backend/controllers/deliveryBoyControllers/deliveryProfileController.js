const { DeliveryBoy } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { toMobileDeliveryProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { sendSuccess } = require("../../utils/apiResponse");
const { normalizePhone } = require("../../utils/phone");
const { resolveDeliveryUploadPath } = require("../../utils/deliveryUploadFiles");

const PROFILE_IMAGE_FIELDS = ["file", "profileImage", "profile_image"];
const AADHAAR_CARD_FIELDS = ["aadhaarCard", "aadharCard", "aadhar_card", "aadhaar_card"];
const AADHAAR_CARD_FRONT_FIELDS = [
  "aadhaarCardFront",
  "aadharCardFront",
  ...AADHAAR_CARD_FIELDS,
];
const AADHAAR_CARD_BACK_FIELDS = ["aadhaarCardBack", "aadharCardBack"];

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
  return norm || null;
}

function pickBodyField(body, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key];
    }
  }
  return undefined;
}

function profileImageFromUpload(req) {
  return resolveDeliveryUploadPath(req, PROFILE_IMAGE_FIELDS);
}

function uploadPathFromFields(req, fieldNames) {
  return resolveDeliveryUploadPath(req, fieldNames);
}

function assignSingleMedia(record, field, uploadedPath, bodyValue) {
  if (uploadedPath) {
    deleteUploadFileByPublicUrl(record[field]);
    record[field] = uploadedPath;
    return uploadedPath;
  }

  if (bodyValue === undefined) return null;

  if (bodyValue === "" || bodyValue === null) {
    deleteUploadFileByPublicUrl(record[field]);
    record[field] = null;
    return null;
  }

  const next = String(bodyValue).trim();
  if (next && next !== record[field]) {
    deleteUploadFileByPublicUrl(record[field]);
    record[field] = next;
  }

  return null;
}

function assignProfileImage(deliveryBoy, uploadedPath, bodyValue) {
  if (uploadedPath) {
    deleteUploadFileByPublicUrl(deliveryBoy.profileImage);
    deliveryBoy.profileImage = uploadedPath;
    return;
  }

  if (bodyValue === undefined) return;

  if (bodyValue === "" || bodyValue === null) {
    deleteUploadFileByPublicUrl(deliveryBoy.profileImage);
    deliveryBoy.profileImage = null;
    return;
  }

  const next = String(bodyValue).trim();
  if (next && next !== deliveryBoy.profileImage) {
    deleteUploadFileByPublicUrl(deliveryBoy.profileImage);
    deliveryBoy.profileImage = next;
  }
}

async function assertEmailAvailable(emailNorm, excludeId) {
  if (!emailNorm) return;
  const taken = await DeliveryBoy.findOne({
    email: emailNorm,
    _id: { $ne: excludeId },
  }).select("_id");
  if (taken) {
    throw new AppError("Email is already in use", 409);
  }
}

async function assertPhoneAvailable(phoneNorm, excludeId) {
  const taken = await DeliveryBoy.findOne({
    phone: phoneNorm,
    _id: { $ne: excludeId },
  }).select("_id");
  if (taken) {
    throw new AppError("Mobile number is already in use", 409);
  }
}

/** GET /api/delivery/profile — profile screen header + personal info form */
exports.getProfile = asyncHandler(async (req, res) => {
  const deliveryBoy = await DeliveryBoy.findById(req.user._id).select("-passwordHash");
  if (!deliveryBoy) {
    throw new AppError("Account not found", 404);
  }

  sendSuccess(res, "Profile fetched", toMobileDeliveryProfile(deliveryBoy, req));
});

/** PATCH /api/delivery/profile — Personal Information → Save Changes */
exports.updateProfile = asyncHandler(async (req, res) => {
  const deliveryBoy = await DeliveryBoy.findById(req.user._id);
  if (!deliveryBoy) {
    throw new AppError("Account not found", 404);
  }

  const body = req.body || {};
  const nameRaw = pickBodyField(body, ["name", "fullName", "full_name"]);
  const phoneRaw = pickBodyField(body, ["phone", "mobile", "mobileNumber", "mobile_number"]);
  const emailRaw = pickBodyField(body, ["email", "emailId", "email_id"]);
  const vehicleRaw = pickBodyField(body, [
    "vehicleRegistrationNumber",
    "vehicleNumber",
    "vehicle_number",
  ]);
  const profileImageBody = pickBodyField(body, ["profileImage", "profile_image"]);
  const aadhaarCardFrontBody = pickBodyField(body, AADHAAR_CARD_FRONT_FIELDS);
  const aadhaarCardBackBody = pickBodyField(body, AADHAAR_CARD_BACK_FIELDS);
  const uploadedProfileImage = profileImageFromUpload(req);
  const uploadedAadhaarFront = uploadPathFromFields(req, AADHAAR_CARD_FRONT_FIELDS);
  const uploadedAadhaarBack = uploadPathFromFields(req, AADHAAR_CARD_BACK_FIELDS);
  const uploadedPaths = [uploadedProfileImage, uploadedAadhaarFront, uploadedAadhaarBack].filter(Boolean);

  try {
    if (nameRaw !== undefined) {
      const name = normalizeRequired(nameRaw);
      if (!name) {
        throw new AppError("Full name is required", 400);
      }
      deliveryBoy.name = name;
    }

    if (phoneRaw !== undefined) {
      const phoneNorm = normalizePhone(phoneRaw);
      if (phoneNorm !== deliveryBoy.phone) {
        await assertPhoneAvailable(phoneNorm, deliveryBoy._id);
      }
      deliveryBoy.phone = phoneNorm;
    }

    if (emailRaw !== undefined) {
      const emailNorm = normalizeOptionalEmail(emailRaw);
      if (emailNorm) {
        await assertEmailAvailable(emailNorm, deliveryBoy._id);
        deliveryBoy.email = emailNorm;
      }
    }

    if (vehicleRaw !== undefined) {
      const vehicleNumber = normalizeRequired(vehicleRaw);
      if (!vehicleNumber) {
        throw new AppError("Vehicle number is required", 400);
      }
      deliveryBoy.vehicleRegistrationNumber = vehicleNumber;
    }

    assignProfileImage(deliveryBoy, uploadedProfileImage, profileImageBody);
    assignSingleMedia(
      deliveryBoy,
      "aadhaarCardFront",
      uploadedAadhaarFront,
      aadhaarCardFrontBody
    );
    assignSingleMedia(
      deliveryBoy,
      "aadhaarCardBack",
      uploadedAadhaarBack,
      aadhaarCardBackBody
    );
    if (deliveryBoy.aadhaarCardFront) {
      deliveryBoy.aadhaarCard = deliveryBoy.aadhaarCardFront;
    } else if (aadhaarCardFrontBody === "" || aadhaarCardFrontBody === null) {
      deliveryBoy.aadhaarCard = null;
    }

    await deliveryBoy.save();

    const fresh = await DeliveryBoy.findById(deliveryBoy._id).select("-passwordHash");
    sendSuccess(res, "Profile updated successfully", toMobileDeliveryProfile(fresh, req));
  } catch (err) {
    uploadedPaths.forEach((path) => deleteUploadFileByPublicUrl(path));
    throw err;
  }
});

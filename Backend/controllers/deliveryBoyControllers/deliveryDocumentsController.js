const { DeliveryBoy } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { getPublicBaseUrl, toAbsoluteUploadUrl } = require("../../utils/mediaUrl");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { sendSuccess } = require("../../utils/apiResponse");
const { resolveDeliveryUploadPath } = require("../../utils/deliveryUploadFiles");

const DRIVING_LICENSE_FRONT_FIELDS = [
  "drivingLicenseFront",
  "drivingLicense",
  "driving_license_front",
  "driving_license",
];
const DRIVING_LICENSE_BACK_FIELDS = [
  "drivingLicenseBack",
  "driving_license_back",
];
const AADHAAR_CARD_FIELDS = ["aadhaarCard", "aadharCard", "aadhar_card", "aadhaar_card"];
const AADHAAR_CARD_FRONT_FIELDS = [
  "aadhaarCardFront",
  "aadharCardFront",
  ...AADHAAR_CARD_FIELDS,
];
const AADHAAR_CARD_BACK_FIELDS = ["aadhaarCardBack", "aadharCardBack"];

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function pickBodyField(body, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key];
    }
  }
  return undefined;
}

function uploadPathFromFields(req, fieldNames) {
  return resolveDeliveryUploadPath(req, fieldNames);
}

function documentStatus(imageUrl) {
  return imageUrl ? "uploaded" : "pending";
}

function toDocumentItem({ image, status, extra = {} }) {
  return {
    status,
    image: image || null,
    ...extra,
  };
}

function toMobileDocumentsPayload(deliveryBoy, req) {
  const baseUrl = getPublicBaseUrl(req);
  const drivingLicenseFront = toAbsoluteUploadUrl(
    deliveryBoy.drivingLicenseFront,
    baseUrl
  );
  const drivingLicenseBack = toAbsoluteUploadUrl(
    deliveryBoy.drivingLicenseBack,
    baseUrl
  );
  const aadhaarCardFront = toAbsoluteUploadUrl(
    deliveryBoy.aadhaarCardFront || deliveryBoy.aadhaarCard,
    baseUrl
  );
  const aadhaarCardBack = toAbsoluteUploadUrl(deliveryBoy.aadhaarCardBack, baseUrl);

  return {
    drivingLicense: toDocumentItem({
      image: drivingLicenseFront || drivingLicenseBack || null,
      status: documentStatus(drivingLicenseFront || drivingLicenseBack),
      extra: {
        licenseNumber: deliveryBoy.licenseNumber || null,
        drivingLicenseFront,
        drivingLicenseBack,
      },
    }),
    aadharCard: toDocumentItem({
      image: aadhaarCardFront || aadhaarCardBack || null,
      status: documentStatus(aadhaarCardFront || aadhaarCardBack),
      extra: {
        aadhaarCardFront,
        aadhaarCardBack,
      },
    }),
  };
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

/** GET /api/delivery/documents */
exports.getDocuments = asyncHandler(async (req, res) => {
  const deliveryBoy = await DeliveryBoy.findById(req.user._id).select(
    "licenseNumber drivingLicenseFront drivingLicenseBack aadhaarCardFront aadhaarCardBack aadhaarCard"
  );
  if (!deliveryBoy) {
    throw new AppError("Account not found", 404);
  }

  sendSuccess(res, "Documents fetched", toMobileDocumentsPayload(deliveryBoy, req));
});

/** PATCH /api/delivery/documents — Save Changes */
exports.updateDocuments = asyncHandler(async (req, res) => {
  const deliveryBoy = await DeliveryBoy.findById(req.user._id);
  if (!deliveryBoy) {
    throw new AppError("Account not found", 404);
  }

  const body = req.body || {};
  const licenseNumberRaw = pickBodyField(body, ["licenseNumber", "license_number"]);
  const drivingLicenseFrontBody = pickBodyField(body, DRIVING_LICENSE_FRONT_FIELDS);
  const drivingLicenseBackBody = pickBodyField(body, DRIVING_LICENSE_BACK_FIELDS);
  const aadhaarCardFrontBody = pickBodyField(body, AADHAAR_CARD_FRONT_FIELDS);
  const aadhaarCardBackBody = pickBodyField(body, AADHAAR_CARD_BACK_FIELDS);

  const uploadedFront = uploadPathFromFields(req, DRIVING_LICENSE_FRONT_FIELDS);
  const uploadedBack = uploadPathFromFields(req, DRIVING_LICENSE_BACK_FIELDS);
  const uploadedAadhaarFront = uploadPathFromFields(req, AADHAAR_CARD_FRONT_FIELDS);
  const uploadedAadhaarBack = uploadPathFromFields(req, AADHAAR_CARD_BACK_FIELDS);
  const uploadedPaths = [uploadedFront, uploadedBack, uploadedAadhaarFront, uploadedAadhaarBack].filter(Boolean);

  try {
    if (licenseNumberRaw !== undefined) {
      deliveryBoy.licenseNumber = normalizeOptional(licenseNumberRaw);
    }

    assignSingleMedia(
      deliveryBoy,
      "drivingLicenseFront",
      uploadedFront,
      drivingLicenseFrontBody
    );
    assignSingleMedia(
      deliveryBoy,
      "drivingLicenseBack",
      uploadedBack,
      drivingLicenseBackBody
    );
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
    }

    await deliveryBoy.save();

    const fresh = await DeliveryBoy.findById(deliveryBoy._id).select(
      "licenseNumber drivingLicenseFront drivingLicenseBack aadhaarCardFront aadhaarCardBack aadhaarCard"
    );
    sendSuccess(res, "Documents updated successfully", toMobileDocumentsPayload(fresh, req));
  } catch (err) {
    uploadedPaths.forEach((path) => deleteUploadFileByPublicUrl(path));
    throw err;
  }
});

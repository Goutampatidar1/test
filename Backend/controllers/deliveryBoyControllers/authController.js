const { DeliveryBoy } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword } = require("../../utils/password");
const { signAccessToken } = require("../../utils/jwt");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const mobileAuth = require("./deliveryMobileAuth");
const profileController = require("./deliveryProfileController");

const DELIVERY_UPLOAD_DIR = "delivery";

function uploadedDeliveryFiles(req) {
  const files = req.files || {};
  return {
    profileImage: files.file?.[0] ? `/uploads/${DELIVERY_UPLOAD_DIR}/${files.file[0].filename}` : undefined,
    drivingLicenseFront: files.drivingLicenseFront?.[0]
      ? `/uploads/${DELIVERY_UPLOAD_DIR}/${files.drivingLicenseFront[0].filename}`
      : undefined,
    drivingLicenseBack: files.drivingLicenseBack?.[0]
      ? `/uploads/${DELIVERY_UPLOAD_DIR}/${files.drivingLicenseBack[0].filename}`
      : undefined,
  };
}

function deleteUploaded(paths = []) {
  const unique = new Set(paths.filter(Boolean));
  unique.forEach((path) => deleteUploadFileByPublicUrl(path));
}

exports.register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    dob,
    gender,
    fcm_id,
    city,
    address,
    profileImage,
    vehicleRegistrationNumber,
    licenseNumber,
    vehicleType,
    drivingLicenseFront,
    drivingLicenseBack,
    bankAccountName,
    accountNumber,
    bankName,
    branchName,
    ifscCode,
  } = req.body;
  const uploaded = uploadedDeliveryFiles(req);

  if (!name || !email || !password || !phone) {
    deleteUploaded([uploaded.profileImage, uploaded.drivingLicenseFront, uploaded.drivingLicenseBack]);
    throw new AppError("Name, email, password, and phone are required", 400);
  }

  const existing = await DeliveryBoy.findOne({
    email: String(email).toLowerCase(),
  });
  if (existing) {
    deleteUploaded([uploaded.profileImage, uploaded.drivingLicenseFront, uploaded.drivingLicenseBack]);
    throw new AppError("Email is already registered", 409);
  }

  const passwordHash = await hashPassword(password);
  let deliveryBoy;
  try {
    deliveryBoy = await DeliveryBoy.create({
      name,
      email,
      passwordHash,
      phone,
      dob,
      gender,
      fcm_id,
      city: city ?? null,
      address: address ?? null,
      profileImage: uploaded.profileImage ?? profileImage,
      vehicleRegistrationNumber: vehicleRegistrationNumber ?? null,
      licenseNumber,
      vehicleType,
      drivingLicenseFront: uploaded.drivingLicenseFront ?? drivingLicenseFront ?? null,
      drivingLicenseBack: uploaded.drivingLicenseBack ?? drivingLicenseBack ?? null,
      bankAccountName: bankAccountName ?? null,
      accountNumber: accountNumber ?? null,
      bankName: bankName ?? null,
      branchName: branchName ?? null,
      ifscCode: ifscCode ?? null,
      status: "active",
      approvalStatus: "pending",
    });
  } catch (err) {
    deleteUploaded([uploaded.profileImage, uploaded.drivingLicenseFront, uploaded.drivingLicenseBack]);
    throw err;
  }

  const token = signAccessToken({
    sub: deliveryBoy._id.toString(),
    role: "deliveryBoy",
  });

  res.status(201).json({
    message: "Registered successfully",
    user: toPublicProfile(deliveryBoy),
    token,
  });
});

exports.login = mobileAuth.login;
exports.refresh = mobileAuth.refresh;
exports.sendForgotPasswordOtp = mobileAuth.sendForgotPasswordOtp;
exports.verifyForgotPasswordOtp = mobileAuth.verifyForgotPasswordOtp;
exports.forgotPassword = mobileAuth.forgotPassword;
exports.resetPassword = mobileAuth.resetPassword;
exports.changePassword = mobileAuth.changePassword;
exports.getMe = mobileAuth.getMe;
exports.updateMe = profileController.updateProfile;

exports.deleteMe = asyncHandler(async (req, res) => {
  const deliveryBoy = await DeliveryBoy.findById(req.user._id);
  if (!deliveryBoy) {
    throw new AppError("Account not found", 404);
  }
  deleteUploaded([
    deliveryBoy.profileImage,
    deliveryBoy.drivingLicenseFront,
    deliveryBoy.drivingLicenseBack,
  ]);
  await DeliveryBoy.findByIdAndDelete(req.user._id);
  res.json({ message: "Account deleted" });
});

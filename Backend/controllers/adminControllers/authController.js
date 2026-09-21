const crypto = require("crypto");
const { Admin } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword, comparePassword } = require("../../utils/password");
const { signAccessToken, signRefreshToken, verifyRefreshToken, withTokenExpiryMeta } = require("../../utils/jwt");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");

const ADMIN_UPLOAD_DIR = "admin";

function profilePathFromFile(req) {
  if (!req.file) {
    return undefined;
  }
  return `/uploads/${ADMIN_UPLOAD_DIR}/${req.file.filename}`;
}

function assertAdminCanLogin(admin) {
  if (admin.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
}

function issueAuthTokens(admin) {
  const payload = {
    sub: admin._id.toString(),
    role: "admin",
  };
  return withTokenExpiryMeta({
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, profileImage } = req.body;

  if (!name || !email || !password) {
    deleteUploadFileByPublicUrl(profilePathFromFile(req));
    throw new AppError("Name, email, and password are required", 400);
  }

  const existing = await Admin.findOne({ email: String(email).toLowerCase() });
  if (existing) {
    deleteUploadFileByPublicUrl(profilePathFromFile(req));
    throw new AppError("Email is already registered", 409);
  }

  const hashed = await hashPassword(password);
  const fromFile = profilePathFromFile(req);
  let admin;
  try {
    admin = await Admin.create({
      name,
      email,
      password: hashed,
      phone,
      profileImage: fromFile ?? profileImage,
    });
  } catch (err) {
    deleteUploadFileByPublicUrl(fromFile);
    throw err;
  }

  const tokens = issueAuthTokens(admin);

  res.status(201).json({
    message: "Registered successfully",
    user: toPublicProfile(admin),
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const admin = await Admin.findOne({ email: String(email).toLowerCase() });
  if (!admin) {
    throw new AppError("Invalid email or password", 401);
  }

  const ok = await comparePassword(password, admin.password);
  if (!ok) {
    throw new AppError("Invalid email or password", 401);
  }

  assertAdminCanLogin(admin);

  const tokens = issueAuthTokens(admin);

  res.json({
    message: "Login successful",
    user: toPublicProfile(admin),
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
  });
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

  if (payload.role !== "admin") {
    throw new AppError("Forbidden", 403);
  }

  const admin = await Admin.findById(payload.sub);
  if (!admin) {
    throw new AppError("Account not found", 401);
  }

  assertAdminCanLogin(admin);

  const tokens = issueAuthTokens(admin);
  res.json({
    message: "Token refreshed",
    ...tokens,
  });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new AppError("Email is required", 400);
  }

  const admin = await Admin.findOne({ email: String(email).toLowerCase() });
  if (!admin) {
    res.json({
      message:
        "If an account exists for that email, password reset instructions have been sent.",
    });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  admin.resetPasswordToken = resetToken;
  admin.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
  await admin.save();

  res.json({
    message:
      "If an account exists for that email, password reset instructions have been sent.",
    resetToken: process.env.NODE_ENV === "development" ? resetToken : undefined,
  });
});

const MIN_NEW_PASSWORD_LENGTH = 8;


exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required", 400);
  }
  if (String(newPassword).length < MIN_NEW_PASSWORD_LENGTH) {
    throw new AppError(`New password must be at least ${MIN_NEW_PASSWORD_LENGTH} characters`, 400);
  }
  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from the current password", 400);
  }

  const admin = await Admin.findById(req.user._id);
  if (!admin) {
    throw new AppError("Account not found", 404);
  }

  const matches = await comparePassword(currentPassword, admin.password);
  if (!matches) {
    throw new AppError("Current password is incorrect", 401);
  }

  admin.password = await hashPassword(newPassword);
  admin.resetPasswordToken = undefined;
  admin.resetPasswordExpire = undefined;
  await admin.save();

  res.json({ message: "Password updated successfully" });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    throw new AppError("Token and new password are required", 400);
  }

  const admin = await Admin.findOne({
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: new Date() },
  });

  if (!admin) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  admin.password = await hashPassword(password);
  admin.resetPasswordToken = undefined;
  admin.resetPasswordExpire = undefined;
  await admin.save();

  res.json({ message: "Password has been reset" });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.json({ user: toPublicProfile(req.user) });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.user._id);
  if (!admin) {
    throw new AppError("Account not found", 404);
  }

  const { name, phone, profileImage } = req.body;

  if (req.file) {
    deleteUploadFileByPublicUrl(admin.profileImage);
    admin.profileImage = profilePathFromFile(req);
  } else if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
    if (profileImage === "" || profileImage === null) {
      deleteUploadFileByPublicUrl(admin.profileImage);
      admin.profileImage = null;
    } else if (profileImage !== admin.profileImage) {
      deleteUploadFileByPublicUrl(admin.profileImage);
      admin.profileImage = profileImage;
    }
  }

  if (name !== undefined) {
    admin.name = name;
  }
  if (phone !== undefined) {
    admin.phone = phone;
  }

  await admin.save();
  const fresh = await Admin.findById(admin._id).select("-password");
  res.json({
    message: "Profile updated",
    user: toPublicProfile(fresh),
  });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.user._id);
  if (!admin) {
    throw new AppError("Account not found", 404);
  }
  deleteUploadFileByPublicUrl(admin.profileImage);
  await Admin.findByIdAndDelete(req.user._id);
  res.json({ message: "Account deleted" });
});

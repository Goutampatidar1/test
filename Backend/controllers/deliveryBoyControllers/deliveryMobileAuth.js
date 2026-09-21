const crypto = require("crypto");
const { DeliveryBoy } = require("../../models");
const PhoneOtp = require("../../models/other/phoneOtp");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword, comparePassword } = require("../../utils/password");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signDeliveryResetPasswordToken,
  verifyDeliveryResetPasswordToken,
  withTokenExpiryMeta,
} = require("../../utils/jwt");
const { toMobileDeliveryProfile, maskPhone } = require("../../utils/toPublicProfile");
const { sendSuccess } = require("../../utils/apiResponse");
const { normalizePhone } = require("../../utils/phone");
const { generateOtp, otpExpiryDate, isOtpExpired, OTP_TTL_MS, devOnlyOtp } = require("../../utils/otp");

const MIN_CHANGE_PASSWORD_LENGTH = 8;
const OTP_PURPOSE_FORGOT_PASSWORD = "delivery_forgot_password";
const RESEND_COOLDOWN_MS = 30 * 1000;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function assertPasswordStrength(password, minLength, label = "Password") {
  const value = String(password ?? "").trim();
  if (value.length < minLength) {
    throw new AppError(`${label} must be at least ${minLength} characters`, 400);
  }
  return value;
}

function assertDeliveryBoyCanLogin(deliveryBoy) {
  if (deliveryBoy.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }
  if (deliveryBoy.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
  if (deliveryBoy.approvalStatus === "pending") {
    throw new AppError("Account is pending approval", 403);
  }
  if (deliveryBoy.approvalStatus === "rejected") {
    throw new AppError("Account approval was rejected", 403);
  }
  if (deliveryBoy.approvalStatus === "suspended") {
    throw new AppError("Account approval is suspended", 403);
  }
}

/** Forgot-password OTP: block only hard account blocks, not approval status. */
function assertDeliveryBoyCanRecoverPassword(deliveryBoy) {
  if (deliveryBoy.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }
  if (deliveryBoy.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
}

async function findDeliveryBoyByPhone(phoneRaw) {
  const phoneNorm = normalizePhone(phoneRaw);
  let deliveryBoy = await DeliveryBoy.findOne({ phone: phoneNorm });
  if (deliveryBoy) {
    return { deliveryBoy, phoneNorm };
  }

  const digits = String(phoneRaw ?? "").replace(/\D/g, "");
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    const variants = [last10, `91${last10}`, `+91${last10}`, `0${last10}`];
    deliveryBoy = await DeliveryBoy.findOne({ phone: { $in: variants } });
    if (deliveryBoy) {
      return { deliveryBoy, phoneNorm: last10 };
    }
  }

  return { deliveryBoy: null, phoneNorm };
}

async function saveForgotPasswordOtp(phoneNorm, otp, otpExpire) {
  return PhoneOtp.findOneAndUpdate(
    { phone: phoneNorm },
    {
      phone: phoneNorm,
      otp,
      otpExpire,
      purpose: OTP_PURPOSE_FORGOT_PASSWORD,
      verified: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function assertCanResendForgotPasswordOtp(phoneNorm) {
  const existing = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: OTP_PURPOSE_FORGOT_PASSWORD,
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

async function verifyForgotPasswordOtpRecord(phoneNorm, otpValue) {
  const record = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: OTP_PURPOSE_FORGOT_PASSWORD,
  });
  if (!record || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.deleteOne({ _id: record._id });
}

function issueAuthTokens(deliveryBoy) {
  const payload = {
    sub: deliveryBoy._id.toString(),
    role: "deliveryBoy",
  };
  return withTokenExpiryMeta({
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
}

function buildAuthData(req, deliveryBoy, tokens) {
  return {
    user: deliveryBoy ? toMobileDeliveryProfile(deliveryBoy, req) : null,
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
  };
}

function authSuccessResponse(req, res, statusCode, message, deliveryBoy) {
  const tokens = issueAuthTokens(deliveryBoy);
  return sendSuccess(
    res,
    message,
    buildAuthData(req, deliveryBoy, tokens),
    statusCode
  );
}

exports.login = asyncHandler(async (req, res) => {
  const { email, password, fcm_id } = req.body;
  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const deliveryBoy = await DeliveryBoy.findOne({
    email: normalizeEmail(email),
  });
  if (!deliveryBoy || !deliveryBoy.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  const ok = await comparePassword(String(password), deliveryBoy.passwordHash);
  if (!ok) {
    throw new AppError("Invalid email or password", 401);
  }

  assertDeliveryBoyCanLogin(deliveryBoy);

  if (fcm_id !== undefined) {
    deliveryBoy.fcm_id = fcm_id;
    await deliveryBoy.save();
  }

  authSuccessResponse(req, res, 200, "Login successful", deliveryBoy);
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

  if (payload.role !== "deliveryBoy") {
    throw new AppError("Forbidden", 403);
  }

  const deliveryBoy = await DeliveryBoy.findById(payload.sub);
  if (!deliveryBoy) {
    throw new AppError("Account not found", 401);
  }

  assertDeliveryBoyCanLogin(deliveryBoy);

  const tokens = issueAuthTokens(deliveryBoy);
  sendSuccess(res, "Token refreshed", tokens);
});

/** Screen 1 — Recovery Password: send 4-digit OTP to registered mobile. */
exports.sendForgotPasswordOtp = asyncHandler(async (req, res) => {
  const phoneRaw = req.body?.phone ?? req.body?.mobile;
  if (!phoneRaw) {
    throw new AppError("Mobile number is required", 400);
  }

  const { deliveryBoy, phoneNorm } = await findDeliveryBoyByPhone(phoneRaw);
  if (!deliveryBoy) {
    throw new AppError("No delivery partner account found with this mobile number", 404);
  }

  assertDeliveryBoyCanRecoverPassword(deliveryBoy);
  await assertCanResendForgotPasswordOtp(phoneNorm);

  const otp = generateOtp();
  const otpExpire = otpExpiryDate();
  await saveForgotPasswordOtp(phoneNorm, otp, otpExpire);

  sendSuccess(res, "OTP sent successfully", {
    phone: phoneNorm,
    phoneMasked: maskPhone(phoneNorm),
    purpose: OTP_PURPOSE_FORGOT_PASSWORD,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otp: devOnlyOtp(otp),
  });
});

/** Screen 2 — Verification Code: verify OTP and issue reset token. */
exports.verifyForgotPasswordOtp = asyncHandler(async (req, res) => {
  const phoneRaw = req.body?.phone ?? req.body?.mobile;
  const otpValue = String(req.body?.otp ?? "").trim();

  if (!phoneRaw) {
    throw new AppError("Mobile number is required", 400);
  }
  if (!otpValue) {
    throw new AppError("OTP is required", 400);
  }

  const { deliveryBoy, phoneNorm } = await findDeliveryBoyByPhone(phoneRaw);
  if (!deliveryBoy) {
    throw new AppError("Account not found", 404);
  }

  assertDeliveryBoyCanRecoverPassword(deliveryBoy);
  await verifyForgotPasswordOtpRecord(phoneNorm, otpValue);

  const resetToken = signDeliveryResetPasswordToken(
    deliveryBoy._id.toString(),
    phoneNorm
  );

  sendSuccess(res, "OTP verified", {
    phone: phoneNorm,
    phoneMasked: maskPhone(phoneNorm),
    otpVerified: true,
    resetToken,
  });
});

/** Legacy email-based forgot password (optional fallback). */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const phoneRaw = req.body?.phone ?? req.body?.mobile;
  if (phoneRaw) {
    return exports.sendForgotPasswordOtp(req, res);
  }

  const { email } = req.body;
  if (!email) {
    throw new AppError("Mobile number or email is required", 400);
  }

  const deliveryBoy = await DeliveryBoy.findOne({
    email: normalizeEmail(email),
  });

  if (!deliveryBoy) {
    return sendSuccess(
      res,
      "If an account exists for that email, password reset instructions have been sent.",
      { sent: true }
    );
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  deliveryBoy.resetPasswordToken = resetToken;
  deliveryBoy.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
  await deliveryBoy.save();

  sendSuccess(
    res,
    "If an account exists for that email, password reset instructions have been sent.",
    {
      sent: true,
      resetToken: process.env.NODE_ENV === "development" ? resetToken : undefined,
    }
  );
});

/** Screen 3 — Create Password: set new password using reset token from OTP verify. */
exports.resetPassword = asyncHandler(async (req, res) => {
  const {
    token,
    resetToken,
    password,
    newPassword,
    confirmPassword,
  } = req.body || {};

  const resetTokenValue = resetToken ?? token;
  const passwordRaw = newPassword ?? password;

  if (!resetTokenValue || !passwordRaw) {
    throw new AppError("Reset token and new password are required", 400);
  }

  if (confirmPassword !== undefined && String(passwordRaw) !== String(confirmPassword)) {
    throw new AppError("Password and confirm password do not match", 400);
  }

  const passwordNorm = assertPasswordStrength(
    passwordRaw,
    MIN_CHANGE_PASSWORD_LENGTH,
    "New password"
  );

  let deliveryBoy = null;

  try {
    const payload = verifyDeliveryResetPasswordToken(resetTokenValue);
    deliveryBoy = await DeliveryBoy.findById(payload.sub);
    if (!deliveryBoy) {
      throw new AppError("Account not found", 404);
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    deliveryBoy = await DeliveryBoy.findOne({
      resetPasswordToken: resetTokenValue,
      resetPasswordExpire: { $gt: new Date() },
    });

    if (!deliveryBoy) {
      throw new AppError("Invalid or expired reset token", 400);
    }
  }

  assertDeliveryBoyCanRecoverPassword(deliveryBoy);

  deliveryBoy.passwordHash = await hashPassword(passwordNorm);
  deliveryBoy.resetPasswordToken = undefined;
  deliveryBoy.resetPasswordExpire = undefined;
  await deliveryBoy.save();

  sendSuccess(res, "Password has been reset", { reset: true });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required", 400);
  }

  if (confirmPassword !== undefined && String(newPassword) !== String(confirmPassword)) {
    throw new AppError("Password and confirm password do not match", 400);
  }

  const newPasswordNorm = assertPasswordStrength(
    newPassword,
    MIN_CHANGE_PASSWORD_LENGTH,
    "New password"
  );

  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from the current password", 400);
  }

  const deliveryBoy = await DeliveryBoy.findById(req.user._id);
  if (!deliveryBoy) {
    throw new AppError("Account not found", 404);
  }

  if (!deliveryBoy.passwordHash) {
    throw new AppError("Password is not set for this account", 400);
  }

  const ok = await comparePassword(String(currentPassword), deliveryBoy.passwordHash);
  if (!ok) {
    throw new AppError("Current password is incorrect", 401);
  }

  deliveryBoy.passwordHash = await hashPassword(newPasswordNorm);
  await deliveryBoy.save();

  sendSuccess(res, "Password updated successfully", { updated: true });
});

exports.getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, "Profile fetched", toMobileDeliveryProfile(req.user, req));
});

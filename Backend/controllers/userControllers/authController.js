const crypto = require("crypto");
const { User } = require("../../models");
const PhoneOtp = require("../../models/other/phoneOtp");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword, comparePassword } = require("../../utils/password");
const { signAccessToken, signRefreshToken, verifyRefreshToken, signRegistrationToken, verifyRegistrationToken, withTokenExpiryMeta } =
  require("../../utils/jwt");
const { enrichMobileUserProfile } = require("../../utils/userProfile");
const { parseDateOnly } = require("../../utils/dateOnly");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { normalizePhone } = require("../../utils/phone");
const { assertObjectId } = require("../../utils/assertObjectId");
const City = require("../../models/other/city");
const {
  resolveSubDistrictFields,
  hasSubDistrictInput,
} = require("../../utils/shippingAddress");
const { generateOtp, otpExpiryDate, registrationSessionExpiryDate, isOtpExpired, OTP_TTL_MS, REGISTER_SESSION_TTL_MS, devOnlyOtp } = require("../../utils/otp");
const { sendSuccess } = require("../../utils/apiResponse");

const USER_UPLOAD_DIR = "user";
const MIN_REGISTER_PASSWORD_LENGTH = 6;
const MIN_CHANGE_PASSWORD_LENGTH = 8;
const ALLOWED_OTP_PURPOSES = new Set(["login", "register"]);
const ALLOWED_GENDERS = new Set(["male", "female", "other"]);

function getUserUploadFile(req) {
  if (req.file) {
    return req.file;
  }
  if (req.files?.file?.[0]) {
    return req.files.file[0];
  }
  if (req.files?.profileImage?.[0]) {
    return req.files.profileImage[0];
  }
  return null;
}

function profilePathFromFile(req) {
  const file = getUserUploadFile(req);
  if (!file) {
    return undefined;
  }
  return `/uploads/${USER_UPLOAD_DIR}/${file.filename}`;
}

function assertUserCanLogin(user) {
  if (user.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }
  if (user.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
}

function issueAuthTokens(user) {
  const payload = {
    sub: user._id.toString(),
    role: "user",
  };
  return withTokenExpiryMeta({
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
}

/** Same shape for login, register, and OTP verify: { user, token, refreshToken, expiresIn } */
async function buildAuthData(req, user, tokens) {
  return {
    user: user ? await enrichMobileUserProfile(user, req) : null,
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
  };
}

async function authSuccessResponse(req, res, statusCode, message, user) {
  const tokens = issueAuthTokens(user);
  return sendSuccess(
    res,
    message,
    await buildAuthData(req, user, tokens),
    statusCode
  );
}

async function resolveRegisterLocationFields(body = {}) {
  if (hasSubDistrictInput(body)) {
    const locationFields = await resolveSubDistrictFields(body, {
      city: body.city,
      requireSubDistrict: true,
      assertEcom: false,
    });
    return {
      city: locationFields.city,
      cityId: locationFields.cityId,
      subDistrict: locationFields.subDistrict,
      subDistrictId: locationFields.subDistrictId,
    };
  }

  if (Object.prototype.hasOwnProperty.call(body, "cityId") && body.cityId) {
    assertObjectId(body.cityId, "Invalid city id");
    const cityDoc = await City.findOne({ _id: body.cityId, status: "active" }).select("name").lean();
    if (!cityDoc) {
      throw new AppError("City not found", 404);
    }
    return {
      city: cityDoc.name,
      cityId: cityDoc._id,
    };
  }

  if (body.city !== undefined && body.city !== null && String(body.city).trim()) {
    return { city: String(body.city).trim() };
  }

  return {};
}

function assertPasswordStrength(password, minLength, label = "Password") {
  const value = String(password ?? "").trim();
  if (!value || value.length < minLength) {
    throw new AppError(`${label} must be at least ${minLength} characters`, 400);
  }
  return value;
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeOptionalEmail(email) {
  if (email === undefined || email === null) {
    return undefined;
  }
  const norm = normalizeEmail(email);
  return norm || undefined;
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, dob, gender, fcm_id, profileImage } = req.body;

  if (!name || !phone) {
    deleteUploadFileByPublicUrl(profilePathFromFile(req));
    throw new AppError("Name and phone are required", 400);
  }

  const emailNorm = normalizeOptionalEmail(email);
  const phoneNorm = normalizePhone(phone);
  const passwordNorm = assertPasswordStrength(password, MIN_REGISTER_PASSWORD_LENGTH);

  if (gender && !ALLOWED_GENDERS.has(String(gender))) {
    deleteUploadFileByPublicUrl(profilePathFromFile(req));
    throw new AppError("Invalid gender. Use male, female, or other", 400);
  }

  if (emailNorm) {
    const existingEmail = await User.findOne({ email: emailNorm });
    if (existingEmail) {
      deleteUploadFileByPublicUrl(profilePathFromFile(req));
      throw new AppError("Email is already registered", 409);
    }
  }

  const existingPhone = await User.findOne({ phone: phoneNorm });
  if (existingPhone) {
    deleteUploadFileByPublicUrl(profilePathFromFile(req));
    throw new AppError("Phone number is already registered", 409);
  }

  const passwordHash = await hashPassword(passwordNorm);
  const fromFile = profilePathFromFile(req);
  let user;
  try {
    user = await User.create({
      name: String(name).trim(),
      ...(emailNorm ? { email: emailNorm } : {}),
      passwordHash,
      phone: phoneNorm,
      dob: dob !== undefined && dob !== "" ? parseDateOnly(dob) : undefined,
      gender: gender || undefined,
      fcm_id,
      profileImage: fromFile ?? profileImage,
    });
  } catch (err) {
    deleteUploadFileByPublicUrl(fromFile);
    throw err;
  }

  await authSuccessResponse(req, res, 201, "Registered successfully", user);
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password, fcm_id } = req.body;
  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!user.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  const ok = await comparePassword(String(password), user.passwordHash);
  if (!ok) {
    throw new AppError("Invalid email or password", 401);
  }

  assertUserCanLogin(user);

  if (fcm_id !== undefined) {
    user.fcm_id = fcm_id;
    await user.save();
  }

  await authSuccessResponse(req, res, 200, "Login successful", user);
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

  if (payload.role !== "user") {
    throw new AppError("Forbidden", 403);
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new AppError("Account not found", 401);
  }

  assertUserCanLogin(user);

  const tokens = issueAuthTokens(user);
  sendSuccess(res, "Token refreshed", tokens);
});

exports.checkAvailability = asyncHandler(async (req, res) => {
  const { email, phone } = req.body || {};
  const result = {};

  if (email !== undefined && String(email).trim()) {
    const emailNorm = normalizeEmail(email);
    const exists = await User.findOne({ email: emailNorm }).select("_id").lean();
    result.email = { available: !exists };
  }

  if (phone !== undefined && String(phone).trim()) {
    const phoneNorm = normalizePhone(phone);
    const exists = await User.findOne({ phone: phoneNorm }).select("_id").lean();
    result.phone = { available: !exists };
  }

  if (!result.email && !result.phone) {
    throw new AppError("Provide email and/or phone to check", 400);
  }

  sendSuccess(res, "Availability checked", result);
});

async function savePhoneOtp(phoneNorm, otpPurpose, otp, otpExpire) {
  return PhoneOtp.findOneAndUpdate(
    { phone: phoneNorm },
    { phone: phoneNorm, otp, otpExpire, purpose: otpPurpose, verified: false },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function verifyPhoneOtpForLogin(phoneNorm, otpValue) {
  const record = await PhoneOtp.findOne({ phone: phoneNorm, purpose: "login" });
  if (!record || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.deleteOne({ _id: record._id });
  return record;
}

/** Register: mark phone verified; token is issued only after sign-up form */
async function verifyRegisterOtp(phoneNorm, otpValue) {
  const record = await PhoneOtp.findOne({ phone: phoneNorm, purpose: "register" });
  if (!record || isOtpExpired(record.otpExpire) || String(record.otp) !== otpValue) {
    throw new AppError("Invalid or expired OTP", 400);
  }
  await PhoneOtp.findOneAndUpdate(
    { _id: record._id },
    {
      $set: {
        verified: true,
        otpExpire: registrationSessionExpiryDate(),
      },
      $unset: { otp: "" },
    }
  );
  return record;
}

async function assertRegisterPhoneVerified(phoneNorm) {
  const record = await PhoneOtp.findOne({
    phone: phoneNorm,
    purpose: "register",
    verified: true,
  });
  if (!record) {
    throw new AppError("Please verify OTP first", 400);
  }
  if (isOtpExpired(record.otpExpire)) {
    await PhoneOtp.deleteOne({ _id: record._id });
    throw new AppError(
      "Registration session expired. Please verify your mobile number again",
      400
    );
  }
}

exports.sendOtp = asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body || {};
  const phoneNorm = normalizePhone(phone);
  const otpPurpose = String(purpose ?? "login").trim().toLowerCase();

  if (!ALLOWED_OTP_PURPOSES.has(otpPurpose)) {
    throw new AppError("Invalid purpose. Use login or register", 400);
  }

  const existing = await User.findOne({ phone: phoneNorm });

  if (otpPurpose === "login") {
    if (!existing) {
      throw new AppError("No account found with this phone number. Please sign up", 404);
    }
    assertUserCanLogin(existing);
  }

  if (otpPurpose === "register" && existing) {
    throw new AppError("Phone number is already registered. Please log in", 409);
  }

  const otp = generateOtp();
  const otpExpire = otpExpiryDate();
  const record = await savePhoneOtp(phoneNorm, otpPurpose, otp, otpExpire);

  const payload = {
    phone: phoneNorm,
    purpose: otpPurpose,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    otp: devOnlyOtp(otp),
  };
  sendSuccess(res, "OTP sent successfully", payload);
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const {
    phone,
    otp,
    purpose,
    name,
    email,
    password,
    dob,
    gender,
    fcm_id,
    profileImage,
  } = req.body || {};

  const phoneNorm = normalizePhone(phone);
  const otpPurpose = String(purpose ?? "login").trim().toLowerCase();
  const otpValue = String(otp ?? "").trim();

  if (!otpValue) {
    throw new AppError("OTP is required", 400);
  }
  if (!ALLOWED_OTP_PURPOSES.has(otpPurpose)) {
    throw new AppError("Invalid purpose. Use login or register", 400);
  }

  if (otpPurpose === "login") {
    await verifyPhoneOtpForLogin(phoneNorm, otpValue);
    const user = await User.findOne({ phone: phoneNorm });
    if (!user) {
      throw new AppError("Account not found", 404);
    }
    assertUserCanLogin(user);
    if (fcm_id !== undefined) {
      user.fcm_id = fcm_id;
      await user.save();
    }
    await authSuccessResponse(req, res, 200, "Login successful", user);
    return;
  }

  // register — verify OTP only (no token until sign-up form is submitted)
  const nameNorm = String(name ?? "").trim();
  const emailNorm = normalizeOptionalEmail(email);
  const hasCompleteProfile = Boolean(nameNorm);

  if (!hasCompleteProfile) {
    const phoneTaken = await User.findOne({ phone: phoneNorm });
    if (phoneTaken) {
      throw new AppError("Phone number is already registered. Please log in", 409);
    }

    await verifyRegisterOtp(phoneNorm, otpValue);
    const registrationToken = signRegistrationToken(phoneNorm);

    sendSuccess(res, "OTP verified", {
      phone: phoneNorm,
      otpVerified: true,
      profileComplete: false,
      registrationToken,
      verifiedExpiresInSeconds: Math.floor(REGISTER_SESSION_TTL_MS / 1000),
    });
    return;
  }

  await verifyRegisterOtp(phoneNorm, otpValue);

  const user = await createUserFromRegisterBody(req, {
    phoneNorm,
    nameNorm,
    emailNorm,
    password,
    dob,
    gender,
    fcm_id,
    profileImage,
  });

  await PhoneOtp.deleteMany({ phone: phoneNorm, purpose: "register" });

  await authSuccessResponse(req, res, 201, "Sign up successful", user);
});

async function createUserFromRegisterBody(
  req,
  { phoneNorm, nameNorm, emailNorm, password, dob, gender, fcm_id, profileImage }
) {
  if (gender && !ALLOWED_GENDERS.has(String(gender))) {
    throw new AppError("Invalid gender. Use male, female, or other", 400);
  }

  const phoneTaken = await User.findOne({ phone: phoneNorm });
  if (phoneTaken) {
    throw new AppError("Phone number is already registered", 409);
  }

  if (emailNorm) {
    const emailTaken = await User.findOne({ email: emailNorm });
    if (emailTaken) {
      throw new AppError("Email is already registered", 409);
    }
  }

  const passwordNorm = String(password ?? "").trim();
  let passwordHash;
  if (passwordNorm) {
    passwordHash = await hashPassword(
      assertPasswordStrength(password, MIN_REGISTER_PASSWORD_LENGTH)
    );
  }

  const fromFile = profilePathFromFile(req);
  const locationFields = await resolveRegisterLocationFields(req.body || {});

  try {
    return await User.create({
      name: nameNorm,
      ...(emailNorm ? { email: emailNorm } : {}),
      phone: phoneNorm,
      ...(passwordHash ? { passwordHash } : {}),
      dob: dob !== undefined && dob !== "" ? parseDateOnly(dob) : undefined,
      gender: gender || undefined,
      fcm_id,
      profileImage: fromFile ?? profileImage,
      status: "active",
      ...locationFields,
    });
  } catch (err) {
    deleteUploadFileByPublicUrl(fromFile);
    throw err;
  }
}

/** Step 2 after register OTP: submit sign-up form → create user + issue tokens */
exports.completeRegister = asyncHandler(async (req, res) => {
  const {
    phone,
    registrationToken,
    token,
    name,
    email,
    password,
    dob,
    gender,
    fcm_id,
    profileImage,
  } = req.body || {};

  let phoneNorm;
  if (phone) {
    phoneNorm = normalizePhone(phone);
    await assertRegisterPhoneVerified(phoneNorm);
  } else {
    const registrationTokenValue = registrationToken || token;
    if (!registrationTokenValue) {
      throw new AppError("phone is required (same number used for OTP)", 400);
    }
    try {
      const payload = verifyRegistrationToken(registrationTokenValue);
      phoneNorm = normalizePhone(payload.phone);
      await assertRegisterPhoneVerified(phoneNorm);
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError("Registration session expired. Please verify OTP again", 401);
    }
  }

  const nameNorm = String(name ?? "").trim();
  const emailNorm = normalizeOptionalEmail(email);

  if (!nameNorm) {
    throw new AppError("Name is required to complete sign up", 400);
  }

  const user = await createUserFromRegisterBody(req, {
    phoneNorm,
    nameNorm,
    emailNorm,
    password,
    dob,
    gender,
    fcm_id,
    profileImage,
  });

  await PhoneOtp.deleteMany({ phone: phoneNorm, purpose: "register" });

  await authSuccessResponse(req, res, 201, "Sign up successful", user);
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  // if (!email) {
  //   throw new AppError("Email is required", 400);
  // }

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) {
    sendSuccess(
      res,
      "If an account exists for that email, password reset instructions have been sent.",
      { sent: true }
    );
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  sendSuccess(
    res,
    "If an account exists for that email, password reset instructions have been sent.",
    {
      sent: true,
      resetToken: process.env.NODE_ENV === "development" ? resetToken : undefined,
    }
  );
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    throw new AppError("Token and new password are required", 400);
  }

  const passwordNorm = assertPasswordStrength(
    password,
    MIN_CHANGE_PASSWORD_LENGTH,
    "New password"
  );

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: new Date() },
  });

  if (!user) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  user.passwordHash = await hashPassword(passwordNorm);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendSuccess(res, "Password has been reset", { reset: true });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required", 400);
  }

  const newPasswordNorm = assertPasswordStrength(
    newPassword,
    MIN_CHANGE_PASSWORD_LENGTH,
    "New password"
  );

  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from the current password", 400);
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError("Account not found", 404);
  }

  if (!user.passwordHash) {
    throw new AppError("Password is not set for this account", 400);
  }

  const ok = await comparePassword(String(currentPassword), user.passwordHash);
  if (!ok) {
    throw new AppError("Current password is incorrect", 401);
  }

  user.passwordHash = await hashPassword(newPasswordNorm);
  await user.save();

  sendSuccess(res, "Password updated successfully", { updated: true });
});

exports.getMe = asyncHandler(async (req, res) => {
  const user = await enrichMobileUserProfile(req.user, req);
  sendSuccess(res, "Profile fetched", { user });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const { name, phone, dob, gender, fcm_id, profileImage, city, subDistrict } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError("Account not found", 404);
  }

  const uploadedPath = profilePathFromFile(req);
  if (uploadedPath) {
    deleteUploadFileByPublicUrl(user.profileImage);
    user.profileImage = uploadedPath;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
    if (profileImage === "" || profileImage === null) {
      deleteUploadFileByPublicUrl(user.profileImage);
      user.profileImage = null;
    } else if (profileImage !== user.profileImage) {
      deleteUploadFileByPublicUrl(user.profileImage);
      user.profileImage = profileImage;
    }
  }

  if (name !== undefined) {
    user.name = name;
  }
  if (phone !== undefined) {
    const phoneNorm = normalizePhone(phone);
    const taken = await User.findOne({ phone: phoneNorm, _id: { $ne: user._id } });
    if (taken) {
      throw new AppError("Phone number is already in use", 409);
    }
    user.phone = phoneNorm;
  }
  if (dob !== undefined) {
    user.dob = dob === "" || dob === null ? null : parseDateOnly(dob);
  }
  if (gender !== undefined) {
    if (gender && !ALLOWED_GENDERS.has(String(gender))) {
      throw new AppError("Invalid gender. Use male, female, or other", 400);
    }
    user.gender = gender;
  }
  if (fcm_id !== undefined) {
    user.fcm_id = fcm_id;
  }
  if (
    hasSubDistrictInput(req.body) ||
    city !== undefined ||
    subDistrict !== undefined ||
    Object.prototype.hasOwnProperty.call(req.body, "subDistrictId") ||
    Object.prototype.hasOwnProperty.call(req.body, "cityId")
  ) {
    const locationFields = await resolveSubDistrictFields(
      {
        ...req.body,
        city: req.body.city ?? user.city,
        subDistrict: req.body.subDistrict ?? user.subDistrict,
        subDistrictId: req.body.subDistrictId ?? user.subDistrictId,
      },
      {
        city: req.body.city ?? user.city,
        requireSubDistrict: false,
        assertEcom: false,
      }
    );
    if (locationFields.subDistrict || locationFields.subDistrictId) {
      user.city = locationFields.city;
      user.cityId = locationFields.cityId;
      user.subDistrict = locationFields.subDistrict;
      user.subDistrictId = locationFields.subDistrictId;
    }
  } else if (city !== undefined) {
    user.city = city === "" || city === null ? null : String(city).trim();
  }

  await user.save();
  const fresh = await User.findById(user._id).select("-passwordHash");
  sendSuccess(res, "Profile updated", { user: await enrichMobileUserProfile(fresh, req) });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError("Account not found", 404);
  }
  deleteUploadFileByPublicUrl(user.profileImage);
  await User.findByIdAndDelete(req.user._id);
  sendSuccess(res, "Account deleted", { deleted: true });
});

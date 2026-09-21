const jwt = require("jsonwebtoken");
const config = require("../config");

function parseDurationToSeconds(value, fallbackSeconds) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallbackSeconds;

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const match = raw.match(/^(\d+)\s*([smhd])$/);
  if (!match) return fallbackSeconds;

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (multipliers[unit] || 1);
}

function getAccessTokenTtlSeconds() {
  return parseDurationToSeconds(config.jwt.expiresIn, 365 * 86400);
}

function getRefreshTokenTtlSeconds() {
  return parseDurationToSeconds(config.jwt.refreshExpiresIn, 365 * 86400);
}

function withTokenExpiryMeta(tokens = {}) {
  const expiresIn = getAccessTokenTtlSeconds();
  return {
    ...tokens,
    expiresIn,
    tokenExpiresIn: expiresIn,
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

exports.parseDurationToSeconds = parseDurationToSeconds;
exports.getAccessTokenTtlSeconds = getAccessTokenTtlSeconds;
exports.getRefreshTokenTtlSeconds = getRefreshTokenTtlSeconds;
exports.withTokenExpiryMeta = withTokenExpiryMeta;

exports.signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

exports.verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);

exports.signRefreshToken = (payload) =>
  jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });

exports.verifyRefreshToken = (token) =>
  jwt.verify(token, config.jwt.refreshSecret);

/** Short-lived token after register OTP is verified (complete profile next). */
exports.signRegistrationToken = (phone) =>
  jwt.sign({ phone, role: "register_pending" }, config.jwt.secret, {
    expiresIn: "1h",
  });

exports.verifyRegistrationToken = (token) => {
  const payload = jwt.verify(token, config.jwt.secret);
  if (payload.role !== "register_pending" || !payload.phone) {
    const err = new Error("Invalid registration token");
    err.statusCode = 401;
    throw err;
  }
  return payload;
};

/** Short-lived token after vendor register OTP is verified. */
exports.signVendorRegistrationToken = (phone) =>
  jwt.sign({ phone, role: "vendor_register_pending" }, config.jwt.secret, {
    expiresIn: "1h",
  });

exports.verifyVendorRegistrationToken = (token) => {
  const payload = jwt.verify(token, config.jwt.secret);
  if (payload.role !== "vendor_register_pending" || !payload.phone) {
    const err = new Error("Invalid registration token");
    err.statusCode = 401;
    throw err;
  }
  return payload;
};

/** Short-lived token after delivery forgot-password OTP is verified. */
exports.signDeliveryResetPasswordToken = (deliveryBoyId, phone) =>
  jwt.sign(
    { sub: deliveryBoyId, phone, role: "delivery_reset_pending" },
    config.jwt.resetPasswordSecret,
    { expiresIn: config.jwt.resetPasswordExpiresIn }
  );

exports.verifyDeliveryResetPasswordToken = (token) => {
  const payload = jwt.verify(token, config.jwt.resetPasswordSecret);
  if (
    payload.role !== "delivery_reset_pending" ||
    !payload.sub ||
    !payload.phone
  ) {
    const err = new Error("Invalid or expired reset token");
    err.statusCode = 401;
    throw err;
  }
  return payload;
};

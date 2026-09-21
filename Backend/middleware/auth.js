const AppError = require("../utils/AppError");
const { asyncHandler } = require("../utils/asyncHandler");
const { verifyAccessToken } = require("../utils/jwt");
const { normalizePhone } = require("../utils/phone");
const { User, Vendor, VenueVendor, Admin, DeliveryBoy } = require("../models");

function readBearer(req) {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function assertActiveAccount(doc) {
  if (doc.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }
  if (doc.status === "inactive") {
    throw new AppError("Account is inactive", 403);
  }
}

function protect(role, Model, select) {
  return asyncHandler(async (req, res, next) => {
    const token = readBearer(req);
    if (!token) {
      throw new AppError("Authentication required", 401);
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError("Invalid or expired token", 401);
    }

    if (payload.role !== role) {
      throw new AppError("Forbidden", 403);
    }

    const account = await Model.findById(payload.sub).select(select);
    if (!account) {
      throw new AppError("Account not found", 401);
    }

    assertActiveAccount(account);

    req.user = account;
    req.auth = { role, sub: payload.sub };
    next();
  });
}

/**
 * Logged-in user OR register OTP verified (register_pending JWT after /otp/verify).
 */
const protectUserOrRegisterPending = asyncHandler(async (req, res, next) => {
  const token = readBearer(req);
  if (!token) {
    throw new AppError("Authentication required", 401);
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }

  if (payload.role === "register_pending" && payload.phone) {
    req.registerPending = true;
    req.pendingPhone = normalizePhone(payload.phone);
    req.auth = { role: "register_pending", phone: req.pendingPhone };
    return next();
  }

  if (payload.role === "user" && payload.sub) {
    const account = await User.findById(payload.sub).select("-passwordHash");
    if (!account) {
      throw new AppError("Account not found", 401);
    }
    assertActiveAccount(account);
    req.user = account;
    req.registerPending = false;
    req.auth = { role: "user", sub: payload.sub };
    return next();
  }

  throw new AppError("Forbidden", 403);
});

/** Sets req.user when a valid user token is sent; continues without error when absent. */
const optionalProtectUser = asyncHandler(async (req, res, next) => {
  const token = readBearer(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== "user" || !payload.sub) return next();

    const account = await User.findById(payload.sub).select("-passwordHash");
    if (!account) return next();

    assertActiveAccount(account);
    req.user = account;
    req.auth = { role: "user", sub: payload.sub };
  } catch {
    // ignore invalid token for public catalog browsing
  }
  next();
});

module.exports = {
  protectUser: protect("user", User, "-passwordHash"),
  protectUserOrRegisterPending,
  optionalProtectUser,
  protectVendor: protect("vendor", Vendor, "-passwordHash"),
  protectVenueVendor: protect("venueVendor", VenueVendor, "-passwordHash"),
  protectAdmin: protect("admin", Admin, "-password"),
  protectDeliveryBoy: protect("deliveryBoy", DeliveryBoy, "-passwordHash"),
};

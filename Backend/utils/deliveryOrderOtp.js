const DeliveryOrderOtp = require("../models/other/deliveryOrderOtp");
const AppError = require("./AppError");
const { generateOtp } = require("./otp");

function isOrderTerminalForOtp(orderStatus) {
  const status = String(orderStatus || "").toLowerCase();
  return ["delivered", "cancelled", "refunded"].includes(status);
}

async function createDeliveryOtpForOrder(orderId, userId) {
  if (!orderId || !userId) {
    throw new AppError("orderId and userId are required to create delivery OTP", 400);
  }

  const existing = await DeliveryOrderOtp.findOne({ order: orderId }).lean();
  if (existing) return existing;

  const otp = generateOtp();

  try {
    const doc = await DeliveryOrderOtp.create({
      order: orderId,
      user: userId,
      otp,
      status: "active",
    });
    return doc.toObject ? doc.toObject() : doc;
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await DeliveryOrderOtp.findOne({ order: orderId }).lean();
      if (dup) return dup;
    }
    throw err;
  }
}

async function getDeliveryOtpForOrder(orderId) {
  return DeliveryOrderOtp.findOne({ order: orderId }).lean();
}

async function cancelDeliveryOtpForOrder(orderId) {
  const record = await DeliveryOrderOtp.findOne({ order: orderId });
  if (!record || record.status !== "active") return record?.toObject?.() ?? record ?? null;

  record.status = "cancelled";
  await record.save();
  return record.toObject();
}

async function verifyDeliveryOtpForOrder(orderId, otpValue, { driverId } = {}) {
  const code = String(otpValue ?? "").trim();
  if (!code) {
    throw new AppError("Delivery OTP is required", 400);
  }

  const record = await DeliveryOrderOtp.findOne({ order: orderId });
  if (!record) {
    throw new AppError("Delivery OTP not found for this order", 404);
  }
  if (record.status === "cancelled") {
    throw new AppError("Delivery OTP is no longer valid", 400);
  }
  if (record.status === "verified") {
    throw new AppError("Delivery OTP already verified", 400);
  }
  if (String(record.otp) !== code) {
    throw new AppError("Invalid delivery OTP", 400);
  }

  record.status = "verified";
  record.verifiedAt = new Date();
  if (driverId) record.verifiedBy = driverId;
  await record.save();
  return record.toObject();
}

function toUserDeliveryOtpPayload(record, order = {}) {
  if (!record) return null;

  const terminal = isOrderTerminalForOtp(order.orderStatus);
  const base = {
    status: record.status,
    verifiedAt: record.verifiedAt ?? null,
  };

  if (record.status === "verified" || terminal || record.status === "cancelled") {
    return base;
  }

  return {
    ...base,
    otp: record.otp,
    otpRequired: true,
    message: "Share this OTP with the delivery partner when your order arrives.",
  };
}

function toAdminDeliveryOtpPayload(record) {
  if (!record) return null;
  return {
    status: record.status,
    verifiedAt: record.verifiedAt ?? null,
    otp: record.otp || null,
  };
}

module.exports = {
  createDeliveryOtpForOrder,
  getDeliveryOtpForOrder,
  cancelDeliveryOtpForOrder,
  verifyDeliveryOtpForOrder,
  toUserDeliveryOtpPayload,
  toAdminDeliveryOtpPayload,
};

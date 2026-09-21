const crypto = require("crypto");
const { AppConfig } = require("../models");
const AppError = require("./AppError");
const { mergePaymentMethods } = require("./appCommerceSettings");

function isOnlinePaymentActive(config) {
  return mergePaymentMethods(config?.payment_methods).some(
    (row) => row.type === "online" && row.isActive
  );
}

async function getRazorpayCredentials() {
  const config = await AppConfig.findOne().select("payment_methods payment_gateways").lean();
  if (!config || !isOnlinePaymentActive(config)) {
    throw new AppError("Online payment is not enabled. Enable Online + Razorpay in admin settings.", 400);
  }

  const gateways = Array.isArray(config.payment_gateways) ? config.payment_gateways : [];
  const razorpay = gateways.find((row) => row?.provider === "razorpay");
  const keyId = String(razorpay?.credentials?.key_id || "").trim();
  const keySecret = String(razorpay?.credentials?.key_secret || "").trim();

  if (!keyId || !keySecret) {
    throw new AppError("Razorpay Key ID / Key secret is not configured in admin settings.", 400);
  }

  return { keyId, keySecret };
}

function toPaise(amountRupees) {
  const rupees = Number(amountRupees);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    throw new AppError("Invalid payment amount", 400);
  }
  return Math.round(rupees * 100);
}

async function createRazorpayOrder({ amountRupees, receipt, notes = {} }) {
  const { keyId, keySecret } = await getRazorpayCredentials();
  const amount = toPaise(amountRupees);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt: String(receipt || `rcpt_${Date.now()}`).slice(0, 40),
      notes: notes && typeof notes === "object" ? notes : {},
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const razorpayMessage =
      payload?.error?.description ||
      payload?.error?.reason ||
      payload?.message ||
      "Failed to create Razorpay order";

    // Razorpay returns "Authentication failed" when Key ID / Key secret are wrong or mismatched.
    if (
      response.status === 401 ||
      /authentication failed/i.test(String(razorpayMessage))
    ) {
      throw new AppError(
        "Razorpay authentication failed. Check Admin → App Settings → Online payment: use a matching Key ID + Key secret pair (both test or both live), with no extra spaces, then save.",
        502
      );
    }

    throw new AppError(razorpayMessage, 502);
  }

  return {
    keyId,
    orderId: payload.id,
    amount: amount / 100,
    amountPaise: amount,
    currency: payload.currency || "INR",
    receipt: payload.receipt || "",
    status: payload.status || "created",
  };
}

function verifyRazorpayPaymentSignature({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  keySecret,
}) {
  const orderId = String(razorpayOrderId || "").trim();
  const paymentId = String(razorpayPaymentId || "").trim();
  const signature = String(razorpaySignature || "").trim();

  if (!orderId || !paymentId || !signature) {
    throw new AppError("Razorpay payment details are required", 400);
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (
    expectedBuf.length !== signatureBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    throw new AppError("Invalid Razorpay payment signature", 400);
  }

  return true;
}

async function verifyRazorpayCheckoutPayment({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  const { keyId, keySecret } = await getRazorpayCredentials();
  verifyRazorpayPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    keySecret,
  });
  return { keyId };
}

module.exports = {
  getRazorpayCredentials,
  createRazorpayOrder,
  verifyRazorpayPaymentSignature,
  verifyRazorpayCheckoutPayment,
  toPaise,
};

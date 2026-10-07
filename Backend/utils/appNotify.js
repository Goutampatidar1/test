const AppNotification = require("../models/other/appNotification");
const User = require("../models/entity/user");
const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const DeliveryBoy = require("../models/entity/deliveryboy");
const { sendFcmNotification } = require("./pushNotification");

const TOKEN_MODELS = {
  user: User,
  vendor: Vendor,
  venueVendor: VenueVendor,
  deliveryBoy: DeliveryBoy,
};

async function resolveFcmToken(recipientType, recipientId) {
  const Model = TOKEN_MODELS[recipientType];
  if (!Model || !recipientId) return "";
  const row = await Model.findById(recipientId).select("fcm_id").lean();
  return row?.fcm_id ? String(row.fcm_id).trim() : "";
}

/**
 * Store an in-app notification and, when the recipient has a device token, push it.
 * Never throws for push failures.
 */
async function deliverAppNotification({
  recipientType,
  recipientId,
  type,
  title,
  message,
  metadata = {},
  push = true,
}) {
  if (!recipientType || !recipientId) return null;

  const notification = await AppNotification.create({
    recipientType,
    recipient: recipientId,
    type,
    title: String(title).slice(0, 200),
    message: String(message).slice(0, 1000),
    metadata,
  });

  if (push) {
    const token = await resolveFcmToken(recipientType, recipientId);
    if (token) {
      await sendFcmNotification(token, {
        title,
        body: message,
        data: { type, notificationId: String(notification._id), ...flattenMetadata(metadata) },
      });
    }
  }

  return notification;
}

function flattenMetadata(metadata) {
  const out = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    out[key] = String(value);
  }
  return out;
}

function queueAppNotification(payload) {
  setImmediate(() => {
    deliverAppNotification(payload).catch((error) => {
      console.error("[app-notify]", error?.message || error);
    });
  });
}

module.exports = {
  deliverAppNotification,
  queueAppNotification,
  resolveFcmToken,
};

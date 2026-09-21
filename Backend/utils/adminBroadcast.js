const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const User = require("../models/entity/user");
const DeliveryBoy = require("../models/entity/deliveryboy");
const AppNotification = require("../models/other/appNotification");
const { sendFcmNotification } = require("./pushNotification");

function vendorTargets(notification) {
  const targets = Array.isArray(notification?.vendorTargetTypes)
    ? notification.vendorTargetTypes.map((item) => String(item).toLowerCase())
    : [];
  if (targets.includes("ecom") || targets.includes("venue")) return targets;
  return ["ecom", "venue"];
}

async function loadRecipients(notification) {
  const audience = String(notification?.audienceType || "");
  if (audience === "users") {
    const rows = await User.find({}).select("_id fcm_id").lean();
    return rows.map((row) => ({ recipientType: "user", recipientId: row._id, fcm_id: row.fcm_id }));
  }
  if (audience === "deliveryPartners") {
    const rows = await DeliveryBoy.find({}).select("_id fcm_id").lean();
    return rows.map((row) => ({ recipientType: "deliveryBoy", recipientId: row._id, fcm_id: row.fcm_id }));
  }
  if (audience !== "vendors") return [];

  const targets = vendorTargets(notification);
  const recipients = [];
  if (targets.includes("ecom")) {
    const rows = await Vendor.find({}).select("_id fcm_id").lean();
    recipients.push(...rows.map((row) => ({ recipientType: "vendor", recipientId: row._id, fcm_id: row.fcm_id })));
  }
  if (targets.includes("venue")) {
    const rows = await VenueVendor.find({}).select("_id fcm_id").lean();
    recipients.push(
      ...rows.map((row) => ({ recipientType: "venueVendor", recipientId: row._id, fcm_id: row.fcm_id }))
    );
  }
  return recipients;
}

async function deliverOne(recipient, notification) {
  const title = notification.kind === "announcement" ? "Announcement" : "Notification";
  const message = String(notification.message || "").trim();
  if (!message) return;

  await AppNotification.create({
    recipientType: recipient.recipientType,
    recipient: recipient.recipientId,
    type: "admin_broadcast",
    title,
    message,
    metadata: {
      source: "admin",
      broadcastId: String(notification._id),
      audienceType: notification.audienceType,
    },
  });

  const token = String(recipient.fcm_id || "").trim();
  if (token) {
    await sendFcmNotification(token, {
      title,
      body: message,
      data: {
        type: "admin_broadcast",
        notificationId: String(notification._id),
        audienceType: String(notification.audienceType || ""),
      },
    });
  }
}

function queueAdminBroadcast(notification) {
  if (!notification?._id) return;
  if (String(notification.status || "").toLowerCase() !== "active") return;
  if (String(notification.kind || "notification") === "announcement") return;

  setImmediate(() => {
    Promise.resolve()
      .then(async () => {
        const recipients = await loadRecipients(notification);
        for (const recipient of recipients) {
          try {
            await deliverOne(recipient, notification);
          } catch (error) {
            console.error("[admin-broadcast]", error?.message || error);
          }
        }
      })
      .catch((error) => {
        console.error("[admin-broadcast]", error?.message || error);
      });
  });
}

module.exports = {
  queueAdminBroadcast,
};

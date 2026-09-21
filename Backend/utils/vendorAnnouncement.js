const Notification = require("../models/other/notification");

const VENDOR_KINDS = new Set(["ecom", "venue"]);

function toPublicAnnouncement(doc) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    message: doc.message,
    sentAt: doc.sentAt || doc.createdAt || null,
    createdAt: doc.createdAt || null,
  };
}

async function listActiveVendorAnnouncements({ vendorKind } = {}) {
  const kind = String(vendorKind || "").trim().toLowerCase();
  if (!VENDOR_KINDS.has(kind)) return [];

  const rows = await Notification.find({
    status: "active",
    audienceType: "vendors",
    kind: "announcement",
    vendorTargetTypes: kind,
  })
    .sort({ sentAt: -1, createdAt: -1 })
    .select("message sentAt createdAt")
    .limit(1)
    .lean();

  return rows.map(toPublicAnnouncement).filter(Boolean);
}

module.exports = {
  toPublicAnnouncement,
  listActiveVendorAnnouncements,
};

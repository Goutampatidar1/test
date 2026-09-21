const Notification = require("../../models/other/notification");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { queueAdminBroadcast } = require("../../utils/adminBroadcast");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const ALLOWED_AUDIENCE_TYPES = new Set(["users", "vendors", "deliveryPartners"]);
const ALLOWED_KINDS = new Set(["notification", "announcement"]);
const ALLOWED_VENDOR_TARGETS = new Set(["ecom", "venue"]);
const UPLOAD_FOLDER = "notification";

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function parseVendorTargetTypes(value) {
  if (value === undefined || value === null || value === "") return [];
  let items = value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      items = Array.isArray(parsed) ? parsed : String(value).split(",");
    } catch {
      items = String(value).split(",");
    }
  }
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((item) => String(item).trim().toLowerCase()).filter((item) => ALLOWED_VENDOR_TARGETS.has(item)))];
}

function resolveKindAndTargets({ audienceType, kind, vendorTargetTypes, fallbackKind = "notification" }) {
  const nextKind = normalizeOptional(kind) || fallbackKind;
  if (!ALLOWED_KINDS.has(nextKind)) {
    throw new AppError("Invalid kind. Use notification or announcement", 400);
  }
  if (nextKind === "announcement") {
    if (audienceType !== "vendors") {
      throw new AppError("Announcements can only be sent to vendors", 400);
    }
    const targets = parseVendorTargetTypes(vendorTargetTypes);
    if (!targets.length) {
      throw new AppError("Select at least one vendor type: ecom or venue", 400);
    }
    return { kind: nextKind, vendorTargetTypes: targets };
  }
  return { kind: "notification", vendorTargetTypes: [] };
}

exports.listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, audienceType, kind, search } = req.query;

  const filter = {};

  if (status && String(status).trim()) {
    const normalizedStatus = String(status).trim();
    if (!ALLOWED_STATUS.has(normalizedStatus)) throw new AppError("Invalid status filter", 400);
    filter.status = normalizedStatus;
  }

  if (audienceType && String(audienceType).trim()) {
    const normalizedAudienceType = String(audienceType).trim();
    if (!ALLOWED_AUDIENCE_TYPES.has(normalizedAudienceType)) {
      throw new AppError("Invalid audience type filter", 400);
    }
    filter.audienceType = normalizedAudienceType;
  }

  if (kind && String(kind).trim()) {
    const normalizedKind = String(kind).trim();
    if (!ALLOWED_KINDS.has(normalizedKind)) throw new AppError("Invalid kind filter", 400);
    filter.kind = normalizedKind;
  }

  const searchOr = searchFilter(search, ["message", "audienceType"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
  ]);

  res.json({
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getNotificationById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const notification = await Notification.findById(req.params.id).lean();
  if (!notification) throw new AppError("Notification not found", 404);
  res.json({ notification });
});

exports.createNotification = asyncHandler(async (req, res) => {
  const audienceType = normalizeRequired(req.body.audienceType);
  const message = normalizeRequired(req.body.message);
  const imageFromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const image = normalizeOptional(imageFromFile ?? req.body.image) || "";
  const status = normalizeOptional(req.body.status) || "active";

  if (!audienceType || !message) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Audience type and message are required", 400);
  }
  if (!ALLOWED_AUDIENCE_TYPES.has(audienceType)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid audience type", 400);
  }
  if (!ALLOWED_STATUS.has(status)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid status", 400);
  }

  let kindAndTargets;
  try {
    kindAndTargets = resolveKindAndTargets({
      audienceType,
      kind: req.body.kind,
      vendorTargetTypes: req.body.vendorTargetTypes,
    });
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }

  try {
    if (kindAndTargets.kind === "announcement") {
      const existing = await Notification.findOne({
        kind: "announcement",
        audienceType: "vendors",
      }).sort({ createdAt: 1 });

      if (existing) {
        existing.message = message;
        existing.status = status;
        existing.vendorTargetTypes = kindAndTargets.vendorTargetTypes;
        existing.image = "";
        existing.sentAt = new Date();
        await existing.save();
        await Notification.deleteMany({
          kind: "announcement",
          audienceType: "vendors",
          _id: { $ne: existing._id },
        });
        deleteUploadFileByPublicUrl(imageFromFile);
        return res.json({ message: "Announcement updated", notification: existing });
      }
    }

    const notification = await Notification.create({
      audienceType,
      kind: kindAndTargets.kind,
      vendorTargetTypes: kindAndTargets.vendorTargetTypes,
      message,
      image: kindAndTargets.kind === "announcement" ? "" : image,
      status,
    });

    queueAdminBroadcast(notification.toObject());
    res.status(201).json({ message: "Notification created", notification });
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

exports.updateNotification = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw new AppError("Notification not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "audienceType")) {
    const audienceType = normalizeRequired(req.body.audienceType);
    if (!audienceType) throw new AppError("Audience type cannot be empty", 400);
    if (!ALLOWED_AUDIENCE_TYPES.has(audienceType)) throw new AppError("Invalid audience type", 400);
    notification.audienceType = audienceType;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "message")) {
    const message = normalizeRequired(req.body.message);
    if (!message) throw new AppError("Message cannot be empty", 400);
    notification.message = message;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
    const image = normalizeOptional(req.body.image) || "";
    notification.image = image;
  }

  if (req.file) {
    const uploadedImage = publicUploadPathFromFile(req, UPLOAD_FOLDER);
    deleteUploadFileByPublicUrl(notification.image);
    notification.image = uploadedImage;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid status", 400);
    }
    notification.status = status;
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body, "kind") ||
    Object.prototype.hasOwnProperty.call(req.body, "vendorTargetTypes") ||
    Object.prototype.hasOwnProperty.call(req.body, "audienceType")
  ) {
    const resolved = resolveKindAndTargets({
      audienceType: notification.audienceType,
      kind: Object.prototype.hasOwnProperty.call(req.body, "kind") ? req.body.kind : notification.kind,
      vendorTargetTypes: Object.prototype.hasOwnProperty.call(req.body, "vendorTargetTypes")
        ? req.body.vendorTargetTypes
        : notification.vendorTargetTypes,
      fallbackKind: notification.kind || "notification",
    });
    notification.kind = resolved.kind;
    notification.vendorTargetTypes = resolved.vendorTargetTypes;
    if (resolved.kind === "announcement") {
      notification.image = "";
    }
  }

  if (notification.kind === "announcement") {
    await Notification.deleteMany({
      kind: "announcement",
      audienceType: "vendors",
      _id: { $ne: notification._id },
    });
  }

  await notification.save();
  res.json({ message: "Notification updated", notification });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw new AppError("Notification not found", 404);

  deleteUploadFileByPublicUrl(notification.image);
  await Notification.findByIdAndDelete(notification._id);
  res.json({ message: "Notification deleted" });
});

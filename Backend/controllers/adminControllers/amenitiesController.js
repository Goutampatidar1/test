const Amenity = require("../../models/other/amenities");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const AMENITY_UPLOAD_FOLDER = "amenities";

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

exports.listAmenities = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, role, addedById, search } = req.query;

  const filter = {};
  if (status && String(status).trim()) {
    const normalizedStatus = String(status).trim();
    if (!ALLOWED_STATUS.has(normalizedStatus)) throw new AppError("Invalid status filter", 400);
    filter.status = normalizedStatus;
  }
  if (role && String(role).trim()) {
    filter.role = String(role).trim();
  }
  if (addedById) {
    assertObjectId(addedById, "Invalid addedById filter");
    filter.addedById = addedById;
  }

  const searchOr = searchFilter(search, ["name", "description"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [amenities, total] = await Promise.all([
    Amenity.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Amenity.countDocuments(filter),
  ]);

  res.json({
    amenities,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getAmenityById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const amenity = await Amenity.findById(req.params.id).populate("addedById").lean();
  if (!amenity) throw new AppError("Amenity not found", 404);
  res.json({ amenity });
});

exports.createAmenity = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const description = normalizeOptional(req.body.description) || "";
  const uploadedIcon = publicUploadPathFromFile(req, AMENITY_UPLOAD_FOLDER);
  const icon = normalizeOptional(uploadedIcon || req.body.icon) || "";
  const status = normalizeOptional(req.body.status) || "active";
  const addedById = normalizeRequired(req.auth?.sub);

  if (!name || !addedById) {
    throw new AppError("Name is required", 400);
  }
  assertObjectId(addedById, "Invalid addedById");
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);

  const amenity = await Amenity.create({
    name,
    icon,
    description,
    addedById,
    status,
  });

  res.status(201).json({ message: "Amenity created", amenity });
});

exports.updateAmenity = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const amenity = await Amenity.findById(req.params.id);
  if (!amenity) throw new AppError("Amenity not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Name cannot be empty", 400);
    amenity.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    amenity.description = normalizeOptional(req.body.description) || "";
  }
  const uploadedIcon = publicUploadPathFromFile(req, AMENITY_UPLOAD_FOLDER);
  if (uploadedIcon) {
    deleteUploadFileByPublicUrl(amenity.icon);
    amenity.icon = uploadedIcon;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "icon")) {
    const icon = normalizeOptional(req.body.icon) || "";
    if (icon !== amenity.icon) {
      deleteUploadFileByPublicUrl(amenity.icon);
    }
    amenity.icon = icon;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    amenity.status = status;
  }

  await amenity.save();
  res.json({ message: "Amenity updated", amenity });
});

exports.deleteAmenity = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const amenity = await Amenity.findById(req.params.id).select("_id icon").lean();
  if (!amenity) throw new AppError("Amenity not found", 404);

  deleteUploadFileByPublicUrl(amenity.icon);
  await Amenity.findByIdAndDelete(amenity._id);
  res.json({ message: "Amenity deleted" });
});

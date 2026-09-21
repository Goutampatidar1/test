const mongoose = require("mongoose");
const Venue = require("../../models/other/venue");
const Category = require("../../models/other/category");
const SubCategory = require("../../models/other/subCategory");
const Amenity = require("../../models/other/amenities");
const VenueVendor = require("../../models/entity/venueVendor");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { resolveVendorApprovalRequired } = require("../../utils/vendorApproval");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const ALLOWED_ROLES = new Set(["Admin", "VenueVendor", "Vendor"]);
const ALLOWED_PRICE_TYPES = new Set(["full", "hourly", "day"]);
const VENUE_UPLOAD_FOLDER = "venue";
const MAX_VENUE_PHOTOS = 6;

function assertVenuePhotoLimit(thumbnail, images = []) {
  const gallery = Array.isArray(images) ? images.filter(Boolean) : [];
  const total = (thumbnail ? 1 : 0) + gallery.length;
  if (total > MAX_VENUE_PHOTOS) {
    throw new AppError(`Maximum ${MAX_VENUE_PHOTOS} photos allowed per service`, 400);
  }
}

function isVenueVendorRequest(req) {
  return req.auth?.role === "venueVendor";
}

function parsePriceTypeInput(value) {
  const raw = String(value || "full")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "full_booking" || raw === "full") return "full";
  if (raw === "per_hour" || raw === "hourly" || raw === "hour") return "hourly";
  if (raw === "per_day" || raw === "day") return "day";
  if (ALLOWED_PRICE_TYPES.has(raw)) return raw;
  throw new AppError("priceType must be full, hourly, or day", 400);
}

function applyPriceTypeToVenueFields({ priceType, price }) {
  const amount = Number(price);
  if (Number.isNaN(amount) || amount < 0) {
    throw new AppError("Invalid price", 400);
  }
  const next = { basePrice: 0, dayPrice: 0, hourlyPrice: 0, priceType };
  if (priceType === "hourly") {
    next.hourlyPrice = amount;
  } else if (priceType === "day") {
    next.dayPrice = amount;
    next.basePrice = amount;
  } else {
    next.basePrice = amount;
  }
  return next;
}

function parseTokenAmountInput(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AppError("tokenAmount is required", 400);
    return undefined;
  }
  const amount = Number(value);
  if (Number.isNaN(amount) || amount < 0) {
    throw new AppError("tokenAmount must be a valid non-negative number", 400);
  }
  return amount;
}

function resolveTokenFields(body, { required = false, allowPercentageFallback = true } = {}) {
  const tokenAmount = parseTokenAmountInput(body.tokenAmount, { required });
  if (tokenAmount !== undefined && tokenAmount > 0) {
    return { tokenAmount, tokenAmountPercentage: undefined };
  }
  if (allowPercentageFallback && body.tokenAmountPercentage !== undefined && body.tokenAmountPercentage !== "") {
    return {
      tokenAmount: 0,
      tokenAmountPercentage: parseTokenAmountPercentageInput(body.tokenAmountPercentage, { required }),
    };
  }
  if (required) throw new AppError("tokenAmount is required", 400);
  return { tokenAmount: 0, tokenAmountPercentage: undefined };
}

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function parsePossiblyJsonArray(value, fieldName) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error("not array");
      return parsed;
    } catch {
      throw new AppError(`${fieldName} must be a valid JSON array`, 400);
    }
  }
  throw new AppError(`${fieldName} must be an array`, 400);
}

function getRequestFiles(req) {
  const filesPayload = req?.files;
  if (!filesPayload) return [];
  if (Array.isArray(filesPayload)) return filesPayload;
  if (typeof filesPayload === "object") {
    return Object.values(filesPayload)
      .filter(Array.isArray)
      .flat();
  }
  return [];
}

function getUploadedPublicPaths(req, fieldName) {
  return getRequestFiles(req)
    .filter((file) => file.fieldname === fieldName)
    .map((file) => `/uploads/${VENUE_UPLOAD_FOLDER}/${file.filename}`);
}

async function assertCategoryAndSubCategory(categoryId, subCategoryId) {
  const [category, subCategory] = await Promise.all([
    Category.findById(categoryId).select("_id").lean(),
    SubCategory.findById(subCategoryId).select("_id category").lean(),
  ]);

  if (!category) throw new AppError("Category not found", 404);
  if (!subCategory) throw new AppError("Sub-category not found", 404);
  if (String(subCategory.category) !== String(categoryId)) {
    throw new AppError("Sub-category does not belong to selected category", 400);
  }
}

async function assertAmenitiesExist(amenities) {
  if (!Array.isArray(amenities) || amenities.length === 0) return;

  for (const amenityId of amenities) {
    assertObjectId(amenityId, "Invalid amenity id");
  }

  const rows = await Amenity.find({ _id: { $in: amenities } }).select("_id").lean();
  if (rows.length !== new Set(amenities.map(String)).size) {
    throw new AppError("One or more amenities do not exist", 404);
  }
}

function parseTokenAmountPercentageInput(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AppError("tokenAmountPercentage is required", 400);
    return undefined;
  }
  const pct = Number(value);
  if (Number.isNaN(pct) || pct < 1 || pct > 99) {
    throw new AppError("tokenAmountPercentage must be between 1 and 99", 400);
  }
  return pct;
}

exports.listVenues = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, role, addedById, category, subCategory, city, search } = req.query;

  const filter = {};
  if (status) {
    const statusValue = normalizeRequired(status);
    if (!ALLOWED_STATUS.has(statusValue)) throw new AppError("Invalid status filter", 400);
    filter.status = statusValue;
  }
  if (role) {
    const roleValue = normalizeRequired(role);
    if (!ALLOWED_ROLES.has(roleValue)) throw new AppError("Invalid role filter", 400);
    filter.role = roleValue;
  }
  if (addedById) {
    assertObjectId(addedById, "Invalid addedById filter");
    filter.addedById = new mongoose.Types.ObjectId(String(addedById));
  }
  if (category) {
    assertObjectId(category, "Invalid category filter");
    filter.category = category;
  }
  if (subCategory) {
    assertObjectId(subCategory, "Invalid subCategory filter");
    filter.subCategory = subCategory;
  }
  if (city && normalizeRequired(city)) {
    filter.city = new RegExp(`^${normalizeRequired(city).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  }

  const searchOr = searchFilter(search, ["name", "description", "shortDescription", "address", "city"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [venues, total] = await Promise.all([
    Venue.find(filter)
      .populate("category", "name status")
      .populate("subCategory", "name status")
      .populate("amenities", "name icon status")
      .populate("addedById", "name businessName status approvalStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Venue.countDocuments(filter),
  ]);

  res.json({
    venues,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getVenueById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const venue = await Venue.findById(req.params.id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("amenities", "name icon status")
    .populate("addedById", "name businessName status approvalStatus")
    .lean();

  if (!venue) throw new AppError("Venue not found", 404);
  res.json({ venue });
});

exports.createVenue = asyncHandler(async (req, res) => {
  const vendorSelfServe = isVenueVendorRequest(req);
  const name = normalizeRequired(req.body.name);
  const description = normalizeOptional(req.body.description) || "";
  const shortDescription =
    normalizeOptional(req.body.shortDescription) || description || "";
  const category = normalizeRequired(req.body.category);
  const subCategory = normalizeOptional(req.body.subCategory);
  const address = normalizeOptional(req.body.address) || "";
  const city = normalizeOptional(req.body.city) || "";
  const state = normalizeOptional(req.body.state) || "";
  const pincode = normalizeOptional(req.body.pincode) || "";
  const latitude = req.body.latitude === "" || req.body.latitude === undefined ? null : Number(req.body.latitude);
  const longitude = req.body.longitude === "" || req.body.longitude === undefined ? null : Number(req.body.longitude);
  const uploadedThumbnail = getUploadedPublicPaths(req, "thumbnail")[0];
  const uploadedImages = getUploadedPublicPaths(req, "images");
  let thumbnail = normalizeOptional(uploadedThumbnail || req.body.thumbnail) || "";
  const bodyImages = parsePossiblyJsonArray(req.body.images, "images").map((img) => String(img).trim());
  let images = uploadedImages.length ? uploadedImages : bodyImages;
  if (!thumbnail && images.length > 0) {
    thumbnail = images[0];
    images = images.slice(1);
  }
  const amenities = parsePossiblyJsonArray(req.body.amenities, "amenities")
    .map((id) => String(id).trim())
    .filter(Boolean);
  const capacity = Number(req.body.capacity ?? 0);
  const carpetArea = Number(req.body.carpetArea ?? 0);

  let priceFields;
  if (
    req.body.priceType !== undefined ||
    req.body.price !== undefined ||
    vendorSelfServe
  ) {
    const priceType = parsePriceTypeInput(req.body.priceType);
    const priceValue =
      req.body.price ??
      (priceType === "hourly"
        ? req.body.hourlyPrice
        : priceType === "day"
          ? req.body.dayPrice
          : req.body.basePrice ?? req.body.dayPrice);
    if (priceValue === undefined || priceValue === "") {
      throw new AppError("Price is required", 400);
    }
    priceFields = applyPriceTypeToVenueFields({ priceType, price: priceValue });
  } else {
    const dayPrice = Number(req.body.dayPrice ?? req.body.basePrice ?? 0);
    const hourlyPrice = Number(req.body.hourlyPrice ?? 0);
    if (Number.isNaN(dayPrice) || dayPrice < 0) throw new AppError("Invalid dayPrice", 400);
    if (Number.isNaN(hourlyPrice) || hourlyPrice < 0) throw new AppError("Invalid hourlyPrice", 400);
    priceFields = {
      basePrice: dayPrice,
      dayPrice,
      hourlyPrice,
      priceType: hourlyPrice > 0 && dayPrice <= 0 ? "hourly" : "day",
    };
  }

  const tokenFields = resolveTokenFields(req.body, {
    required: vendorSelfServe,
    allowPercentageFallback: !vendorSelfServe,
  });

  const authRole = req.auth?.role;
  const defaultRole = authRole === "venueVendor" ? "VenueVendor" : "Admin";
  let role = normalizeOptional(req.body.role) || defaultRole;
  let addedById = normalizeRequired(req.body.addedById || req.auth?.sub);
  if (authRole === "venueVendor") {
    role = "VenueVendor";
    addedById = String(req.auth.sub);
  }
  const status = normalizeOptional(req.body.status) || "active";

  if (!name || !category || !addedById) {
    throw new AppError("Name, category and addedById are required", 400);
  }
  if (!thumbnail) {
    throw new AppError("At least one service photo is required", 400);
  }
  assertVenuePhotoLimit(thumbnail, images);
  if (!vendorSelfServe && !address) {
    throw new AppError("Address is required", 400);
  }
  assertObjectId(category, "Invalid category id");
  if (subCategory) assertObjectId(subCategory, "Invalid subCategory id");
  assertObjectId(addedById, "Invalid addedById");
  if (Number.isNaN(capacity) || capacity < 0) throw new AppError("Invalid capacity", 400);
  if (Number.isNaN(carpetArea) || carpetArea < 0) throw new AppError("Invalid carpet area", 400);
  if (latitude !== null && Number.isNaN(latitude)) throw new AppError("Invalid latitude", 400);
  if (longitude !== null && Number.isNaN(longitude)) throw new AppError("Invalid longitude", 400);
  if (!ALLOWED_ROLES.has(role)) throw new AppError("Invalid role", 400);
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);

  if (subCategory) await assertCategoryAndSubCategory(category, subCategory);
  if (amenities.length > 0) await assertAmenitiesExist(amenities);

  const { adminApproved } = await resolveVendorApprovalRequired();
  const venueAdminApproved = role === "VenueVendor" ? adminApproved : true;

  const venue = await Venue.create({
    name,
    description,
    shortDescription,
    category,
    ...(subCategory ? { subCategory } : {}),
    address,
    city,
    state,
    pincode,
    latitude,
    longitude,
    thumbnail,
    images: images.filter(Boolean),
    amenities,
    capacity,
    carpetArea,
    ...priceFields,
    ...tokenFields,
    role,
    addedById,
    status,
    adminApproved: venueAdminApproved,
  });

  const fresh = await Venue.findById(venue._id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("amenities", "name icon status")
    .populate("addedById", "name businessName status approvalStatus")
    .lean();

  res.status(201).json({
    message: venueAdminApproved ? "Venue created" : "Venue submitted for admin approval",
    venue: fresh,
    approvalRequired: role === "VenueVendor" ? !venueAdminApproved : false,
  });
});

exports.updateVenue = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const venue = await Venue.findById(req.params.id);
  if (!venue) throw new AppError("Venue not found", 404);

  const originalCategory = String(venue.category);
  const originalSubCategory = venue.subCategory ? String(venue.subCategory) : "";
  let nextCategory = originalCategory;
  let nextSubCategory = originalSubCategory;

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Name cannot be empty", 400);
    venue.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    venue.description = normalizeOptional(req.body.description) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "shortDescription")) {
    venue.shortDescription = normalizeOptional(req.body.shortDescription) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "address")) {
    const address = normalizeOptional(req.body.address) || "";
    // Vendor panel service form does not collect address; ignore empty updates so
    // existing address is preserved. Admin still cannot clear address to blank.
    if (!address) {
      if (!isVenueVendorRequest(req)) {
        throw new AppError("Address cannot be empty", 400);
      }
    } else {
      venue.address = address;
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "city")) {
    venue.city = normalizeOptional(req.body.city) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "state")) {
    venue.state = normalizeOptional(req.body.state) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "pincode")) {
    venue.pincode = normalizeOptional(req.body.pincode) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "latitude")) {
    const latitude = req.body.latitude === "" ? null : Number(req.body.latitude);
    if (latitude !== null && Number.isNaN(latitude)) throw new AppError("Invalid latitude", 400);
    venue.latitude = latitude;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "longitude")) {
    const longitude = req.body.longitude === "" ? null : Number(req.body.longitude);
    if (longitude !== null && Number.isNaN(longitude)) throw new AppError("Invalid longitude", 400);
    venue.longitude = longitude;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
    const category = normalizeRequired(req.body.category);
    assertObjectId(category, "Invalid category id");
    venue.category = category;
    nextCategory = category;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "subCategory")) {
    const subCategory = normalizeOptional(req.body.subCategory);
    if (subCategory) {
      assertObjectId(subCategory, "Invalid subCategory id");
      venue.subCategory = subCategory;
      nextSubCategory = subCategory;
    } else {
      venue.subCategory = undefined;
      nextSubCategory = "";
    }
  }

  if (
    nextSubCategory &&
    (nextCategory !== originalCategory || nextSubCategory !== originalSubCategory)
  ) {
    await assertCategoryAndSubCategory(nextCategory, nextSubCategory);
  }

  const uploadedThumbnail = getUploadedPublicPaths(req, "thumbnail")[0];
  const uploadedImages = getUploadedPublicPaths(req, "images");

  if (uploadedThumbnail) {
    deleteUploadFileByPublicUrl(venue.thumbnail);
    venue.thumbnail = uploadedThumbnail;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "thumbnail")) {
    const thumbnail = normalizeRequired(req.body.thumbnail);
    if (!thumbnail) throw new AppError("Thumbnail cannot be empty", 400);
    if (thumbnail !== venue.thumbnail) {
      deleteUploadFileByPublicUrl(venue.thumbnail);
    }
    venue.thumbnail = thumbnail;
  }

  if (uploadedImages.length > 0) {
    for (const oldImage of venue.images || []) deleteUploadFileByPublicUrl(oldImage);
    venue.images = uploadedImages;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "images")) {
    const images = parsePossiblyJsonArray(req.body.images, "images").map((img) => String(img).trim());
    venue.images = images.filter(Boolean);
  }

  assertVenuePhotoLimit(venue.thumbnail, venue.images);

  if (Object.prototype.hasOwnProperty.call(req.body, "amenities")) {
    const amenities = parsePossiblyJsonArray(req.body.amenities, "amenities")
      .map((id) => String(id).trim())
      .filter(Boolean);
    await assertAmenitiesExist(amenities);
    venue.amenities = amenities;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "capacity")) {
    const capacity = Number(req.body.capacity);
    if (Number.isNaN(capacity) || capacity < 0) throw new AppError("Invalid capacity", 400);
    venue.capacity = capacity;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "carpetArea")) {
    const carpetArea = Number(req.body.carpetArea);
    if (Number.isNaN(carpetArea) || carpetArea < 0) throw new AppError("Invalid carpet area", 400);
    venue.carpetArea = carpetArea;
  }
  if (
    Object.prototype.hasOwnProperty.call(req.body, "priceType") ||
    Object.prototype.hasOwnProperty.call(req.body, "price")
  ) {
    const priceType = parsePriceTypeInput(req.body.priceType ?? venue.priceType);
    const priceValue =
      req.body.price ??
      (priceType === "hourly"
        ? req.body.hourlyPrice ?? venue.hourlyPrice
        : priceType === "day"
          ? req.body.dayPrice ?? venue.dayPrice
          : req.body.basePrice ?? venue.basePrice ?? venue.dayPrice);
    const priceFields = applyPriceTypeToVenueFields({ priceType, price: priceValue });
    venue.basePrice = priceFields.basePrice;
    venue.dayPrice = priceFields.dayPrice;
    venue.hourlyPrice = priceFields.hourlyPrice;
    venue.priceType = priceFields.priceType;
  } else {
    if (Object.prototype.hasOwnProperty.call(req.body, "basePrice")) {
      const basePrice = Number(req.body.basePrice);
      if (Number.isNaN(basePrice) || basePrice < 0) throw new AppError("Invalid basePrice", 400);
      venue.basePrice = basePrice;
      venue.dayPrice = basePrice;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "dayPrice")) {
      const dayPrice = Number(req.body.dayPrice);
      if (Number.isNaN(dayPrice) || dayPrice < 0) throw new AppError("Invalid dayPrice", 400);
      venue.dayPrice = dayPrice;
      venue.basePrice = dayPrice;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "hourlyPrice")) {
      const hourlyPrice = Number(req.body.hourlyPrice);
      if (Number.isNaN(hourlyPrice) || hourlyPrice < 0) throw new AppError("Invalid hourlyPrice", 400);
      venue.hourlyPrice = hourlyPrice;
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "tokenAmount")) {
    venue.tokenAmount = parseTokenAmountInput(req.body.tokenAmount, { required: false }) ?? 0;
    if (venue.tokenAmount > 0) {
      venue.tokenAmountPercentage = undefined;
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "tokenAmountPercentage")) {
    venue.tokenAmountPercentage = parseTokenAmountPercentageInput(req.body.tokenAmountPercentage, {
      required: !isVenueVendorRequest(req),
    });
    if (venue.tokenAmountPercentage !== undefined) {
      venue.tokenAmount = 0;
    }
  }
  if (req.auth?.role !== "venueVendor" && Object.prototype.hasOwnProperty.call(req.body, "role")) {
    const role = normalizeRequired(req.body.role);
    if (!ALLOWED_ROLES.has(role)) throw new AppError("Invalid role", 400);
    venue.role = role;
  }
  if (req.auth?.role !== "venueVendor" && Object.prototype.hasOwnProperty.call(req.body, "addedById")) {
    const addedById = normalizeRequired(req.body.addedById);
    assertObjectId(addedById, "Invalid addedById");
    venue.addedById = addedById;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    venue.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "adminApproved")) {
    if (req.auth?.role === "venueVendor") {
      throw new AppError("Only admin can change approval status", 403);
    }
    const approved = req.body.adminApproved;
    let nextAdminApproved;
    if (typeof approved === "boolean") {
      nextAdminApproved = approved;
    } else if (approved === "true" || approved === "1") {
      nextAdminApproved = true;
    } else if (approved === "false" || approved === "0") {
      nextAdminApproved = false;
    } else {
      throw new AppError("adminApproved must be a boolean", 400);
    }

    if (nextAdminApproved && venue.role === "VenueVendor") {
      const serviceVendor = await VenueVendor.findById(venue.addedById)
        .select("approvalStatus")
        .lean();
      if (!serviceVendor) {
        throw new AppError("Service Vendor account not found", 404);
      }
      if (serviceVendor.approvalStatus !== "approved") {
        throw new AppError(
          "Approve the Service Vendor account before approving this service",
          409
        );
      }
    }
    venue.adminApproved = nextAdminApproved;
  } else if (req.auth?.role === "venueVendor" && venue.isModified()) {
    const { approvalRequired, adminApproved } = await resolveVendorApprovalRequired();
    if (approvalRequired) {
      venue.adminApproved = false;
    } else {
      venue.adminApproved = adminApproved;
    }
  }

  await venue.save();
  const fresh = await Venue.findById(venue._id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("amenities", "name icon status")
    .populate("addedById", "name businessName status approvalStatus")
    .lean();

  res.json({
    message: fresh.adminApproved
      ? "Venue updated"
      : "Venue updated and submitted for admin approval",
    venue: fresh,
    approvalRequired: Boolean(req.auth?.role === "venueVendor" && !fresh.adminApproved),
  });
});

exports.deleteVenue = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const venue = await Venue.findById(req.params.id).select("_id thumbnail images").lean();
  if (!venue) throw new AppError("Venue not found", 404);

  deleteUploadFileByPublicUrl(venue.thumbnail);
  for (const image of venue.images || []) deleteUploadFileByPublicUrl(image);

  await Venue.findByIdAndDelete(venue._id);
  res.json({ message: "Venue deleted" });
});

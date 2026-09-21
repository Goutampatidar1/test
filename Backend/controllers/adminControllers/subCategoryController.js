const Category = require("../../models/other/category");
const SubCategory = require("../../models/other/subCategory");
const { Admin, Vendor, VenueVendor } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");

const ALLOWED_STATUS = new Set(["active", "inactive", "pending", "rejected"]);
const ALLOWED_CATEGORY_MODES = new Set(["venue", "ecom"]);
const ALLOWED_ROLES = new Set(["Admin", "VenueVendor", "Vendor"]);
const UPLOAD_FOLDER = "sub-category";

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertSubCategoryNameUnique(categoryId, name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = {
    category: categoryId,
    name: exactNameRx,
    status: { $in: ["active", "pending"] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await SubCategory.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Sub-category name already exists in this category", 409);
}

async function populateSubCategoryAddedBy(subCategories) {
  return Promise.all(
    subCategories.map(async (row) => {
      if (!row.addedById) return row;
      const id = row.addedById;
      const role = String(row.role || "");
      let addedBy = null;
      if (role === "Vendor") {
        addedBy = await Vendor.findById(id).select("name businessName phone email").lean();
      } else if (role === "VenueVendor") {
        addedBy = await VenueVendor.findById(id).select("name businessName phone email").lean();
      } else {
        addedBy = await Admin.findById(id).select("name email").lean();
      }
      return { ...row, addedById: addedBy };
    })
  );
}

function applyListedSubCategoryFilter(filter) {
  filter.$or = [
    { role: { $in: ["Admin", "admin"] }, status: { $in: ["active", "inactive"] } },
    { role: "Vendor", status: "active" },
    { role: "VenueVendor", status: "active" },
  ];
}

exports.listSubCategories = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, category, mode, role, addedById, listed } = req.query;

  const filter = {};
  const listedOnly = listed === "true" || listed === "1";
  if (listedOnly) {
    applyListedSubCategoryFilter(filter);
  } else if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (category) {
    assertObjectId(category, "Invalid category id");
    filter.category = category;
  }
  if (mode) {
    if (!ALLOWED_CATEGORY_MODES.has(String(mode))) {
      throw new AppError("Invalid category mode filter", 400);
    }
    filter.mode = String(mode);
  }
  if (role) {
    if (!ALLOWED_ROLES.has(String(role))) throw new AppError("Invalid role filter", 400);
    filter.role = String(role);
  }
  if (addedById) {
    assertObjectId(addedById, "Invalid addedById filter");
    filter.addedById = addedById;
  }

  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [rawSubCategories, total] = await Promise.all([
    SubCategory.find(filter)
      .populate("category", "name status mode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SubCategory.countDocuments(filter),
  ]);
  const subCategories = await populateSubCategoryAddedBy(rawSubCategories);

  res.json({
    subCategories,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getSubCategoryById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subCategory = await SubCategory.findById(req.params.id)
    .populate("category", "name status")
    .lean();
  if (!subCategory) throw new AppError("Sub-category not found", 404);
  res.json({ subCategory });
});

exports.createSubCategory = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const imageFromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const image = normalizeRequired(imageFromFile ?? req.body.image);
  const category = normalizeRequired(req.body.category);
  const status = normalizeOptional(req.body.status) || "active";
  const mode = normalizeOptional(req.body.mode) || "ecom";
  const roleRaw = normalizeOptional(req.body.role) || "Admin";
  const role = roleRaw === "admin" ? "Admin" : roleRaw;
  const addedById = normalizeOptional(req.body.addedById);

  if (!name || !image || !category) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Name, image, and category are required", 400);
  }
  assertObjectId(category, "Invalid category id");
  if (!ALLOWED_STATUS.has(status)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid status", 400);
  }
  if (!ALLOWED_CATEGORY_MODES.has(mode)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid mode", 400);
  }
  if (!ALLOWED_ROLES.has(role)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid role", 400);
  }
  if (addedById) {
    assertObjectId(addedById, "Invalid addedById");
  }

  const parent = await Category.findById(category).select("_id").lean();
  if (!parent) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Category not found", 404);
  }

  try {
    await assertSubCategoryNameUnique(category, name);

    const subCategory = await SubCategory.create({
      name,
      image,
      category,
      mode,
      role,
      addedById,
      status,
    });

    const populated = await SubCategory.findById(subCategory._id)
      .populate("category", "name status")
      .lean();
    res.status(201).json({ message: "Sub-category created", subCategory: populated });
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

exports.updateSubCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subCategory = await SubCategory.findById(req.params.id);
  if (!subCategory) throw new AppError("Sub-category not found", 404);

  let nextCategoryId = String(subCategory.category);

  if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
    const category = normalizeRequired(req.body.category);
    assertObjectId(category, "Invalid category id");
    const parent = await Category.findById(category).select("_id").lean();
    if (!parent) throw new AppError("Category not found", 404);
    nextCategoryId = category;
    subCategory.category = category;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Name cannot be empty", 400);
    await assertSubCategoryNameUnique(nextCategoryId, name, subCategory._id);
    subCategory.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
    const image = normalizeRequired(req.body.image);
    if (!image) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Image cannot be empty", 400);
    }
    subCategory.image = image;
  }

  if (req.file) {
    const uploadedImage = publicUploadPathFromFile(req, UPLOAD_FOLDER);
    deleteUploadFileByPublicUrl(subCategory.image);
    subCategory.image = uploadedImage;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid status", 400);
    }
    subCategory.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "mode")) {
    const mode = normalizeRequired(req.body.mode);
    if (!ALLOWED_CATEGORY_MODES.has(mode)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid mode", 400);
    }
    subCategory.mode = mode;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
    const role = normalizeRequired(req.body.role);
    if (!ALLOWED_ROLES.has(role)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid role", 400);
    }
    subCategory.role = role;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "addedById")) {
    const addedById = normalizeOptional(req.body.addedById);
    if (!addedById) {
      subCategory.addedById = undefined;
    } else {
      assertObjectId(addedById, "Invalid addedById");
      subCategory.addedById = addedById;
    }
  }

  await subCategory.save();
  const populated = await SubCategory.findById(subCategory._id)
    .populate("category", "name status")
    .lean();
  res.json({ message: "Sub-category updated", subCategory: populated });
});

exports.approveSubCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subCategory = await SubCategory.findById(req.params.id);
  if (!subCategory) throw new AppError("Sub-category not found", 404);
  if (subCategory.role !== "Vendor") {
    throw new AppError("Only vendor-submitted sub-categories require approval", 400);
  }
  if (subCategory.status !== "pending") {
    throw new AppError("Sub-category is not pending approval", 400);
  }

  const parent = await Category.findOne({
    _id: subCategory.category,
    status: "active",
    mode: subCategory.mode,
  })
    .select("_id")
    .lean();
  if (!parent) {
    throw new AppError("Parent category is not active. Approve the category first.", 400);
  }

  subCategory.status = "active";
  await subCategory.save();

  const populated = await SubCategory.findById(subCategory._id)
    .populate("category", "name status mode")
    .lean();
  res.json({ message: "Sub-category approved", subCategory: populated });
});

exports.rejectSubCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subCategory = await SubCategory.findById(req.params.id);
  if (!subCategory) throw new AppError("Sub-category not found", 404);
  if (subCategory.role !== "Vendor") {
    throw new AppError("Only vendor-submitted sub-categories require approval", 400);
  }
  if (subCategory.status !== "pending") {
    throw new AppError("Sub-category is not pending approval", 400);
  }

  subCategory.status = "rejected";
  await subCategory.save();

  const populated = await SubCategory.findById(subCategory._id)
    .populate("category", "name status mode")
    .lean();
  res.json({ message: "Sub-category rejected", subCategory: populated });
});

exports.deleteSubCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subCategory = await SubCategory.findById(req.params.id);
  if (!subCategory) throw new AppError("Sub-category not found", 404);
  deleteUploadFileByPublicUrl(subCategory.image);
  await SubCategory.findByIdAndDelete(subCategory._id);
  res.json({ message: "Sub-category deleted" });
});

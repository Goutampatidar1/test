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
const UPLOAD_FOLDER = "category";

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

async function assertCategoryNameUnique(name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = { name: exactNameRx };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await Category.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Category name already exists", 409);
}

/** refPath on Category uses role names; DB may have legacy "admin" — populate manually. */
async function populateCategoryAddedBy(categories) {
  return Promise.all(
    categories.map(async (cat) => {
      if (!cat.addedById) return cat;
      const id = cat.addedById;
      const role = String(cat.role || "");
      let addedBy = null;

      if (role === "Vendor") {
        addedBy = await Vendor.findById(id).select("name businessName phone email").lean();
      } else if (role === "VenueVendor") {
        addedBy = await VenueVendor.findById(id).select("name businessName phone email").lean();
      } else {
        addedBy = await Admin.findById(id).select("name email").lean();
      }

      return { ...cat, addedById: addedBy };
    })
  );
}

function applyListedCatalogFilter(filter) {
  filter.$or = [
    { role: { $in: ["Admin", "admin"] }, status: { $in: ["active", "inactive"] } },
    { role: "Vendor", status: "active" },
    { role: "VenueVendor", status: "active" },
  ];
}

exports.listCategories = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, mode, role, addedById, listed } = req.query;

  const filter = {};
  const listedOnly = listed === "true" || listed === "1";
  if (listedOnly) {
    applyListedCatalogFilter(filter);
  } else if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);
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

  const [rawCategories, total] = await Promise.all([
    Category.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);
  const categories = await populateCategoryAddedBy(rawCategories);

  res.json({
    categories,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getCategoryById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const category = await Category.findById(req.params.id).lean();
  if (!category) throw new AppError("Category not found", 404);
  res.json({ category });
});

exports.createCategory = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const imageFromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const image = normalizeRequired(imageFromFile ?? req.body.image);
  const status = normalizeOptional(req.body.status) || "active";
  const mode = normalizeOptional(req.body.mode) || "ecom";
  const roleRaw = normalizeOptional(req.body.role) || "Admin";
  const role = roleRaw === "admin" ? "Admin" : roleRaw;
  const addedById = normalizeOptional(req.body.addedById);

  if (!name || !image) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Name and image are required", 400);
  }
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

  try {
    await assertCategoryNameUnique(name);

    const category = await Category.create({
      name,
      image,
      mode,
      role,
      addedById,
      status,
    });

    res.status(201).json({ message: "Category created", category });
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

exports.updateCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError("Category not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Name cannot be empty", 400);
    await assertCategoryNameUnique(name, category._id);
    category.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
    const image = normalizeRequired(req.body.image);
    if (!image) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Image cannot be empty", 400);
    }
    category.image = image;
  }

  if (req.file) {
    const uploadedImage = publicUploadPathFromFile(req, UPLOAD_FOLDER);
    deleteUploadFileByPublicUrl(category.image);
    category.image = uploadedImage;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid status", 400);
    }
    category.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "mode")) {
    const mode = normalizeRequired(req.body.mode);
    if (!ALLOWED_CATEGORY_MODES.has(mode)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid mode", 400);
    }
    category.mode = mode;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
    const role = normalizeRequired(req.body.role);
    if (!ALLOWED_ROLES.has(role)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid role", 400);
    }
    category.role = role;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "addedById")) {
    const addedById = normalizeOptional(req.body.addedById);
    if (!addedById) {
      category.addedById = undefined;
    } else {
      assertObjectId(addedById, "Invalid addedById");
      category.addedById = addedById;
    }
  }

  await category.save();
  res.json({ message: "Category updated", category });
});

exports.approveCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError("Category not found", 404);
  if (category.role !== "Vendor") {
    throw new AppError("Only vendor-submitted categories require approval", 400);
  }
  if (category.status !== "pending") {
    throw new AppError("Category is not pending approval", 400);
  }

  category.status = "active";
  await category.save();

  res.json({ message: "Category approved", category });
});

exports.rejectCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError("Category not found", 404);
  if (category.role !== "Vendor") {
    throw new AppError("Only vendor-submitted categories require approval", 400);
  }
  if (category.status !== "pending") {
    throw new AppError("Category is not pending approval", 400);
  }

  category.status = "rejected";
  await category.save();

  res.json({ message: "Category rejected", category });
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError("Category not found", 404);

  const linkedSubCategories = await SubCategory.countDocuments({ category: category._id });
  if (linkedSubCategories > 0) {
    throw new AppError("Cannot delete category with existing sub-categories", 409);
  }

  deleteUploadFileByPublicUrl(category.image);
  await Category.findByIdAndDelete(category._id);
  res.json({ message: "Category deleted" });
});

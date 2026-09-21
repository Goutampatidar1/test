const Category = require("../../models/other/category");
const SubCategory = require("../../models/other/subCategory");
const ChildCategory = require("../../models/other/childCategory");
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
const UPLOAD_FOLDER = "child-category";

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

async function assertChildCategoryNameUnique(subCategoryId, name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = {
    subCategory: subCategoryId,
    name: exactNameRx,
    status: { $in: ["active", "pending"] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await ChildCategory.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Child category name already exists in this sub-category", 409);
}

async function assertSubCategoryBelongsToCategory(subCategoryId, categoryId) {
  const parent = await SubCategory.findOne({
    _id: subCategoryId,
    category: categoryId,
  })
    .select("_id category mode status")
    .lean();
  if (!parent) {
    throw new AppError("Sub-category not found for the selected category", 404);
  }
  return parent;
}

async function populateChildCategoryAddedBy(rows) {
  return Promise.all(
    rows.map(async (row) => {
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

function applyListedChildCategoryFilter(filter) {
  filter.$or = [
    { role: { $in: ["Admin", "admin"] }, status: { $in: ["active", "inactive"] } },
    { role: "Vendor", status: "active" },
    { role: "VenueVendor", status: "active" },
  ];
}

exports.listChildCategories = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, category, subCategory, mode, role, addedById, listed } = req.query;

  const filter = {};
  const listedOnly = listed === "true" || listed === "1";
  if (listedOnly) {
    applyListedChildCategoryFilter(filter);
  } else if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (category) {
    assertObjectId(category, "Invalid category id");
    filter.category = category;
  }
  if (subCategory) {
    assertObjectId(subCategory, "Invalid subCategory id");
    filter.subCategory = subCategory;
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

  const [rawRows, total] = await Promise.all([
    ChildCategory.find(filter)
      .populate("category", "name status mode")
      .populate("subCategory", "name status mode category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ChildCategory.countDocuments(filter),
  ]);
  const childCategories = await populateChildCategoryAddedBy(rawRows);

  res.json({
    childCategories,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getChildCategoryById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const childCategory = await ChildCategory.findById(req.params.id)
    .populate("category", "name status mode")
    .populate("subCategory", "name status mode category")
    .lean();
  if (!childCategory) throw new AppError("Child category not found", 404);
  res.json({ childCategory });
});

exports.createChildCategory = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const imageFromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const image = normalizeRequired(imageFromFile ?? req.body.image);
  const category = normalizeRequired(req.body.category);
  const subCategory = normalizeRequired(req.body.subCategory);
  const status = normalizeOptional(req.body.status) || "active";
  const mode = normalizeOptional(req.body.mode) || "ecom";
  const roleRaw = normalizeOptional(req.body.role) || "Admin";
  const role = roleRaw === "admin" ? "Admin" : roleRaw;
  const addedById = normalizeOptional(req.body.addedById);

  if (!name || !image || !category || !subCategory) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Name, image, category, and sub-category are required", 400);
  }
  assertObjectId(category, "Invalid category id");
  assertObjectId(subCategory, "Invalid subCategory id");
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

  const parentCategory = await Category.findById(category).select("_id mode").lean();
  if (!parentCategory) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Category not found", 404);
  }

  const parentSubCategory = await assertSubCategoryBelongsToCategory(subCategory, category);
  if (parentSubCategory.mode !== mode) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Sub-category mode must match child category mode", 400);
  }

  try {
    await assertChildCategoryNameUnique(subCategory, name);

    const childCategory = await ChildCategory.create({
      name,
      image,
      category,
      subCategory,
      mode,
      role,
      addedById,
      status,
    });

    const populated = await ChildCategory.findById(childCategory._id)
      .populate("category", "name status mode")
      .populate("subCategory", "name status mode category")
      .lean();
    res.status(201).json({ message: "Child category created", childCategory: populated });
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

exports.updateChildCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const childCategory = await ChildCategory.findById(req.params.id);
  if (!childCategory) throw new AppError("Child category not found", 404);

  let nextCategoryId = String(childCategory.category);
  let nextSubCategoryId = String(childCategory.subCategory);

  if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
    const category = normalizeRequired(req.body.category);
    assertObjectId(category, "Invalid category id");
    const parent = await Category.findById(category).select("_id").lean();
    if (!parent) throw new AppError("Category not found", 404);
    nextCategoryId = category;
    childCategory.category = category;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "subCategory")) {
    const subCategory = normalizeRequired(req.body.subCategory);
    assertObjectId(subCategory, "Invalid subCategory id");
    await assertSubCategoryBelongsToCategory(subCategory, nextCategoryId);
    nextSubCategoryId = subCategory;
    childCategory.subCategory = subCategory;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
    await assertSubCategoryBelongsToCategory(nextSubCategoryId, nextCategoryId);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Name cannot be empty", 400);
    await assertChildCategoryNameUnique(nextSubCategoryId, name, childCategory._id);
    childCategory.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
    const image = normalizeRequired(req.body.image);
    if (!image) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Image cannot be empty", 400);
    }
    childCategory.image = image;
  }

  if (req.file) {
    const uploadedImage = publicUploadPathFromFile(req, UPLOAD_FOLDER);
    deleteUploadFileByPublicUrl(childCategory.image);
    childCategory.image = uploadedImage;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid status", 400);
    }
    childCategory.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "mode")) {
    const mode = normalizeRequired(req.body.mode);
    if (!ALLOWED_CATEGORY_MODES.has(mode)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid mode", 400);
    }
    childCategory.mode = mode;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
    const role = normalizeRequired(req.body.role);
    if (!ALLOWED_ROLES.has(role)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid role", 400);
    }
    childCategory.role = role;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "addedById")) {
    const addedById = normalizeOptional(req.body.addedById);
    if (!addedById) {
      childCategory.addedById = undefined;
    } else {
      assertObjectId(addedById, "Invalid addedById");
      childCategory.addedById = addedById;
    }
  }

  await childCategory.save();
  const populated = await ChildCategory.findById(childCategory._id)
    .populate("category", "name status mode")
    .populate("subCategory", "name status mode category")
    .lean();
  res.json({ message: "Child category updated", childCategory: populated });
});

exports.approveChildCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const childCategory = await ChildCategory.findById(req.params.id);
  if (!childCategory) throw new AppError("Child category not found", 404);
  if (childCategory.role !== "Vendor") {
    throw new AppError("Only vendor-submitted child categories require approval", 400);
  }
  if (childCategory.status !== "pending") {
    throw new AppError("Child category is not pending approval", 400);
  }

  const parent = await SubCategory.findOne({
    _id: childCategory.subCategory,
    status: "active",
    mode: childCategory.mode,
    category: childCategory.category,
  })
    .select("_id")
    .lean();
  if (!parent) {
    throw new AppError("Parent sub-category is not active. Approve the sub-category first.", 400);
  }

  childCategory.status = "active";
  await childCategory.save();

  const populated = await ChildCategory.findById(childCategory._id)
    .populate("category", "name status mode")
    .populate("subCategory", "name status mode category")
    .lean();
  res.json({ message: "Child category approved", childCategory: populated });
});

exports.rejectChildCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const childCategory = await ChildCategory.findById(req.params.id);
  if (!childCategory) throw new AppError("Child category not found", 404);
  if (childCategory.role !== "Vendor") {
    throw new AppError("Only vendor-submitted child categories require approval", 400);
  }
  if (childCategory.status !== "pending") {
    throw new AppError("Child category is not pending approval", 400);
  }

  childCategory.status = "rejected";
  await childCategory.save();

  const populated = await ChildCategory.findById(childCategory._id)
    .populate("category", "name status mode")
    .populate("subCategory", "name status mode category")
    .lean();
  res.json({ message: "Child category rejected", childCategory: populated });
});

exports.deleteChildCategory = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const childCategory = await ChildCategory.findById(req.params.id);
  if (!childCategory) throw new AppError("Child category not found", 404);
  deleteUploadFileByPublicUrl(childCategory.image);
  await ChildCategory.findByIdAndDelete(childCategory._id);
  res.json({ message: "Child category deleted" });
});

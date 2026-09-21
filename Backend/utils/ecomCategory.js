const mongoose = require("mongoose");
const Category = require("../models/other/category");
const SubCategory = require("../models/other/subCategory");
const ChildCategory = require("../models/other/childCategory");
const Product = require("../models/other/product");
const AppError = require("./AppError");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { searchFilter } = require("./listQuery");
const { getCategoryIdsWithPublicProducts, getSubCategoryIdsWithPublicProducts } = require("./publicProductList");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function toMobileCategoryItem(doc, baseUrl, options = {}) {
  if (!doc) return null;

  const image = toAbsoluteUploadUrl(doc.image, baseUrl);

  return {
    _id: doc._id,
    name: doc.name,
    image,
    icon: image,
    mode: doc.mode,
    isSelected: Boolean(options.isSelected),
  };
}

function toMobileSubCategoryItem(doc, baseUrl) {
  if (!doc) return null;

  const image = toAbsoluteUploadUrl(doc.image, baseUrl);
  const category =
    doc.category && typeof doc.category === "object"
      ? {
          _id: doc.category._id,
          name: doc.category.name,
          mode: doc.category.mode,
        }
      : doc.category;

  return {
    _id: doc._id,
    name: doc.name,
    image,
    icon: image,
    categoryId: category?._id ?? doc.category,
    category,
    mode: doc.mode,
  };
}

function toMobileChildCategoryItem(doc, baseUrl) {
  if (!doc) return null;

  const image = toAbsoluteUploadUrl(doc.image, baseUrl);
  const category =
    doc.category && typeof doc.category === "object"
      ? {
          _id: doc.category._id,
          name: doc.category.name,
          mode: doc.category.mode,
        }
      : doc.category;
  const subCategory =
    doc.subCategory && typeof doc.subCategory === "object"
      ? {
          _id: doc.subCategory._id,
          name: doc.subCategory.name,
          mode: doc.subCategory.mode,
        }
      : doc.subCategory;

  return {
    _id: doc._id,
    name: doc.name,
    image,
    icon: image,
    categoryId: category?._id ?? doc.category,
    category,
    subCategoryId: subCategory?._id ?? doc.subCategory,
    subCategory,
    mode: doc.mode,
  };
}

async function assertEcomCategory(categoryId) {
  const category = await Category.findOne({
    _id: toObjectId(categoryId),
    status: "active",
    mode: "ecom",
  }).lean();

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  return category;
}

async function listEcomCategories({ search, skip = 0, limit = 100, onlyWithProducts = true } = {}) {
  const filter = { status: "active", mode: "ecom" };
  const searchOr = searchFilter(search, ["name"]);

  if (searchOr) {
    Object.assign(filter, searchOr);
  }

  if (onlyWithProducts) {
    const categoryIds = await getCategoryIdsWithPublicProducts(Product);
    if (!categoryIds.length) return [];
    filter._id = { $in: categoryIds.map((id) => toObjectId(id)) };
  }

  return Category.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean();
}

async function listEcomSubCategories(
  categoryId,
  { search, skip = 0, limit = 100, onlyWithProducts = true } = {}
) {
  await assertEcomCategory(categoryId);

  const filter = {
    status: "active",
    mode: "ecom",
    category: toObjectId(categoryId),
  };
  const searchOr = searchFilter(search, ["name"]);

  if (searchOr) {
    Object.assign(filter, searchOr);
  }

  if (onlyWithProducts) {
    const subCategoryIds = await getSubCategoryIdsWithPublicProducts(Product, {
      categoryId: toObjectId(categoryId),
    });
    if (!subCategoryIds.length) return [];
    filter._id = { $in: subCategoryIds.map((id) => toObjectId(id)) };
  }

  return SubCategory.find(filter)
    .populate("category", "name mode status")
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function assertEcomSubCategory(subCategoryId, { categoryId } = {}) {
  const filter = {
    _id: toObjectId(subCategoryId),
    status: "active",
    mode: "ecom",
  };
  if (categoryId) {
    filter.category = toObjectId(categoryId);
  }

  const subCategory = await SubCategory.findOne(filter)
    .populate("category", "name mode status")
    .lean();

  if (!subCategory) {
    throw new AppError("Sub-category not found", 404);
  }

  return subCategory;
}

async function listEcomChildCategories({ search, skip = 0, limit = 100, categoryId, subCategoryId } = {}) {
  if (subCategoryId) {
    await assertEcomSubCategory(subCategoryId, { categoryId });
  } else if (categoryId) {
    await assertEcomCategory(categoryId);
  }

  const filter = {
    status: "active",
    mode: "ecom",
  };
  if (subCategoryId) {
    filter.subCategory = toObjectId(subCategoryId);
  }
  if (categoryId) {
    filter.category = toObjectId(categoryId);
  }

  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) {
    Object.assign(filter, searchOr);
  }

  return ChildCategory.find(filter)
    .populate("category", "name mode status")
    .populate("subCategory", "name mode status")
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function getCategoryScreenPayload(categoryId, baseUrl, options = {}) {
  const { search = "" } = options;
  const selectedCategory = await assertEcomCategory(categoryId);

  const [categories, subCategories] = await Promise.all([
    listEcomCategories({ search: "" }),
    listEcomSubCategories(categoryId, { search }),
  ]);

  const selectedId = String(selectedCategory._id);
  const categoryTabs = categories
    .map((row) =>
      toMobileCategoryItem(row, baseUrl, {
        isSelected: String(row._id) === selectedId,
      })
    )
    .filter(Boolean);

  const subCategoryItems = subCategories
    .map((row) => toMobileSubCategoryItem(row, baseUrl))
    .filter(Boolean);

  const selected = toMobileCategoryItem(selectedCategory, baseUrl, { isSelected: true });

  return {
    categoryId: selectedCategory._id,
    categoryName: selectedCategory.name,
    category: selected,
    categories: categoryTabs,
    subCategories: subCategoryItems,
  };
}

module.exports = {
  toMobileCategoryItem,
  toMobileSubCategoryItem,
  toMobileChildCategoryItem,
  listEcomCategories,
  listEcomSubCategories,
  listEcomChildCategories,
  getCategoryScreenPayload,
  assertEcomCategory,
  assertEcomSubCategory,
};

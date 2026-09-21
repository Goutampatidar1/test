const Product = require("../../models/other/product");
const Category = require("../../models/other/category");
const SubCategory = require("../../models/other/subCategory");
const ChildCategory = require("../../models/other/childCategory");
const AttributeTitle = require("../../models/other/attributeTitle");
const AttributeValue = require("../../models/other/attributeValue");
const Admin = require("../../models/entity/admin");
const Vendor = require("../../models/entity/vendor");
const VenueVendor = require("../../models/entity/venueVendor");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { removeProductFromAllWishlists } = require("../../utils/wishlist");
const { removeAllRatingsForProduct } = require("../../utils/productRating");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const ALLOWED_ROLES = new Set(["Admin", "VenueVendor", "Vendor"]);
const ALLOWED_DISCOUNT_TYPES = new Set(["percentage", "flat"]);
const ALLOWED_TAX_TYPES = new Set(["inclusive", "exclusive"]);
const ALLOWED_VARIANT_TYPES = new Set(["single", "multi"]);
const PRODUCT_UPLOAD_FOLDER = "product";

/** refPath on Product uses role model names; populate manually for reliable admin UI. */
async function populateProductAddedBy(products) {
  const list = Array.isArray(products) ? products : [products];
  return Promise.all(
    list.map(async (item) => {
      if (!item?.addedById) return item;
      const id = item.addedById?._id ?? item.addedById;
      const role = String(item.role || "");
      let addedBy = null;

      if (role === "Vendor") {
        addedBy = await Vendor.findById(id)
          .select("name businessName phone email status approvalStatus")
          .lean();
      } else if (role === "VenueVendor") {
        addedBy = await VenueVendor.findById(id).select("name businessName phone email").lean();
      } else {
        addedBy = await Admin.findById(id).select("name email").lean();
      }

      return { ...item, addedById: addedBy };
    })
  );
}

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseAdminApproved(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function resolveAdminApprovedOnCreate(body, role) {
  if (Object.prototype.hasOwnProperty.call(body, "adminApproved")) {
    const parsed = parseAdminApproved(body.adminApproved);
    if (parsed !== null) return parsed;
  }
  return role === "Admin";
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

function matchFileField(fieldName, expectedField) {
  const normalized = String(fieldName || "").trim();
  if (!normalized) return false;
  if (normalized === expectedField) return true;
  if (normalized === `${expectedField}[]`) return true;
  if (new RegExp(`^${expectedField}\\[\\d+\\]$`).test(normalized)) return true;
  return false;
}

function getUploadedPublicPaths(req, fieldName) {
  return getRequestFiles(req)
    .filter((file) => matchFileField(file.fieldname, fieldName))
    .map((file) => `/uploads/${PRODUCT_UPLOAD_FOLDER}/${file.filename}`);
}

function getCombinationUploadedImages(req) {
  const filesPayload = getRequestFiles(req);
  const out = new Map();
  let fallbackOrder = 0;

  for (const file of filesPayload) {
    const fieldName = String(file.fieldname || "").trim();
    if (!fieldName || !fieldName.startsWith("combinationImages")) continue;

    const numericParts = [...fieldName.matchAll(/\d+/g)].map((match) => Number(match[0]));
    if (numericParts.length === 0) continue;

    const idx = Number(numericParts[0]);
    if (Number.isNaN(idx)) continue;
    const explicitOrder = Number(numericParts[1]);
    const imageOrder = Number.isNaN(explicitOrder) ? fallbackOrder++ : explicitOrder;
    const imagePath = `/uploads/${PRODUCT_UPLOAD_FOLDER}/${file.filename}`;
    if (!out.has(idx)) out.set(idx, []);
    out.get(idx).push({ imagePath, imageOrder });
  }

  for (const [idx, images] of out.entries()) {
    images.sort((a, b) => a.imageOrder - b.imageOrder);
    out.set(
      idx,
      images.map((item) => item.imagePath)
    );
  }

  return out;
}

function parseCombinations(rawCombinations) {
  let combinations = rawCombinations;
  if (typeof combinations === "string") {
    try {
      combinations = JSON.parse(combinations);
    } catch {
      throw new AppError("combinations must be a valid JSON array", 400);
    }
  }
  if (!Array.isArray(combinations)) {
    throw new AppError("combinations must be an array", 400);
  }
  return combinations.map((combination, idx) => {
    if (!combination || typeof combination !== "object") {
      throw new AppError(`Combination at index ${idx} must be an object`, 400);
    }

    const sku = normalizeRequired(combination.sku);
    const price = Number(combination.price);
    const discountValue = Number(combination.discountValue ?? 0);
    const stock = Number(combination.stock ?? 0);
    const images = parsePossiblyJsonArray(
      combination.images,
      `combinations[${idx}].images`
    ).map((img) => String(img).trim());
    const attributes = parsePossiblyJsonArray(
      combination.attributes,
      `combinations[${idx}].attributes`
    );
    const status = normalizeOptional(combination.status) || "active";

    if (
      !sku ||
      Number.isNaN(price) ||
      Number.isNaN(discountValue) ||
      Number.isNaN(stock)
    ) {
      throw new AppError(`Invalid combination payload at index ${idx}`, 400);
    }
    if (price < 1 || discountValue < 0 || stock < 0) {
      throw new AppError(`Invalid numeric values in combinations at index ${idx}`, 400);
    }
    if (!ALLOWED_STATUS.has(status)) {
      throw new AppError(`Invalid combination status at index ${idx}`, 400);
    }

    const normalizedAttributes = attributes.map((attribute, attrIdx) => {
      const attributeTitle = normalizeRequired(attribute?.attributeTitle);
      const attributeValue = normalizeRequired(attribute?.attributeValue);
      if (!attributeTitle || !attributeValue) {
        throw new AppError(
          `Attribute title and value are required at combination ${idx}, attribute ${attrIdx}`,
          400
        );
      }
      assertObjectId(attributeTitle, "Invalid combination attributeTitle id");
      assertObjectId(attributeValue, "Invalid combination attributeValue id");
      return { attributeTitle, attributeValue };
    });

    return {
      sku,
      price,
      discountValue,
      stock,
      images: images.filter(Boolean),
      attributes: normalizedAttributes,
      status,
    };
  });
}

async function assertSlugUnique(slug, excludeId) {
  const filter = { slug };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await Product.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Product slug already exists", 409);
}

async function assertProductSkuUnique(sku, excludeId) {
  const filter = { sku };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await Product.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Product sku already exists", 409);
}

function assertUniqueCombinationSkus(combinations) {
  const skuSet = new Set();
  for (const combination of combinations) {
    const combinationSku = String(combination.sku || "").trim();
    if (!combinationSku) continue;
    if (skuSet.has(combinationSku)) {
      throw new AppError("Duplicate combination sku is not allowed", 409);
    }
    skuSet.add(combinationSku);
  }
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

function hasChildCategoryInBody(body) {
  return (
    Object.prototype.hasOwnProperty.call(body, "childCategory") ||
    Object.prototype.hasOwnProperty.call(body, "childCategoryId") ||
    Object.prototype.hasOwnProperty.call(body, "child_category")
  );
}

function readChildCategoryFromBody(body) {
  if (!hasChildCategoryInBody(body)) return undefined;
  const raw = body.childCategory ?? body.childCategoryId ?? body.child_category;
  if (raw === "" || raw === null || raw === undefined) return null;
  return normalizeRequired(raw);
}

async function assertActiveEcomChildCategory(childCategoryId, { categoryId, subCategoryId } = {}) {
  assertObjectId(childCategoryId, "Invalid child category id");
  const childCategory = await ChildCategory.findOne({
    _id: childCategoryId,
    status: "active",
    mode: "ecom",
  }).lean();

  if (!childCategory) {
    throw new AppError("Child category not found", 404);
  }
  if (subCategoryId && String(childCategory.subCategory) !== String(subCategoryId)) {
    throw new AppError("Child category does not belong to the selected sub-category", 400);
  }
  if (categoryId && String(childCategory.category) !== String(categoryId)) {
    throw new AppError("Child category does not belong to the selected category", 400);
  }

  return childCategory;
}

async function assertAttributeTitlesMatchSubCategory(attributeTitleIds, subCategoryId, categoryId) {
  const ids = [...new Set((attributeTitleIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return;

  const titles = await AttributeTitle.find({ _id: { $in: ids } }).select("_id category subCategory").lean();
  if (titles.length !== ids.length) {
    throw new AppError("One or more variant attribute titles do not exist", 404);
  }
  for (const title of titles) {
    if (String(title.subCategory) !== String(subCategoryId)) {
      throw new AppError("Variant attribute title does not belong to the product sub-category", 400);
    }
    if (String(title.category) !== String(categoryId)) {
      throw new AppError("Variant attribute title does not belong to the product category", 400);
    }
  }
}

async function assertVariantAttributesValid(combinations, categoryId, subCategoryId) {
  const titleIds = new Set();
  const valueIds = new Set();

  for (const combination of combinations) {
    for (const attribute of combination.attributes) {
      titleIds.add(String(attribute.attributeTitle));
      valueIds.add(String(attribute.attributeValue));
    }
  }

  if (titleIds.size === 0 && valueIds.size === 0) return;

  const [titles, values] = await Promise.all([
    AttributeTitle.find({ _id: { $in: [...titleIds] } }).select("_id category subCategory").lean(),
    AttributeValue.find({ _id: { $in: [...valueIds] } }).select("_id attributeTitle").lean(),
  ]);

  if (titles.length !== titleIds.size) {
    throw new AppError("One or more variant attribute titles do not exist", 404);
  }
  if (values.length !== valueIds.size) {
    throw new AppError("One or more variant attribute values do not exist", 404);
  }

  for (const title of titles) {
    if (String(title.subCategory) !== String(subCategoryId)) {
      throw new AppError("Variant attribute title does not belong to the product sub-category", 400);
    }
    if (String(title.category) !== String(categoryId)) {
      throw new AppError("Variant attribute title does not belong to the product category", 400);
    }
  }

  const valueToTitleMap = new Map(values.map((value) => [String(value._id), String(value.attributeTitle)]));
  for (const combination of combinations) {
    for (const attribute of combination.attributes) {
      const valueId = String(attribute.attributeValue);
      const titleId = String(attribute.attributeTitle);
      if (valueToTitleMap.get(valueId) !== titleId) {
        throw new AppError("Variant attribute value does not belong to the provided title", 400);
      }
    }
  }
}

exports.listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, role, addedById, category, subCategory, search, variantType, adminApproved } =
    req.query;

  const filter = {};
  if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (role) {
    if (!ALLOWED_ROLES.has(String(role))) throw new AppError("Invalid role filter", 400);
    filter.role = String(role);
  }
  if (addedById) {
    assertObjectId(addedById, "Invalid addedById filter");
    filter.addedById = addedById;
  }
  if (adminApproved !== undefined && adminApproved !== "") {
    const raw = String(adminApproved).toLowerCase();
    if (raw === "true" || raw === "1") filter.adminApproved = true;
    else if (raw === "false" || raw === "0") filter.adminApproved = false;
    else throw new AppError("Invalid adminApproved filter", 400);
  }
  if (category) {
    assertObjectId(category, "Invalid category filter");
    filter.category = category;
  }
  if (subCategory) {
    assertObjectId(subCategory, "Invalid subCategory filter");
    filter.subCategory = subCategory;
  }
  if (variantType) {
    if (!ALLOWED_VARIANT_TYPES.has(String(variantType))) {
      throw new AppError("Invalid variantType filter", 400);
    }
    filter.variantType = String(variantType);
  }

  const searchOr = searchFilter(search, ["name", "slug", "description", "shortDescription"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [rawProducts, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name status")
      .populate("subCategory", "name status")
      .populate("childCategory", "name status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const products = await populateProductAddedBy(rawProducts);

  res.json({
    products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getProductById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const product = await Product.findById(req.params.id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .populate("attributeTitles", "title status subCategory")
    .lean();

  if (!product) throw new AppError("Product not found", 404);
  const [withAddedBy] = await populateProductAddedBy([product]);
  res.json({ product: withAddedBy });
});

exports.createProduct = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  if (name && name.length > 50) {
    throw new AppError("Name cannot exceed 50 characters", 400);
  }
  const slug = toSlug(normalizeOptional(req.body.slug) || name);
  const sku = normalizeRequired(req.body.sku);
  const description = normalizeRequired(req.body.description);
  if (description && description.length > 2000) {
    throw new AppError("Description cannot exceed 2000 characters", 400);
  }
  const shortDescription = normalizeOptional(req.body.shortDescription) || "";
  const category = normalizeRequired(req.body.category);
  const subCategory = normalizeRequired(req.body.subCategory);
  const moq = Number(req.body.moq ?? 1);
  const price = Number(req.body.price);
  const stock = Number(req.body.stock ?? 0);
  const discountType = normalizeOptional(req.body.discountType) || "percentage";
  const discountValue = Number(req.body.discountValue ?? 0);
  const taxType = normalizeOptional(req.body.taxType) || "inclusive";
  const taxValue = Number(req.body.taxValue ?? 0);
  const variantType = normalizeOptional(req.body.variantType) || "single";
  const uploadedThumbnail = getUploadedPublicPaths(req, "thumbnail")[0];
  const uploadedImages = getUploadedPublicPaths(req, "images");
  const uploadedVideos = getUploadedPublicPaths(req, "videos");
  const thumbnail = normalizeRequired(uploadedThumbnail || req.body.thumbnail);
  const bodyImages = parsePossiblyJsonArray(req.body.images, "images").map((img) => String(img).trim());
  const images = uploadedImages.length ? uploadedImages : bodyImages;
  const bodyVideos = parsePossiblyJsonArray(req.body.videos || "[]", "videos").map((vid) => String(vid).trim());
  const videos = uploadedVideos.length ? uploadedVideos : bodyVideos;
  const combinations = parseCombinations(req.body.combinations);
  const combinationUploadedImages = getCombinationUploadedImages(req);
  const attributeTitles = parsePossiblyJsonArray(req.body.attributeTitles, "attributeTitles").map((id) =>
    String(id).trim()
  );
  const status = normalizeOptional(req.body.status) || "active";
  const role = normalizeOptional(req.body.role) || "Admin";
  const addedById = normalizeRequired(req.body.addedById);

  if (!name || !slug || !sku || !description || !category || !subCategory || !thumbnail || !addedById) {
    throw new AppError(
      "Name, sku, description, category, subCategory, thumbnail, price and addedById are required",
      400
    );
  }

  assertObjectId(category, "Invalid category id");
  assertObjectId(subCategory, "Invalid subCategory id");
  assertObjectId(addedById, "Invalid addedById");
  if (Number.isNaN(moq) || moq < 1) throw new AppError("Invalid moq", 400);
  if (Number.isNaN(price) || price < 1) throw new AppError("Invalid price", 400);
  if (Number.isNaN(stock) || stock < 0) throw new AppError("Invalid stock", 400);
  if (Number.isNaN(discountValue) || discountValue < 0) throw new AppError("Invalid discountValue", 400);
  if (Number.isNaN(taxValue) || taxValue < 0) throw new AppError("Invalid taxValue", 400);
  if (!ALLOWED_DISCOUNT_TYPES.has(discountType)) throw new AppError("Invalid discountType", 400);
  if (!ALLOWED_TAX_TYPES.has(taxType)) throw new AppError("Invalid taxType", 400);
  if (!ALLOWED_VARIANT_TYPES.has(variantType)) throw new AppError("Invalid variantType", 400);
  if (variantType === "single" && combinations.length > 0) {
    throw new AppError("Single variant product cannot have combinations", 400);
  }
  if (variantType === "multi" && combinations.length === 0) {
    throw new AppError("Multi variant product must include combinations", 400);
  }
  for (const titleId of attributeTitles) {
    assertObjectId(titleId, "Invalid attributeTitle id");
  }
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
  if (!ALLOWED_ROLES.has(role)) throw new AppError("Invalid role", 400);

  await assertSlugUnique(slug);
  await assertProductSkuUnique(sku);
  await assertCategoryAndSubCategory(category, subCategory);

  let childCategoryId = null;
  if (hasChildCategoryInBody(req.body)) {
    const childCategoryInput = readChildCategoryFromBody(req.body);
    if (childCategoryInput) {
      await assertActiveEcomChildCategory(childCategoryInput, { categoryId: category, subCategoryId: subCategory });
      childCategoryId = childCategoryInput;
    }
  }

  await assertAttributeTitlesMatchSubCategory(attributeTitles, subCategory, category);
  await assertVariantAttributesValid(combinations, category, subCategory);
  assertUniqueCombinationSkus(combinations);
  if (combinationUploadedImages.size > 0) {
    combinations.forEach((combination, idx) => {
      const uploaded = combinationUploadedImages.get(idx);
      if (uploaded?.length) {
        combination.images = uploaded;
      }
    });
  }

  const product = await Product.create({
    name,
    slug,
    sku,
    description,
    shortDescription,
    category,
    subCategory,
    childCategory: childCategoryId,
    moq,
    price,
    stock,
    discountType,
    discountValue,
    taxType,
    taxValue,
    variantType,
    thumbnail,
    images: images.filter(Boolean),
    videos: videos.filter(Boolean),
    combinations,
    attributeTitles: attributeTitles.filter(Boolean),
    role,
    addedById,
    status,
    adminApproved: resolveAdminApprovedOnCreate(req.body, role),
  });

  const fresh = await Product.findById(product._id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .populate("addedById", "name businessName")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .populate("attributeTitles", "title status")
    .lean();

  res.status(201).json({ message: "Product created", product: fresh });
});

exports.updateProduct = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError("Product not found", 404);

  const originalCategoryId = String(product.category);
  const originalSubCategoryId = String(product.subCategory);
  const originalChildCategoryId = product.childCategory ? String(product.childCategory) : "";
  const originalSlug = String(product.slug);
  const originalSku = String(product.sku);

  let nextCategoryId = originalCategoryId;
  let nextSubCategoryId = originalSubCategoryId;
  let nextChildCategoryId = originalChildCategoryId;
  let nextSlug = originalSlug;
  let nextSku = originalSku;

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Name cannot be empty", 400);
    if (name.length > 50) throw new AppError("Name cannot exceed 50 characters", 400);
    product.name = name;
    if (!Object.prototype.hasOwnProperty.call(req.body, "slug")) {
      nextSlug = toSlug(name);
      product.slug = nextSlug;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "slug")) {
    const slug = toSlug(req.body.slug);
    if (!slug) throw new AppError("Slug cannot be empty", 400);
    nextSlug = slug;
    product.slug = slug;
  }

  if (nextSlug !== originalSlug) {
    await assertSlugUnique(nextSlug, product._id);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "sku")) {
    const sku = normalizeRequired(req.body.sku);
    if (!sku) throw new AppError("Sku cannot be empty", 400);
    nextSku = sku;
    product.sku = sku;
  }

  if (nextSku !== originalSku) {
    await assertProductSkuUnique(nextSku, product._id);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    const description = normalizeRequired(req.body.description);
    if (!description) throw new AppError("Description cannot be empty", 400);
    if (description.length > 2000) throw new AppError("Description cannot exceed 2000 characters", 400);
    product.description = description;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "shortDescription")) {
    product.shortDescription = normalizeOptional(req.body.shortDescription) || "";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
    const category = normalizeRequired(req.body.category);
    assertObjectId(category, "Invalid category id");
    nextCategoryId = category;
    product.category = category;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "subCategory")) {
    const subCategory = normalizeRequired(req.body.subCategory);
    assertObjectId(subCategory, "Invalid subCategory id");
    nextSubCategoryId = subCategory;
    product.subCategory = subCategory;
    if (!hasChildCategoryInBody(req.body)) {
      nextChildCategoryId = "";
      product.childCategory = null;
    }
  }

  if (
    nextCategoryId !== originalCategoryId ||
    nextSubCategoryId !== originalSubCategoryId ||
    Object.prototype.hasOwnProperty.call(req.body, "category") ||
    Object.prototype.hasOwnProperty.call(req.body, "subCategory")
  ) {
    await assertCategoryAndSubCategory(nextCategoryId, nextSubCategoryId);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "category") && !Object.prototype.hasOwnProperty.call(req.body, "subCategory")) {
    if (!hasChildCategoryInBody(req.body)) {
      nextChildCategoryId = "";
      product.childCategory = null;
    }
  }

  if (hasChildCategoryInBody(req.body)) {
    const childCategoryInput = readChildCategoryFromBody(req.body);
    if (!childCategoryInput) {
      nextChildCategoryId = "";
      product.childCategory = null;
    } else {
      await assertActiveEcomChildCategory(childCategoryInput, {
        categoryId: nextCategoryId,
        subCategoryId: nextSubCategoryId,
      });
      nextChildCategoryId = childCategoryInput;
      product.childCategory = childCategoryInput;
    }
  }

  const uploadedThumbnail = getUploadedPublicPaths(req, "thumbnail")[0];
  const uploadedImages = getUploadedPublicPaths(req, "images");
  const uploadedVideos = getUploadedPublicPaths(req, "videos");

  if (uploadedThumbnail) {
    deleteUploadFileByPublicUrl(product.thumbnail);
    product.thumbnail = uploadedThumbnail;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "thumbnail")) {
    const thumbnail = normalizeRequired(req.body.thumbnail);
    if (!thumbnail) throw new AppError("Thumbnail cannot be empty", 400);
    product.thumbnail = thumbnail;
  }

  if (uploadedImages.length > 0) {
    const bodyImages = Object.prototype.hasOwnProperty.call(req.body, "images")
      ? parsePossiblyJsonArray(req.body.images, "images").map((img) => String(img).trim()).filter(Boolean)
      : [...(product.images || [])].filter(Boolean);
    const merged = [...bodyImages];
    const seen = new Set(merged);
    for (const path of uploadedImages) {
      if (!seen.has(path)) {
        seen.add(path);
        merged.push(path);
      }
    }
    const nextSet = new Set(merged);
    for (const oldImage of product.images || []) {
      if (!nextSet.has(oldImage)) {
        deleteUploadFileByPublicUrl(oldImage);
      }
    }
    product.images = merged;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "images")) {
    const images = parsePossiblyJsonArray(req.body.images, "images").map((img) => String(img).trim());
    product.images = images.filter(Boolean);
  }

  if (uploadedVideos.length > 0) {
    const bodyVideos = Object.prototype.hasOwnProperty.call(req.body, "videos")
      ? parsePossiblyJsonArray(req.body.videos, "videos").map((vid) => String(vid).trim()).filter(Boolean)
      : [...(product.videos || [])].filter(Boolean);
    const mergedVideos = [...bodyVideos];
    const seenVideos = new Set(mergedVideos);
    for (const path of uploadedVideos) {
      if (!seenVideos.has(path)) {
        seenVideos.add(path);
        mergedVideos.push(path);
      }
    }
    const nextVideoSet = new Set(mergedVideos);
    for (const oldVideo of product.videos || []) {
      if (!nextVideoSet.has(oldVideo)) {
        deleteUploadFileByPublicUrl(oldVideo);
      }
    }
    product.videos = mergedVideos;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "videos")) {
    const videos = parsePossiblyJsonArray(req.body.videos, "videos").map((vid) => String(vid).trim());
    product.videos = videos.filter(Boolean);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "attributeTitles")) {
    const attributeTitles = parsePossiblyJsonArray(req.body.attributeTitles, "attributeTitles").map((id) =>
      String(id).trim()
    );
    for (const titleId of attributeTitles) {
      assertObjectId(titleId, "Invalid attributeTitle id");
    }
    product.attributeTitles = attributeTitles.filter(Boolean);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "combinations")) {
    const combinations = parseCombinations(req.body.combinations);
    const combinationUploadedImages = getCombinationUploadedImages(req);

    const oldCombinationImages = (product.combinations || [])
      .flatMap((combination) => combination.images || [])
      .filter(Boolean);

    await assertVariantAttributesValid(combinations, nextCategoryId, nextSubCategoryId);
    assertUniqueCombinationSkus(combinations);
    if (combinationUploadedImages.size > 0) {
      combinations.forEach((combination, idx) => {
        const uploaded = combinationUploadedImages.get(idx);
        if (uploaded?.length) {
          const kept = Array.isArray(combination.images)
            ? combination.images.map((img) => String(img).trim()).filter(Boolean)
            : [];
          const mergedCombo = [...kept];
          const seenCombo = new Set(mergedCombo);
          for (const path of uploaded) {
            if (!seenCombo.has(path)) {
              seenCombo.add(path);
              mergedCombo.push(path);
            }
          }
          combination.images = mergedCombo;
        }
      });
    }
    product.combinations = combinations;

    const nextCombinationImages = combinations
      .flatMap((combination) => combination.images || [])
      .filter(Boolean);
    const nextImageSet = new Set(nextCombinationImages);
    for (const oldImage of oldCombinationImages) {
      if (!nextImageSet.has(oldImage)) {
        deleteUploadFileByPublicUrl(oldImage);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "moq")) {
    const moq = Number(req.body.moq);
    if (Number.isNaN(moq) || moq < 1) throw new AppError("Invalid moq", 400);
    product.moq = moq;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "price")) {
    const price = Number(req.body.price);
    if (Number.isNaN(price) || price < 1) throw new AppError("Invalid price", 400);
    product.price = price;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "stock")) {
    const stock = Number(req.body.stock);
    if (Number.isNaN(stock) || stock < 0) throw new AppError("Invalid stock", 400);
    product.stock = stock;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "discountType")) {
    const discountType = normalizeRequired(req.body.discountType);
    if (!ALLOWED_DISCOUNT_TYPES.has(discountType)) throw new AppError("Invalid discountType", 400);
    product.discountType = discountType;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "discountValue")) {
    const discountValue = Number(req.body.discountValue);
    if (Number.isNaN(discountValue) || discountValue < 0) throw new AppError("Invalid discountValue", 400);
    product.discountValue = discountValue;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "taxType")) {
    const taxType = normalizeRequired(req.body.taxType);
    if (!ALLOWED_TAX_TYPES.has(taxType)) throw new AppError("Invalid taxType", 400);
    product.taxType = taxType;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "taxValue")) {
    const taxValue = Number(req.body.taxValue);
    if (Number.isNaN(taxValue) || taxValue < 0) throw new AppError("Invalid taxValue", 400);
    product.taxValue = taxValue;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "variantType")) {
    const variantType = normalizeRequired(req.body.variantType);
    if (!ALLOWED_VARIANT_TYPES.has(variantType)) throw new AppError("Invalid variantType", 400);
    product.variantType = variantType;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    product.status = status;
    if (product.role === "Vendor") {
      product.statusLockedByAdmin = status === "inactive";
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "adminApproved")) {
    const approved = parseAdminApproved(req.body.adminApproved);
    if (approved === null) {
      throw new AppError("adminApproved must be a boolean", 400);
    }
    product.adminApproved = approved;
  }

  if (product.role === "Admin") {
    product.adminApproved = true;
  }

  if (product.variantType === "single" && product.combinations.length > 0) {
    throw new AppError("Single variant product cannot have combinations", 400);
  }

  if (product.variantType === "multi" && product.combinations.length === 0) {
    throw new AppError("Multi variant product must include combinations", 400);
  }

  if (product.variantType === "multi") {
    await assertAttributeTitlesMatchSubCategory(product.attributeTitles, nextSubCategoryId, nextCategoryId);
    if (product.combinations.length) {
      await assertVariantAttributesValid(product.combinations, nextCategoryId, nextSubCategoryId);
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
    const role = normalizeRequired(req.body.role);
    if (!ALLOWED_ROLES.has(role)) throw new AppError("Invalid role", 400);
    product.role = role;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "addedById")) {
    const addedById = normalizeRequired(req.body.addedById);
    assertObjectId(addedById, "Invalid addedById");
    product.addedById = addedById;
  }

  await product.save();
  const fresh = await Product.findById(product._id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .populate("attributeTitles", "title status")
    .lean();
  const [withAddedBy] = await populateProductAddedBy([fresh]);

  res.json({ message: "Product updated", product: withAddedBy });
});

exports.approveProduct = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError("Product not found", 404);
  if (product.role !== "Vendor") {
    throw new AppError("Only vendor-submitted products require approval", 400);
  }
  if (product.adminApproved) {
    throw new AppError("Product is already approved", 400);
  }

  const vendor = await Vendor.findById(product.addedById)
    .select("approvalStatus")
    .lean();
  if (!vendor) {
    throw new AppError("Vendor account not found", 404);
  }
  if (vendor.approvalStatus !== "approved") {
    throw new AppError(
      "Approve the vendor account before approving this product",
      409
    );
  }

  product.adminApproved = true;
  product.status = "active";
  product.statusLockedByAdmin = false;
  await product.save();

  const fresh = await Product.findById(product._id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .lean();
  const [withAddedBy] = await populateProductAddedBy([fresh]);

  res.json({ message: "Product approved", product: withAddedBy });
});

exports.rejectProduct = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError("Product not found", 404);
  if (product.role !== "Vendor") {
    throw new AppError("Only vendor-submitted products can be rejected", 400);
  }

  product.adminApproved = false;
  product.status = "inactive";
  product.statusLockedByAdmin = true;
  await product.save();

  const fresh = await Product.findById(product._id)
    .populate("category", "name status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .lean();
  const [withAddedBy] = await populateProductAddedBy([fresh]);

  res.json({ message: "Product rejected", product: withAddedBy });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const product = await Product.findById(req.params.id).select("_id").lean();
  if (!product) throw new AppError("Product not found", 404);

  await Promise.all([
    Product.findByIdAndDelete(product._id),
    removeProductFromAllWishlists(product._id),
    removeAllRatingsForProduct(product._id),
  ]);
  res.json({ message: "Product deleted" });
});

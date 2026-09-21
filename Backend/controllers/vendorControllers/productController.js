const Product = require("../../models/other/product");
const { removeProductFromAllWishlists } = require("../../utils/wishlist");
const { removeAllRatingsForProduct, listProductReviews, getRatingStatsForProducts, applyRatingStatsToProduct } = require("../../utils/productRating");
const SubCategory = require("../../models/other/subCategory");
const ChildCategory = require("../../models/other/childCategory");
const AttributeTitle = require("../../models/other/attributeTitle");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl, toUploadStoragePath } = require("../../utils/mediaUrl");
const { toVendorProduct } = require("../../utils/mobilePresenters");
const { resolveAttributePair } = require("../../utils/attributeEnsure");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { resolveVendorApprovalRequired } = require("../../utils/vendorApproval");
const { queueNotifyAllAdmins } = require("../../utils/adminInbox");

const PRODUCT_FOLDER = "product";
const MAX_PRODUCT_IMAGES = 5;
const MAX_COMBINATION_IMAGES = 1;
const MAX_PRODUCT_VIDEOS = 5;
const VIDEO_MIME_PREFIX = "video/";
const ALLOWED_PRODUCT_STATUS = new Set(["active", "inactive"]);
const ALLOWED_DISCOUNT_TYPES = new Set(["percentage", "flat"]);
const ALLOWED_TAX_TYPES = new Set(["inclusive", "exclusive"]);
const ALLOWED_VARIANT_TYPES = new Set(["single", "multi"]);

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return "";
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

function parseJsonArray(value, fieldName) {
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

function hasNonEmptyLegacyMediaBody(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.length > 0;
  } catch {
    return true;
  }
  return false;
}

function toCombinationSavePayload(combination) {
  return {
    sku: combination.sku,
    attributes: (combination.attributes || []).map((attr) => ({
      attributeTitle: attr.attributeTitle,
      attributeValue: attr.attributeValue,
    })),
    price: Number(combination.price),
    discountValue: Number(combination.discountValue) || 0,
    stock: Number(combination.stock) || 0,
    images: [...(combination.images || [])],
    status: combination.status || "active",
  };
}

function assignProductCombinations(product, combinations) {
  product.combinations = combinations.map(toCombinationSavePayload);
  product.markModified("combinations");
}

function markProductMediaModified(product) {
  if (product.isModified("images")) product.markModified("images");
  if (product.isModified("videos")) product.markModified("videos");
  if (product.isModified("combinations")) product.markModified("combinations");
  if (product.isModified("thumbnail")) product.markModified("thumbnail");
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

function pathsForField(req, fieldName) {
  return getRequestFiles(req)
    .filter((file) => matchFileField(file.fieldname, fieldName))
    .map((file) => `/uploads/${PRODUCT_FOLDER}/${file.filename}`);
}

function getCombinationUploadedImages(req) {
  const out = new Map();
  let fallbackOrder = 0;

  for (const file of getRequestFiles(req)) {
    const fieldName = String(file.fieldname || "").trim();
    let idx = null;

    if (fieldName === "combinationImages" || fieldName === "variantImages") {
      idx = 0;
    } else if (
      fieldName.startsWith("combinationImages") ||
      fieldName.startsWith("variantImages")
    ) {
      const numericParts = [...fieldName.matchAll(/\d+/g)].map((match) => Number(match[0]));
      if (!numericParts.length) continue;
      idx = Number(numericParts[0]);
    } else {
      continue;
    }

    if (Number.isNaN(idx)) continue;

    let explicitOrder = NaN;
    if (fieldName !== "combinationImages" && fieldName !== "variantImages") {
      const numericParts = [...fieldName.matchAll(/\d+/g)].map((match) => Number(match[0]));
      explicitOrder = Number(numericParts[1]);
    }

    const imageOrder = Number.isNaN(explicitOrder) ? fallbackOrder++ : explicitOrder;
    const imagePath = `/uploads/${PRODUCT_FOLDER}/${file.filename}`;
    if (!out.has(idx)) out.set(idx, []);
    out.get(idx).push({ imagePath, imageOrder });
  }

  for (const [idx, images] of out.entries()) {
    images.sort((a, b) => a.imageOrder - b.imageOrder);
    const paths = images.map((item) => item.imagePath);
    out.set(
      idx,
      paths.length > MAX_COMBINATION_IMAGES
        ? paths.slice(-MAX_COMBINATION_IMAGES)
        : paths
    );
  }

  return out;
}

function limitVariantUploadedPaths(uploadedPaths, baseUrl) {
  const normalized = (uploadedPaths || [])
    .map((path) => toUploadStoragePath(path, baseUrl) || path)
    .filter(Boolean);
  if (normalized.length <= MAX_COMBINATION_IMAGES) return normalized;
  return normalized.slice(-MAX_COMBINATION_IMAGES);
}

function buildCombinationAttributeKey(attributes) {
  return (attributes || [])
    .map((attr) => `${String(attr.attributeTitle)}:${String(attr.attributeValue)}`)
    .sort()
    .join("|");
}

function findExistingCombinationMatch(attributes, idx, existingCombinations) {
  if (!existingCombinations?.length) return null;
  const key = buildCombinationAttributeKey(attributes);
  for (const combo of existingCombinations) {
    if (buildCombinationAttributeKey(combo.attributes) === key) return combo;
  }
  return existingCombinations[idx] || null;
}

function parseKeptMediaUrlsFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const fields = ["imageUrls", "image_urls", "existingImageUrls"];
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(row, field)) continue;
    const value = row[field];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") return null;
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch {
        return value.trim() ? [value.trim()] : null;
      }
    }
    throw new AppError(`${field} must be an array`, 400);
  }
  return null;
}

function parseCombinationImageUrlsMap(req) {
  if (!Object.prototype.hasOwnProperty.call(req.body, "combinationImageUrls")) return null;

  let parsed = req.body.combinationImageUrls;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new AppError("combinationImageUrls must be valid JSON", 400);
    }
  }

  const map = new Map();
  if (Array.isArray(parsed)) {
    parsed.forEach((urls, idx) => {
      if (!Array.isArray(urls)) return;
      const list = urls.map((url) => String(url).trim()).filter(Boolean);
      if (list.length > 0) {
        map.set(idx, list.slice(0, MAX_COMBINATION_IMAGES));
      }
    });
    return map.size > 0 ? map : null;
  }

  if (parsed && typeof parsed === "object") {
    for (const [key, urls] of Object.entries(parsed)) {
      const idx = Number(key);
      if (Number.isNaN(idx)) continue;
      const list = Array.isArray(urls)
        ? urls.map((url) => String(url).trim()).filter(Boolean)
        : parseJsonArray(urls, `combinationImageUrls[${key}]`)
            .map((url) => String(url).trim())
            .filter(Boolean);
      if (list.length > 0) {
        map.set(idx, list.slice(0, MAX_COMBINATION_IMAGES));
      } else if (Array.isArray(urls) && urls.length === 0) {
        map.set(idx, []);
      }
    }
    return map.size > 0 ? map : null;
  }

  throw new AppError("combinationImageUrls must be an array or object", 400);
}

function copyExistingCombinationImages(existing, baseUrl) {
  if (!existing?.images?.length) return [];
  return existing.images
    .map((img) => toUploadStoragePath(img, baseUrl) || img)
    .filter(Boolean);
}

function resolveVariantKeptImageInputs(combination, idx, combinationImageUrlsMap) {
  if (combination.keptImageUrls !== null && combination.keptImageUrls !== undefined) {
    return combination.keptImageUrls;
  }
  if (combinationImageUrlsMap?.has(idx)) {
    return combinationImageUrlsMap.get(idx);
  }
  return null;
}

function shouldUpdateVariantImages(keptUrlInputs, uploadedPaths) {
  return keptUrlInputs !== null || (uploadedPaths && uploadedPaths.length > 0);
}

function toPlainCombination(combo) {
  const plain = combo?.toObject?.() ?? combo ?? {};
  return {
    sku: plain.sku,
    price: plain.price,
    stock: plain.stock,
    discountValue: plain.discountValue ?? 0,
    status: plain.status || "active",
    images: [...(plain.images || [])],
    attributes: (plain.attributes || []).map((attr) => ({
      attributeTitle: attr.attributeTitle?._id ?? attr.attributeTitle,
      attributeValue: attr.attributeValue?._id ?? attr.attributeValue,
    })),
    keptImageUrls: null,
  };
}

/**
 * Update only variants sent in the payload; keep other existing variants.
 * Use replaceCombinations=true in body to replace the full variant list.
 */
function mergeCombinationsOnUpdate(parsedList, existingList) {
  const existing = (existingList || []).map(toPlainCombination);
  const merged = [];
  const matchedExistingSkus = new Set();

  for (const parsed of parsedList) {
    const key = buildCombinationAttributeKey(parsed.attributes);
    const existingMatch =
      existing.find((combo) => String(combo.sku) === String(parsed.sku)) ||
      existing.find((combo) => buildCombinationAttributeKey(combo.attributes) === key);

    if (existingMatch) {
      matchedExistingSkus.add(String(existingMatch.sku));
      if (!normalizeOptional(parsed.sku)) {
        parsed.sku = existingMatch.sku;
      }
    }
    merged.push(parsed);
  }

  for (const existingCombo of existing) {
    if (matchedExistingSkus.has(String(existingCombo.sku))) continue;
    const key = buildCombinationAttributeKey(existingCombo.attributes);
    if (merged.some((combo) => buildCombinationAttributeKey(combo.attributes) === key)) {
      continue;
    }
    merged.push({ ...existingCombo, keptImageUrls: null });
  }

  return merged;
}

function collectCombinationAttributeTitleIds(combinations) {
  const ids = new Set();
  for (const combination of combinations || []) {
    for (const attribute of combination.attributes || []) {
      ids.add(String(attribute.attributeTitle));
    }
  }
  return [...ids];
}

function mergeCombinationImages({
  existingCombo,
  keptUrlInputs,
  uploadedPaths,
  legacyBodyImages,
  baseUrl,
  maxCount,
  variantLabel,
  allowedPathSet,
}) {
  const existingPaths = (existingCombo?.images || [])
    .map((path) => toUploadStoragePath(path, baseUrl))
    .filter(Boolean);
  const existingSet = new Set(existingPaths);
  const allowedSet = allowedPathSet || existingSet;

  let keptPaths;
  if (keptUrlInputs !== null) {
    keptPaths = keptUrlInputs
      .map((url) => toUploadStoragePath(url, baseUrl))
      .filter(Boolean)
      .slice(0, maxCount);
    for (const path of keptPaths) {
      if (!allowedSet.has(path)) {
        throw new AppError(
          `imageUrls contains an image that does not belong to variant ${variantLabel}`,
          400
        );
      }
    }
  } else if (legacyBodyImages?.length) {
    keptPaths = legacyBodyImages
      .map((img) => toUploadStoragePath(img, baseUrl))
      .filter(Boolean);
  } else {
    keptPaths = [...existingPaths];
  }

  const merged = [...keptPaths];
  const seen = new Set(merged);
  for (const path of uploadedPaths || []) {
    const normalized = toUploadStoragePath(path, baseUrl) || path;
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  if (maxCount === 1) {
    const uploaded = limitVariantUploadedPaths(uploadedPaths, baseUrl);
    if (uploaded.length > 0) {
      return uploaded;
    }
    return merged.slice(0, 1);
  }

  if (merged.length > maxCount) {
    throw new AppError(`Maximum ${maxCount} images allowed per variant`, 400);
  }

  return merged;
}

function assertVideoFiles(req) {
  const videoFiles = getRequestFiles(req).filter((file) => matchFileField(file.fieldname, "videos"));
  if (videoFiles.length > MAX_PRODUCT_VIDEOS) {
    throw new AppError(`Maximum ${MAX_PRODUCT_VIDEOS} videos allowed`, 400);
  }
  for (const file of videoFiles) {
    if (!String(file.mimetype || "").startsWith(VIDEO_MIME_PREFIX)) {
      throw new AppError("Only video files are allowed in videos field", 400);
    }
  }
}

async function assertActiveEcomSubCategory(subCategoryId) {
  assertObjectId(subCategoryId, "Invalid sub-category id");
  const subCategory = await SubCategory.findOne({
    _id: subCategoryId,
    status: "active",
    mode: "ecom",
  })
    .populate("category", "name mode status")
    .lean();

  if (!subCategory) {
    throw new AppError("Sub-category not found", 404);
  }

  const category = subCategory.category;
  if (!category || category.status !== "active" || category.mode !== "ecom") {
    throw new AppError("Category is not available", 404);
  }

  return { subCategory, categoryId: String(category._id) };
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

function generateVendorSku(vendorId) {
  const tail = String(vendorId || "").slice(-6);
  return `VP-${tail}-${Date.now()}`;
}

function generateCombinationSku(vendorId, index) {
  const tail = String(vendorId || "").slice(-4);
  return `VP-${tail}-${Date.now()}-${index}`;
}

function resolveVendorVariantType(body, rawCombinations) {
  const explicit = String(body.variantType || "").trim().toLowerCase();
  if (explicit) {
    if (!ALLOWED_VARIANT_TYPES.has(explicit)) {
      throw new AppError('Invalid variantType. Use "single" or "multi"', 400);
    }
    return explicit;
  }

  const stockOnly = parseStockOnlyCombinationPayload(rawCombinations);
  if (stockOnly) return "single";

  const hasCombinations =
    rawCombinations !== undefined &&
    rawCombinations !== null &&
    rawCombinations !== "" &&
    parseJsonArray(rawCombinations, "combinations").length > 0;

  return hasCombinations ? "multi" : "single";
}

function parseDiscountTaxFields(body) {
  const discountType = normalizeOptional(body.discountType) || "percentage";
  const discountValue = Number(body.discountValue ?? 0);
  const taxType = normalizeOptional(body.taxType) || "inclusive";
  const taxValue = Number(body.taxValue ?? 0);

  if (!ALLOWED_DISCOUNT_TYPES.has(discountType)) {
    throw new AppError("Invalid discountType", 400);
  }
  if (!ALLOWED_TAX_TYPES.has(taxType)) {
    throw new AppError("Invalid taxType", 400);
  }
  if (Number.isNaN(discountValue) || discountValue < 0) {
    throw new AppError("Invalid discountValue", 400);
  }
  if (discountType === "percentage" && discountValue > 100) {
    throw new AppError("Percentage discount cannot exceed 100", 400);
  }
  if (Number.isNaN(taxValue) || taxValue < 0) {
    throw new AppError("Invalid taxValue", 400);
  }

  return { discountType, discountValue, taxType, taxValue };
}

function applyDiscountTaxUpdates(product, body) {
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(body, "discountType")) {
    const discountType = normalizeRequired(body.discountType);
    if (!ALLOWED_DISCOUNT_TYPES.has(discountType)) {
      throw new AppError("Invalid discountType", 400);
    }
    product.discountType = discountType;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "discountValue")) {
    const discountValue = Number(body.discountValue);
    if (Number.isNaN(discountValue) || discountValue < 0) {
      throw new AppError("Invalid discountValue", 400);
    }
    const discountType = product.discountType || "percentage";
    if (discountType === "percentage" && discountValue > 100) {
      throw new AppError("Percentage discount cannot exceed 100", 400);
    }
    product.discountValue = discountValue;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "taxType")) {
    const taxType = normalizeRequired(body.taxType);
    if (!ALLOWED_TAX_TYPES.has(taxType)) {
      throw new AppError("Invalid taxType", 400);
    }
    product.taxType = taxType;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "taxValue")) {
    const taxValue = Number(body.taxValue);
    if (Number.isNaN(taxValue) || taxValue < 0) {
      throw new AppError("Invalid taxValue", 400);
    }
    product.taxValue = taxValue;
    changed = true;
  }

  return changed;
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

async function resolveMultiAttributeTitles(body, derivedTitleIds, categoryId, subCategoryId) {
  const fromBody = parseJsonArray(body.attributeTitles, "attributeTitles")
    .map((id) => String(id).trim())
    .filter(Boolean);
  for (const id of fromBody) {
    assertObjectId(id, "Invalid attributeTitle id");
  }

  const titleIds = fromBody.length ? fromBody : derivedTitleIds;
  if (!titleIds.length) {
    throw new AppError("Select at least one variant attribute title for multi-variant products", 400);
  }

  await assertAttributeTitlesMatchSubCategory(titleIds, subCategoryId, categoryId);
  return [...new Set(titleIds.map(String))];
}

function assertVariantCombinationRules(variantType, combinations) {
  const combos = combinations || [];
  if (variantType === "single" && combos.length > 0) {
    throw new AppError("Single variant product cannot have combinations", 400);
  }
  if (variantType === "multi" && combos.length === 0) {
    throw new AppError("Multi variant product must include combinations", 400);
  }
}

function isStockOnlyCombinationRow(row) {
  if (!row || typeof row !== "object") return false;

  const hasAttributes = Array.isArray(row.attributes) && row.attributes.length > 0;
  const hasLegacyVariantFields = Boolean(
    row.sizeType ||
      row.sizeTitle ||
      row.size ||
      row.sizeValue ||
      row.color ||
      row.colorValue
  );

  if (hasAttributes || hasLegacyVariantFields) return false;

  const hasStock = row.stock !== undefined && row.stock !== null && row.stock !== "";
  const hasPrice = row.price !== undefined && row.price !== null && row.price !== "";
  return hasStock || hasPrice;
}

function parseStockOnlyCombinationPayload(rawCombinations) {
  if (rawCombinations === undefined || rawCombinations === null || rawCombinations === "") {
    return null;
  }

  const combos = parseJsonArray(rawCombinations, "combinations");
  if (combos.length !== 1 || !isStockOnlyCombinationRow(combos[0])) {
    return null;
  }

  return combos[0];
}

function hasSingleProductStockInBody(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, "stock")) return true;
  if (Object.prototype.hasOwnProperty.call(body, "productStock")) return true;

  const stockOnlyRow = parseStockOnlyCombinationPayload(body.combinations ?? body.variants);
  return Boolean(
    stockOnlyRow &&
      stockOnlyRow.stock !== undefined &&
      stockOnlyRow.stock !== null &&
      stockOnlyRow.stock !== ""
  );
}

function readSingleProductPrice(body) {
  const stockOnlyRow = parseStockOnlyCombinationPayload(body.combinations ?? body.variants);
  const raw = body.price ?? body.productPrice ?? stockOnlyRow?.price;
  const price = Number(raw);
  if (Number.isNaN(price) || price < 1) {
    throw new AppError("Product price must be at least 1", 400);
  }
  return price;
}

function readSingleProductStock(body) {
  const stockOnlyRow = parseStockOnlyCombinationPayload(body.combinations ?? body.variants);
  const raw =
    body.stock ??
    body.productStock ??
    (stockOnlyRow?.stock !== undefined && stockOnlyRow?.stock !== null && stockOnlyRow?.stock !== ""
      ? stockOnlyRow.stock
      : undefined);

  const stock = raw === undefined || raw === null || raw === "" ? 0 : Number(raw);
  if (Number.isNaN(stock) || stock < 0) {
    throw new AppError("Invalid stock", 400);
  }
  return stock;
}

function assertNoCombinationsForSingle(rawCombinations) {
  if (rawCombinations === undefined || rawCombinations === null || rawCombinations === "") return;
  if (parseStockOnlyCombinationPayload(rawCombinations)) return;

  const combos = parseJsonArray(rawCombinations, "combinations");
  if (combos.length) {
    throw new AppError("Single-variant product cannot include combinations", 400);
  }
}

function clearProductCombinations(product) {
  const oldCombinationImages = (product.combinations || [])
    .flatMap((combination) => combination.images || [])
    .filter(Boolean);
  product.combinations = [];
  product.attributeTitles = [];
  product.markModified("combinations");
  product.markModified("attributeTitles");
  pruneRemovedUploads(oldCombinationImages, [], collectProtectedMediaPaths(product));
}

/**
 * Build attributes array from mobile payload.
 * Supports:
 * - { attributeTitle, attributeValue } ObjectIds
 * - { title, value, colorCode } strings (auto ensure)
 * - flat { sizeType, size, color, colorCode } per combination row
 */
async function normalizeCombinationAttributes(rawAttributes, categoryId, subCategoryId, combination, idx) {
  const titleIdSet = new Set();
  const resolved = [];

  const pushPair = async (title, value, colorCode) => {
    if (!title || !value) return;
    const pair = await resolveAttributePair({
      categoryId,
      subCategoryId,
      title,
      value,
      colorCode,
    });
    titleIdSet.add(String(pair.attributeTitleId));
    resolved.push({
      attributeTitle: pair.attributeTitleId,
      attributeValue: pair.attributeValueId,
    });
  };

  const attrs = Array.isArray(rawAttributes) ? rawAttributes : [];

  if (attrs.length) {
    for (let attrIdx = 0; attrIdx < attrs.length; attrIdx += 1) {
      const attr = attrs[attrIdx];
      if (!attr || typeof attr !== "object") {
        throw new AppError(`Invalid attribute at combination ${idx}, index ${attrIdx}`, 400);
      }

      const titleId = normalizeOptional(attr.attributeTitle || attr.attributeTitleId);
      const valueId = normalizeOptional(attr.attributeValue || attr.attributeValueId);
      const titleName = normalizeOptional(attr.title || attr.sizeType || attr.name);
      const valueName = normalizeOptional(
        attr.value || attr.sizeValue || attr.size || attr.colorValue || attr.color
      );
      const colorCode = attr.colorCode;

      if (titleId && valueId) {
        assertObjectId(titleId);
        assertObjectId(valueId);
        titleIdSet.add(titleId);
        resolved.push({ attributeTitle: titleId, attributeValue: valueId });
        continue;
      }

      if (titleName && valueName) {
        await pushPair(titleName, valueName, colorCode);
        continue;
      }

      throw new AppError(
        `Each attribute needs title+value or attributeTitle+attributeValue (combination ${idx})`,
        400
      );
    }
  } else {
    const sizeType = normalizeOptional(combination.sizeType || combination.sizeTitle);
    const sizeValue = normalizeOptional(combination.size || combination.sizeValue);
    const colorValue = normalizeOptional(combination.color || combination.colorValue);
    const colorCode = combination.colorCode;

    if (sizeType && sizeValue) {
      await pushPair(sizeType, sizeValue);
    }
    if (colorValue) {
      await pushPair("color", colorValue, colorCode);
    }
  }

  if (!resolved.length) {
    throw new AppError(`At least one attribute is required for variant at index ${idx}`, 400);
  }

  return { attributes: resolved, titleIdSet };
}

async function parseVendorCombinations(rawCombinations, categoryId, subCategoryId, vendorId, existingCombinations = null) {
  const combinations = parseJsonArray(rawCombinations, "combinations");
  if (!combinations.length) {
    throw new AppError("Add at least one variant before submitting the product", 400);
  }

  const allTitleIds = new Set();
  const parsed = [];

  for (let idx = 0; idx < combinations.length; idx += 1) {
    const row = combinations[idx];
    if (!row || typeof row !== "object") {
      throw new AppError(`Variant at index ${idx} must be an object`, 400);
    }

    const price = Number(row.price);
    const stock = Number(row.stock ?? 0);
    const discountValue = Number(row.discountValue ?? 0);
    const status = normalizeOptional(row.status) || "active";

    if (Number.isNaN(price) || price < 1) {
      throw new AppError(`Variant price must be at least 1 (index ${idx})`, 400);
    }
    if (Number.isNaN(stock) || stock < 0) {
      throw new AppError(`Invalid stock at variant index ${idx}`, 400);
    }
    if (Number.isNaN(discountValue) || discountValue < 0) {
      throw new AppError(`Invalid discount at variant index ${idx}`, 400);
    }

    const rawAttributes = row.attributes ?? row;
    const { attributes, titleIdSet } = await normalizeCombinationAttributes(
      rawAttributes,
      categoryId,
      subCategoryId,
      row,
      idx
    );

    for (const id of titleIdSet) allTitleIds.add(id);

    const keptImageUrls = parseKeptMediaUrlsFromRow(row);
    const images = parseJsonArray(row.images, `combinations[${idx}].images`)
      .map((img) => String(img).trim())
      .filter(Boolean);
    if (images.length > MAX_COMBINATION_IMAGES) {
      throw new AppError(`Maximum ${MAX_COMBINATION_IMAGES} image allowed per variant`, 400);
    }

    let sku = normalizeOptional(row.sku);
    if (!sku && existingCombinations?.length) {
      const matched = findExistingCombinationMatch(attributes, idx, existingCombinations);
      if (matched?.sku) sku = matched.sku;
    }
    if (!sku) sku = generateCombinationSku(vendorId, idx);

    parsed.push({
      sku,
      price,
      stock,
      discountValue,
      images,
      keptImageUrls,
      attributes,
      status,
    });
  }

  const skuSet = new Set();
  for (const combo of parsed) {
    if (skuSet.has(combo.sku)) {
      throw new AppError("Duplicate variant SKU is not allowed", 409);
    }
    skuSet.add(combo.sku);
  }

  return { combinations: parsed, attributeTitleIds: [...allTitleIds] };
}

async function assertVariantAttributesValid(combinations, categoryId, subCategoryId) {
  const AttributeTitle = require("../../models/other/attributeTitle");
  const AttributeValue = require("../../models/other/attributeValue");

  const titleIds = new Set();
  const valueIds = new Set();

  for (const combination of combinations) {
    for (const attribute of combination.attributes) {
      titleIds.add(String(attribute.attributeTitle));
      valueIds.add(String(attribute.attributeValue));
    }
  }

  const [titles, values] = await Promise.all([
    AttributeTitle.find({ _id: { $in: [...titleIds] } }).select("_id category subCategory").lean(),
    AttributeValue.find({ _id: { $in: [...valueIds] } }).select("_id attributeTitle").lean(),
  ]);

  if (titles.length !== titleIds.size || values.length !== valueIds.size) {
    throw new AppError("One or more variant attributes are invalid", 400);
  }

  for (const title of titles) {
    if (String(title.subCategory) !== String(subCategoryId)) {
      throw new AppError("Variant attribute does not belong to this sub-category", 400);
    }
    if (String(title.category) !== String(categoryId)) {
      throw new AppError("Variant attribute does not belong to this category", 400);
    }
  }

  const valueToTitle = new Map(values.map((v) => [String(v._id), String(v.attributeTitle)]));
  for (const combination of combinations) {
    for (const attribute of combination.attributes) {
      if (valueToTitle.get(String(attribute.attributeValue)) !== String(attribute.attributeTitle)) {
        throw new AppError("Variant attribute value does not match its title", 400);
      }
    }
  }
}

/**
 * POST /vendor/products
 * multipart: thumbnail (optional), images (max 5), videos (max 5), combinationImages[0]...
 * body: name, description (optional), price, stock, category, subCategory, childCategory,
 *       variantType ("single" | "multi"), discountType, discountValue, taxType, taxValue,
 *       attributeTitles (multi), combinations (JSON, multi only)
 *       For single products, stock may also be sent as stock / productStock or
 *       variants/combinations: [{ "stock": 10, "price": 99 }] (stock-only row).
 */
exports.createProduct = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const description = normalizeOptional(req.body.description || req.body.productDescription) || "";
  const subCategoryId = normalizeRequired(req.body.subCategory || req.body.subCategoryId);
  const categoryId = normalizeRequired(req.body.category || req.body.categoryId);
  const childCategoryInput = readChildCategoryFromBody(req.body);
  const basePrice = Number(req.body.price ?? req.body.productPrice);

  if (!name) {
    throw new AppError("Product name is required", 400);
  }
  if (!subCategoryId) {
    throw new AppError("Sub-category is required", 400);
  }

  const { subCategory, categoryId: resolvedCategoryId } = await assertActiveEcomSubCategory(subCategoryId);
  const finalCategoryId = categoryId || resolvedCategoryId;

  if (categoryId && String(resolvedCategoryId) !== String(categoryId)) {
    throw new AppError("Sub-category does not belong to the selected category", 400);
  }

  let childCategoryId = null;
  if (childCategoryInput) {
    await assertActiveEcomChildCategory(childCategoryInput, {
      categoryId: finalCategoryId,
      subCategoryId,
    });
    childCategoryId = childCategoryInput;
  }

  const rawCombinations = req.body.combinations ?? req.body.variants;
  const variantType = resolveVendorVariantType(req.body, rawCombinations);
  const { discountType, discountValue, taxType, taxValue } = parseDiscountTaxFields(req.body);

  let combinations = [];
  let attributeTitleIds = [];
  let productPrice;
  let totalStock;

  if (variantType === "multi") {
    const parsed = await parseVendorCombinations(
      rawCombinations,
      finalCategoryId,
      subCategoryId,
      req.user._id
    );
    combinations = parsed.combinations;
    attributeTitleIds = await resolveMultiAttributeTitles(
      req.body,
      parsed.attributeTitleIds,
      finalCategoryId,
      subCategoryId
    );
    await assertVariantAttributesValid(combinations, finalCategoryId, subCategoryId);
    productPrice =
      !Number.isNaN(basePrice) && basePrice >= 1
        ? basePrice
        : Math.min(...combinations.map((c) => c.price));
    totalStock = combinations.reduce((sum, c) => sum + (c.stock || 0), 0);
  } else {
    assertNoCombinationsForSingle(rawCombinations);
    productPrice = readSingleProductPrice(req.body);
    totalStock = readSingleProductStock(req.body);
    attributeTitleIds = [];
  }

  assertVariantCombinationRules(variantType, combinations);

  const uploadedImages = pathsForField(req, "images");
  const uploadedVideos = pathsForField(req, "videos");
  const uploadedThumbnail = pathsForField(req, "thumbnail")[0];

  if (uploadedImages.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(`Maximum ${MAX_PRODUCT_IMAGES} product images allowed`, 400);
  }
  assertVideoFiles(req);

  const bodyImages = parseJsonArray(req.body.images, "images")
    .map((img) => String(img).trim())
    .filter(Boolean);
  const images = uploadedImages.length ? uploadedImages : bodyImages;
  if (images.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(`Maximum ${MAX_PRODUCT_IMAGES} product images allowed`, 400);
  }

  const bodyVideos = parseJsonArray(req.body.videos, "videos")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const videos = uploadedVideos.length ? uploadedVideos : bodyVideos;
  if (videos.length > MAX_PRODUCT_VIDEOS) {
    throw new AppError(`Maximum ${MAX_PRODUCT_VIDEOS} product videos allowed`, 400);
  }

  const thumbnail = uploadedThumbnail || images[0];
  if (!thumbnail) {
    throw new AppError("At least one product image is required (thumbnail)", 400);
  }

  const combinationUploadedImages = getCombinationUploadedImages(req);
  const combinationImageUrlsMap = parseCombinationImageUrlsMap(req);
  const baseUrl = getPublicBaseUrl(req);

  if (variantType === "multi") {
    combinations.forEach((combination, idx) => {
      const uploaded = limitVariantUploadedPaths(combinationUploadedImages.get(idx) || [], baseUrl);
      const keptUrlInputs =
        combination.keptImageUrls !== null && combination.keptImageUrls !== undefined
          ? combination.keptImageUrls
          : combinationImageUrlsMap?.has(idx)
            ? combinationImageUrlsMap.get(idx)
            : null;

      combination.images = mergeCombinationImages({
        existingCombo: null,
        keptUrlInputs,
        uploadedPaths: uploaded,
        legacyBodyImages: combination.images,
        baseUrl,
        maxCount: MAX_COMBINATION_IMAGES,
        variantLabel: combination.sku || `index ${idx}`,
      });
      delete combination.keptImageUrls;
    });
  }

  const slugBase = toSlug(normalizeOptional(req.body.slug) || name);
  let slug = slugBase;
  let slugAttempt = 0;
  while (await Product.findOne({ slug }).select("_id").lean()) {
    slugAttempt += 1;
    slug = `${slugBase}-${slugAttempt}`;
  }

  const sku = normalizeOptional(req.body.sku) || generateVendorSku(req.user._id);
  const skuExists = await Product.findOne({ sku }).select("_id").lean();
  if (skuExists) {
    throw new AppError("Product SKU already exists, retry", 409);
  }

  const { approvalRequired, adminApproved } = await resolveVendorApprovalRequired();

  const product = await Product.create({
    name,
    slug,
    sku,
    description,
    shortDescription: normalizeOptional(req.body.shortDescription),
    category: finalCategoryId,
    subCategory: subCategoryId,
    childCategory: childCategoryId,
    moq: Number(req.body.moq ?? 1) || 1,
    price: productPrice,
    stock: totalStock,
    discountType,
    discountValue,
    taxType,
    taxValue,
    variantType,
    thumbnail,
    images,
    videos,
    combinations,
    attributeTitles: attributeTitleIds,
    role: "Vendor",
    addedById: req.user._id,
    adminApproved,
    status: "active",
  });

  const fresh = await Product.findById(product._id)
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .populate("attributeTitles", "title status")
    .lean();

  if (approvalRequired && !adminApproved) {
    queueNotifyAllAdmins({
      type: "product_pending_approval",
      title: "Product pending approval",
      message: `${product.name} was submitted and is waiting for approval.`,
      metadata: {
        productId: String(product._id),
        vendorId: String(req.user._id),
        linkPath: `/admin/products/${product._id}`,
      },
    });
  }

  sendSuccess(
    res,
    approvalRequired
      ? "Product submitted successfully. It will appear in the store after admin approval."
      : "Product created successfully.",
    toVendorProduct(fresh, baseUrl),
    201
  );
});

async function findVendorOwnedProduct(vendorId, productId) {
  assertObjectId(productId, "Invalid product id");
  const product = await Product.findOne({
    _id: productId,
    role: "Vendor",
    addedById: vendorId,
  });
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

async function assertSlugUnique(slug, excludeId) {
  const filter = { slug };
  if (excludeId) {
    filter._id = { $ne: excludeId };
  }
  const existing = await Product.findOne(filter).select("_id").lean();
  if (existing) {
    throw new AppError("Product slug already exists", 409);
  }
}

async function assertProductSkuUnique(sku, excludeId) {
  const filter = { sku };
  if (excludeId) {
    filter._id = { $ne: excludeId };
  }
  const existing = await Product.findOne(filter).select("_id").lean();
  if (existing) {
    throw new AppError("Product SKU already exists", 409);
  }
}

function mergeMediaPaths(existing, uploaded, bodyPaths, maxCount, label) {
  const bodyList = bodyPaths.length ? bodyPaths : [...(existing || [])].filter(Boolean);
  const merged = [...bodyList];
  const seen = new Set(merged);
  for (const path of uploaded) {
    if (!seen.has(path)) {
      seen.add(path);
      merged.push(path);
    }
  }
  if (merged.length > maxCount) {
    throw new AppError(`Maximum ${maxCount} ${label} allowed`, 400);
  }
  return merged;
}

function parseKeptMediaUrlsBody(req, fields) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
    const value = req.body[field];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") return null;
    return parseJsonArray(value, field)
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return null;
}

function parseKeptImageUrlsBody(req) {
  return parseKeptMediaUrlsBody(req, ["imageUrls", "image_urls", "existingImageUrls"]);
}

function parseKeptVideoUrlsBody(req) {
  return parseKeptMediaUrlsBody(req, ["videoUrls", "video_urls", "existingVideoUrls"]);
}

function mergeProductMediaOnUpdate({
  existing,
  keptUrlInputs,
  uploadedPaths,
  baseUrl,
  maxCount,
  fieldLabel,
}) {
  const existingPaths = (existing || [])
    .map((path) => toUploadStoragePath(path, baseUrl))
    .filter(Boolean);
  const existingSet = new Set(existingPaths);

  const keptPaths =
    keptUrlInputs === null
      ? [...existingPaths]
      : keptUrlInputs.map((url) => toUploadStoragePath(url, baseUrl)).filter(Boolean);

  for (const path of keptPaths) {
    if (!existingSet.has(path)) {
      throw new AppError(`${fieldLabel} contains a file that does not belong to this product`, 400);
    }
  }

  const merged = [...keptPaths];
  const seen = new Set(merged);
  for (const path of uploadedPaths) {
    const normalized = toUploadStoragePath(path, baseUrl) || path;
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  if (merged.length > maxCount) {
    throw new AppError(`Maximum ${maxCount} ${fieldLabel.replace(/Urls?$/i, "")} files allowed`, 400);
  }

  return merged;
}

function mergeProductImagesOnUpdate(options) {
  return mergeProductMediaOnUpdate({ ...options, fieldLabel: "imageUrls" });
}

function mergeProductVideosOnUpdate(options) {
  return mergeProductMediaOnUpdate({ ...options, fieldLabel: "videoUrls" });
}

function collectAllowedMediaPathSet(product, baseUrl) {
  const allowed = new Set();
  for (const path of collectProtectedMediaPaths(product)) {
    const normalized = toUploadStoragePath(path, baseUrl) || path;
    if (normalized) allowed.add(normalized);
  }
  return allowed;
}

function collectProtectedMediaPaths(product) {
  const paths = [];
  if (product?.thumbnail) paths.push(product.thumbnail);
  for (const img of product?.images || []) {
    if (img) paths.push(img);
  }
  for (const vid of product?.videos || []) {
    if (vid) paths.push(vid);
  }
  for (const combo of product?.combinations || []) {
    for (const img of combo.images || []) {
      if (img) paths.push(img);
    }
  }
  return paths;
}

function pruneRemovedUploads(previousPaths, nextPaths, keepPaths = []) {
  const nextSet = new Set(
    (nextPaths || []).map((path) => toUploadStoragePath(path) || path).filter(Boolean)
  );
  const keepSet = new Set(
    (keepPaths || []).map((path) => toUploadStoragePath(path) || path).filter(Boolean)
  );
  for (const oldPath of previousPaths || []) {
    const normalized = toUploadStoragePath(oldPath) || oldPath;
    if (normalized && !nextSet.has(normalized) && !keepSet.has(normalized)) {
      deleteUploadFileByPublicUrl(normalized);
    }
  }
}

function resolveCombinationImagesOnUpdate(
  parsedCombinations,
  existingCombinations,
  combinationUploadedImages,
  combinationImageUrlsMap,
  baseUrl,
  allowedPathSet
) {
  parsedCombinations.forEach((combination, idx) => {
    const existing =
      (existingCombinations || []).find((combo) => String(combo.sku) === String(combination.sku)) ||
      findExistingCombinationMatch(combination.attributes, idx, existingCombinations);

    const keptUrlInputs = resolveVariantKeptImageInputs(
      combination,
      idx,
      combinationImageUrlsMap
    );
    const uploaded = limitVariantUploadedPaths(combinationUploadedImages.get(idx) || [], baseUrl);
    const variantLabel = combination.sku || `index ${idx}`;

    if (!shouldUpdateVariantImages(keptUrlInputs, uploaded)) {
      combination.images = copyExistingCombinationImages(existing, baseUrl);
      delete combination.keptImageUrls;
      return;
    }

    combination.images = mergeCombinationImages({
      existingCombo: existing,
      keptUrlInputs,
      uploadedPaths: uploaded,
      legacyBodyImages: combination.images,
      baseUrl,
      maxCount: MAX_COMBINATION_IMAGES,
      variantLabel,
      allowedPathSet,
    });

    delete combination.keptImageUrls;
  });
}

function applyStandaloneCombinationImageUpdates(product, req, baseUrl) {
  const combinationUploadedImages = getCombinationUploadedImages(req);
  const combinationImageUrlsMap = parseCombinationImageUrlsMap(req);
  const hasComboImageUpdate =
    combinationUploadedImages.size > 0 ||
    (combinationImageUrlsMap && combinationImageUrlsMap.size > 0);

  if (!hasComboImageUpdate) return false;

  const oldCombinationImages = (product.combinations || [])
    .flatMap((combination) => combination.images || [])
    .filter(Boolean);

  const combos = product.combinations || [];
  const allowedPathSet = collectAllowedMediaPathSet(product, baseUrl);
  let changed = false;

  combos.forEach((combo, idx) => {
    const keptUrlInputs = combinationImageUrlsMap?.has(idx)
      ? combinationImageUrlsMap.get(idx)
      : null;
    const uploaded = limitVariantUploadedPaths(combinationUploadedImages.get(idx) || [], baseUrl);

    if (!shouldUpdateVariantImages(keptUrlInputs, uploaded)) return;

    combo.images = mergeCombinationImages({
      existingCombo: combo,
      keptUrlInputs,
      uploadedPaths: uploaded,
      legacyBodyImages: null,
      baseUrl,
      maxCount: MAX_COMBINATION_IMAGES,
      variantLabel: combo.sku || `index ${idx}`,
      allowedPathSet,
    });
    changed = true;
  });

  if (!changed) return false;

  assignProductCombinations(product, combos);
  const nextCombinationImages = product.combinations
    .flatMap((combination) => combination.images || [])
    .filter(Boolean);
  pruneRemovedUploads(oldCombinationImages, nextCombinationImages, collectProtectedMediaPaths(product));
  return true;
}

function collectProductMediaPaths(product) {
  const paths = new Set();
  if (product.thumbnail) paths.add(product.thumbnail);
  for (const img of product.images || []) {
    if (img) paths.add(img);
  }
  for (const vid of product.videos || []) {
    if (vid) paths.add(vid);
  }
  for (const combo of product.combinations || []) {
    for (const img of combo.images || []) {
      if (img) paths.add(img);
    }
  }
  return [...paths];
}

function deleteProductMedia(product) {
  for (const mediaPath of collectProductMediaPaths(product)) {
    deleteUploadFileByPublicUrl(mediaPath);
  }
}

/**
 * GET /vendor/products
 * GET /vendor/products/mine
 * Query: page, limit, search, status, adminApproved, category, subCategory, childCategory
 */
exports.listMyProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, adminApproved, search, category, subCategory, childCategory } = req.query;

  const filter = {
    role: "Vendor",
    addedById: req.user._id,
  };

  if (status) {
    const normalized = String(status).toLowerCase();
    if (!["active", "inactive"].includes(normalized)) {
      throw new AppError("Invalid status filter", 400);
    }
    filter.status = normalized;
  }

  if (adminApproved !== undefined && adminApproved !== "") {
    const raw = String(adminApproved).toLowerCase();
    if (raw === "true" || raw === "1") filter.adminApproved = true;
    else if (raw === "false" || raw === "0") filter.adminApproved = false;
    else throw new AppError("Invalid adminApproved filter", 400);
  }

  if (category !== undefined && String(category).trim() !== "") {
    assertObjectId(String(category).trim(), "Invalid category id");
    filter.category = String(category).trim();
  }

  if (subCategory !== undefined && String(subCategory).trim() !== "") {
    assertObjectId(String(subCategory).trim(), "Invalid subCategory id");
    filter.subCategory = String(subCategory).trim();
  }

  if (childCategory !== undefined && String(childCategory).trim() !== "") {
    assertObjectId(String(childCategory).trim(), "Invalid childCategory id");
    filter.childCategory = String(childCategory).trim();
  }

  const searchOr = searchFilter(search, ["name", "slug", "sku", "description"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name")
      .populate("subCategory", "name")
      .populate("childCategory", "name")
      .populate("attributeTitles", "title status")
      .populate("combinations.attributes.attributeTitle", "title status")
      .populate("combinations.attributes.attributeValue", "value colorCode status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const ratingStatsMap = await getRatingStatsForProducts(products.map((product) => product._id));
  const items = products
    .map((product) => toVendorProduct(applyRatingStatsToProduct(product, ratingStatsMap), baseUrl))
    .filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Your products fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getMyProductById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid product id");

  const product = await Product.findOne({
    _id: req.params.id,
    role: "Vendor",
    addedById: req.user._id,
  })
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .populate("attributeTitles", "title status")
    .lean();

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  const baseUrl = getPublicBaseUrl(req);
  const { page, limit, skip } = getPagination(req.query);
  const { reviews, total: reviewTotal } = await listProductReviews(product._id, baseUrl, {
    skip,
    limit,
  });

  const detail = {
    ...toVendorProduct(product, baseUrl),
    reviews,
    reviewTotal,
    reviewsPagination: {
      page,
      limit,
      total: reviewTotal,
      pages: Math.ceil(reviewTotal / limit) || 1,
    },
  };

  sendSuccess(res, "Product fetched", detail);
});

/**
 * PATCH /vendor/products/:id
 * multipart: thumbnail, images (new files), videos (new files), combinationImages[n]
 * Body media fields:
 *   - imageUrls: JSON array of existing image URLs/paths to keep (max 5 total with new uploads)
 *   - images: multipart new image files (appended after imageUrls)
 *   - videoUrls: JSON array of existing video URLs/paths to keep (max 5 total with new uploads)
 *   - videos: multipart new video files (appended after videoUrls)
 * Variant images (one image per variant — only sent indices are updated):
 *   - combinationImageUrls: JSON object e.g. {"0":["url"]} — only listed variants change
 *   - combinationImages[n] or variantImages[n]: new file replaces that variant's image
 *   - combinations[].imageUrls on a row — omit field to keep previous image
 *   - replaceCombinations=true — replace full variant list (omit variants are deleted)
 *   - each combination row may also include imageUrls for kept images when sending combinations JSON
 */
exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await findVendorOwnedProduct(req.user._id, req.params.id);
  const wasApproved = Boolean(product.adminApproved);
  let needsReapproval = false;

  const originalCategoryId = String(product.category);
  const originalSubCategoryId = String(product.subCategory);
  const originalSlug = String(product.slug);
  const originalSku = String(product.sku);

  let nextCategoryId = originalCategoryId;
  let nextSubCategoryId = originalSubCategoryId;

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Name cannot be empty", 400);
    product.name = name;
    needsReapproval = true;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "slug")) {
    const slug = toSlug(req.body.slug);
    if (!slug) throw new AppError("Slug cannot be empty", 400);
    if (slug !== originalSlug) {
      await assertSlugUnique(slug, product._id);
      product.slug = slug;
      needsReapproval = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "sku")) {
    const sku = normalizeRequired(req.body.sku);
    if (!sku) throw new AppError("SKU cannot be empty", 400);
    if (sku !== originalSku) {
      await assertProductSkuUnique(sku, product._id);
      product.sku = sku;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "description") || Object.prototype.hasOwnProperty.call(req.body, "productDescription")) {
    product.description = normalizeOptional(req.body.description || req.body.productDescription) || "";
    needsReapproval = true;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "shortDescription")) {
    product.shortDescription = normalizeOptional(req.body.shortDescription) || "";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "subCategory") || Object.prototype.hasOwnProperty.call(req.body, "subCategoryId")) {
    const subCategoryId = normalizeRequired(req.body.subCategory || req.body.subCategoryId);
    const categoryId = normalizeOptional(req.body.category || req.body.categoryId) || nextCategoryId;
    const { categoryId: resolvedCategoryId } = await assertActiveEcomSubCategory(subCategoryId);
    if (categoryId && String(resolvedCategoryId) !== String(categoryId)) {
      throw new AppError("Sub-category does not belong to the selected category", 400);
    }
    nextSubCategoryId = subCategoryId;
    nextCategoryId = resolvedCategoryId;
    product.subCategory = subCategoryId;
    product.category = resolvedCategoryId;
    if (!hasChildCategoryInBody(req.body)) {
      product.childCategory = null;
    }
    needsReapproval = true;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "category") || Object.prototype.hasOwnProperty.call(req.body, "categoryId")) {
    const categoryId = normalizeRequired(req.body.category || req.body.categoryId);
    assertObjectId(categoryId, "Invalid category id");
    await assertActiveEcomSubCategory(nextSubCategoryId);
    if (String(categoryId) !== String(nextCategoryId)) {
      throw new AppError("Category does not match the product sub-category", 400);
    }
    nextCategoryId = categoryId;
    product.category = categoryId;
    needsReapproval = true;
  }

  if (hasChildCategoryInBody(req.body)) {
    const childCategoryInput = readChildCategoryFromBody(req.body);
    if (!childCategoryInput) {
      product.childCategory = null;
    } else {
      await assertActiveEcomChildCategory(childCategoryInput, {
        categoryId: nextCategoryId,
        subCategoryId: nextSubCategoryId,
      });
      product.childCategory = childCategoryInput;
    }
    needsReapproval = true;
  }

  const uploadedImages = pathsForField(req, "images");
  const uploadedVideos = pathsForField(req, "videos");
  const uploadedThumbnail = pathsForField(req, "thumbnail")[0];
  const baseUrl = getPublicBaseUrl(req);
  assertVideoFiles(req);

  if (uploadedImages.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(`Maximum ${MAX_PRODUCT_IMAGES} product images allowed`, 400);
  }

  if (uploadedThumbnail) {
    deleteUploadFileByPublicUrl(product.thumbnail);
    product.thumbnail = uploadedThumbnail;
    needsReapproval = true;
  }

  const keptImageUrls = parseKeptImageUrlsBody(req);
  const shouldUpdateProductImages =
    uploadedImages.length > 0 ||
    keptImageUrls !== null ||
    hasNonEmptyLegacyMediaBody(req.body.images);

  if (shouldUpdateProductImages) {
    let mergedImages;

    if (keptImageUrls !== null || uploadedImages.length > 0) {
      mergedImages = mergeProductImagesOnUpdate({
        existing: product.images,
        keptUrlInputs: keptImageUrls,
        uploadedPaths: uploadedImages,
        baseUrl,
        maxCount: MAX_PRODUCT_IMAGES,
      });
    } else {
      const bodyImages = parseJsonArray(req.body.images, "images")
        .map((img) => toUploadStoragePath(img, baseUrl))
        .filter(Boolean);
      mergedImages = mergeMediaPaths([], [], bodyImages, MAX_PRODUCT_IMAGES, "images");
    }

    pruneRemovedUploads(product.images, mergedImages, collectProtectedMediaPaths(product));
    product.images = mergedImages;
    product.markModified("images");
    const normalizedThumbnail = toUploadStoragePath(product.thumbnail, baseUrl);
    if (
      normalizedThumbnail &&
      !mergedImages.includes(normalizedThumbnail) &&
      !mergedImages.includes(product.thumbnail)
    ) {
      product.thumbnail = mergedImages[0] || product.thumbnail;
    }
    needsReapproval = true;
  }

  const keptVideoUrls = parseKeptVideoUrlsBody(req);
  const shouldUpdateProductVideos =
    uploadedVideos.length > 0 ||
    keptVideoUrls !== null ||
    hasNonEmptyLegacyMediaBody(req.body.videos);

  if (uploadedVideos.length > MAX_PRODUCT_VIDEOS) {
    throw new AppError(`Maximum ${MAX_PRODUCT_VIDEOS} product videos allowed`, 400);
  }

  if (shouldUpdateProductVideos) {
    let mergedVideos;

    if (keptVideoUrls !== null || uploadedVideos.length > 0) {
      mergedVideos = mergeProductVideosOnUpdate({
        existing: product.videos,
        keptUrlInputs: keptVideoUrls,
        uploadedPaths: uploadedVideos,
        baseUrl,
        maxCount: MAX_PRODUCT_VIDEOS,
      });
    } else {
      const bodyVideos = parseJsonArray(req.body.videos, "videos")
        .map((vid) => toUploadStoragePath(vid, baseUrl))
        .filter(Boolean);
      mergedVideos = mergeMediaPaths([], [], bodyVideos, MAX_PRODUCT_VIDEOS, "videos");
    }

    pruneRemovedUploads(product.videos, mergedVideos, collectProtectedMediaPaths(product));
    product.videos = mergedVideos;
    product.markModified("videos");
    needsReapproval = true;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "moq")) {
    const moq = Number(req.body.moq);
    if (Number.isNaN(moq) || moq < 1) throw new AppError("Invalid moq", 400);
    product.moq = moq;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "price") || Object.prototype.hasOwnProperty.call(req.body, "productPrice")) {
    const price = Number(req.body.price ?? req.body.productPrice);
    if (Number.isNaN(price) || price < 1) throw new AppError("Invalid price", 400);
    product.price = price;
    needsReapproval = true;
  }

  if (applyDiscountTaxUpdates(product, req.body)) {
    needsReapproval = true;
  }

  const rawCombinations = req.body.combinations ?? req.body.variants;
  const combinationUploadedImages = getCombinationUploadedImages(req);
  const combinationImageUrlsMap = parseCombinationImageUrlsMap(req);

  let targetVariantType = product.variantType || "single";
  const explicitVariantType = String(req.body.variantType || "").trim().toLowerCase();
  if (explicitVariantType) {
    if (!ALLOWED_VARIANT_TYPES.has(explicitVariantType)) {
      throw new AppError('Invalid variantType. Use "single" or "multi"', 400);
    }
    targetVariantType = explicitVariantType;
  } else if (rawCombinations !== undefined && rawCombinations !== null && rawCombinations !== "") {
    if (parseStockOnlyCombinationPayload(rawCombinations)) {
      targetVariantType = "single";
    } else if (parseJsonArray(rawCombinations, "combinations").length > 0) {
      targetVariantType = "multi";
    }
  }

  if (targetVariantType !== product.variantType) {
    product.variantType = targetVariantType;
    needsReapproval = true;
    if (targetVariantType === "single" && (product.combinations || []).length) {
      clearProductCombinations(product);
    }
  }

  if (product.variantType === "single") {
    assertNoCombinationsForSingle(rawCombinations);
    if (hasSingleProductStockInBody(req.body)) {
      product.stock = readSingleProductStock(req.body);
      needsReapproval = true;
    }
    if ((product.combinations || []).length) {
      clearProductCombinations(product);
      needsReapproval = true;
    }
  } else if (rawCombinations === undefined || rawCombinations === null || rawCombinations === "") {
    if (applyStandaloneCombinationImageUpdates(product, req, baseUrl)) {
      needsReapproval = true;
    }
  } else {
    const { combinations: parsedCombinations } = await parseVendorCombinations(
      rawCombinations,
      nextCategoryId,
      nextSubCategoryId,
      req.user._id,
      product.combinations
    );

    const replaceAllCombinations =
      String(req.body.replaceCombinations || req.body.replaceVariants || "")
        .toLowerCase() === "true";

    const combinations = replaceAllCombinations
      ? parsedCombinations
      : mergeCombinationsOnUpdate(parsedCombinations, product.combinations);

    await assertVariantAttributesValid(combinations, nextCategoryId, nextSubCategoryId);

    const oldCombinationImages = (product.combinations || [])
      .flatMap((combination) => combination.images || [])
      .filter(Boolean);

    const allowedPathSet = collectAllowedMediaPathSet(product, baseUrl);

    resolveCombinationImagesOnUpdate(
      combinations,
      product.combinations,
      combinationUploadedImages,
      combinationImageUrlsMap,
      baseUrl,
      allowedPathSet
    );

    assignProductCombinations(product, combinations);
    product.attributeTitles = Object.prototype.hasOwnProperty.call(req.body, "attributeTitles")
      ? await resolveMultiAttributeTitles(
          req.body,
          collectCombinationAttributeTitleIds(combinations),
          nextCategoryId,
          nextSubCategoryId
        )
      : collectCombinationAttributeTitleIds(combinations);
    product.stock = combinations.reduce((sum, c) => sum + (c.stock || 0), 0);
    const minVariantPrice = Math.min(...combinations.map((c) => c.price));
    if (
      !Object.prototype.hasOwnProperty.call(req.body, "price") &&
      !Object.prototype.hasOwnProperty.call(req.body, "productPrice")
    ) {
      product.price = minVariantPrice;
    }

    const nextCombinationImages = combinations
      .flatMap((combination) => combination.images || [])
      .filter(Boolean);
    pruneRemovedUploads(oldCombinationImages, nextCombinationImages, collectProtectedMediaPaths(product));
    needsReapproval = true;
  }

  if (needsReapproval && wasApproved) {
    const productApproval = await resolveVendorApprovalRequired();
    product.adminApproved = productApproval.approvalRequired ? false : productApproval.adminApproved;
  }

  assertVariantCombinationRules(product.variantType, product.combinations);

  markProductMediaModified(product);
  await product.save();

  const fresh = await Product.findById(product._id)
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .populate("childCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .populate("attributeTitles", "title status")
    .lean();

  const message =
    wasApproved && needsReapproval && !product.adminApproved
      ? "Product updated. It requires admin approval again before appearing in the store."
      : "Product updated successfully";

  sendSuccess(res, message, toVendorProduct(fresh, baseUrl));
});

/**
 * PATCH /vendor/products/status/:id
 * Body: { "status": "active" } | { "status": "inactive" }
 */
exports.updateProductStatus = asyncHandler(async (req, res) => {
  const product = await findVendorOwnedProduct(req.user._id, req.params.id);
  const status = normalizeRequired(req.body.status).toLowerCase();

  if (!ALLOWED_PRODUCT_STATUS.has(status)) {
    throw new AppError('Invalid status. Use "active" or "inactive"', 400);
  }

  if (status === "active" && product.statusLockedByAdmin) {
    throw new AppError(
      "This product was deactivated by admin. Contact admin to activate it again.",
      403
    );
  }

  if (product.status === status) {
    const baseUrl = getPublicBaseUrl(req);
    const fresh = await Product.findById(product._id)
      .populate("category", "name")
      .populate("subCategory", "name")
      .populate("childCategory", "name")
      .lean();
    return sendSuccess(res, `Product is already ${status}`, toVendorProduct(fresh, baseUrl));
  }

  product.status = status;
  await product.save();

  const fresh = await Product.findById(product._id)
    .populate("category", "name")
    .populate("subCategory", "name")
      .populate("childCategory", "name")
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const message =
    status === "active"
      ? "Product activated"
      : "Product deactivated. It will not appear in the store while inactive.";

  sendSuccess(res, message, toVendorProduct(fresh, baseUrl));
});

/**
 * DELETE /vendor/products/:id
 */
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await findVendorOwnedProduct(req.user._id, req.params.id);
  deleteProductMedia(product);
  await Promise.all([
    Product.findByIdAndDelete(product._id),
    removeProductFromAllWishlists(product._id),
    removeAllRatingsForProduct(product._id),
  ]);
  sendSuccess(res, "Product deleted successfully", { _id: product._id });
});

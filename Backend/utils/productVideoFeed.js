const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");
const { toAbsoluteUploadUrl } = require("./mediaUrl");

const VIDEO_MIME_PREFIX = "video/";

function vendorProductFilter(vendorId) {
  return {
    role: "Vendor",
    addedById: vendorId,
  };
}

function resolveVariantForProduct(product, variantSkuInput) {
  const variantSku = String(variantSkuInput || "").trim();

  if (product.variantType === "single") {
    return {
      sku: product.sku,
      combination: null,
      attributes: [],
    };
  }

  if (!variantSku) {
    return {
      sku: "",
      combination: null,
      attributes: [],
    };
  }

  const combination = (product.combinations || []).find(
    (combo) => combo.sku === variantSku && combo.status !== "inactive"
  );
  if (!combination) {
    throw new AppError("Invalid variantSku for this product", 400);
  }

  return {
    sku: combination.sku,
    combination,
    attributes: combination.attributes || [],
  };
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

function pathForField(req, fieldName, folder) {
  const file = getRequestFiles(req).find((f) => matchFileField(f.fieldname, fieldName));
  if (!file) return "";
  return `/uploads/${folder}/${file.filename}`;
}

function getVideoUploadFile(req, fieldName = "video") {
  return getRequestFiles(req).find((f) => matchFileField(f.fieldname, fieldName));
}

function assertVideoMime(file, fieldName = "video") {
  if (!String(file.mimetype || "").startsWith(VIDEO_MIME_PREFIX)) {
    throw new AppError(`Only video files are allowed in ${fieldName}`, 400);
  }
}

function assertVideoUpload(req, fieldName = "video") {
  const file = getVideoUploadFile(req, fieldName);
  if (!file) {
    throw new AppError("Video file is required", 400);
  }
  assertVideoMime(file, fieldName);
  return file;
}

function assertOptionalVideoUpload(req, fieldName = "video") {
  const file = getVideoUploadFile(req, fieldName);
  if (!file) return null;
  assertVideoMime(file, fieldName);
  return file;
}

function buildShopNowTarget(product, variantSku) {
  return {
    productId: product._id,
    productSlug: product.slug,
    productName: product.name,
    variantSku,
    variantType: product.variantType,
  };
}

function toVendorVideoFeedCard(doc, product, baseUrl) {
  if (!product) {
    return {
      _id: doc._id,
      video: toAbsoluteUploadUrl(doc.video, baseUrl),
      thumbnail: toAbsoluteUploadUrl(doc.thumbnail, baseUrl),
      title: doc.title || "",
      status: doc.status,
      variantSku: "",
      product: null,
      createdAt: doc.createdAt,
    };
  }

  const variant = resolveVariantForProduct(product, doc.variantSku);

  return {
    _id: doc._id,
    video: toAbsoluteUploadUrl(doc.video, baseUrl),
    thumbnail: toAbsoluteUploadUrl(
      doc.thumbnail || product.thumbnail,
      baseUrl
    ),
    title: doc.title || product.name,
    status: doc.status,
    variantSku: variant.sku || "",
    product: {
      _id: product._id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      variantType: product.variantType,
      thumbnail: toAbsoluteUploadUrl(product.thumbnail, baseUrl),
    },
    createdAt: doc.createdAt,
  };
}

function toPublicVideoFeedItem(
  doc,
  product,
  vendor,
  baseUrl,
  { productCount, likeCount = 0, isLiked = false } = {}
) {
  const cityState = [vendor?.city, vendor?.state].filter(Boolean).join(", ");

  if (!product) {
    return {
      _id: doc._id,
      type: "ecom",
      video: toAbsoluteUploadUrl(doc.video, baseUrl),
      thumbnail: toAbsoluteUploadUrl(doc.thumbnail, baseUrl),
      title: doc.title || "",
      likeCount: Number(likeCount) || 0,
      isLiked: Boolean(isLiked),
      vendor: {
        _id: vendor?._id ?? doc.vendor,
        name: vendor?.businessName ?? "",
        profileImage: vendor?.shopLogo
          ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl)
          : "",
        location: cityState || vendor?.city || "",
        productCount: productCount ?? 0,
      },
      product: null,
      venue: null,
      variantSku: "",
      shopNow: null,
      bookNow: null,
      createdAt: doc.createdAt,
    };
  }

  const variant = resolveVariantForProduct(product, doc.variantSku);

  return {
    _id: doc._id,
    type: "ecom",
    video: toAbsoluteUploadUrl(doc.video, baseUrl),
    thumbnail: toAbsoluteUploadUrl(
      doc.thumbnail || product.thumbnail,
      baseUrl
    ),
    title: doc.title || product.name,
    likeCount: Number(likeCount) || 0,
    isLiked: Boolean(isLiked),
    vendor: {
      _id: vendor?._id ?? doc.vendor,
      name: vendor?.businessName ?? "",
      profileImage: vendor?.shopLogo
        ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl)
        : "",
      location: cityState || vendor?.city || "",
      productCount: productCount ?? 0,
    },
    product: {
      _id: product._id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      thumbnail: toAbsoluteUploadUrl(product.thumbnail, baseUrl),
      price: variant.combination?.price ?? product.price,
      variantType: product.variantType,
    },
    venue: null,
    variantSku: variant.sku || "",
    shopNow: buildShopNowTarget(product, variant.sku || ""),
    bookNow: null,
    createdAt: doc.createdAt,
  };
}

async function loadVendorOwnedProduct(productId, vendorId) {
  assertObjectId(productId, "Invalid product id");
  const Product = require("../models/other/product");
  const product = await Product.findOne({
    _id: productId,
    ...vendorProductFilter(vendorId),
  }).lean();

  if (!product) throw new AppError("Product not found", 404);
  return product;
}

module.exports = {
  vendorProductFilter,
  resolveVariantForProduct,
  pathForField,
  assertVideoUpload,
  assertOptionalVideoUpload,
  buildShopNowTarget,
  toVendorVideoFeedCard,
  toPublicVideoFeedItem,
  loadVendorOwnedProduct,
};

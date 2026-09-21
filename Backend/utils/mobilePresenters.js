const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { buildSimpleVariantView, formatSimpleCombination } = require("./productVariants");
const { formatRatingValue } = require("./productRating");
const { getVenueDisplayPrice, positiveAmount } = require("./venuePricing");

/**
 * Shapes documents for mobile / storefront clients.
 * Omits internal admin fields where appropriate.
 */

function toPublicCategory(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    image: doc.image,
    mode: doc.mode,
    status: doc.status,
  };
}

/** E-commerce vendor app — category picker (register / shop setup) */
function toVendorCategory(doc, baseUrl) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    image: toAbsoluteUploadUrl(doc.image, baseUrl),
    mode: doc.mode,
    status: doc.status,
    role: doc.role,
  };
}

/** Vendor / mobile — state picker */
function toVendorState(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    code: doc.code ?? null,
    status: doc.status,
  };
}

/** Vendor / mobile — city picker */
function toVendorCity(doc) {
  if (!doc) return null;
  const state =
    doc.state && typeof doc.state === "object"
      ? {
          _id: doc.state._id,
          name: doc.state.name,
          code: doc.state.code ?? null,
        }
      : doc.state;
  return {
    _id: doc._id,
    name: doc.name,
    pincode: doc.pincode ?? null,
    state,
    status: doc.status,
  };
}

/** Mobile — sub-district (tehsil / taluka) picker */
function toVendorSubDistrict(doc) {
  if (!doc) return null;
  const city =
    doc.city && typeof doc.city === "object"
      ? {
          _id: doc.city._id,
          name: doc.city.name,
          pincode: doc.city.pincode ?? null,
        }
      : doc.city;
  return {
    _id: doc._id,
    name: doc.name,
    city,
    status: doc.status,
  };
}

/** E-commerce vendor app — sub-categories for a selected category */
function toVendorSubCategory(doc, baseUrl) {
  if (!doc) return null;
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
    image: toAbsoluteUploadUrl(doc.image, baseUrl),
    category,
    mode: doc.mode,
    status: doc.status,
    role: doc.role,
  };
}

/** E-commerce vendor app — child categories for a selected sub-category */
function toVendorChildCategory(doc, baseUrl) {
  if (!doc) return null;
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
    image: toAbsoluteUploadUrl(doc.image, baseUrl),
    category,
    subCategory,
    mode: doc.mode,
    status: doc.status,
    role: doc.role,
  };
}

/** Venue home "Venue types" carousel — active categories with mode venue */
function toPublicVenueType(doc, baseUrl, { venueCount } = {}) {
  if (!doc) return null;
  const item = {
    _id: doc._id,
    name: doc.name,
    image: toAbsoluteUploadUrl(doc.image, baseUrl),
    mode: doc.mode,
    status: doc.status,
  };
  if (venueCount !== undefined) {
    item.venueCount = venueCount;
  }
  return item;
}

function toPublicSubCategory(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    image: doc.image,
    category: doc.category,
    mode: doc.mode,
    status: doc.status,
  };
}

function toPublicBanner(doc, baseUrl, relatedEntity = null) {
  if (!doc) return null;
  const categoryId =
    doc.category && typeof doc.category === "object"
      ? doc.category._id
      : doc.category ?? null;
  const related = doc.related || "none";
  return {
    _id: doc._id,
    title: doc.title,
    image: toAbsoluteUploadUrl(doc.image, baseUrl),
    targetType: doc.targetType || "ecom",
    related,
    relatedId:
      related === "category"
        ? categoryId
        : doc.relatedId ?? null,
    relatedEntity: relatedEntity ?? null,
    mode: doc.mode,
    categoryId,
    cities: doc.cities ?? [],
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
  };
}

function formatVenueLocation(doc) {
  if (!doc) return "";
  const cityState = [doc.city, doc.state].filter(Boolean).join(", ");
  if (cityState) return cityState;
  return doc.address || "";
}

/** Mobile venue list card (category screen) */
function toPublicVenueSummary(doc, baseUrl) {
  if (!doc) return null;
  const category =
    doc.category && typeof doc.category === "object"
      ? { _id: doc.category._id, name: doc.category.name }
      : doc.category;
  const subCategory =
    doc.subCategory && typeof doc.subCategory === "object"
      ? { _id: doc.subCategory._id, name: doc.subCategory.name }
      : doc.subCategory;

  return {
    _id: doc._id,
    name: doc.name,
    shortDescription: doc.shortDescription ?? "",
    thumbnail: toAbsoluteUploadUrl(doc.thumbnail, baseUrl),
    basePrice: positiveAmount(doc.basePrice, doc.dayPrice),
    dayPrice: getVenueDisplayPrice(doc).amount,
    hourlyPrice: positiveAmount(doc.hourlyPrice),
    priceType: doc.priceType || "full",
    capacity: doc.capacity ?? 0,
    carpetArea: doc.carpetArea ?? 0,
    location: formatVenueLocation(doc),
    address: doc.address ?? "",
    city: doc.city ?? "",
    state: doc.state ?? "",
    category,
    subCategory,
    rating: formatRatingValue(doc.averageRating, doc.ratingCount),
    ratingCount: doc.ratingCount ?? 0,
    tokenAmountPercentage: Number(doc.tokenAmountPercentage) || 0,
    availableFrom: doc.availableFrom ?? null,
  };
}

function buildVenueGallery(doc, baseUrl) {
  const urls = [];
  const seen = new Set();
  const add = (src) => {
    const url = toAbsoluteUploadUrl(src, baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };
  if (doc?.thumbnail) add(doc.thumbnail);
  for (const src of doc?.images ?? []) add(src);
  return urls;
}

function buildVenueFullAddress(doc) {
  return [doc?.address, doc?.city, doc?.state, doc?.pincode].filter(Boolean).join(", ");
}

function mapPublicAmenities(amenities, baseUrl) {
  return (amenities ?? [])
    .filter((a) => a && typeof a === "object" && a.status !== "inactive")
    .map((a) => ({
      _id: a._id,
      name: a.name,
      icon: a.icon ? toAbsoluteUploadUrl(a.icon, baseUrl) : "",
      description: a.description ?? "",
    }));
}

/** Mobile venue detail — tap a venue from list */
function toPublicVenueDetail(doc, baseUrl, { vendorDoc = null } = {}) {
  if (!doc) return null;
  const summary = toPublicVenueSummary(doc, baseUrl);
  if (!summary) return null;

  const gallery = buildVenueGallery(doc, baseUrl);
  const facilities = mapPublicAmenities(doc.amenities, baseUrl);
  const dayPrice = Number(doc.dayPrice ?? doc.basePrice) || 0;
  const hourlyPrice = Number(doc.hourlyPrice) || 0;
  const basePrice = dayPrice;
  const capacity = Number(doc.capacity) || 0;
  const carpetArea = Number(doc.carpetArea) || 0;
  const lat = doc.latitude != null ? Number(doc.latitude) : null;
  const lon = doc.longitude != null ? Number(doc.longitude) : null;
  const hasCoords =
    lat != null &&
    lon != null &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;

  const { resolveVendorContactPhone } = require("./publicVendorContact");
  const vendorContact =
    vendorDoc && doc?.role === "VenueVendor" ? resolveVendorContactPhone(vendorDoc) : null;

  return {
    ...summary,
    description: doc.description ?? "",
    gallery,
    images: gallery,
    thumbnail: gallery[0] ?? summary.thumbnail,
    price: {
      amount: dayPrice,
      currency: "INR",
      symbol: "₹",
      period: "day",
    },
    dayPrice,
    hourlyPrice,
    basePrice,
    capacityLabel: capacity > 0 ? `${capacity.toLocaleString()} Guests` : null,
    carpetArea,
    carpetAreaLabel: carpetArea > 0 ? `${carpetArea.toLocaleString()} sq. ft.` : null,
    space: carpetArea > 0 ? `${carpetArea.toLocaleString()} sq. ft.` : null,
    spaceLabel: carpetArea > 0 ? "Carpet area" : null,
    facilities,
    amenities: facilities,
    fullAddress: buildVenueFullAddress(doc),
    coordinates: hasCoords ? { latitude: lat, longitude: lon } : null,
    latitude: hasCoords ? lat : null,
    longitude: hasCoords ? lon : null,
    pincode: doc.pincode ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(vendorContact
      ? {
          vendorName: vendorDoc.businessName || vendorDoc.name || "",
          ...vendorContact,
        }
      : {}),
  };
}

function toPublicFaq(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    question: doc.question,
    answer: doc.answer,
  };
}

function toPublicProductSummary(doc) {
  if (!doc) return null;
  const category =
    doc.category && typeof doc.category === "object"
      ? { _id: doc.category._id, name: doc.category.name }
      : doc.category;
  const subCategory =
    doc.subCategory && typeof doc.subCategory === "object"
      ? { _id: doc.subCategory._id, name: doc.subCategory.name }
      : doc.subCategory;

  return {
    _id: doc._id,
    name: doc.name,
    slug: doc.slug,
    sku: doc.sku,
    shortDescription: doc.shortDescription ?? "",
    thumbnail: doc.thumbnail,
    price: doc.price,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    stock: doc.stock,
    variantType: doc.variantType,
    category,
    subCategory,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

function toPublicProductDetail(doc) {
  if (!doc) return null;
  const summary = toPublicProductSummary(doc);
  return {
    ...summary,
    description: doc.description,
    taxType: doc.taxType,
    taxValue: doc.taxValue,
    moq: doc.moq,
    images: doc.images ?? [],
    videos: doc.videos ?? [],
    combinations: doc.combinations ?? [],
    attributeTitles: doc.attributeTitles ?? [],
  };
}

/** Vendor app — product after create / my products */
function toVendorProduct(doc, baseUrl) {
  if (!doc) return null;
  const category =
    doc.category && typeof doc.category === "object"
      ? { _id: doc.category._id, name: doc.category.name }
      : doc.category;
  const subCategory =
    doc.subCategory && typeof doc.subCategory === "object"
      ? { _id: doc.subCategory._id, name: doc.subCategory.name }
      : doc.subCategory;
  const childCategory =
    doc.childCategory && typeof doc.childCategory === "object"
      ? { _id: doc.childCategory._id, name: doc.childCategory.name }
      : doc.childCategory ?? null;

  const combinations = (doc.combinations || []).map((combo) =>
    formatSimpleCombination(combo, doc, baseUrl)
  );

  const attributeTitles = (doc.attributeTitles || []).map((title) =>
    title && typeof title === "object"
      ? { _id: title._id, title: title.title, status: title.status }
      : title
  );

  const variants =
    doc.variantType === "multi"
      ? buildSimpleVariantView(doc, baseUrl, { includeInactive: true })
      : null;

  return {
    _id: doc._id,
    name: doc.name,
    slug: doc.slug,
    sku: doc.sku,
    description: doc.description,
    shortDescription: doc.shortDescription ?? "",
    price: doc.price,
    stock: doc.stock,
    moq: doc.moq,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    taxType: doc.taxType,
    taxValue: doc.taxValue,
    variantType: doc.variantType,
    category,
    subCategory,
    childCategory,
    thumbnail: toAbsoluteUploadUrl(doc.thumbnail, baseUrl),
    images: (doc.images || []).map((img) => toAbsoluteUploadUrl(img, baseUrl)),
    videos: (doc.videos || []).map((vid) => toAbsoluteUploadUrl(vid, baseUrl)),
    combinations,
    attributeTitles,
    variants,
    adminApproved: Boolean(doc.adminApproved),
    statusLockedByAdmin: Boolean(doc.statusLockedByAdmin),
    status: doc.status,
    rating: formatRatingValue(doc.averageRating, doc.ratingCount),
    ratingCount: Number(doc.ratingCount) || 0,
    averageRating: Number(doc.averageRating) || 0,
    createdAt: doc.createdAt,
  };
}

/** Vendor app — one attribute title (SIZE TYPE name, color, etc.) */
function toVendorAttributeTitle(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    title: doc.title,
    category: doc.category,
    subCategory: doc.subCategory,
    status: doc.status,
  };
}

/** Vendor app — one attribute value (size 8, white, etc.) */
function toVendorAttributeValue(doc, titleDoc) {
  if (!doc) return null;
  const title =
    titleDoc && typeof titleDoc === "object"
      ? { _id: titleDoc._id, title: titleDoc.title }
      : doc.attributeTitle;
  return {
    _id: doc._id,
    value: doc.value,
    colorCode: doc.colorCode || "",
    attributeTitle: title,
    status: doc.status,
  };
}

/**
 * Vendor add-product variant picker:
 * sizeTypes = non-color titles + values, colors = color title + values
 */
function toVendorAttributeCatalog(titles, valuesByTitle) {
  const sizeTypes = [];
  const colors = [];

  for (const title of titles) {
    const values = (valuesByTitle.get(String(title._id)) || []).map((row) =>
      toVendorAttributeValue(row, title)
    );
    const entry = {
      _id: title._id,
      title: title.title,
      values,
    };
    if (isColorTitleName(title.title)) {
      colors.push(entry);
    } else {
      sizeTypes.push(entry);
    }
  }

  return { sizeTypes, colors };
}

function isColorTitleName(title) {
  return /color/i.test(String(title || ""));
}

module.exports = {
  toVendorState,
  toVendorCity,
  toVendorSubDistrict,
  toVendorCategory,
  toVendorSubCategory,
  toVendorChildCategory,
  toVendorAttributeTitle,
  toVendorAttributeValue,
  toVendorAttributeCatalog,
  toVendorProduct,
  toPublicCategory,
  toPublicVenueType,
  toPublicVenueSummary,
  toPublicVenueDetail,
  toPublicSubCategory,
  toPublicBanner,
  toPublicFaq,
  toPublicProductSummary,
  toPublicProductDetail,
};

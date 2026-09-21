const mongoose = require("mongoose");
const Vendor = require("../models/entity/vendor");
const Product = require("../models/other/product");
const ProductRating = require("../models/other/productRating");
const ShippingAddress = require("../models/other/shippingAddress");
const SubDistrict = require("../models/other/subDistrict");
const City = require("../models/other/city");
const User = require("../models/entity/user");
const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { formatRatingValue } = require("./productRating");
const { activePublicProductBaseFilter } = require("./publicProductList");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVendorLocation(vendor) {
  const parts = [vendor.subDistrict, vendor.city, vendor.state].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return vendor.businessAddress || "";
}

function readSubDistrictQuery(query = {}) {
  const name = String(
    query.subDistrictName ?? query.sub_district_name ?? query.sub_district ?? ""
  ).trim();
  if (name) return name;

  const generic = String(query.subDistrict ?? "").trim();
  if (generic && !mongoose.Types.ObjectId.isValid(generic)) return generic;

  return "";
}

function readSubDistrictIdQuery(query = {}) {
  const explicit = String(query.subDistrictId ?? query.sub_district_id ?? "").trim();
  if (explicit) return explicit;

  const generic = String(query.subDistrict ?? query.sub_district ?? "").trim();
  if (generic && mongoose.Types.ObjectId.isValid(generic)) return generic;

  return "";
}

async function resolveSubDistrictFromId(subDistrictId) {
  if (!subDistrictId) return { subDistrict: "", city: "", subDistrictId: "" };

  assertObjectId(subDistrictId, "Invalid sub-district id");

  const subDistrict = await SubDistrict.findOne({ _id: subDistrictId, status: "active" })
    .populate("city", "name status")
    .lean();

  if (!subDistrict) {
    throw new AppError("Sub-district not found", 404);
  }

  return {
    subDistrictId: String(subDistrict._id),
    subDistrict: String(subDistrict.name || "").trim(),
    city: subDistrict.city?.status === "active" ? String(subDistrict.city.name || "").trim() : "",
  };
}

async function resolveCityFromSubDistrictName(subDistrictName, cityName = "") {
  if (!subDistrictName) return { subDistrict: "", city: "" };

  const filter = {
    name: new RegExp(`^${escapeRegex(subDistrictName)}$`, "i"),
    status: "active",
  };

  const city = String(cityName || "").trim();
  if (city) {
    const cityDoc = await City.findOne({
      name: new RegExp(`^${escapeRegex(city)}$`, "i"),
      status: "active",
    })
      .select("_id name")
      .lean();
    if (cityDoc?._id) {
      filter.city = cityDoc._id;
    }
  }

  const subDistrict = await SubDistrict.findOne(filter).populate("city", "name status").lean();
  if (!subDistrict) {
    throw new AppError("Sub-district not found", 404);
  }

  return {
    subDistrict: String(subDistrict.name || "").trim(),
    city:
      subDistrict.city?.status === "active" ? String(subDistrict.city.name || "").trim() : "",
  };
}

async function resolveLocationFromUser(userId) {
  if (!userId) {
    return { city: "", subDistrict: "", subDistrictId: "" };
  }

  const user = await User.findById(userId).select("city subDistrict subDistrictId").lean();
  if (user?.subDistrictId || user?.subDistrict || user?.city) {
    return {
      city: String(user.city || "").trim(),
      subDistrict: String(user.subDistrict || "").trim(),
      subDistrictId: user.subDistrictId ? String(user.subDistrictId) : "",
    };
  }

  const defaultAddress = await ShippingAddress.findOne({
    user: toObjectId(userId),
    status: "active",
    isDefault: true,
  })
    .select("city subDistrict subDistrictId")
    .lean();

  if (defaultAddress) {
    return {
      city: String(defaultAddress.city || "").trim(),
      subDistrict: String(defaultAddress.subDistrict || "").trim(),
      subDistrictId: defaultAddress.subDistrictId ? String(defaultAddress.subDistrictId) : "",
    };
  }

  const latestAddress = await ShippingAddress.findOne({
    user: toObjectId(userId),
    status: "active",
  })
    .sort({ createdAt: -1 })
    .select("city subDistrict subDistrictId")
    .lean();

  if (latestAddress) {
    return {
      city: String(latestAddress.city || "").trim(),
      subDistrict: String(latestAddress.subDistrict || "").trim(),
      subDistrictId: latestAddress.subDistrictId ? String(latestAddress.subDistrictId) : "",
    };
  }

  return { city: "", subDistrict: "", subDistrictId: "" };
}

async function resolveNearbyCityFromAddress(userId) {
  const location = await resolveLocationFromUser(userId);
  return location.city;
}

async function resolveNearbyLocation(userId, query = {}, { locationOptional = false } = {}) {
  const state = String(query.state ?? "").trim();
  let city = String(query.city ?? query.cityName ?? "").trim();
  let subDistrict = readSubDistrictQuery(query);
  let subDistrictId = readSubDistrictIdQuery(query);

  if (userId) {
    const fromUser = await resolveLocationFromUser(userId);
    if (!subDistrictId) subDistrictId = fromUser.subDistrictId;
    if (!subDistrict) subDistrict = fromUser.subDistrict;
    if (!city) city = fromUser.city;
  }

  if (subDistrictId) {
    const resolved = await resolveSubDistrictFromId(subDistrictId);
    subDistrictId = resolved.subDistrictId || subDistrictId;
    subDistrict = subDistrict || resolved.subDistrict;
    if (!city) city = resolved.city;
  }

  if (subDistrict && !city) {
    const resolved = await resolveCityFromSubDistrictName(subDistrict, city);
    subDistrict = resolved.subDistrict || subDistrict;
    city = resolved.city || city;
  } else if (subDistrict && city) {
    const resolved = await resolveCityFromSubDistrictName(subDistrict, city);
    subDistrict = resolved.subDistrict || subDistrict;
  }

  if (!city && userId) {
    city = await resolveNearbyCityFromAddress(userId);
  }

  if (!city && !subDistrict && !subDistrictId) {
    if (locationOptional) {
      return {
        city: null,
        state: state || null,
        subDistrict: null,
        subDistrictId: null,
      };
    }

    throw new AppError(
      query.hadEmptyLocationParam
        ? "subDistrictId, subDistrict, or city is missing or empty. Pass a valid location in query, or sign in with a saved location."
        : "city, subDistrict, or subDistrictId is required. Pass location in query, or sign in with a saved location.",
      400
    );
  }

  if (!city && (subDistrict || subDistrictId)) {
    throw new AppError("city is required when sub-district cannot be resolved", 400);
  }

  return {
    city: city || null,
    state: state || null,
    subDistrict: subDistrict || null,
    subDistrictId: subDistrictId || null,
  };
}

async function resolveNearbyCity(userId, query = {}) {
  const { city } = await resolveNearbyLocation(userId, query);
  return city;
}

async function getActiveVendorIdsWithProducts() {
  return Product.distinct("addedById", activePublicProductBaseFilter({ role: "Vendor" }));
}

function buildVendorDescription(vendor) {
  return `${vendor.businessName} — shop quality products near you.`;
}

function formatDiscountBadge(discountType, discountValue) {
  const value = Number(discountValue) || 0;
  if (value <= 0) return null;

  if (discountType === "percentage") {
    return `${Math.round(value)}% Off`;
  }

  return `₹${Math.round(value)} Off`;
}

async function getVendorRatingStatsMap(vendorIds) {
  if (!vendorIds.length) return new Map();

  const rows = await ProductRating.aggregate([
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: "$productDoc" },
    {
      $match: {
        "productDoc.addedById": { $in: vendorIds.map((id) => toObjectId(id)) },
        "productDoc.status": "active",
        "productDoc.adminApproved": true,
        "productDoc.role": "Vendor",
      },
    },
    {
      $group: {
        _id: "$productDoc.addedById",
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        rating: formatRatingValue(row.averageRating, row.ratingCount),
        ratingCount: row.ratingCount,
      },
    ])
  );
}

async function getVendorProductStatsMap(vendorIds) {
  if (!vendorIds.length) return new Map();

  const rows = await Product.aggregate([
    {
      $match: activePublicProductBaseFilter({
        addedById: { $in: vendorIds.map((id) => toObjectId(id)) },
        role: "Vendor",
      }),
    },
    {
      $group: {
        _id: "$addedById",
        productCount: { $sum: 1 },
        maxDiscountValue: { $max: "$discountValue" },
        discountType: { $first: "$discountType" },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        productCount: row.productCount,
        maxDiscountValue: row.maxDiscountValue,
        discountType: row.discountType,
      },
    ])
  );
}

function toNearbyVendorCard(vendor, baseUrl, stats = {}, ratingStats = {}) {
  const location = buildVendorLocation(vendor);
  const discountBadge = formatDiscountBadge(
    stats.discountType,
    stats.maxDiscountValue
  );

  return {
    _id: vendor._id,
    name: vendor.businessName,
    businessName: vendor.businessName,
    description: buildVendorDescription(vendor),
    location,
    city: vendor.city ?? "",
    subDistrict: vendor.subDistrict ?? "",
    state: vendor.state ?? "",
    shopLogo: vendor.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl) : "",
    image: vendor.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl) : "",
    coverImage: vendor.shopBanner
      ? toAbsoluteUploadUrl(vendor.shopBanner, baseUrl)
      : vendor.shopLogo
        ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl)
        : "",
    rating: ratingStats.rating ?? null,
    ratingCount: ratingStats.ratingCount ?? 0,
    productCount: stats.productCount ?? 0,
    discountBadge,
    hasDiscount: Boolean(discountBadge),
    category:
      vendor.category && typeof vendor.category === "object"
        ? {
            _id: vendor.category._id,
            name: vendor.category.name,
          }
        : vendor.category ?? null,
  };
}

async function listNearbyVendors(options = {}) {
  const {
    userId = null,
    city: queryCity,
    state: queryState,
    subDistrict: querySubDistrict,
    subDistrictId: querySubDistrictId,
    search,
    page = 1,
    limit = 20,
    baseUrl = "",
    sortBy = "recent",
    hadEmptyLocationParam = false,
    locationOptional = false,
  } = options;

  const { city, state, subDistrict, subDistrictId } = await resolveNearbyLocation(
    userId,
    {
      city: queryCity,
      cityName: queryCity,
      state: queryState,
      subDistrict: querySubDistrict,
      subDistrictName: querySubDistrict,
      subDistrictId: querySubDistrictId,
      hadEmptyLocationParam,
    },
    { locationOptional }
  );

  const vendorIdsWithProducts = await getActiveVendorIdsWithProducts();
  if (!vendorIdsWithProducts.length) {
    return {
      city,
      state,
      subDistrict,
      subDistrictId,
      vendors: [],
      total: 0,
      page,
      limit,
      pages: 1,
    };
  }

  const filter = {
    _id: { $in: vendorIdsWithProducts },
    status: "active",
    approvalStatus: "approved",
    isOpen: { $ne: false },
  };

  if (state) {
    filter.state = { $regex: new RegExp(`^${escapeRegex(state)}$`, "i") };
  }

  if (subDistrict) {
    const subDistrictRegex = {
      $regex: new RegExp(`^${escapeRegex(subDistrict)}$`, "i"),
    };
    const locationClause = city
      ? {
          $or: [
            { subDistrict: subDistrictRegex },
            {
              $or: [{ subDistrict: null }, { subDistrict: "" }],
              city: { $regex: new RegExp(`^${escapeRegex(city)}$`, "i") },
            },
          ],
        }
      : { subDistrict: subDistrictRegex };

    Object.assign(filter, locationClause);
  } else if (city) {
    filter.city = { $regex: new RegExp(`^${escapeRegex(city)}$`, "i") };
  }

  if (search) {
    const term = escapeRegex(String(search).trim());
    filter.$or = [
      { businessName: { $regex: term, $options: "i" } },
      { businessAddress: { $regex: term, $options: "i" } },
    ];
  }

  const vendors = await Vendor.find(filter)
    .populate("category", "name mode status")
    .sort(sortBy === "name" ? { businessName: 1 } : { createdAt: -1 })
    .lean();

  const vendorIds = vendors.map((vendor) => vendor._id);
  const [productStatsMap, ratingStatsMap] = await Promise.all([
    getVendorProductStatsMap(vendorIds),
    getVendorRatingStatsMap(vendorIds),
  ]);

  const cards = vendors
    .map((vendor) =>
      toNearbyVendorCard(
        vendor,
        baseUrl,
        productStatsMap.get(String(vendor._id)) ?? {},
        ratingStatsMap.get(String(vendor._id)) ?? {}
      )
    )
    .filter((card) => card.productCount > 0);

  const total = cards.length;
  const pages = Math.ceil(total / limit) || 1;
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * limit;

  return {
    city,
    state,
    subDistrict,
    subDistrictId,
    vendors: cards.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    pages,
  };
}

module.exports = {
  listNearbyVendors,
  resolveNearbyCity,
  resolveNearbyLocation,
  toNearbyVendorCard,
  getVendorRatingStatsMap,
};

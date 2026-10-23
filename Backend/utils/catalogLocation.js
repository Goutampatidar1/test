const mongoose = require("mongoose");
const City = require("../models/other/city");
const SubDistrict = require("../models/other/subDistrict");
const Vendor = require("../models/entity/vendor");
const User = require("../models/entity/user");

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactRx(value) {
  return new RegExp(`^${escapeRegex(String(value || "").trim())}$`, "i");
}

/**
 * Resolves the shopping area from request query or user profile according to the rules:
 * - Query parameters:
 *   - city: string (case-insensitive name)
 *   - cityId: optional ObjectId; if both city and cityId are sent, cityId wins
 *   - subDistrictId: optional ObjectId (tehsil)
 *
 * Rules:
 * 1. subDistrictId present -> only vendors/products that serve that tehsil.
 * 2. only city or cityId -> whole city, ignore tehsil ("Expand to all of {city}").
 * 3. none of these -> no location filter (current behaviour). Do not 400.
 * 4. Logged-in user with saved PUT user/area: if the client omits location query,
 *    fall back to the saved area. Explicit query always overrides the saved area.
 */
async function resolveShoppingArea(req) {
  // Check Admin Setting: E-commerce flow visibility scope
  try {
    const { getEcomFlowSettings } = require("./appCommerceSettings");
    const ecomFlow = await getEcomFlowSettings();
    if (ecomFlow && ecomFlow.enabled && ecomFlow.scope === "all") {
      // Visibility scope is set to "Visible for all locations"
      return {
        hasFilter: false,
        scope: "all",
        cityName: null,
        cityId: null,
        subDistrictName: null,
        subDistrictId: null,
        isAllLocations: true,
      };
    }
  } catch {
    // ignore
  }

  const query = req.query || {};

  const rawCity = String(query.city ?? query.cityName ?? "").trim();
  const rawCityId = String(query.cityId ?? query.city_id ?? "").trim();
  const rawSubDistrictId = String(
    query.subDistrictId ?? query.sub_district_id ?? query.subDistrict ?? ""
  ).trim();

  const validCityId = mongoose.Types.ObjectId.isValid(rawCityId) ? rawCityId : null;
  const validSubDistrictId = mongoose.Types.ObjectId.isValid(rawSubDistrictId)
    ? rawSubDistrictId
    : null;

  const hasExplicitQuery = Boolean(rawCity || validCityId || validSubDistrictId);

  let cityName = null;
  let cityId = null;
  let subDistrictName = null;
  let subDistrictId = null;
  let hasFilter = false;

  if (hasExplicitQuery) {
    hasFilter = true;

    // Rule: if both city and cityId are sent, cityId wins
    if (validCityId) {
      const cityDoc = await City.findById(validCityId).select("_id name status").lean();
      if (cityDoc) {
        cityId = String(cityDoc._id);
        cityName = String(cityDoc.name || "").trim();
      }
    }

    if (validSubDistrictId) {
      const subDoc = await SubDistrict.findById(validSubDistrictId)
        .populate("city", "_id name status")
        .select("_id name city status")
        .lean();

      if (subDoc) {
        subDistrictId = String(subDoc._id);
        subDistrictName = String(subDoc.name || "").trim();
        if (!cityName) {
          cityName = String(subDoc.city?.name || rawCity || "").trim() || null;
        }
        if (!cityId && subDoc.city?._id) {
          cityId = String(subDoc.city._id);
        }
      } else {
        subDistrictId = validSubDistrictId;
        subDistrictName = null;
      }
    }

    if (!cityName && rawCity) {
      cityName = rawCity;
    }
  } else if (req.user?._id) {
    // Rule 4: Client omitted location query -> fall back to logged-in user's saved area
    const user = await User.findById(req.user._id)
      .select("city cityId subDistrict subDistrictId")
      .lean();

    if (user?.subDistrictId || user?.subDistrict) {
      hasFilter = true;
      subDistrictId = user.subDistrictId ? String(user.subDistrictId) : null;
      subDistrictName = String(user.subDistrict || "").trim() || null;
      cityName = String(user.city || "").trim() || null;
      cityId = user.cityId ? String(user.cityId) : null;
    } else if (user?.cityId || user?.city) {
      hasFilter = true;
      cityName = String(user.city || "").trim() || null;
      cityId = user.cityId ? String(user.cityId) : null;
      subDistrictName = null;
      subDistrictId = null;
    }
  }

  const scope = subDistrictId || subDistrictName ? "subDistrict" : cityName ? "city" : null;

  return {
    hasFilter: Boolean(hasFilter && (cityName || subDistrictName || subDistrictId)),
    scope,
    cityName,
    cityId,
    subDistrictName,
    subDistrictId,
  };
}

/**
 * Returns active vendor ObjectIds that serve the resolved shopping area.
 * Returns null if no location filter is active (do not filter).
 * Returns [] if location filter is active but 0 vendors match.
 */
async function getAreaVendorIds(area) {
  if (!area || !area.hasFilter) return null;

  const vendorFilter = {
    status: "active",
    approvalStatus: "approved",
    isOpen: { $ne: false },
  };

  if (area.scope === "subDistrict") {
    const subDistrictRx = area.subDistrictName ? exactRx(area.subDistrictName) : null;
    const cityRx = area.cityName ? exactRx(area.cityName) : null;

    if (cityRx && subDistrictRx) {
      vendorFilter.$or = [
        { city: cityRx, subDistrict: subDistrictRx },
        { city: cityRx, subDistrict: null },
        { city: cityRx, subDistrict: "" },
        { city: null },
        { city: "" },
      ];
    } else if (subDistrictRx) {
      vendorFilter.$or = [
        { subDistrict: subDistrictRx },
        { subDistrict: null },
        { subDistrict: "" },
      ];
    } else if (cityRx) {
      vendorFilter.$or = [
        { city: cityRx },
        { city: null },
        { city: "" },
      ];
    }
  } else if (area.scope === "city") {
    if (area.cityName) {
      vendorFilter.$or = [
        { city: exactRx(area.cityName) },
        { city: null },
        { city: "" },
      ];
    }
  }

  return Vendor.distinct("_id", vendorFilter);
}

/**
 * Applies vendor area filtering to any Mongoose product filter.
 * If vendorIds is null -> returns filter as is.
 * If vendorIds is empty array -> returns filter matching no products (_id: { $in: [] }).
 * If vendorIds has items -> constrains role to "Vendor" and addedById to vendorIds.
 */
function applyAreaToProductFilter(filter, vendorIds) {
  if (vendorIds === null || vendorIds === undefined) {
    return filter;
  }
  if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
    return {
      ...filter,
      role: { $in: ["Admin", "admin"] },
    };
  }

  return {
    ...filter,
    $and: [
      ...(Array.isArray(filter.$and) ? filter.$and : []),
      {
        $or: [
          { role: { $in: ["Admin", "admin"] } },
          { role: "Vendor", addedById: { $in: vendorIds } },
        ],
      },
    ],
  };
}

module.exports = {
  exactRx,
  resolveShoppingArea,
  getAreaVendorIds,
  applyAreaToProductFilter,
};

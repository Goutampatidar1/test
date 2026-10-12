const mongoose = require("mongoose");
const SubDistrict = require("../models/other/subDistrict");
const City = require("../models/other/city");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactRx(value) {
  return new RegExp(`^${escapeRegex(String(value).trim())}$`, "i");
}

/**
 * User-app area for a request: ?city / ?subDistrictId / ?subDistrict, otherwise the signed-in
 * user's saved area. Never throws — a bad location falls back to the plain ?city value.
 */
async function resolveRequestArea(req) {
  const { resolveNearbyLocation } = require("./nearbyVendors");
  const query = req.query || {};
  const locationKeys = ["city", "cityName", "subDistrict", "subDistrictId", "sub_district_id", "subDistrictName"];
  const hasQueryLocation = locationKeys.some((k) => String(query[k] ?? "").trim());
  const userId = hasQueryLocation ? null : req.user?._id ?? null;
  try {
    const area = await resolveNearbyLocation(userId, query, { locationOptional: true });
    return {
      city: area.city || "",
      subDistrict: area.subDistrict || "",
      subDistrictId: area.subDistrictId || "",
    };
  } catch {
    return { city: String(query.city ?? query.cityName ?? "").trim(), subDistrict: "", subDistrictId: "" };
  }
}

async function findSubDistrictId(subDistrictName, cityName) {
  if (!subDistrictName) return "";
  const filter = { name: exactRx(subDistrictName), status: "active" };
  if (cityName) {
    const city = await City.findOne({ name: exactRx(cityName), status: "active" }).select("_id").lean();
    if (city) filter.city = city._id;
  }
  const row = await SubDistrict.findOne(filter).select("_id").lean();
  return row ? String(row._id) : "";
}

/**
 * Venue match for an area: same city, and when a tehsil is known, venues in that tehsil plus
 * venues of the same city that have no tehsil saved yet. Returns null when no area is known.
 */
async function venueAreaClause(area) {
  if (!area?.city) return null;
  const subDistrictId = area.subDistrictId || (await findSubDistrictId(area.subDistrict, area.city));
  if (!subDistrictId || !mongoose.Types.ObjectId.isValid(subDistrictId)) {
    return { city: exactRx(area.city) };
  }
  return {
    city: exactRx(area.city),
    $or: [{ subDistrict: new mongoose.Types.ObjectId(subDistrictId) }, { subDistrict: null }],
  };
}

/** Adds an extra condition without clobbering $or / $and already on the filter. */
function andClause(filter, clause) {
  if (!clause) return filter;
  return { ...filter, $and: [...(Array.isArray(filter.$and) ? filter.$and : []), clause] };
}

/**
 * Resolves a tehsil sent on a venue create/update. `undefined` when no tehsil field was sent,
 * `null` when it was cleared, otherwise `{ subDistrictId, city }` with the tehsil's city name.
 */
async function readVenueSubDistrictInput(body = {}) {
  const keys = ["subDistrictId", "sub_district_id", "subDistrict"];
  const key = keys.find((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (!key) return undefined;
  const raw = String(body[key] ?? "").trim();
  if (!raw || raw === "null") return null;
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    const AppError = require("./AppError");
    throw new AppError("Invalid sub-district id", 400);
  }
  const row = await SubDistrict.findOne({ _id: raw, status: "active" }).populate("city", "name").lean();
  if (!row) {
    const AppError = require("./AppError");
    throw new AppError("Sub-district not found", 404);
  }
  return { subDistrictId: row._id, city: String(row.city?.name || "").trim() };
}

module.exports = {
  exactRx,
  resolveRequestArea,
  venueAreaClause,
  andClause,
  readVenueSubDistrictInput,
};

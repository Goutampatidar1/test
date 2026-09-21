const mongoose = require("mongoose");
const ShippingAddress = require("../models/other/shippingAddress");
const SubDistrict = require("../models/other/subDistrict");
const City = require("../models/other/city");
const AppError = require("./AppError");
const { normalizePhone } = require("./phone");
const { assertObjectId } = require("./assertObjectId");
const { resolveEcomAvailability } = require("./appCommerceSettings");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

const DELIVERY_TYPES = new Set(["home", "office", "other"]);

const LABEL_DISPLAY = {
  home: "Home",
  office: "Office",
  other: "Other",
};

function normalizeText(value) {
  return String(value ?? "").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDeliveryType(value) {
  const key = normalizeText(value).toLowerCase();
  if (!key) return "home";
  if (!DELIVERY_TYPES.has(key)) {
    throw new AppError("Invalid delivery type. Use home, office or other", 400);
  }
  return key;
}

function normalizeCountryCode(value) {
  const raw = normalizeText(value) || "+91";
  return raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`;
}

function readSubDistrictInput(body = {}) {
  const explicitId = normalizeText(body.subDistrictId ?? body.sub_district_id ?? "");
  const explicitName = normalizeText(body.subDistrictName ?? body.sub_district_name ?? "");
  const generic = normalizeText(body.subDistrict ?? body.sub_district ?? "");

  if (explicitId) {
    return {
      subDistrictId: explicitId,
      subDistrictName: explicitName || (mongoose.Types.ObjectId.isValid(generic) ? "" : generic),
    };
  }

  if (mongoose.Types.ObjectId.isValid(generic)) {
    return { subDistrictId: generic, subDistrictName: explicitName };
  }

  return {
    subDistrictId: "",
    subDistrictName: explicitName || generic,
  };
}

function hasSubDistrictInput(body = {}) {
  const { subDistrictId, subDistrictName } = readSubDistrictInput(body);
  if (subDistrictId && mongoose.Types.ObjectId.isValid(subDistrictId)) return true;
  return Boolean(subDistrictName);
}

function buildAddressLine(doc) {
  const housePart = [doc.houseNo, doc.buildingName].filter(Boolean).join(", ");
  const roadPart = [doc.roadName, doc.areaColony].filter(Boolean).join(", ");
  const cityStatePin = [doc.subDistrict, doc.city, doc.state, doc.pincode].filter(Boolean).join(", ");

  return [housePart, roadPart, doc.landmark, cityStatePin].filter(Boolean).join(", ");
}

async function loadActiveSubDistrict({ subDistrictId, subDistrictName, cityName } = {}) {
  let subDistrictDoc = null;

  if (subDistrictId && mongoose.Types.ObjectId.isValid(subDistrictId)) {
    assertObjectId(subDistrictId, "Invalid sub-district id");
    subDistrictDoc = await SubDistrict.findOne({ _id: subDistrictId, status: "active" })
      .populate("city", "name status pincode")
      .lean();
  } else if (subDistrictName) {
    const filter = {
      name: new RegExp(`^${escapeRegex(subDistrictName)}$`, "i"),
      status: "active",
    };

    const city = normalizeText(cityName);
    if (city) {
      const cityDoc = await City.findOne({
        name: new RegExp(`^${escapeRegex(city)}$`, "i"),
        status: "active",
      })
        .select("_id")
        .lean();
      if (cityDoc?._id) filter.city = cityDoc._id;
    }

    subDistrictDoc = await SubDistrict.findOne(filter)
      .populate("city", "name status pincode")
      .lean();
  }

  return subDistrictDoc;
}

async function resolveAddressSubDistrictStatus(doc) {
  if (!doc?.subDistrict && !doc?.subDistrictId) {
    return {
      subDistrict: "",
      subDistrictId: null,
      cityId: null,
      subDistrictEnabled: false,
      ecomAvailable: false,
      ecomUnavailableReason: "Sub-district is not set for this address.",
    };
  }

  const subDistrictDoc = await loadActiveSubDistrict({
    subDistrictId: doc.subDistrictId ? String(doc.subDistrictId) : "",
    subDistrictName: doc.subDistrict || "",
    cityName: doc.city || "",
  });

  if (!subDistrictDoc) {
    return {
      subDistrict: doc.subDistrict || "",
      subDistrictId: doc.subDistrictId ?? null,
      cityId: doc.cityId ?? null,
      subDistrictEnabled: false,
      ecomAvailable: false,
      ecomUnavailableReason: "This sub-district is no longer enabled.",
    };
  }

  const resolvedCityName =
    subDistrictDoc.city?.status === "active"
      ? String(subDistrictDoc.city.name || "").trim()
      : String(doc.city || "").trim();

  const availability = await resolveEcomAvailability({
    subDistrictId: String(subDistrictDoc._id),
    subDistrictName: subDistrictDoc.name,
    cityId: subDistrictDoc.city?._id ? String(subDistrictDoc.city._id) : null,
    cityName: resolvedCityName || doc.city,
    pincode: doc.pincode,
  });

  return {
    subDistrict: String(subDistrictDoc.name || "").trim(),
    subDistrictId: subDistrictDoc._id,
    cityId: subDistrictDoc.city?._id ?? null,
    subDistrictEnabled: true,
    ecomAvailable: availability.available,
    ecomUnavailableReason: availability.available ? null : availability.reason,
  };
}

async function resolveSubDistrictFields(
  body = {},
  { city, pincode, requireSubDistrict = true, assertEcom = true } = {}
) {
  const { subDistrictId, subDistrictName } = readSubDistrictInput(body);
  const cityName = normalizeText(city ?? body.city);

  if (!subDistrictId && !subDistrictName) {
    if (requireSubDistrict) {
      throw new AppError("Sub-district is required", 400);
    }
    return {
      subDistrict: "",
      subDistrictId: null,
      city: cityName,
      cityId: null,
    };
  }

  const subDistrictDoc = await loadActiveSubDistrict({
    subDistrictId: mongoose.Types.ObjectId.isValid(subDistrictId) ? subDistrictId : "",
    subDistrictName: mongoose.Types.ObjectId.isValid(subDistrictId) ? "" : subDistrictName || subDistrictId,
    cityName,
  });

  if (!subDistrictDoc) {
    throw new AppError("Sub-district not found or is not enabled", 400);
  }

  const resolvedCityName =
    subDistrictDoc.city?.status === "active"
      ? String(subDistrictDoc.city.name || "").trim()
      : cityName;

  const availability = await resolveEcomAvailability({
    subDistrictId: String(subDistrictDoc._id),
    subDistrictName: subDistrictDoc.name,
    cityId: subDistrictDoc.city?._id ? String(subDistrictDoc.city._id) : null,
    cityName: resolvedCityName || cityName,
    pincode: pincode ?? body.pincode,
  });

  if (assertEcom && !availability.available) {
    throw new AppError(
      availability.reason || "E-commerce is not available in this sub-district.",
      400
    );
  }

  return {
    subDistrict: String(subDistrictDoc.name || "").trim(),
    subDistrictId: subDistrictDoc._id,
    city: resolvedCityName || cityName,
    cityId: subDistrictDoc.city?._id ?? null,
  };
}

async function resolveShippingSubDistrictFields(body = {}, options = {}) {
  return resolveSubDistrictFields(body, { ...options, assertEcom: true });
}

function parseShippingAddressInput(body = {}, options = {}) {
  const { forUpdate = false, existing = null } = options;
  const fullName = normalizeText(body.fullName ?? body.name);
  const rawPhone = normalizeText(body.phone ?? body.mobileNumber ?? body.mobile);
  const countryCode = normalizeCountryCode(body.countryCode ?? body.dialCode);
  const houseNoBuilding = normalizeText(body.houseNoBuilding ?? body.houseNoAndBuilding);
  let houseNo = normalizeText(body.houseNo ?? body.houseNumber);
  let buildingName = normalizeText(body.buildingName);
  if (houseNoBuilding && !houseNo && !buildingName) {
    houseNo = houseNoBuilding;
  }

  const roadAreaColony = normalizeText(body.roadAreaColony ?? body.roadAndArea);
  let roadName = normalizeText(body.roadName);
  let areaColony = normalizeText(body.areaColony ?? body.area ?? body.colony);
  if (roadAreaColony && !roadName && !areaColony) {
    areaColony = roadAreaColony;
  }

  const landmark = normalizeText(body.landmark);
  const country = normalizeText(body.country);
  const state = normalizeText(body.state);
  const city = normalizeText(body.city);
  const pincode = normalizeText(body.pincode ?? body.pinCode ?? body.zip);
  const label = normalizeDeliveryType(body.label ?? body.deliveryType ?? body.addressType);

  let isDefault = false;
  if (body.isDefault === undefined || body.isDefault === null || body.isDefault === "") {
    isDefault = forUpdate && existing ? Boolean(existing.isDefault) : false;
  } else if (body.isDefault === false || body.isDefault === "false" || body.isDefault === 0) {
    isDefault = false;
  } else {
    isDefault = body.isDefault === true || body.isDefault === "true" || body.isDefault === 1;
  }

  if (!fullName) throw new AppError("Full name is required", 400);
  if (!rawPhone) throw new AppError("Mobile number is required", 400);
  if (!houseNo && !buildingName) {
    throw new AppError("House no. or building name is required", 400);
  }
  if (!roadName && !areaColony) {
    throw new AppError("Road name or area/colony is required", 400);
  }
  if (!city) throw new AppError("City is required", 400);
  if (!pincode) throw new AppError("Pincode is required", 400);

  const phone = normalizePhone(rawPhone);

  return {
    label,
    fullName,
    countryCode,
    phone,
    houseNo,
    buildingName,
    roadName,
    areaColony,
    landmark,
    country,
    state,
    city,
    pincode,
    isDefault,
  };
}

async function clearDefaultAddress(userId, exceptId = null) {
  const filter = { user: toObjectId(userId), isDefault: true, status: "active" };
  if (exceptId) filter._id = { $ne: toObjectId(exceptId) };
  await ShippingAddress.updateMany(filter, { $set: { isDefault: false } });
}

async function createShippingAddress(userId, body = {}) {
  const payload = parseShippingAddressInput(body);
  const subDistrictFields = await resolveShippingSubDistrictFields(body, {
    city: payload.city,
    pincode: payload.pincode,
    requireSubDistrict: true,
  });

  if (subDistrictFields.city) {
    payload.city = subDistrictFields.city;
  }

  const existingCount = await ShippingAddress.countDocuments({
    user: userId,
    status: "active",
  });

  const shouldDefault = payload.isDefault || existingCount === 0;
  if (shouldDefault) {
    await clearDefaultAddress(userId);
  }

  const doc = await ShippingAddress.create({
    user: userId,
    ...payload,
    subDistrict: subDistrictFields.subDistrict,
    subDistrictId: subDistrictFields.subDistrictId,
    isDefault: shouldDefault,
    status: "active",
  });

  return doc.toObject();
}

async function getUserShippingAddress(userId, addressId) {
  const doc = await ShippingAddress.findOne({
    _id: toObjectId(addressId),
    user: toObjectId(userId),
    status: "active",
  }).lean();

  if (!doc) {
    throw new AppError("Shipping address not found for this account", 404);
  }

  return doc;
}

async function updateShippingAddress(userId, addressId, body = {}) {
  const existing = await getUserShippingAddress(userId, addressId);

  const mergedBody = {
    fullName: existing.fullName,
    phone: existing.phone,
    mobileNumber: existing.phone,
    countryCode: existing.countryCode,
    houseNo: existing.houseNo,
    buildingName: existing.buildingName,
    roadName: existing.roadName,
    areaColony: existing.areaColony,
    landmark: existing.landmark,
    country: existing.country,
    state: existing.state,
    city: existing.city,
    subDistrict: existing.subDistrict,
    subDistrictId: existing.subDistrictId,
    pincode: existing.pincode,
    label: existing.label,
    deliveryType: existing.label,
    isDefault: existing.isDefault,
    ...body,
  };

  const payload = parseShippingAddressInput(mergedBody, { forUpdate: true, existing });

  const subDistrictChanged = hasSubDistrictInput(body);
  let subDistrictFields;

  if (subDistrictChanged) {
    subDistrictFields = await resolveShippingSubDistrictFields(mergedBody, {
      city: payload.city,
      pincode: payload.pincode,
      requireSubDistrict: true,
    });
  } else if (existing.subDistrict || existing.subDistrictId) {
    subDistrictFields = {
      subDistrict: existing.subDistrict || "",
      subDistrictId: existing.subDistrictId || null,
    };
  } else {
    subDistrictFields = {
      subDistrict: "",
      subDistrictId: null,
    };
  }

  if (subDistrictFields.city) {
    payload.city = subDistrictFields.city;
  }

  payload.subDistrict = subDistrictFields.subDistrict;
  payload.subDistrictId = subDistrictFields.subDistrictId;

  if (payload.isDefault) {
    await clearDefaultAddress(userId, addressId);
  } else if (existing.isDefault && payload.isDefault === false) {
    const nextDefault = await ShippingAddress.findOne({
      user: toObjectId(userId),
      status: "active",
      _id: { $ne: toObjectId(addressId) },
    })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();

    if (nextDefault) {
      await ShippingAddress.updateOne(
        { _id: nextDefault._id },
        { $set: { isDefault: true } }
      );
    }
  }

  const updated = await ShippingAddress.findOneAndUpdate(
    {
      _id: toObjectId(addressId),
      user: toObjectId(userId),
      status: "active",
    },
    { $set: payload },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    throw new AppError("Shipping address not found", 404);
  }

  return updated;
}

async function deleteShippingAddress(userId, addressId) {
  const existing = await getUserShippingAddress(userId, addressId);

  const deleted = await ShippingAddress.findOneAndUpdate(
    {
      _id: toObjectId(addressId),
      user: toObjectId(userId),
      status: "active",
    },
    { $set: { status: "inactive", isDefault: false } },
    { new: true }
  ).lean();

  if (!deleted) {
    throw new AppError("Shipping address not found", 404);
  }

  if (existing.isDefault) {
    const nextDefault = await ShippingAddress.findOne({
      user: toObjectId(userId),
      status: "active",
    })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();

    if (nextDefault) {
      await ShippingAddress.updateOne(
        { _id: nextDefault._id },
        { $set: { isDefault: true } }
      );
    }
  }

  return {
    _id: deleted._id,
    deleted: true,
  };
}

async function listShippingAddresses(userId) {
  return ShippingAddress.find({
    user: toObjectId(userId),
    status: "active",
  })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
}

async function toShippingAddressItem(doc) {
  if (!doc) return null;

  const addressLine = buildAddressLine(doc);
  const subDistrictStatus = await resolveAddressSubDistrictStatus(doc);

  return {
    _id: doc._id,
    label: doc.label,
    labelDisplay: LABEL_DISPLAY[doc.label] ?? doc.label,
    fullName: doc.fullName,
    countryCode: doc.countryCode,
    phone: doc.phone,
    mobileNumber: doc.phone,
    houseNo: doc.houseNo,
    buildingName: doc.buildingName,
    roadName: doc.roadName,
    areaColony: doc.areaColony,
    landmark: doc.landmark,
    country: doc.country,
    state: doc.state,
    city: doc.city,
    cityId: subDistrictStatus.cityId ?? doc.cityId ?? null,
    subDistrict: subDistrictStatus.subDistrict || doc.subDistrict || "",
    subDistrictId: subDistrictStatus.subDistrictId ?? doc.subDistrictId ?? null,
    subDistrictEnabled: subDistrictStatus.subDistrictEnabled,
    ecomAvailable: subDistrictStatus.ecomAvailable,
    ecomUnavailableReason: subDistrictStatus.ecomUnavailableReason,
    pincode: doc.pincode,
    addressLine,
    fullAddress: addressLine,
    isDefault: Boolean(doc.isDefault),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = {
  parseShippingAddressInput,
  createShippingAddress,
  getUserShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  listShippingAddresses,
  toShippingAddressItem,
  buildAddressLine,
  loadActiveSubDistrict,
  resolveAddressSubDistrictStatus,
  resolveSubDistrictFields,
  hasSubDistrictInput,
};

const mongoose = require("mongoose");
const Order = require("../models/other/order");
const User = require("../models/entity/user");
const DeliveryBoy = require("../models/entity/deliveryboy");
const ShippingAddress = require("../models/other/shippingAddress");
const SubDistrict = require("../models/other/subDistrict");
const City = require("../models/other/city");
const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");
const { toPublicProfile } = require("./toPublicProfile");
const { ensureVendorFulfillmentsPersisted } = require("./ecomVendorFulfillment");
const { initDriverDeliveryPending } = require("./deliveryDriverOrder");
const { queueDriverAssignedNotification } = require("./ecomOrderNotifications");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value._id != null) return String(value._id);
  const id = String(value).trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : "";
}

async function resolveLocationSubDistrictId(location = {}) {
  const directId = normalizeId(location.subDistrictId);
  if (directId) return directId;

  const subDistrictName = String(location.subDistrict || "").trim();
  if (!subDistrictName) return "";

  const filter = {
    name: new RegExp(`^${escapeRegex(subDistrictName)}$`, "i"),
    status: "active",
  };

  const cityName = String(location.city || "").trim();
  if (cityName) {
    const cityDoc = await City.findOne({
      name: new RegExp(`^${escapeRegex(cityName)}$`, "i"),
      status: "active",
    })
      .select("_id")
      .lean();
    if (cityDoc?._id) filter.city = cityDoc._id;
  }

  const docs = await SubDistrict.find(filter).select("_id name").lean();
  if (!docs.length) return "";
  if (docs.length === 1) return String(docs[0]._id);
  if (cityName) return String(docs[0]._id);
  return "";
}

async function enrichOrderLocation(location = {}) {
  const subDistrictId = await resolveLocationSubDistrictId(location);
  return {
    ...location,
    subDistrictId: subDistrictId || normalizeId(location.subDistrictId),
  };
}

async function resolveOrderSubDistrict(order) {
  const snap =
    order.addressSnapshot && typeof order.addressSnapshot === "object"
      ? order.addressSnapshot
      : {};

  if (snap.subDistrictId) {
    const subDistrictId = normalizeId(snap.subDistrictId);
    const subDistrictDoc = subDistrictId
      ? await SubDistrict.findById(subDistrictId).select("name city").populate("city", "name").lean()
      : null;
    return {
      subDistrictId,
      subDistrict: String(snap.subDistrict || subDistrictDoc?.name || "").trim(),
      city: String(snap.city || subDistrictDoc?.city?.name || "").trim(),
      source: "address_snapshot",
    };
  }

  if (snap.subDistrict) {
    return {
      subDistrictId: "",
      subDistrict: String(snap.subDistrict).trim(),
      city: String(snap.city || "").trim(),
      source: "address_snapshot_name",
    };
  }

  const addressId = snap.addressId || snap._id;
  if (addressId && mongoose.Types.ObjectId.isValid(String(addressId))) {
    const address = await ShippingAddress.findById(addressId)
      .select("subDistrict subDistrictId city")
      .lean();
    if (address?.subDistrictId || address?.subDistrict) {
      return {
        subDistrictId: normalizeId(address.subDistrictId),
        subDistrict: String(address.subDistrict || "").trim(),
        city: String(address.city || "").trim(),
        source: "shipping_address",
      };
    }
  }

  const userId = order.user?._id || order.user;
  if (userId) {
    const user = await User.findById(userId).select("city subDistrict subDistrictId").lean();
    if (user?.subDistrictId || user?.subDistrict) {
      return {
        subDistrictId: normalizeId(user.subDistrictId),
        subDistrict: String(user.subDistrict || "").trim(),
        city: String(user.city || "").trim(),
        source: "user_profile",
      };
    }

    const defaultAddress = await ShippingAddress.findOne({
      user: toObjectId(userId),
      status: "active",
      isDefault: true,
    })
      .select("city subDistrict subDistrictId")
      .lean();

    const address = defaultAddress
      || (await ShippingAddress.findOne({ user: toObjectId(userId), status: "active" })
          .sort({ createdAt: -1 })
          .select("city subDistrict subDistrictId")
          .lean());

    if (address?.subDistrictId || address?.subDistrict) {
      return {
        subDistrictId: normalizeId(address.subDistrictId),
        subDistrict: String(address.subDistrict || "").trim(),
        city: String(address.city || "").trim(),
        source: "user_shipping_address",
      };
    }
  }

  return {
    subDistrictId: "",
    subDistrict: "",
    city: "",
    source: "unknown",
  };
}

async function buildDriverSubDistrictFilter(location) {
  const enriched = await enrichOrderLocation(location);
  const base = {
    status: "active",
    approvalStatus: "approved",
  };

  const or = [];
  if (enriched.subDistrictId) {
    or.push({ subDistrictId: toObjectId(enriched.subDistrictId) });
  }
  if (enriched.subDistrict) {
    or.push({
      subDistrict: new RegExp(`^${escapeRegex(enriched.subDistrict)}$`, "i"),
    });
  }

  if (!or.length) return null;
  return or.length === 1 ? { ...base, ...or[0] } : { ...base, $or: or };
}

function driverMatchesOrderSubDistrict(driver, location) {
  if (!driver) return false;

  const driverSubDistrictId = normalizeId(driver.subDistrictId);
  const locationSubDistrictId = normalizeId(location.subDistrictId);

  if (locationSubDistrictId && driverSubDistrictId) {
    return driverSubDistrictId === locationSubDistrictId;
  }

  if (location.subDistrict && driver.subDistrict) {
    return (
      String(driver.subDistrict).trim().toLowerCase() ===
      String(location.subDistrict).trim().toLowerCase()
    );
  }

  return false;
}

async function listAssignableDriversForOrder(orderId) {
  const order = await Order.findById(orderId)
    .populate("user", "name phone email city subDistrict subDistrictId")
    .populate("deliveryBoy", "name phone email profileImage subDistrict subDistrictId city status approvalStatus")
    .lean();

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const location = await enrichOrderLocation(await resolveOrderSubDistrict(order));
  const filter = await buildDriverSubDistrictFilter(location);
  const rejectedDriverId = normalizeId(order.driverDelivery?.rejectedBy);
  const hasRejection = Boolean(
    String(order.driverDelivery?.rejectionReason || "").trim() ||
      order.driverDelivery?.rejectedAt ||
      String(order.driverDelivery?.status || "").toLowerCase() === "rejected"
  );

  const driverSelect =
    "name phone email profileImage city subDistrict subDistrictId status approvalStatus vehicleType vehicleRegistrationNumber";

  let drivers = [];
  if (filter) {
    drivers = await DeliveryBoy.find(filter).select(driverSelect).sort({ name: 1 }).lean();
  }

  if (hasRejection) {
    const othersInArea = rejectedDriverId
      ? drivers.filter((driver) => String(driver._id) !== rejectedDriverId)
      : drivers;
    if (!othersInArea.length) {
      drivers = await DeliveryBoy.find({ status: "active", approvalStatus: "approved" })
        .select(driverSelect)
        .sort({ name: 1 })
        .lean();
    }
  }

  const adminAssigned =
    order.deliveryBoyAssignedBy === "admin" && order.deliveryBoy
      ? typeof order.deliveryBoy === "object"
        ? order.deliveryBoy
        : await DeliveryBoy.findById(order.deliveryBoy)
            .select("name phone email profileImage city subDistrict subDistrictId status approvalStatus vehicleType vehicleRegistrationNumber")
            .lean()
      : null;

  const currentAssigned =
    adminAssigned && rejectedDriverId && String(adminAssigned._id) === rejectedDriverId
      ? null
      : adminAssigned;

  const driverRows = drivers.map((driver) => ({
    ...toPublicProfile(driver),
    subDistrict: driver.subDistrict || "",
    subDistrictId: driver.subDistrictId || null,
    city: driver.city || "",
    vehicleType: driver.vehicleType || "",
    vehicleRegistrationNumber: driver.vehicleRegistrationNumber || "",
  }));

  if (currentAssigned) {
    const assignedId = String(currentAssigned._id);
    if (!driverRows.some((row) => String(row._id) === assignedId)) {
      driverRows.unshift({
        ...toPublicProfile(currentAssigned),
        subDistrict: currentAssigned.subDistrict || "",
        subDistrictId: currentAssigned.subDistrictId || null,
        city: currentAssigned.city || "",
        vehicleType: currentAssigned.vehicleType || "",
        vehicleRegistrationNumber: currentAssigned.vehicleRegistrationNumber || "",
      });
    }
  }

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    location,
    deliveryBoyAssignedBy: order.deliveryBoyAssignedBy || null,
    assignedDriver: currentAssigned
      ? {
          ...toPublicProfile(currentAssigned),
          subDistrict: currentAssigned.subDistrict || "",
          subDistrictId: currentAssigned.subDistrictId || null,
        }
      : null,
    drivers: driverRows,
    canAssign: Boolean(filter) || hasRejection,
    message: hasRejection
      ? "Previous driver rejected this delivery. Select another driver."
      : filter
        ? drivers.length
          ? "Drivers filtered by customer sub-district"
          : "No active approved drivers found for this sub-district"
        : "Customer sub-district is missing on this order",
  };
}

async function assignDriverToOrder(orderId, driverId) {
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) {
    throw new AppError("Order not found", 404);
  }

  if (["cancelled", "refunded", "delivered"].includes(String(orderDoc.orderStatus || "").toLowerCase())) {
    throw new AppError("Cannot assign driver to a completed or cancelled order", 400);
  }

  const driver = await DeliveryBoy.findById(driverId).select(
    "name phone status approvalStatus subDistrict subDistrictId"
  );
  if (!driver) {
    throw new AppError("Driver not found", 404);
  }
  if (driver.status !== "active") {
    throw new AppError("Selected driver is not active", 400);
  }
  if (driver.approvalStatus !== "approved") {
    throw new AppError("Selected driver is not approved", 400);
  }

  const location = await enrichOrderLocation(await resolveOrderSubDistrict(orderDoc.toObject()));
  const hasRejection = Boolean(
    String(orderDoc.driverDelivery?.rejectionReason || "").trim() ||
      orderDoc.driverDelivery?.rejectedAt ||
      String(orderDoc.driverDelivery?.status || "").toLowerCase() === "rejected"
  );

  if (!hasRejection && !location.subDistrictId && !location.subDistrict) {
    throw new AppError(
      "Order has no customer sub-district. Update the user address or profile before assigning a driver.",
      400
    );
  }

  if (!hasRejection && !driverMatchesOrderSubDistrict(driver, location)) {
    throw new AppError("Selected driver does not serve the customer's sub-district", 400);
  }

  await ensureVendorFulfillmentsPersisted(orderDoc);

  const previousDriverId = orderDoc.deliveryBoy ? String(orderDoc.deliveryBoy) : "";
  const driverObjectId = toObjectId(driverId);
  orderDoc.deliveryBoy = driverObjectId;
  orderDoc.deliveryBoyAssignedBy = "admin";

  for (const row of orderDoc.vendorFulfillments ?? []) {
    if (String(row.status || "").toLowerCase() !== "cancelled") {
      row.deliveryBoy = driverObjectId;
    }
  }

  orderDoc.driverDelivery = {
    status: "pending",
    acceptedAt: null,
    rejectedAt: null,
    rejectionReason: "",
    rejectedBy: null,
    outForDeliveryAt: null,
    deliveredAt: null,
  };
  initDriverDeliveryPending(orderDoc);
  await orderDoc.save();

  queueDriverAssignedNotification(orderDoc.toObject(), driverObjectId, {
    previousDriverId,
  });

  const fresh = await Order.findById(orderDoc._id)
    .populate("deliveryBoy", "name phone email profileImage subDistrict subDistrictId city status approvalStatus")
    .lean();

  return {
    orderId: fresh._id,
    orderNumber: fresh.orderNumber,
    deliveryBoyAssignedBy: fresh.deliveryBoyAssignedBy || null,
    deliveryBoy: fresh.deliveryBoy
      ? {
          ...toPublicProfile(fresh.deliveryBoy),
          subDistrict: fresh.deliveryBoy.subDistrict || "",
          subDistrictId: fresh.deliveryBoy.subDistrictId || null,
        }
      : null,
    location,
  };
}

/** Admin API — keep driver rejection visible after deliveryBoy is cleared. */
function toAdminDriverDeliveryPayload(order) {
  const dd = order?.driverDelivery;
  if (!dd || typeof dd !== "object") return null;

  const hasRejection = Boolean(String(dd.rejectionReason || "").trim() || dd.rejectedAt);
  const hasActiveDriver = Boolean(order.deliveryBoy);
  const hasStatus = Boolean(dd.status);

  if (!hasRejection && !hasActiveDriver && !hasStatus) return null;

  const rejectedBy =
    dd.rejectedBy && typeof dd.rejectedBy === "object"
      ? {
          _id: dd.rejectedBy._id,
          name: dd.rejectedBy.name ?? "",
          phone: dd.rejectedBy.phone ?? "",
        }
      : dd.rejectedBy
        ? { _id: dd.rejectedBy }
        : null;

  return {
    status: dd.status || (dd.rejectedAt ? "rejected" : null),
    acceptedAt: dd.acceptedAt ?? null,
    rejectedAt: dd.rejectedAt ?? null,
    rejectionReason: String(dd.rejectionReason || "").trim(),
    rejectedBy,
    outForDeliveryAt: dd.outForDeliveryAt ?? null,
    deliveredAt: dd.deliveredAt ?? null,
  };
}

module.exports = {
  resolveOrderSubDistrict,
  enrichOrderLocation,
  listAssignableDriversForOrder,
  assignDriverToOrder,
  driverMatchesOrderSubDistrict,
  toAdminDriverDeliveryPayload,
};

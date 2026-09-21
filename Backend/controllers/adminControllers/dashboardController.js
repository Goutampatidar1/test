const User = require("../../models/entity/user");
const Vendor = require("../../models/entity/vendor");
const VenueVendor = require("../../models/entity/venueVendor");
const Order = require("../../models/other/order");
const VenueOrder = require("../../models/other/venueOrder");
const RechargeTransaction = require("../../models/other/rechargeTransaction");
const PromotionSubscription = require("../../models/other/promotionSubscription");
const { AppConfig } = require("../../models");
const { asyncHandler } = require("../../utils/asyncHandler");

const COLLECTED_ORDER_MATCH = {
  orderStatus: { $nin: ["cancelled", "refunded"] },
  $or: [
    { paymentStatus: { $in: ["paid", "partially_paid"] } },
    { paymentMethod: "cod", orderStatus: "delivered" },
    { paymentMethod: "cod", codCollectedAt: { $ne: null } },
  ],
};

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_MONTHS = 6;
const CHART_TZ = "Asia/Kolkata";

async function sumGrandTotal(Model, filter = {}) {
  const [result] = await Model.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: "$grandTotal" } } },
  ]);
  return result?.total ?? 0;
}

async function sumAmount(Model, filter = {}, field = "amount") {
  const [result] = await Model.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return result?.total ?? 0;
}

async function getCommissionPercents() {
  const config = await AppConfig.findOne().select("commissions").lean();
  const list = config?.commissions ?? [];
  return {
    vendor: Number(list.find((row) => row.type === "Vendor")?.percentage) || 0,
    venue: Number(list.find((row) => row.type === "VenueVendor")?.percentage) || 0,
  };
}

async function getEcomAdminCollection(vendorCommissionPercent) {
  const [row] = await Order.aggregate([
    { $match: COLLECTED_ORDER_MATCH },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        isVendorItem: {
          $or: [{ $eq: ["$product.role", "Vendor"] }, { $ne: ["$items.vendor", null] }],
        },
        itemTotal: { $ifNull: ["$items.totalPrice", 0] },
      },
    },
    {
      $group: {
        _id: "$_id",
        shippingCharge: { $first: { $ifNull: ["$shippingCharge", 0] } },
        vendorItemTotal: { $sum: { $cond: ["$isVendorItem", "$itemTotal", 0] } },
        adminItemTotal: { $sum: { $cond: ["$isVendorItem", 0, "$itemTotal"] } },
      },
    },
    {
      $group: {
        _id: null,
        adminProducts: { $sum: "$adminItemTotal" },
        vendorCommission: {
          $sum: { $multiply: ["$vendorItemTotal", vendorCommissionPercent / 100] },
        },
        adminShipping: {
          $sum: { $cond: [{ $lte: ["$vendorItemTotal", 0] }, "$shippingCharge", 0] },
        },
      },
    },
  ]);

  const adminProducts = money(row?.adminProducts);
  const vendorCommission = money(row?.vendorCommission);
  const adminShipping = money(row?.adminShipping);
  return {
    adminProducts,
    vendorCommission,
    adminShipping,
    total: money(adminProducts + vendorCommission + adminShipping),
  };
}

function lastNMonths(count) {
  const now = new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABELS[d.getMonth()],
      year: d.getFullYear(),
    });
  }
  return months;
}

async function monthlyOrderCounts() {
  const months = lastNMonths(CHART_MONTHS);
  const start = new Date(months[0].year, MONTH_LABELS.indexOf(months[0].label), 1);

  const rows = await Order.aggregate([
    { $match: { placedAt: { $gte: start } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$placedAt", timezone: CHART_TZ },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const byKey = new Map(rows.map((row) => [row._id, row.count]));
  return months.map((month) => ({
    ...month,
    count: byKey.get(month.key) ?? 0,
  }));
}

async function getCategoryPerformance(limit = 5) {
  const rows = await Order.aggregate([
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: "$product.category",
        quantity: { $sum: "$items.quantity" },
      },
    },
    { $sort: { quantity: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 0,
        name: "$category.name",
        quantity: 1,
      },
    },
  ]);

  return rows;
}

exports.getStats = asyncHandler(async (req, res) => {
  const commissions = await getCommissionPercents();

  const [
    totalUsers,
    ecomVendors,
    venueVendors,
    totalOrders,
    ecomAdmin,
    venueCollected,
    rechargeCollected,
    promotionCollected,
    totalRechargeTransactions,
    totalVenueBookings,
    ecomActiveVendors,
    venueActiveVendors,
    ecomPendingApprovals,
    venuePendingApprovals,
    monthlyOrders,
    categoryPerformance,
  ] = await Promise.all([
    User.countDocuments(),
    Vendor.countDocuments(),
    VenueVendor.countDocuments(),
    Order.countDocuments(),
    getEcomAdminCollection(commissions.vendor),
    sumGrandTotal(VenueOrder, COLLECTED_ORDER_MATCH),
    sumAmount(RechargeTransaction, { status: "success", type: "payment" }),
    sumAmount(PromotionSubscription, { paymentStatus: "paid" }),
    RechargeTransaction.countDocuments(),
    VenueOrder.countDocuments(),
    Vendor.countDocuments({ status: "active", approvalStatus: "approved" }),
    VenueVendor.countDocuments({ status: "active", approvalStatus: "approved" }),
    Vendor.countDocuments({ approvalStatus: "pending" }),
    VenueVendor.countDocuments({ approvalStatus: "pending" }),
    monthlyOrderCounts(),
    getCategoryPerformance(),
  ]);

  const venueAdmin = money(
    commissions.venue > 0 ? (Number(venueCollected) * commissions.venue) / 100 : venueCollected
  );
  const recharge = money(rechargeCollected);
  const promotions = money(promotionCollected);
  const revenue = money(ecomAdmin.total + venueAdmin + recharge + promotions);

  res.json({
    stats: {
      totalUsers,
      ecomVendors,
      venueVendors,
      totalOrders,
      revenue,
      totalRechargeTransactions,
      totalVenueBookings,
      ecomActiveVendors,
      venueActiveVendors,
      ecomPendingApprovals,
      venuePendingApprovals,
      monthlyOrders,
      categoryPerformance,
    },
  });
});

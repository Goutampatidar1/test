const Transaction = require("../../models/other/transaction");
const VenueTransaction = require("../../models/other/venueTransaction");
const RechargeTransaction = require("../../models/other/rechargeTransaction");
const DeliveryWithdrawalRequest = require("../../models/other/deliveryWithdrawalRequest");
const VendorWithdrawalRequest = require("../../models/other/vendorWithdrawalRequest");
const User = require("../../models/entity/user");
const Order = require("../../models/other/order");
const VenueOrder = require("../../models/other/venueOrder");
const DeliveryBoy = require("../../models/entity/deliveryboy");
const Vendor = require("../../models/entity/vendor");
const { asyncHandler } = require("../../utils/asyncHandler");
const { getPagination } = require("../../utils/listQuery");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lookupUnwind(from, localField, as) {
  return [
    {
      $lookup: {
        from,
        localField,
        foreignField: "_id",
        as,
      },
    },
    { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
  ];
}

function paymentShape({ kind, kindLabel, vendorExpr, orderIdExpr, customerExpr, extraVendorFromType }) {
  return {
    $project: {
      _id: 1,
      kind: { $literal: kind },
      kindLabel: { $literal: kindLabel },
      transactionId: { $ifNull: ["$transactionId", ""] },
      orderId: orderIdExpr,
      customer: customerExpr,
      vendor: extraVendorFromType || vendorExpr,
      amount: { $ifNull: ["$amount", 0] },
      method: { $ifNull: ["$paymentMethod", ""] },
      date: { $ifNull: ["$processedAt", "$createdAt"] },
      status: { $ifNull: ["$status", ""] },
      direction: { $literal: "in" },
      createdAt: 1,
    },
  };
}

function withdrawalShape({ kind, kindLabel, customerExpr }) {
  return {
    $project: {
      _id: 1,
      kind: { $literal: kind },
      kindLabel: { $literal: kindLabel },
      transactionId: { $ifNull: ["$requestNumber", ""] },
      orderId: { $literal: "" },
      customer: customerExpr,
      vendor: { $literal: kindLabel },
      amount: { $ifNull: ["$amount", 0] },
      method: { $literal: "wallet" },
      date: "$createdAt",
      status: { $ifNull: ["$status", ""] },
      direction: { $literal: "out" },
      createdAt: 1,
    },
  };
}

function ecomPipeline() {
  return [
    ...lookupUnwind(User.collection.name, "user", "userDoc"),
    ...lookupUnwind(Order.collection.name, "order", "orderDoc"),
    paymentShape({
      kind: "ecom",
      kindLabel: "Order Payment",
      vendorExpr: { $literal: "Ecom Order" },
      orderIdExpr: { $ifNull: ["$orderDoc.orderNumber", ""] },
      customerExpr: { $ifNull: ["$userDoc.name", ""] },
    }),
  ];
}

function venuePipeline() {
  return [
    ...lookupUnwind(User.collection.name, "user", "userDoc"),
    ...lookupUnwind(VenueOrder.collection.name, "order", "orderDoc"),
    paymentShape({
      kind: "venue",
      kindLabel: "Booking Payment",
      vendorExpr: { $literal: "Venue Booking" },
      orderIdExpr: { $ifNull: ["$orderDoc.orderNumber", ""] },
      customerExpr: { $ifNull: ["$userDoc.name", ""] },
    }),
  ];
}

function rechargePipeline() {
  return [
    ...lookupUnwind(User.collection.name, "user", "userDoc"),
    {
      $project: {
        _id: 1,
        kind: { $literal: "recharge" },
        kindLabel: { $literal: "Recharge Payment" },
        transactionId: { $ifNull: ["$transactionId", ""] },
        orderId: { $ifNull: ["$referenceId", ""] },
        customer: { $ifNull: ["$userDoc.name", ""] },
        vendor: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ["$rechargeType", ""] } }, 0] },
            { $concat: [{ $toUpper: "$rechargeType" }, " Recharge"] },
            "Recharge",
          ],
        },
        amount: { $ifNull: ["$amount", 0] },
        method: { $ifNull: ["$paymentMethod", ""] },
        date: { $ifNull: ["$processedAt", "$createdAt"] },
        status: { $ifNull: ["$status", ""] },
        direction: { $literal: "in" },
        createdAt: 1,
      },
    },
  ];
}

function driverWithdrawalPipeline() {
  return [
    ...lookupUnwind(DeliveryBoy.collection.name, "deliveryBoy", "driverDoc"),
    withdrawalShape({
      kind: "withdrawal",
      kindLabel: "Driver Withdrawal",
      customerExpr: { $ifNull: ["$driverDoc.name", ""] },
    }),
  ];
}

function vendorWithdrawalPipeline() {
  return [
    ...lookupUnwind(Vendor.collection.name, "vendor", "vendorDoc"),
    withdrawalShape({
      kind: "vendor_withdrawal",
      kindLabel: "Vendor Withdrawal",
      customerExpr: {
        $ifNull: ["$vendorDoc.businessName", { $ifNull: ["$vendorDoc.name", ""] }],
      },
    }),
  ];
}

/** GET /api/admin/payments/revenue — combined payment + withdrawal history */
exports.listRevenueHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search = String(req.query.search || "").trim();

  const pipeline = [
    ...ecomPipeline(),
    {
      $unionWith: {
        coll: VenueTransaction.collection.name,
        pipeline: venuePipeline(),
      },
    },
    {
      $unionWith: {
        coll: RechargeTransaction.collection.name,
        pipeline: rechargePipeline(),
      },
    },
    {
      $unionWith: {
        coll: DeliveryWithdrawalRequest.collection.name,
        pipeline: driverWithdrawalPipeline(),
      },
    },
    {
      $unionWith: {
        coll: VendorWithdrawalRequest.collection.name,
        pipeline: vendorWithdrawalPipeline(),
      },
    },
  ];

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    pipeline.push({
      $match: {
        $or: [
          { transactionId: rx },
          { orderId: rx },
          { customer: rx },
          { vendor: rx },
          { kindLabel: rx },
          { status: rx },
          { method: rx },
        ],
      },
    });
  }

  pipeline.push({ $sort: { date: -1, createdAt: -1 } });
  pipeline.push({
    $facet: {
      rows: [{ $skip: skip }, { $limit: limit }],
      total: [{ $count: "count" }],
      totals: [
        {
          $group: {
            _id: null,
            inflow: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$direction", "in"] }, { $eq: ["$status", "success"] }],
                  },
                  "$amount",
                  0,
                ],
              },
            },
            outflow: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$direction", "out"] }, { $eq: ["$status", "approved"] }],
                  },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ],
    },
  });

  const [facet] = await Transaction.aggregate(pipeline);
  const rows = facet?.rows ?? [];
  const total = facet?.total?.[0]?.count ?? 0;
  const totalsRow = facet?.totals?.[0] ?? {};
  const inflow = Number(totalsRow.inflow) || 0;
  const outflow = Number(totalsRow.outflow) || 0;

  res.json({
    rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
    totals: {
      inflow,
      outflow,
      net: Math.round((inflow - outflow) * 100) / 100,
    },
  });
});

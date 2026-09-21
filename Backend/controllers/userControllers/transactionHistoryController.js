const VenueTransaction = require("../../models/other/venueTransaction");
const VenueOrder = require("../../models/other/venueOrder");
const Transaction = require("../../models/other/transaction");
const Order = require("../../models/other/order");
const RechargeTransaction = require("../../models/other/rechargeTransaction");
const { asyncHandler } = require("../../utils/asyncHandler");
const { getPagination } = require("../../utils/listQuery");
const { parseDateRangeFromQuery } = require("../../utils/dateOnly");
const {
  toVenueTransactionHistoryItem,
  toEcomTransactionHistoryItem,
  toRechargeTransactionHistoryItem,
  paginateTransactions,
  filterByModule,
} = require("../../utils/transactionHistory");

const MAX_PER_SOURCE = 500;

function buildBaseTxFilter(userId, statusFilter) {
  const filter = { user: userId, type: "payment" };
  if (statusFilter) filter.status = statusFilter;
  return filter;
}

async function findVenueOrderIdsByBookingDateRange(userId, dateRange) {
  const orders = await VenueOrder.find({
    user: userId,
    items: {
      $elemMatch: {
        bookingDate: dateRange.mongoRange,
      },
    },
  })
    .select("_id")
    .lean();

  return orders.map((o) => o._id);
}

/**
 * Unified transaction history — merges:
 * - VenueTransaction (filtered by venue booking dates when date range set)
 * - Transaction (ecom — filtered by transaction createdAt)
 * - RechargeTransaction (filtered by transaction createdAt)
 */
exports.listTransactionHistory = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const statusFilter = req.query.status
    ? String(req.query.status).trim().toLowerCase()
    : null;
  const moduleFilter = req.query.module ?? null;
  const dateRange = parseDateRangeFromQuery(req.query);

  const baseFilter = buildBaseTxFilter(req.user._id, statusFilter);

  const venueFilter = { ...baseFilter };
  const otherFilter = { ...baseFilter };

  if (dateRange?.mongoRange) {
    const venueOrderIds = await findVenueOrderIdsByBookingDateRange(
      req.user._id,
      dateRange
    );
    venueFilter.order = { $in: venueOrderIds };
    otherFilter.createdAt = dateRange.mongoRange;
  }

  const [venueTxs, ecomTxs, rechargeTxs] = await Promise.all([
    VenueTransaction.find(venueFilter).sort({ createdAt: -1 }).limit(MAX_PER_SOURCE).lean(),
    Transaction.find(otherFilter).sort({ createdAt: -1 }).limit(MAX_PER_SOURCE).lean(),
    RechargeTransaction.find(otherFilter).sort({ createdAt: -1 }).limit(MAX_PER_SOURCE).lean(),
  ]);

  const [venueOrders, ecomOrders] = await Promise.all([
    VenueOrder.find({
      _id: { $in: venueTxs.map((t) => t.order).filter(Boolean) },
    })
      .select("orderNumber items.bookingDate items.bookingType items.bookingSlot")
      .lean(),
    Order.find({
      _id: { $in: ecomTxs.map((t) => t.order).filter(Boolean) },
    })
      .select("orderNumber")
      .lean(),
  ]);

  const venueOrderMap = new Map(venueOrders.map((o) => [String(o._id), o]));
  const ecomOrderMap = new Map(ecomOrders.map((o) => [String(o._id), o]));

  let merged = [
    ...venueTxs.map((tx) =>
      toVenueTransactionHistoryItem(tx, venueOrderMap.get(String(tx.order)))
    ),
    ...ecomTxs.map((tx) =>
      toEcomTransactionHistoryItem(tx, ecomOrderMap.get(String(tx.order)))
    ),
    ...rechargeTxs.map((tx) => toRechargeTransactionHistoryItem(tx)),
  ];

  merged = filterByModule(merged, moduleFilter);
  const { transactions, total, pages } = paginateTransactions(merged, page, limit);

  return res.status(200).json({
    status: transactions.length > 0,
    message: "Transaction history fetched",
    data: transactions,
    pagination: {
      page,
      limit,
      total,
      pages,
    },
    filters: {
      status: statusFilter,
      module: moduleFilter,
      startDate: dateRange?.startDate ?? null,
      endDate: dateRange?.endDate ?? null,
      filterBy: dateRange ? "bookingDate" : null,
    },
  });
});

const DeliveryBoy = require("../../models/entity/deliveryboy");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { formatInrAmount } = require("../../utils/deliveryWallet");
const {
  getDriverCodSummary,
  listDriversCodSummary,
  listDriverPendingCodOrders,
  listDriverCodSettlements,
  settleDriverCodBalance,
} = require("../../utils/driverCodWallet");

/** GET /api/admin/delivery-cod */
exports.listDriversCod = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const search = req.query.search ?? req.query.q ?? null;
  const onlyPending = String(req.query.onlyPending || req.query.pending || "").toLowerCase() === "true";

  const result = await listDriversCodSummary({ page, limit, search, onlyPending });

  return res.json({
    items: result.items,
    pagination: result.pagination,
  });
});

/** GET /api/admin/delivery-cod/:driverId */
exports.getDriverCodDetail = asyncHandler(async (req, res) => {
  const driverId = assertObjectId(req.params.driverId, "Delivery partner id");
  const driver = await DeliveryBoy.findById(driverId).select("_id").lean();
  if (!driver) throw new AppError("Delivery partner not found", 404);

  const summary = await getDriverCodSummary(driverId);
  return res.json(summary);
});

/** GET /api/admin/delivery-cod/:driverId/pending-orders */
exports.listDriverPendingOrders = asyncHandler(async (req, res) => {
  const driverId = assertObjectId(req.params.driverId, "Delivery partner id");
  const { page, limit } = getPagination(req.query);
  const result = await listDriverPendingCodOrders(driverId, { page, limit });
  return res.json(result);
});

/** GET /api/admin/delivery-cod/:driverId/settlements */
exports.listDriverSettlements = asyncHandler(async (req, res) => {
  const driverId = assertObjectId(req.params.driverId, "Delivery partner id");
  const { page, limit } = getPagination(req.query);
  const result = await listDriverCodSettlements(driverId, { page, limit });
  return res.json(result);
});

/** POST /api/admin/delivery-cod/:driverId/settle */
exports.settleDriverCod = asyncHandler(async (req, res) => {
  const driverId = assertObjectId(req.params.driverId, "Delivery partner id");
  const body = req.body ?? {};
  const amount = body.amount ?? body.settleAmount ?? body.value;
  const adminNote = body.adminNote ?? body.note ?? body.remarks ?? "";

  if (amount === undefined || amount === null || amount === "") {
    throw new AppError("Settlement amount is required", 400);
  }

  const driver = await DeliveryBoy.findById(driverId).select("_id name").lean();
  if (!driver) throw new AppError("Delivery partner not found", 404);

  const result = await settleDriverCodBalance(driverId, amount, req.user._id, adminNote);

  return res.json({
    message: `Settled ${formatInrAmount(result.settlement.amount)} from ${driver.name || "driver"}`,
    settlement: {
      _id: result.settlement._id,
      settlementNumber: result.settlement.settlementNumber,
      amount: result.settlement.amount,
      amountLabel: formatInrAmount(result.settlement.amount),
      previousBalance: result.settlement.previousBalance,
      balanceAfter: result.settlement.balanceAfter,
      balanceAfterLabel: formatInrAmount(result.settlement.balanceAfter),
      adminNote: result.settlement.adminNote || "",
      processedAt: result.settlement.processedAt,
      orderAllocations: result.allocations,
    },
    codPendingBalance: result.codPendingBalance,
    codPendingBalanceLabel: result.codPendingBalanceLabel,
  });
});

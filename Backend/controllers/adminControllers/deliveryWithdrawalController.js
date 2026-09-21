const DeliveryWithdrawalRequest = require("../../models/other/deliveryWithdrawalRequest");
const DeliveryBoy = require("../../models/entity/deliveryboy");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { parseDateRangeFromQuery } = require("../../utils/dateOnly");
const {
  processDriverWithdrawalRequest,
  formatInrAmount,
} = require("../../utils/deliveryWallet");

const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);

function toWithdrawalPresenter(row) {
  const driver = row.deliveryBoy && typeof row.deliveryBoy === "object" ? row.deliveryBoy : null;

  return {
    _id: row._id,
    requestNumber: row.requestNumber,
    amount: row.amount,
    amountLabel: formatInrAmount(row.amount),
    status: row.status,
    statusLabel: String(row.status || "").toUpperCase(),
    bankAccountName: row.bankAccountName,
    accountNumber: row.accountNumber,
    bankName: row.bankName,
    branchName: row.branchName,
    ifscCode: row.ifscCode,
    adminNote: row.adminNote || "",
    rejectionReason: row.rejectionReason || "",
    processedAt: row.processedAt,
    createdAt: row.createdAt,
    driver: driver
      ? {
          _id: driver._id,
          name: driver.name || "",
          email: driver.email || "",
          phone: driver.phone || "",
          profileImage: driver.profileImage || "",
        }
      : null,
  };
}

/** GET /api/admin/delivery-withdrawals */
exports.listWithdrawalRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const dateRange = parseDateRangeFromQuery(req.query);
  const search = req.query.search ?? req.query.q ?? null;
  const status = String(req.query.status || "").trim().toLowerCase();

  const filter = {};
  if (status && ALLOWED_STATUSES.has(status)) {
    filter.status = status;
  }

  if (dateRange?.startDate || dateRange?.endDate) {
    filter.createdAt = {};
    if (dateRange.startDate) {
      filter.createdAt.$gte = new Date(`${dateRange.startDate}T00:00:00.000Z`);
    }
    if (dateRange.endDate) {
      filter.createdAt.$lte = new Date(`${dateRange.endDate}T23:59:59.999Z`);
    }
  }

  if (search) {
    const term = String(search).trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const drivers = await DeliveryBoy.find({
      $or: [{ name: regex }, { email: regex }, { phone: regex }],
    })
      .select("_id")
      .lean();

    filter.$or = [
      { requestNumber: regex },
      { deliveryBoy: { $in: drivers.map((driver) => driver._id) } },
    ];
  }

  const [rows, total] = await Promise.all([
    DeliveryWithdrawalRequest.find(filter)
      .populate("deliveryBoy", "name email phone profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DeliveryWithdrawalRequest.countDocuments(filter),
  ]);

  return res.json({
    items: rows.map(toWithdrawalPresenter),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

/** GET /api/admin/delivery-withdrawals/:id */
exports.getWithdrawalRequestById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "Withdrawal request id");

  const row = await DeliveryWithdrawalRequest.findById(id)
    .populate("deliveryBoy", "name email phone profileImage walletBalance")
    .populate("processedBy", "name email")
    .populate("walletTransaction")
    .lean();

  if (!row) throw new AppError("Withdrawal request not found", 404);

  return res.json({
    ...toWithdrawalPresenter(row),
    walletTransaction: row.walletTransaction || null,
    processedBy: row.processedBy || null,
  });
});

/** PATCH /api/admin/delivery-withdrawals/:id */
exports.updateWithdrawalRequest = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "Withdrawal request id");
  const body = req.body ?? {};

  const result = await processDriverWithdrawalRequest(id, req.user._id, {
    status: body.status ?? body.action,
    adminNote: body.adminNote ?? body.note,
    rejectionReason: body.rejectionReason ?? body.reason ?? body.remarks,
  });

  return res.json({
    request: toWithdrawalPresenter({
      ...result.request,
      deliveryBoy: await DeliveryBoy.findById(result.request.deliveryBoy)
        .select("name email phone profileImage")
        .lean(),
    }),
    walletBalance: result.walletBalance,
    walletBalanceLabel: formatInrAmount(result.walletBalance),
  });
});

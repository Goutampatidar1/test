const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPagination } = require("../../utils/listQuery");
const { parseDateRangeFromQuery } = require("../../utils/dateOnly");
const {
  getDriverWalletBalance,
  getDriverLifetimeEarnings,
  createDriverWithdrawalRequest,
  formatInrAmount,
} = require("../../utils/deliveryWallet");
const { getDriverCodPendingBalance, getDriverCodSummary } = require("../../utils/driverCodWallet");
const { listDriverWalletTransactions } = require("../../utils/deliveryWalletTransactionHistory");

function readWithdrawAmount(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};
  return body.amount ?? body.withdrawAmount ?? query.amount ?? query.withdrawAmount;
}

/** GET /api/delivery/wallet */
exports.getWallet = asyncHandler(async (req, res) => {
  const [walletBalance, totalEarnings, codPendingBalance] = await Promise.all([
    getDriverWalletBalance(req.user._id),
    getDriverLifetimeEarnings(req.user._id),
    getDriverCodPendingBalance(req.user._id).catch(() => 0),
  ]);

  return sendSuccess(res, "Wallet fetched", {
    walletBalance,
    walletBalanceLabel: formatInrAmount(walletBalance),
    totalEarnings,
    totalEarningsLabel: formatInrAmount(totalEarnings),
    codPendingBalance,
    codPendingBalanceLabel: formatInrAmount(codPendingBalance),
  });
});

/** POST /api/delivery/wallet/withdraw */
exports.requestWithdrawal = asyncHandler(async (req, res) => {
  const amount = readWithdrawAmount(req);
  const result = await createDriverWithdrawalRequest(req.user._id, amount);

  const totalEarnings = await getDriverLifetimeEarnings(req.user._id);

  return sendSuccess(res, "Withdrawal request submitted", {
    requestId: result.withdrawalRequest._id,
    requestNumber: result.withdrawalRequest.requestNumber,
    amount: result.withdrawalRequest.amount,
    amountLabel: formatInrAmount(result.withdrawalRequest.amount),
    status: result.withdrawalRequest.status,
    transactionId: result.walletTransaction.transactionId,
    transactionIdLabel: `#${result.walletTransaction.transactionId}`,
    walletBalance: result.walletBalance,
    walletBalanceLabel: formatInrAmount(result.walletBalance),
    totalEarnings,
    totalEarningsLabel: formatInrAmount(totalEarnings),
  });
});

/** GET /api/delivery/wallet/cod */
exports.getCodSummary = asyncHandler(async (req, res) => {
  const summary = await getDriverCodSummary(req.user._id);
  return sendSuccess(res, "COD summary fetched", summary);
});

/** GET /api/delivery/wallet/transactions */
exports.listWalletTransactions = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const dateRange = parseDateRangeFromQuery(req.query);
  const search =
    req.query.search ?? req.query.title ?? req.query.q ?? req.query.keyword ?? null;
  const sort = req.query.sort ?? req.query.order ?? "desc";

  const { transactions, total, pages } = await listDriverWalletTransactions(req.user._id, {
    page,
    limit,
    direction: req.query.direction ?? req.query.flow ?? req.query.type ?? null,
    status: req.query.status ?? null,
    category: req.query.category ?? null,
    search,
    sort,
    dateRange,
  });

  const [walletBalance, totalEarnings] = await Promise.all([
    getDriverWalletBalance(req.user._id),
    getDriverLifetimeEarnings(req.user._id),
  ]);

  return res.status(200).json({
    status: transactions.length > 0,
    message: "Wallet transactions fetched",
    data: transactions,
    walletBalance,
    walletBalanceLabel: formatInrAmount(walletBalance),
    totalEarnings,
    totalEarningsLabel: formatInrAmount(totalEarnings),
    pagination: {
      page,
      limit,
      total,
      pages,
    },
    filters: {
      search: search ? String(search).trim() : null,
      direction: req.query.direction ?? null,
      status: req.query.status ?? null,
      category: req.query.category ?? null,
      sort: String(sort).trim().toLowerCase(),
      startDate: dateRange?.startDate ?? null,
      endDate: dateRange?.endDate ?? null,
    },
  });
});

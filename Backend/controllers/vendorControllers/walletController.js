const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPagination } = require("../../utils/listQuery");
const { parseDateRangeFromQuery } = require("../../utils/dateOnly");
const {
  getVendorWalletBalance,
  getVendorLifetimeEarnings,
  createVendorWithdrawalRequest,
  formatInrAmount,
} = require("../../utils/vendorWallet");
const { listVendorWalletTransactions } = require("../../utils/vendorWalletTransactionHistory");

function readWithdrawAmount(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};
  return body.amount ?? body.withdrawAmount ?? query.amount ?? query.withdrawAmount;
}

/** GET /api/vendor/wallet */
exports.getWallet = asyncHandler(async (req, res) => {
  const [walletBalance, totalEarnings] = await Promise.all([
    getVendorWalletBalance(req.user._id),
    getVendorLifetimeEarnings(req.user._id),
  ]);

  return sendSuccess(res, "Wallet fetched", {
    walletBalance,
    walletBalanceLabel: formatInrAmount(walletBalance),
    totalEarnings,
    totalEarningsLabel: formatInrAmount(totalEarnings),
  });
});

/** GET /api/vendor/wallet/balance */
exports.getBalance = asyncHandler(async (req, res) => {
  const [walletBalance, totalEarnings] = await Promise.all([
    getVendorWalletBalance(req.user._id),
    getVendorLifetimeEarnings(req.user._id),
  ]);

  return sendSuccess(res, "Wallet balance fetched", {
    walletBalance,
    walletBalanceLabel: formatInrAmount(walletBalance),
    totalEarnings,
    totalEarningsLabel: formatInrAmount(totalEarnings),
  });
});

/** POST /api/vendor/wallet/withdraw */
exports.requestWithdrawal = asyncHandler(async (req, res) => {
  const amount = readWithdrawAmount(req);
  const result = await createVendorWithdrawalRequest(req.user._id, amount);

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
  });
});

/** GET /api/vendor/wallet/transactions */
exports.listWalletTransactions = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const dateRange = parseDateRangeFromQuery(req.query);
  const search =
    req.query.search ?? req.query.title ?? req.query.q ?? req.query.keyword ?? null;
  const sort = req.query.sort ?? req.query.order ?? "desc";

  const { transactions, total, pages } = await listVendorWalletTransactions(req.user._id, {
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
    getVendorWalletBalance(req.user._id),
    getVendorLifetimeEarnings(req.user._id),
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

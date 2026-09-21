const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPagination } = require("../../utils/listQuery");
const { parseDateRangeFromQuery } = require("../../utils/dateOnly");
const { getUserWalletBalance, addWalletTopUp } = require("../../utils/userWallet");
const { listUserWalletTransactions } = require("../../utils/walletTransactionHistory");

function formatWalletAmount(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function readWalletAddParams(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};

  return {
    transactionId:
      body.transaction_id ??
      body.transactionId ??
      query.transaction_id ??
      query.transactionId,
    amount: body.amount ?? query.amount,
  };
}

exports.getWallet = asyncHandler(async (req, res) => {
  const walletBalance = await getUserWalletBalance(req.user._id);

  return sendSuccess(res, "Wallet fetched", {
    walletBalance,
    walletBalanceLabel: formatWalletAmount(walletBalance),
  });
});

exports.addWalletAmount = asyncHandler(async (req, res) => {
  const { transactionId, amount } = readWalletAddParams(req);
  const result = await addWalletTopUp(req.user._id, transactionId, amount);

  return sendSuccess(
    res,
    result.alreadyCredited ? "Wallet already credited for this transaction" : "Amount added to wallet",
    {
      transaction_id: result.transaction.transactionId,
      amount: result.transaction.amount,
      amountLabel: formatWalletAmount(result.transaction.amount),
      walletBalance: result.walletBalance,
      walletBalanceLabel: formatWalletAmount(result.walletBalance),
      alreadyCredited: result.alreadyCredited,
      status: result.transaction.status,
    }
  );
});

exports.listWalletTransactions = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const dateRange = parseDateRangeFromQuery(req.query);
  const search =
    req.query.search ?? req.query.title ?? req.query.q ?? req.query.keyword ?? null;
  const sort = req.query.sort ?? req.query.order ?? "desc";

  const { transactions, total, pages } = await listUserWalletTransactions(req.user._id, {
    page,
    limit,
    direction: req.query.direction ?? req.query.flow ?? null,
    status: req.query.status ?? null,
    type: req.query.type ?? null,
    search,
    sort,
    dateRange,
  });

  const walletBalance = await getUserWalletBalance(req.user._id);

  return res.status(200).json({
    status: true,
    message: "Wallet transactions fetched",
    data: transactions,
    walletBalance,
    walletBalanceLabel: formatWalletAmount(walletBalance),
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
      type: req.query.type ?? null,
      sort: String(sort).trim().toLowerCase(),
      startDate: dateRange?.startDate ?? null,
      endDate: dateRange?.endDate ?? null,
    },
  });
});

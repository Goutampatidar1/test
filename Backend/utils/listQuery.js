function getPagination(query) {
  const pageRaw = query.page ?? query.Page ?? query.PAGE ?? "1";
  const limitRaw = query.limit ?? query.Limit ?? query.LIMIT ?? "10";
  const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);
  const rawLimit = parseInt(String(limitRaw), 10) || 10;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function escapeRegex(s) {
  return String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchFilter(search, fields) {
  if (!search || !String(search).trim()) {
    return null;
  }
  const rx = new RegExp(escapeRegex(search), "i");
  return { $or: fields.map((field) => ({ [field]: rx })) };
}

/**
 * Order list search — order number plus matching customer name.
 */
async function orderSearchFilter(search, UserModel, orderFields = ["orderNumber"]) {
  const trimmed = String(search || "").trim();
  if (!trimmed) return null;

  const rx = new RegExp(escapeRegex(trimmed), "i");
  const or = orderFields.map((field) => ({ [field]: rx }));

  if (UserModel) {
    const users = await UserModel.find({ name: rx }).select("_id").lean();

    if (users.length) {
      or.push({ user: { $in: users.map((row) => row._id) } });
    }
  }

  return { $or: or };
}

function applyOrderDateRangeFilter(filter, query = {}) {
  const { parseListDateRangeFromQuery } = require("./dateOnly");
  const dateRange = parseListDateRangeFromQuery(query);
  if (!dateRange?.mongoRange) return;

  const clauses = [];
  if (dateRange.mongoRange.$gte) {
    clauses.push({
      $gte: [{ $ifNull: ["$placedAt", "$createdAt"] }, dateRange.mongoRange.$gte],
    });
  }
  if (dateRange.mongoRange.$lte) {
    clauses.push({
      $lte: [{ $ifNull: ["$placedAt", "$createdAt"] }, dateRange.mongoRange.$lte],
    });
  }

  if (clauses.length) {
    filter.$expr = { $and: clauses };
  }
}

module.exports = {
  getPagination,
  searchFilter,
  orderSearchFilter,
  applyOrderDateRangeFilter,
  /** @deprecated use applyOrderDateRangeFilter */
  applyCreatedAtDateRangeFilter: applyOrderDateRangeFilter,
};

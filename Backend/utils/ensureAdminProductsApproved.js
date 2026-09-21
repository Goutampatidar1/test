const Product = require("../models/other/product");

/** Admin-owned products are always approved; fix legacy rows created before this rule. */
async function ensureAdminProductsApproved() {
  const result = await Product.updateMany(
    { role: "Admin", adminApproved: { $ne: true } },
    { $set: { adminApproved: true } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[products] Marked ${result.modifiedCount} admin product(s) as approved`);
  }
}

module.exports = { ensureAdminProductsApproved };

/**
 * Replaces a non-sparse unique email index so vendors can omit email (mobile sign-up).
 */
const { listCollectionIndexes } = require("./safeCollectionIndexes");

async function ensureVendorEmailSparseIndex() {
  const Vendor = require("../models/entity/vendor");
  const collection = Vendor.collection;

  const unsetResult = await collection.updateMany(
    { $or: [{ email: null }, { email: "" }] },
    { $unset: { email: "" } }
  );
  if (unsetResult.modifiedCount > 0) {
    console.log(
      `Cleared null/empty email on ${unsetResult.modifiedCount} vendor document(s)`
    );
  }

  const indexes = await listCollectionIndexes(collection);
  const emailIndex = indexes.find((idx) => idx.name === "email_1");
  if (emailIndex && !emailIndex.sparse) {
    await collection.dropIndex("email_1");
    console.log("Dropped non-sparse vendors.email_1 index");
  }

  await Vendor.syncIndexes();
}

module.exports = { ensureVendorEmailSparseIndex };

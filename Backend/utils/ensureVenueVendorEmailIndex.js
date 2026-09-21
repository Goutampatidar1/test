/**
 * Unique email only for real addresses. Sparse unique still indexes null,
 * so a second blank-email signup hits E11000. A partial index does not.
 */
function isPartialNonEmptyEmailIndex(idx) {
  const emailFilter = idx?.partialFilterExpression?.email;
  return Boolean(emailFilter && (emailFilter.$gt === "" || emailFilter.$type === "string"));
}

const { listCollectionIndexes } = require("./safeCollectionIndexes");

async function ensureVenueVendorEmailSparseIndex() {
  const VenueVendor = require("../models/entity/venueVendor");
  const collection = VenueVendor.collection;

  const unsetResult = await collection.updateMany(
    { $or: [{ email: null }, { email: "" }] },
    { $unset: { email: "" } }
  );
  if (unsetResult.modifiedCount > 0) {
    console.log(
      `Cleared null/empty email on ${unsetResult.modifiedCount} venue vendor document(s)`
    );
  }

  const indexes = await listCollectionIndexes(collection);
  const emailIndexes = indexes.filter(
    (idx) => idx.name === "email_1" || (idx.key && idx.key.email === 1 && idx.unique)
  );

  for (const emailIndex of emailIndexes) {
    if (!isPartialNonEmptyEmailIndex(emailIndex)) {
      await collection.dropIndex(emailIndex.name);
      console.log(`Dropped venuevendors.${emailIndex.name} (was indexing null emails)`);
    }
  }

  await VenueVendor.syncIndexes();
}

module.exports = { ensureVenueVendorEmailSparseIndex };

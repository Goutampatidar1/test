/**
 * Replaces a non-sparse unique email index so multiple users can omit email.
 * Also removes stored null/empty email values (they break sparse uniqueness).
 */
const { listCollectionIndexes } = require("./safeCollectionIndexes");

async function ensureUserEmailSparseIndex() {
  const User = require("../models/entity/user");
  const collection = User.collection;

  const unsetResult = await collection.updateMany(
    { $or: [{ email: null }, { email: "" }] },
    { $unset: { email: "" } }
  );
  if (unsetResult.modifiedCount > 0) {
    console.log(
      `Cleared null/empty email on ${unsetResult.modifiedCount} user document(s)`
    );
  }

  const indexes = await listCollectionIndexes(collection);
  const emailIndex = indexes.find((idx) => idx.name === "email_1");
  if (emailIndex && !emailIndex.sparse) {
    await collection.dropIndex("email_1");
    console.log("Dropped non-sparse users.email_1 index");
  }

  await User.syncIndexes();
}

module.exports = { ensureUserEmailSparseIndex };

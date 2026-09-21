/**
 * Static pages are unique per app + slug (user, vendor, venue_vendor can each
 * have "privacy-policy"). Older deployments may still have a global unique slug_1
 * index that blocks creating the same slug for a different app.
 */
const { listCollectionIndexes } = require("./safeCollectionIndexes");

async function ensureStaticPageSlugIndex(PageModel) {
  const collection = PageModel.collection;

  await PageModel.updateMany(
    { $or: [{ app: { $exists: false } }, { app: null }, { app: "" }] },
    { $set: { app: "user" } }
  );

  const indexes = await listCollectionIndexes(collection);
  const legacySlugIndex = indexes.find((idx) => idx.name === "slug_1");
  if (legacySlugIndex) {
    await collection.dropIndex("slug_1");
    console.log("Dropped legacy pages.slug_1 index (replaced by app + slug compound index)");
  }

  await PageModel.syncIndexes();
}

module.exports = { ensureStaticPageSlugIndex };

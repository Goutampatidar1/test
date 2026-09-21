/**
 * Ensures promotions have one unique promoCode index (drops legacy duplicate if present).
 */
const { listCollectionIndexes } = require("./safeCollectionIndexes");

async function ensurePromotionPromoCodeIndex() {
  const Promotion = require("../models/other/promotion");
  const collection = Promotion.collection;

  const indexes = await listCollectionIndexes(collection);
  const promoCodeIndexes = indexes.filter(
    (idx) => idx.key && Object.keys(idx.key).length === 1 && idx.key.promoCode === 1
  );

  const uniqueIndexes = promoCodeIndexes.filter((idx) => idx.unique);
  const nonUniqueIndexes = promoCodeIndexes.filter((idx) => !idx.unique);

  for (const idx of nonUniqueIndexes) {
    await collection.dropIndex(idx.name);
    console.log(`Dropped duplicate promotion ${idx.name} index`);
  }

  if (uniqueIndexes.length > 1) {
    for (const idx of uniqueIndexes.slice(1)) {
      await collection.dropIndex(idx.name);
      console.log(`Dropped extra unique promotion ${idx.name} index`);
    }
  }

  await Promotion.syncIndexes();
}

module.exports = { ensurePromotionPromoCodeIndex };

/** Returns [] when the collection does not exist yet (fresh database). */
async function listCollectionIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (err) {
    if (err.code === 26 || err.codeName === "NamespaceNotFound") {
      return [];
    }
    throw err;
  }
}

module.exports = { listCollectionIndexes };

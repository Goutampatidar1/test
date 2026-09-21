export function normalizeCatalogOption(row) {
  if (!row || typeof row !== "object") return null;
  const id = String(row._id ?? row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!id || !name) return null;
  return { ...row, _id: id, name };
}

export function normalizeCatalogOptions(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeCatalogOption).filter(Boolean);
}

export function unwrapCatalogList(body) {
  if (!body || typeof body !== "object") return [];

  if (Array.isArray(body.categories)) return body.categories;
  if (Array.isArray(body.subCategories)) return body.subCategories;
  if (Array.isArray(body.amenities)) return body.amenities;

  const raw = body.data;
  if (!Array.isArray(raw)) {
    if (raw && Array.isArray(raw.items)) return raw.items;
    return [];
  }
  if (raw.length === 0) return [];

  const first = raw[0];
  if (first && Array.isArray(first.items)) return first.items;

  return raw;
}

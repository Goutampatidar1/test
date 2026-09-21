const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { applyDiscount } = require("./publicProductList");

function normalizeTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getAttributeDimensionType(title) {
  const key = normalizeTitle(title);
  if (key.includes("color")) return "color";
  if (key.includes("size")) return "size";
  return "option";
}

function mapCombinationAttributes(combination) {
  return (combination?.attributes ?? []).map((attr) => {
    const titleDoc =
      attr.attributeTitle && typeof attr.attributeTitle === "object" ? attr.attributeTitle : null;
    const valueObj =
      attr.attributeValue && typeof attr.attributeValue === "object" ? attr.attributeValue : null;
    const title = titleDoc?.title ?? "";
    const titleId = titleDoc?._id ?? attr.attributeTitle ?? "";
    const valueId = valueObj?._id ?? attr.attributeValue ?? "";
    const value = valueObj?.value ?? "";
    const type = getAttributeDimensionType(title);

    return {
      titleId: String(titleId),
      title,
      titleKey: normalizeTitle(title),
      type,
      valueId: String(valueId),
      value,
      label: value,
      colorCode: valueObj?.colorCode ?? "",
    };
  });
}

function resolveAttributeTitleOrder(product) {
  const ordered = [];
  const seen = new Set();

  for (const titleRef of product?.attributeTitles ?? []) {
    const titleId = String(
      titleRef && typeof titleRef === "object" ? titleRef._id : titleRef || ""
    ).trim();
    if (!titleId || seen.has(titleId)) continue;
    seen.add(titleId);
    ordered.push(titleId);
  }

  for (const combo of product?.combinations ?? []) {
    for (const attr of combo?.attributes ?? []) {
      const titleId = String(
        attr?.attributeTitle?._id ?? attr?.attributeTitle ?? ""
      ).trim();
      if (!titleId || seen.has(titleId)) continue;
      seen.add(titleId);
      ordered.push(titleId);
    }
  }

  return ordered;
}

function resolveTitleMeta(product, titleId) {
  const id = String(titleId);

  for (const titleRef of product?.attributeTitles ?? []) {
    if (titleRef && typeof titleRef === "object" && String(titleRef._id) === id) {
      return {
        titleId: id,
        title: titleRef.title ?? "",
        type: getAttributeDimensionType(titleRef.title),
      };
    }
  }

  for (const combo of product?.combinations ?? []) {
    for (const attr of combo?.attributes ?? []) {
      const titleDoc =
        attr.attributeTitle && typeof attr.attributeTitle === "object" ? attr.attributeTitle : null;
      if (titleDoc && String(titleDoc._id) === id) {
        return {
          titleId: id,
          title: titleDoc.title ?? "",
          type: getAttributeDimensionType(titleDoc.title),
        };
      }
    }
  }

  return { titleId: id, title: "", type: "option" };
}

function resolvePrimaryDimensionTitleId(product) {
  const ordered = resolveAttributeTitleOrder(product);
  for (const titleId of ordered) {
    const meta = resolveTitleMeta(product, titleId);
    if (meta.type !== "color") return titleId;
  }
  return ordered[0] || null;
}

function buildSelectionMap(attrs) {
  const selection = {};
  for (const attr of attrs) {
    if (attr.title && attr.value) selection[attr.title] = attr.value;
  }
  return selection;
}

function buildCombinationKey(attrs) {
  return attrs
    .slice()
    .sort((a, b) => a.titleKey.localeCompare(b.titleKey))
    .map((attr) => `${attr.titleKey}:${normalizeTitle(attr.value)}`)
    .join("|");
}

function resolveComboImages(combo, product, baseUrl) {
  return (combo?.images ?? []).map((img) => toAbsoluteUploadUrl(img, baseUrl)).filter(Boolean);
}

function resolveComboPricing(combo, product) {
  const mrp = Number(combo.price) || 0;
  const sellingPrice = applyDiscount(
    combo.price,
    product?.discountType,
    combo.discountValue ?? product?.discountValue
  );
  return {
    price: sellingPrice,
    mrp: mrp > sellingPrice ? mrp : sellingPrice,
  };
}

function resolveColorDimensionTitleId(product) {
  const ordered = resolveAttributeTitleOrder(product);
  for (const titleId of ordered) {
    const meta = resolveTitleMeta(product, titleId);
    if (meta.type === "color") return titleId;
  }
  return null;
}

/** Secondary axis: prefer Color, otherwise the next attribute after primary (e.g. Storage). */
function resolveSecondaryDimensionTitleId(product, primaryTitleId) {
  const colorTitleId = resolveColorDimensionTitleId(product);
  if (colorTitleId && String(colorTitleId) !== String(primaryTitleId || "")) {
    return colorTitleId;
  }

  const ordered = resolveAttributeTitleOrder(product);
  for (const titleId of ordered) {
    if (String(titleId) === String(primaryTitleId || "")) continue;
    return titleId;
  }
  return null;
}

function resolveCombinationPrimaryAttr(attrs, primaryTitleId) {
  return (
    attrs.find((attr) => attr.titleId === primaryTitleId) ??
    attrs.find((attr) => attr.type !== "color") ??
    attrs[0] ??
    null
  );
}

function resolveCombinationSecondaryAttr(attrs, secondaryTitleId) {
  if (!secondaryTitleId) return null;
  return attrs.find((attr) => attr.titleId === secondaryTitleId) ?? null;
}

function formatSimpleCombination(combo, product, baseUrl) {
  const attrs = mapCombinationAttributes(combo);
  const primaryTitleId = resolvePrimaryDimensionTitleId(product);
  const secondaryTitleId = resolveSecondaryDimensionTitleId(product, primaryTitleId);
  const primaryAttr = resolveCombinationPrimaryAttr(attrs, primaryTitleId);
  const secondaryAttr = resolveCombinationSecondaryAttr(attrs, secondaryTitleId);

  const images = resolveComboImages(combo, product, baseUrl);
  const { price, mrp } = resolveComboPricing(combo, product);
  const stock = Number(combo.stock) || 0;

  return {
    sku: combo.sku,
    size: primaryAttr?.value ?? null,
    color: secondaryAttr?.value ?? null,
    colorCode: secondaryAttr?.colorCode ?? "",
    price,
    mrp,
    stock,
    inStock: stock > 0,
    discountValue: Number(combo.discountValue) || 0,
    status: combo.status || "active",
    images,
  };
}

function buildSimpleVariantView(product, baseUrl, options = {}) {
  const raw = buildProductVariantOptions(product, baseUrl, options);
  const grouped = raw.groupedByPrimary;
  if (!grouped) return null;

  const primaryTitleId = resolvePrimaryDimensionTitleId(product);
  const secondaryTitleId = resolveSecondaryDimensionTitleId(product, primaryTitleId);
  const secondaryMeta = secondaryTitleId ? resolveTitleMeta(product, secondaryTitleId) : null;

  const groups = grouped.groups.map((group) => ({
    size: group.value,
    label: group.label,
    dimensionTitle: group.dimensionTitle ?? grouped.dimensionTitle,
    stock: group.totalStock,
    inStock: group.inStock,
    colors: group.variants.map((variant) => {
      const displayValue = variant.secondary?.value ?? variant.color?.value ?? "";
      const colorCode = String(variant.secondary?.colorCode ?? variant.color?.colorCode ?? "").trim();
      const hasColorCode = Boolean(colorCode);

      return {
        name: hasColorCode ? displayValue || null : "",
        value: hasColorCode ? "" : displayValue || "",
        colorCode,
        sku: variant.sku,
        price: variant.price,
        mrp: variant.mrp,
        stock: variant.stock,
        inStock: variant.inStock,
        status: variant.status,
        images: variant.images,
        otherAttributes: variant.otherAttributes ?? [],
      };
    }),
  }));

  return {
    sizeLabel: grouped.dimensionTitle,
    colorLabel: secondaryMeta?.title ?? null,
    groups,
  };
}

function buildProductVariantOptions(product, baseUrl, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const activeCombos = (product?.combinations ?? []).filter((combo) =>
    includeInactive ? true : combo.status !== "inactive"
  );

  if (!activeCombos.length) {
    return {
      dimensions: [],
      matrix: [],
      groupedByPrimary: null,
      colors: [],
      sizes: [],
      combinations: [],
    };
  }

  const titleOrder = resolveAttributeTitleOrder(product);
  const dimensionValueMaps = new Map(titleOrder.map((titleId) => [titleId, new Map()]));
  const matrix = [];
  const enrichedCombinations = [];
  const colors = new Map();
  const sizes = new Map();

  for (const combo of activeCombos) {
    const attrs = mapCombinationAttributes(combo);
    const comboImages = resolveComboImages(combo, product, baseUrl);
    const { price, mrp } = resolveComboPricing(combo, product);
    const stock = Number(combo.stock) || 0;
    const inStock = stock > 0;
    const selection = buildSelectionMap(attrs);
    const key = buildCombinationKey(attrs);

    const matrixEntry = {
      sku: combo.sku,
      key,
      price,
      mrp,
      stock,
      inStock,
      status: combo.status || "active",
      images: comboImages,
      selection,
      attributes: attrs.map((attr) => ({
        titleId: attr.titleId,
        title: attr.title,
        type: attr.type,
        valueId: attr.valueId,
        value: attr.value,
        label: attr.label,
        colorCode: attr.colorCode,
      })),
    };

    matrix.push(matrixEntry);
    enrichedCombinations.push({
      sku: combo.sku,
      price,
      mrp,
      stock,
      inStock,
      status: combo.status || "active",
      images: comboImages,
      selection,
      attributes: matrixEntry.attributes,
    });

    for (const attr of attrs) {
      const valueKey = attr.valueId || attr.value;
      if (!valueKey) continue;

      const dimMap = dimensionValueMaps.get(attr.titleId);
      if (dimMap) {
        const current = dimMap.get(valueKey) ?? {
          valueId: attr.valueId,
          value: attr.value,
          label: attr.label,
          colorCode: attr.colorCode || "",
          stock: 0,
          inStock: false,
          image: "",
        };
        current.stock += stock;
        current.inStock = current.inStock || inStock;
        if (!current.image && comboImages[0]) current.image = comboImages[0];
        if (attr.colorCode) current.colorCode = attr.colorCode;
        dimMap.set(valueKey, current);
      }

      if (attr.type === "color") {
        if (!colors.has(valueKey)) {
          colors.set(valueKey, {
            valueId: attr.valueId,
            value: attr.value,
            label: String(attr.value).toUpperCase(),
            colorCode: attr.colorCode || "",
            image: comboImages[0] || "",
            inStock,
            stock,
          });
        } else {
          const colorEntry = colors.get(valueKey);
          colorEntry.inStock = colorEntry.inStock || inStock;
          colorEntry.stock += stock;
          if (!colorEntry.image && comboImages[0]) colorEntry.image = comboImages[0];
        }
      }

      if (attr.type === "size" || attr.type === "option") {
        const sizeKey = `${attr.titleId}:${valueKey}`;
        if (!sizes.has(sizeKey)) {
          sizes.set(sizeKey, {
            titleId: attr.titleId,
            title: attr.title,
            valueId: attr.valueId,
            value: attr.value,
            label: attr.label,
            inStock,
            stock,
          });
        } else {
          const sizeEntry = sizes.get(sizeKey);
          sizeEntry.inStock = sizeEntry.inStock || inStock;
          sizeEntry.stock += stock;
        }
      }
    }
  }

  const dimensions = titleOrder.map((titleId) => {
    const meta = resolveTitleMeta(product, titleId);
    const values = Array.from(dimensionValueMaps.get(titleId)?.values() ?? []);
    return {
      titleId: meta.titleId,
      title: meta.title,
      type: meta.type,
      values,
    };
  });

  const primaryTitleId = resolvePrimaryDimensionTitleId(product);
  const secondaryTitleId = resolveSecondaryDimensionTitleId(product, primaryTitleId);
  let groupedByPrimary = null;

  if (primaryTitleId) {
    const primaryMeta = resolveTitleMeta(product, primaryTitleId);
    const groupsMap = new Map();

    for (const entry of matrix) {
      const primaryAttr = resolveCombinationPrimaryAttr(entry.attributes, primaryTitleId);
      if (!primaryAttr) continue;

      const groupKey = `${primaryAttr.titleId}:${primaryAttr.valueId || primaryAttr.value}`;
      const group =
        groupsMap.get(groupKey) ??
        {
          valueId: primaryAttr.valueId,
          value: primaryAttr.value,
          label: primaryAttr.label,
          dimensionTitleId: primaryAttr.titleId,
          dimensionTitle: primaryAttr.title,
          totalStock: 0,
          inStock: false,
          variants: [],
        };

      group.totalStock += entry.stock;
      group.inStock = group.inStock || entry.inStock;

      const secondaryAttr = resolveCombinationSecondaryAttr(entry.attributes, secondaryTitleId);
      const colorAttr =
        entry.attributes.find((attr) => attr.type === "color") ??
        (secondaryAttr?.type === "color" ? secondaryAttr : null);
      const otherAttributes = entry.attributes.filter(
        (attr) =>
          attr.titleId !== primaryAttr.titleId &&
          attr.titleId !== secondaryAttr?.titleId
      );

      group.variants.push({
        sku: entry.sku,
        key: entry.key,
        price: entry.price,
        mrp: entry.mrp,
        stock: entry.stock,
        inStock: entry.inStock,
        status: entry.status,
        images: entry.images,
        selection: entry.selection,
        label: secondaryAttr?.value ?? primaryAttr.value,
        color: colorAttr
          ? {
              titleId: colorAttr.titleId,
              title: colorAttr.title,
              valueId: colorAttr.valueId,
              value: colorAttr.value,
              label: colorAttr.label,
              colorCode: colorAttr.colorCode || "",
            }
          : null,
        secondary: secondaryAttr
          ? {
              titleId: secondaryAttr.titleId,
              title: secondaryAttr.title,
              type: secondaryAttr.type,
              valueId: secondaryAttr.valueId,
              value: secondaryAttr.value,
              label: secondaryAttr.label,
              colorCode: secondaryAttr.colorCode || "",
            }
          : null,
        otherAttributes,
      });

      groupsMap.set(groupKey, group);
    }

    groupedByPrimary = {
      dimensionTitleId: primaryMeta.titleId,
      dimensionTitle: primaryMeta.title,
      dimensionType: primaryMeta.type,
      groups: Array.from(groupsMap.values()),
    };
  }

  return {
    dimensions,
    matrix,
    groupedByPrimary,
    colors: Array.from(colors.values()),
    sizes: Array.from(sizes.values()),
    combinations: enrichedCombinations,
  };
}

function findAttributeForSelection(attrs, { size, color }, product = null) {
  const normalizedSize = size != null && size !== "" ? String(size).trim() : null;
  const normalizedColor = color != null && color !== "" ? String(color).trim() : null;

  let sizeAttr = null;
  let colorAttr = null;

  const primaryTitleId = product ? resolvePrimaryDimensionTitleId(product) : null;
  const secondaryTitleId = product
    ? resolveSecondaryDimensionTitleId(product, primaryTitleId)
    : null;

  if (normalizedSize) {
    sizeAttr =
      (primaryTitleId
        ? attrs.find((attr) => attr.titleId === primaryTitleId)
        : null) ??
      attrs.find((attr) => attr.type === "size" || attr.titleKey.includes("size")) ??
      attrs.find((attr) => attr.type === "option");
  }

  if (normalizedColor) {
    colorAttr =
      (secondaryTitleId
        ? attrs.find((attr) => attr.titleId === secondaryTitleId)
        : null) ??
      attrs.find((attr) => attr.type === "color" || attr.titleKey.includes("color"));
  }

  return { sizeAttr, colorAttr, normalizedSize, normalizedColor };
}

function combinationMatchesSelection(combination, { size, color } = {}, product = null) {
  const attrs = mapCombinationAttributes(combination);
  const { sizeAttr, colorAttr, normalizedSize, normalizedColor } = findAttributeForSelection(
    attrs,
    { size, color },
    product
  );

  if (normalizedSize) {
    if (!sizeAttr || String(sizeAttr.value) !== normalizedSize) return false;
  }

  if (normalizedColor) {
    if (!colorAttr || String(colorAttr.value) !== normalizedColor) return false;
  }

  return true;
}

module.exports = {
  normalizeTitle,
  getAttributeDimensionType,
  mapCombinationAttributes,
  buildProductVariantOptions,
  buildSimpleVariantView,
  formatSimpleCombination,
  combinationMatchesSelection,
  findAttributeForSelection,
  resolveCombinationPrimaryAttr,
  resolveSecondaryDimensionTitleId,
};

const AttributeTitle = require("../models/other/attributeTitle");
const AttributeValue = require("../models/other/attributeValue");
const AppError = require("./AppError");

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeColorCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new AppError("Invalid color code. Use hex format e.g. #FFFFFF", 400);
  }
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}

function isColorTitle(title) {
  return /color/i.test(String(title || ""));
}

async function findOrCreateAttributeTitle({ categoryId, subCategoryId, title }) {
  const normalizedTitle = normalizeRequired(title);
  if (!normalizedTitle) {
    throw new AppError("Attribute title is required", 400);
  }

  const rx = new RegExp(`^${escapeRegex(normalizedTitle)}$`, "i");
  let attributeTitle = await AttributeTitle.findOne({
    subCategory: subCategoryId,
    title: rx,
  }).lean();

  if (attributeTitle) {
    if (attributeTitle.status !== "active") {
      await AttributeTitle.updateOne({ _id: attributeTitle._id }, { status: "active" });
      attributeTitle.status = "active";
    }
    return { attributeTitle, created: false };
  }

  const created = await AttributeTitle.create({
    title: normalizedTitle,
    category: categoryId,
    subCategory: subCategoryId,
    status: "active",
  });

  const fresh = await AttributeTitle.findById(created._id).lean();
  return { attributeTitle: fresh, created: true };
}

async function findOrCreateAttributeValue({ attributeTitleId, value, colorCode }) {
  const normalizedValue = normalizeRequired(value);
  if (!normalizedValue) {
    throw new AppError("Attribute value is required", 400);
  }

  const titleDoc = await AttributeTitle.findById(attributeTitleId).select("title").lean();
  if (!titleDoc) {
    throw new AppError("Attribute title not found", 404);
  }

  const rx = new RegExp(`^${escapeRegex(normalizedValue)}$`, "i");
  let attributeValue = await AttributeValue.findOne({
    attributeTitle: attributeTitleId,
    value: rx,
  }).lean();

  const nextColorCode = isColorTitle(titleDoc.title) ? normalizeColorCode(colorCode) : "";

  if (attributeValue) {
    if (nextColorCode && attributeValue.colorCode !== nextColorCode) {
      await AttributeValue.updateOne({ _id: attributeValue._id }, { colorCode: nextColorCode });
      attributeValue.colorCode = nextColorCode;
    }
    if (attributeValue.status !== "active") {
      await AttributeValue.updateOne({ _id: attributeValue._id }, { status: "active" });
      attributeValue.status = "active";
    }
    return { attributeValue, created: false };
  }

  const created = await AttributeValue.create({
    attributeTitle: attributeTitleId,
    value: normalizedValue,
    colorCode: nextColorCode,
    status: "active",
  });

  const fresh = await AttributeValue.findById(created._id).lean();
  return { attributeValue: fresh, created: true };
}

async function resolveAttributePair({ categoryId, subCategoryId, title, value, colorCode }) {
  const { attributeTitle } = await findOrCreateAttributeTitle({
    categoryId,
    subCategoryId,
    title: normalizeRequired(title),
  });
  const { attributeValue } = await findOrCreateAttributeValue({
    attributeTitleId: attributeTitle._id,
    value: normalizeRequired(value),
    colorCode,
  });
  return {
    attributeTitleId: attributeTitle._id,
    attributeValueId: attributeValue._id,
  };
}

module.exports = {
  normalizeColorCode,
  isColorTitle,
  findOrCreateAttributeTitle,
  findOrCreateAttributeValue,
  resolveAttributePair,
};

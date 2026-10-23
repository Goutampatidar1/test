/**
 * Short human-readable reference numbers: PREFIX-###### (6 digits).
 * Example: ENQ-482913, BK-739201, ORD-104482
 */

function randomDigits(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function generateSimpleRef(prefix, { digits = 6 } = {}) {
  const clean = String(prefix || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return `${clean}-${randomDigits(digits)}`;
}

/**
 * Allocate a unique ref by checking the model field. Retries on collision.
 * @param {import("mongoose").Model} Model
 * @param {string} field
 * @param {string} prefix
 */
async function allocateUniqueRef(Model, field, prefix, { digits = 6, attempts = 12 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const value = generateSimpleRef(prefix, { digits: i < 8 ? digits : digits + 2 });
    const exists = await Model.exists({ [field]: value });
    if (!exists) return value;
  }
  // Last-resort: prefix + epoch tail (still numeric, unique enough).
  return `${String(prefix).toUpperCase()}-${String(Date.now()).slice(-10)}`;
}

module.exports = {
  generateSimpleRef,
  allocateUniqueRef,
  randomDigits,
};

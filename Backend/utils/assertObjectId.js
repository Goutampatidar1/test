const mongoose = require("mongoose");
const AppError = require("./AppError");

function assertObjectId(id, message = "Invalid id") {
  const normalized = String(id ?? "").trim();
  if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) {
    throw new AppError(message, 400);
  }
  return normalized;
}

module.exports = { assertObjectId };

const config = require("../config");

function multerErrorMessage(err) {
  if (err.code === "LIMIT_FILE_SIZE") {
    return "File is too large";
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE" || err.message === "Unexpected field") {
    const rawField = err.field ? String(err.field).trim() : "";
    const field = rawField ? ` "${rawField}"` : "";
    return `Invalid or unsupported file upload field${field}. Use the field names documented for this API.`;
  }
  return err.message || "File upload failed";
}

exports.errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (!err.statusCode && err.name === "MulterError") {
    statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = multerErrorMessage(err);
  }

  if (!err.statusCode && err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .filter(Boolean)
      .join("; ") || message;
  }

  if (!err.statusCode && err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path || "value"}`;
  }

  const payload = {
    status: false,
    message,
    data: [],
  };

  if (config.nodeEnv === "development" && err.stack) {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};

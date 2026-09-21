/**
 * Standard mobile API envelope: { status, message, data }.
 * status is true when data array has at least one item.
 */

function toDataArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function buildPayload(message, data) {
  const arr = toDataArray(data);
  return {
    status: arr.length > 0,
    message: message || "",
    data: arr,
  };
}

function sendSuccess(res, message, data, statusCode = 200) {
  return res.status(statusCode).json(buildPayload(message, data));
}

function sendError(res, statusCode, message) {
  return res.status(statusCode).json({
    status: false,
    message: message || "Request failed",
    data: [],
  });
}

module.exports = {
  toDataArray,
  buildPayload,
  sendSuccess,
  sendError,
};

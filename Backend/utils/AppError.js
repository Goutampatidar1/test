class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode]
   * @param {string} [errorCode] machine-readable code apps can branch on (e.g. ENQUIRY_REQUIRED)
   */
  constructor(message, statusCode = 400, errorCode = "") {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode || "";
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;

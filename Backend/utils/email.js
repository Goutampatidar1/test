const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.(co\.in|com|in|net)$/i;

function isValidEmail(email) {
  const value = String(email ?? "").trim();
  return Boolean(value) && EMAIL_REGEX.test(value);
}

module.exports = { isValidEmail, EMAIL_REGEX };

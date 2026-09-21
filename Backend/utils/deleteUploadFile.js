const path = require("path");
const fs = require("fs");
const uploadsRoot = require("./uploadsRoot");

const UPLOAD_URL_PREFIX = "/uploads/";

/**
 * Deletes a file stored under ./uploads when `publicUrl` is a local `/uploads/...` path.
 * Ignores external URLs and malformed paths (path traversal safe).
 */
function deleteUploadFileByPublicUrl(publicUrl) {
  if (!publicUrl || typeof publicUrl !== "string") {
    return;
  }
  if (!publicUrl.startsWith(UPLOAD_URL_PREFIX)) {
    return;
  }

  const rel = publicUrl.slice(UPLOAD_URL_PREFIX.length);
  if (!rel || rel.includes("..")) {
    return;
  }

  const abs = path.resolve(uploadsRoot, rel);
  const relativeToRoot = path.relative(uploadsRoot, abs);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return;
  }

  try {
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
  } catch {
    /* ignore unlink errors */
  }
}

module.exports = { deleteUploadFileByPublicUrl };

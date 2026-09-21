/**
 * Resolve multer file from single or fields upload middleware.
 */
function getMulterUploadFile(req) {
  if (req.file) {
    return req.file;
  }
  if (req.files?.file?.[0]) {
    return req.files.file[0];
  }
  if (req.files?.profileImage?.[0]) {
    return req.files.profileImage[0];
  }
  return null;
}

/**
 * Build public URL path for a multer upload saved under uploads/<folder>/.
 */
function publicUploadPathFromFile(req, folder) {
  const file = getMulterUploadFile(req);
  if (!file) {
    return undefined;
  }
  return `/uploads/${folder}/${file.filename}`;
}

module.exports = { publicUploadPathFromFile, getMulterUploadFile };

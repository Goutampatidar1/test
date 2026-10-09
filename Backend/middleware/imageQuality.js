const AppError = require("../utils/AppError");
const { deleteUploadFileByPublicUrl } = require("../utils/deleteUploadFile");
const { normalizeImageFile, classifyImage, isProcessable } = require("../utils/imageNormalize");

function listFiles(req) {
  const payload = req.files;
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Object.values(payload).filter(Array.isArray).flat();
}

function fieldMatches(fieldName, expected) {
  const name = String(fieldName || "").trim();
  return name === expected || name === `${expected}[]` || new RegExp(`^${expected}\\[\\d+\\]$`).test(name);
}

function publicPathOf(file) {
  const folder = String(file.destination || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop();
  return folder ? `/uploads/${folder}/${file.filename}` : "";
}

function discardUploads(files) {
  files.forEach((file) => {
    const publicPath = publicPathOf(file);
    if (publicPath) deleteUploadFileByPublicUrl(publicPath);
  });
}

/**
 * Runs after multer on product / venue uploads:
 *  1. fixes rotation and caps oversized photos (so they render correctly in the apps);
 *  2. classifies each image (thumbnail-suitable / gallery / banner-like / too small);
 *  3. rejects a thumbnail that is too small to display;
 *  4. when no explicit thumbnail is sent, moves the first thumbnail-suitable gallery photo to the front
 *     so it becomes the card image;
 *  5. surfaces advisory `imageWarnings` on the JSON response.
 */
function processListingImages(options = {}) {
  const { thumbnailField = "thumbnail", galleryField = "images", extraFields = ["combinationImages"] } = options;

  return async function listingImageMiddleware(req, res, next) {
    try {
      const files = listFiles(req).filter((f) => String(f.mimetype || "").startsWith("image/") && isProcessable(f.path));
      if (!files.length) return next();

      const thumbnails = files.filter((f) => fieldMatches(f.fieldname, thumbnailField));
      const gallery = files.filter((f) => fieldMatches(f.fieldname, galleryField));
      const extras = files.filter((f) => extraFields.some((name) => fieldMatches(f.fieldname, name)));

      const warnings = [];
      const metaByFile = new Map();
      for (const file of [...thumbnails, ...gallery, ...extras]) {
        metaByFile.set(file, await normalizeImageFile(file, { maxWidth: 1600, maxHeight: 1600 }));
      }

      for (const file of thumbnails) {
        const result = classifyImage(metaByFile.get(file));
        if (result.kind === "low_quality") {
          discardUploads(listFiles(req));
          throw new AppError("Thumbnail is too small. Use an image at least 300px on the shorter side.", 400, "THUMBNAIL_TOO_SMALL");
        }
        result.issues.forEach((issue) => warnings.push({ field: "thumbnail", file: file.originalname, message: issue }));
      }

      gallery.forEach((file) => {
        const result = classifyImage(metaByFile.get(file));
        if (result.kind === "low_quality") {
          warnings.push({ field: "images", file: file.originalname, message: "Image is very small and may look blurry." });
        }
      });

      // no explicit thumbnail: make the best-suited gallery image the first (= card) image
      if (!thumbnails.length && gallery.length > 1 && Array.isArray(req.files)) {
        const best = gallery.find((f) => classifyImage(metaByFile.get(f)).suitableAsThumbnail);
        if (best && best !== gallery[0]) {
          const rest = req.files.filter((f) => f !== best);
          const firstGalleryIndex = rest.indexOf(gallery[0]);
          rest.splice(firstGalleryIndex, 0, best);
          req.files = rest;
        }
      }

      if (warnings.length) {
        req.imageWarnings = warnings;
        const originalJson = res.json.bind(res);
        res.json = (body) =>
          originalJson(body && typeof body === "object" && !Array.isArray(body) ? { ...body, imageWarnings: warnings } : body);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { processListingImages };

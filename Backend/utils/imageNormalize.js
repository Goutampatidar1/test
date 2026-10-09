/**
 * Server-side image helpers built on `sharp` (optional dependency at runtime).
 *
 * - normalizeImageFile: fixes EXIF rotation, strips metadata and caps dimensions so oversized
 *   phone photos render correctly (and load fast) in the apps.
 * - inspectImageFile: reads width/height/aspect so uploads can be classified (thumbnail vs gallery).
 *
 * If sharp cannot be loaded (missing native binary) every helper degrades to a no-op instead of
 * breaking uploads.
 */
const fs = require("fs");
const path = require("path");

let sharpLib;
function getSharp() {
  if (sharpLib !== undefined) return sharpLib;
  try {
    // eslint-disable-next-line global-require
    sharpLib = require("sharp");
    sharpLib.cache(false);
  } catch (err) {
    console.warn(`[image] sharp unavailable, skipping normalisation: ${err.message}`);
    sharpLib = null;
  }
  return sharpLib;
}

const PROCESSABLE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function isProcessable(filePath) {
  return PROCESSABLE_EXT.has(path.extname(String(filePath || "")).toLowerCase());
}

/**
 * Re-encode an uploaded image in place.
 * @param {string|{path:string}} fileOrPath multer file or absolute path
 * @param {{maxWidth?:number,maxHeight?:number,quality?:number}} [opts]
 * @returns {Promise<{width:number,height:number,aspectRatio:number,processed:boolean}|null>}
 */
async function normalizeImageFile(fileOrPath, opts = {}) {
  const filePath = typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.path;
  if (!filePath || !fs.existsSync(filePath)) return null;

  const sharp = getSharp();
  if (!sharp || !isProcessable(filePath)) {
    return inspectImageFile(filePath);
  }

  const { maxWidth = 1600, maxHeight = 1600, quality = 82 } = opts;
  const ext = path.extname(filePath).toLowerCase();
  try {
    let pipeline = sharp(filePath, { failOn: "none" }).rotate(); // honours EXIF orientation
    pipeline = pipeline.resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
    if (ext === ".png") pipeline = pipeline.png({ compressionLevel: 9 });
    else if (ext === ".webp") pipeline = pipeline.webp({ quality });
    else pipeline = pipeline.jpeg({ quality, mozjpeg: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    await fs.promises.writeFile(filePath, data);
    return {
      width: info.width,
      height: info.height,
      aspectRatio: info.height ? Number((info.width / info.height).toFixed(3)) : 0,
      processed: true,
    };
  } catch (err) {
    console.warn(`[image] normalise failed for ${path.basename(filePath)}: ${err.message}`);
    return inspectImageFile(filePath);
  }
}

/** Read dimensions without modifying the file. */
async function inspectImageFile(fileOrPath) {
  const filePath = typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.path;
  if (!filePath || !fs.existsSync(filePath)) return null;
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const meta = await sharp(filePath, { failOn: "none" }).metadata();
    // EXIF orientations 5-8 swap width/height
    const swap = meta.orientation && meta.orientation >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    if (!width || !height) return null;
    return {
      width,
      height,
      aspectRatio: Number((width / height).toFixed(3)),
      processed: false,
    };
  } catch {
    return null;
  }
}

/**
 * Classify an image for product/venue slots.
 *  - thumbnail: square-ish card image (aspect 0.75–1.6, at least 300px on the short side)
 *  - banner: wide (aspect >= 2)
 *  - gallery: anything else that is large enough
 *  - low_quality: too small to display well
 */
function classifyImage(meta) {
  if (!meta) return { kind: "unknown", suitableAsThumbnail: true, issues: [] };
  const { width, height, aspectRatio } = meta;
  const short = Math.min(width, height);
  const issues = [];
  if (short < 200) issues.push("Image is very small; use at least 300px on the shorter side.");
  let kind = "gallery";
  if (aspectRatio >= 2) kind = "banner";
  else if (aspectRatio >= 0.75 && aspectRatio <= 1.6) kind = "thumbnail";
  else if (aspectRatio < 0.75) kind = "portrait";
  if (short < 200) kind = "low_quality";
  const suitableAsThumbnail = kind === "thumbnail";
  if (!suitableAsThumbnail && kind !== "low_quality") {
    issues.push(
      kind === "banner"
        ? "Wide banner-style image — better used as a gallery or banner image, not a card thumbnail."
        : "Tall portrait image — may be cropped as a card thumbnail."
    );
  }
  return { kind, suitableAsThumbnail, issues };
}

module.exports = { normalizeImageFile, inspectImageFile, classifyImage, isProcessable };

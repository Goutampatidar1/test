const multer = require("multer");
const path = require("path");
const fs = require("fs");
const AppError = require("./AppError");
const uploadsRoot = require("./uploadsRoot");

const allowedTypes = [
  // Images
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
];

function createUploader(folderName = "") {
  const uploadPath = folderName ? path.join(uploadsRoot, folderName) : uploadsRoot;

  // Ensure folder exists
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname.replace("[]", "") + "-" + uniqueSuffix + ext);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedTypes.includes(file.mimetype) || ext === ".ico") {
      cb(null, true);
    } else {
      cb(new AppError("Unsupported file type", 400), false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  });
}

module.exports = createUploader;

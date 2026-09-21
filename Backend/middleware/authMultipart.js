const createUploader = require("../utils/fileUploader");

function isMultipartRequest(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  return contentType.includes("multipart/form-data");
}

function optionalMultipart(uploadMiddleware) {
  return (req, res, next) => {
    if (isMultipartRequest(req)) {
      return uploadMiddleware(req, res, (err) => {
        if (err) return next(err);
        next();
      });
    }
    next();
  };
}

const userUpload = createUploader("user").fields([
  { name: "file", maxCount: 1 },
  { name: "profileImage", maxCount: 1 },
]);
const vendorUpload = createUploader("vendor").single("file");
const vendorUploads = createUploader("vendor").fields([
  { name: "file", maxCount: 1 },
  { name: "profileImage", maxCount: 1 },
  { name: "aadhaarCard", maxCount: 1 },
  { name: "aadhaarCardFront", maxCount: 1 },
  { name: "aadhaarCardBack", maxCount: 1 },
  { name: "panCard", maxCount: 1 },
  { name: "panCardFront", maxCount: 1 },
  { name: "shopLogo", maxCount: 1 },
  { name: "shopImages", maxCount: 5 },
  { name: "shop_banner_Images", maxCount: 5 },
  { name: "shopVideos", maxCount: 10 },
  { name: "shopBanner", maxCount: 1 },
]);
/** Vendor mobile register — accepts any multipart file field names from the app */
const vendorRegisterUploads = createUploader("vendor").any();
const venueVendorUploads = createUploader("venue-vendor").fields([
  { name: "file", maxCount: 1 },
  { name: "aadhaarCard", maxCount: 1 },
  { name: "aadhaarCardFront", maxCount: 1 },
  { name: "aadhaarCardBack", maxCount: 1 },
  { name: "panCard", maxCount: 1 },
]);
const adminUpload = createUploader("admin").single("file");
const deliveryUpload = createUploader("delivery").single("file");
/** Driver mobile profile/documents — accept any multipart file field (trimmed in controller). */
const deliveryAnyUploads = createUploader("delivery").any();
const deliveryUploads = createUploader("delivery").fields([
  { name: "file", maxCount: 1 },
  { name: "profileImage", maxCount: 1 },
  { name: "profile_image", maxCount: 1 },
  { name: "drivingLicenseFront", maxCount: 1 },
  { name: "drivingLicenseBack", maxCount: 1 },
  { name: "drivingLicense", maxCount: 1 },
  { name: "driving_license_front", maxCount: 1 },
  { name: "driving_license", maxCount: 1 },
  { name: "driving_license_back", maxCount: 1 },
  { name: "aadhaarCard", maxCount: 1 },
  { name: "aadhaarCardFront", maxCount: 1 },
  { name: "aadhaarCardBack", maxCount: 1 },
  { name: "aadharCard", maxCount: 1 },
  { name: "aadharCardFront", maxCount: 1 },
  { name: "aadharCardBack", maxCount: 1 },
  { name: "aadhar_card", maxCount: 1 },
  { name: "aadhaar_card", maxCount: 1 },
]);
const categoryUpload = createUploader("category").single("file");
const vendorCategoryUpload = createUploader("category").fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "categoryImage", maxCount: 1 },
]);
const subCategoryUpload = createUploader("sub-category").single("file");
const vendorSubCategoryUpload = createUploader("sub-category").fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "subCategoryImage", maxCount: 1 },
]);
const childCategoryUpload = createUploader("child-category").single("file");
const vendorChildCategoryUpload = createUploader("child-category").any();
const bannerUpload = createUploader("banner").single("file");
const promotionUpload = createUploader("promotion").single("file");
const notificationUpload = createUploader("notification").single("file");
const productUploads = createUploader("product").any();
/** Vendor add product — images, videos, combination images (validated in controller) */
const vendorProductUploads = createUploader("product").any();
const venueUploads = createUploader("venue").any();
const amenitiesUpload = createUploader("amenities").single("file");
const productVideoFeedUploads = createUploader("product-video-feed").fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);
const venueVideoFeedUploads = createUploader("venue-video-feed").fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

exports.optionalUserFile = optionalMultipart(userUpload);
exports.optionalVendorFile = optionalMultipart(vendorUpload);
exports.optionalVendorFiles = optionalMultipart(vendorUploads);
exports.optionalVendorRegisterFiles = optionalMultipart(vendorRegisterUploads);
exports.optionalVenueVendorFiles = optionalMultipart(venueVendorUploads);
exports.optionalAdminFile = optionalMultipart(adminUpload);
exports.optionalDeliveryBoyFile = optionalMultipart(deliveryUpload);
exports.optionalDeliveryBoyFiles = optionalMultipart(deliveryUploads);
exports.optionalDeliveryBoyProfileFiles = optionalMultipart(deliveryAnyUploads);
exports.optionalDeliveryBoyDocumentFiles = optionalMultipart(deliveryAnyUploads);
exports.optionalCategoryFile = optionalMultipart(categoryUpload);
exports.optionalVendorCategoryFile = optionalMultipart(vendorCategoryUpload);
exports.optionalSubCategoryFile = optionalMultipart(subCategoryUpload);
exports.optionalVendorSubCategoryFile = optionalMultipart(vendorSubCategoryUpload);
exports.optionalChildCategoryFile = optionalMultipart(childCategoryUpload);
exports.optionalVendorChildCategoryFile = optionalMultipart(vendorChildCategoryUpload);
exports.optionalBannerFile = optionalMultipart(bannerUpload);
exports.optionalPromotionFile = optionalMultipart(promotionUpload);
exports.optionalNotificationFile = optionalMultipart(notificationUpload);
exports.optionalProductFiles = optionalMultipart(productUploads);
exports.optionalVendorProductFiles = optionalMultipart(vendorProductUploads);
exports.optionalVenueFiles = optionalMultipart(venueUploads);
exports.optionalAmenitiesFile = optionalMultipart(amenitiesUpload);
exports.optionalProductVideoFeedFiles = optionalMultipart(productVideoFeedUploads);
exports.optionalVenueVideoFeedFiles = optionalMultipart(venueVideoFeedUploads);
exports.optionalAdminVideoFeedFiles = optionalMultipart(
  createUploader("video-feed").fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ])
);

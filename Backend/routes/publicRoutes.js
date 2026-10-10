const express = require("express");
const publicAppConfigController = require("../controllers/publicControllers/publicAppConfigController");
const mobileAppSettingsController = require("../controllers/publicControllers/mobileAppSettingsController");
const publicCatalogController = require("../controllers/publicControllers/publicCatalogController");
const publicHotDealsController = require("../controllers/publicControllers/publicHotDealsController");
const publicHomeFeedController = require("../controllers/publicControllers/publicHomeFeedController");
const publicVideoFeedController = require("../controllers/publicControllers/publicVideoFeedController");
const publicProductRatingController = require("../controllers/publicControllers/publicProductRatingController");
const publicVenueRatingController = require("../controllers/publicControllers/publicVenueRatingController");
const publicDeliveryBoyRatingController = require("../controllers/publicControllers/publicDeliveryBoyRatingController");
const publicVendorProfileController = require("../controllers/publicControllers/publicVendorProfileController");
const nearbyVendorController = require("../controllers/userControllers/nearbyVendorController");
const locationController = require("../controllers/vendorControllers/locationController");
const { optionalProtectUser } = require("../middleware/auth");

const router = express.Router();

router.get("/app-config", publicAppConfigController.getPublicAppConfig);
router.get("/app-settings", mobileAppSettingsController.getAppSettings);
router.get("/ecom-availability", publicAppConfigController.getEcomAvailability);

// Mobile / storefront catalog (no auth)
router.get("/home", publicCatalogController.getHome);
router.get("/home/feed", optionalProtectUser, publicHomeFeedController.getHomeFeed);
router.get("/hot-deals", optionalProtectUser, publicHotDealsController.listHotDeals);
router.get("/home/hot-deals", optionalProtectUser, publicHotDealsController.listHotDeals);
router.get("/banners", publicCatalogController.listBanners);
router.get("/home/banners", publicCatalogController.listBanners);
router.get("/venue-types", publicCatalogController.listVenueTypes);
router.get("/home/venue-types", publicCatalogController.listVenueTypes);
router.get("/venue-types/all", publicCatalogController.listAllVenueTypes);
router.get("/available-venues", publicCatalogController.listAllVenueTypes);
router.get("/venues", publicCatalogController.listVenues);
// Category id at end of path (preferred for mobile)
router.get("/category-venues/:categoryId", publicCatalogController.listVenues);
// Legacy — id between /categories/ and /venues
router.get("/categories/:categoryId/venues", publicCatalogController.listVenues);
router.get("/venues/:id", publicCatalogController.getVenueById);
router.get("/states", locationController.listStates);
router.get("/cities", locationController.listCities);
router.get("/states/:stateId/cities", locationController.listCities);
router.get("/sub-districts", locationController.listSubDistricts);
router.get("/cities/:cityId/sub-districts", locationController.listSubDistricts);

router.get("/categories", publicCatalogController.listCategories);
router.get("/nearby-vendors", optionalProtectUser, nearbyVendorController.listNearbyVendors);
router.get("/vendors", optionalProtectUser, nearbyVendorController.listAllVendors);
router.get("/vendors/all", optionalProtectUser, nearbyVendorController.listAllVendors);
router.get("/sub-categories", publicCatalogController.listSubCategories);
router.get("/product-video-feeds", optionalProtectUser, publicVideoFeedController.listVideoFeeds);
router.get("/video-feeds", optionalProtectUser, publicVideoFeedController.listVideoFeeds);
router.get("/product-video-feed/:feedId", optionalProtectUser, publicVideoFeedController.getVideoFeedById);
router.get("/video-feed/:feedId", optionalProtectUser, publicVideoFeedController.getVideoFeedById);

router.get("/product-filter-categories", publicCatalogController.listProductFilterCategories);
router.get("/product-filter-options", publicCatalogController.getProductFilterOptions);
router.get("/product-reviews/:productId", publicProductRatingController.listProductRatings);
router.get("/product-ratings/:productId", publicProductRatingController.listProductRatings);
router.get("/venue-reviews/:venueId", publicVenueRatingController.listVenueRatings);
router.get("/venue-ratings/:venueId", publicVenueRatingController.listVenueRatings);
router.get("/driver-reviews/:deliveryBoyId", publicDeliveryBoyRatingController.listDriverRatings);
router.get("/driver-ratings/:deliveryBoyId", publicDeliveryBoyRatingController.listDriverRatings);
router.get("/sub-categories/:subCategoryId/products", optionalProtectUser, publicCatalogController.listProducts);
router.get("/products", optionalProtectUser, publicCatalogController.listProducts);
router.get("/vendor-profile/:vendorId", publicVendorProfileController.getVendorProfile);
router.get("/vendor-products/:vendorId", optionalProtectUser, publicVendorProfileController.listVendorProducts);
router.get("/product-detail/:productId", optionalProtectUser, publicCatalogController.getProductDetail);
router.get("/products/slug/:slug", optionalProtectUser, publicCatalogController.getProductBySlug);
router.get("/products/:id", optionalProtectUser, publicCatalogController.getProductById);
router.get("/amenities", publicCatalogController.listAmenities);
router.get("/faq", publicCatalogController.listFaqs);

const publicStaticPageController = require("../controllers/publicControllers/publicStaticPageController");
const publicAccountController = require("../controllers/publicControllers/publicAccountController");
const legalPageController = require("../controllers/publicControllers/legalPageController");

router.get("/pages", publicStaticPageController.listPages);
router.get("/pages/:slug", publicStaticPageController.getPageBySlug);

/** Play Store legal HTML pages (served via /api proxy — works without Apache root rewrite). */
router.get("/privacy-policy", legalPageController.renderPrivacyPolicy);
router.get("/vendor/privacy-policy", legalPageController.renderVendorPrivacyPolicy);
router.get("/delivery/privacy-policy", legalPageController.renderDeliveryPrivacyPolicy);
router.get("/driver/privacy-policy", legalPageController.renderDeliveryPrivacyPolicy);

router.get("/delete-account", legalPageController.renderDeleteAccount);
router.get("/vendor/delete-account", legalPageController.renderVendorDeleteAccount);
router.get("/delivery/delete-account", legalPageController.renderDeliveryDeleteAccount);
router.get("/driver/delete-account", legalPageController.renderDeliveryDeleteAccount);

/** Play Store: delete accounts by mobile (no auth token). */
router.post("/account/delete", publicAccountController.deleteAccountByMobile);
router.post("/delete-account", publicAccountController.deleteAccountByMobile);
router.post("/vendor/account/delete", publicAccountController.deleteVendorAccountByMobile);
router.post("/vendor/delete-account", publicAccountController.deleteVendorAccountByMobile);
router.post("/delivery/account/delete", publicAccountController.deleteDeliveryAccountByMobile);
router.post("/delivery/delete-account", publicAccountController.deleteDeliveryAccountByMobile);
router.post("/driver/account/delete", publicAccountController.deleteDeliveryAccountByMobile);
router.post("/driver/delete-account", publicAccountController.deleteDeliveryAccountByMobile);

module.exports = router;

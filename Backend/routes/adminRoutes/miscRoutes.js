const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const appConfigController = require("../../controllers/adminControllers/appConfigController");
const staticPageController = require("../../controllers/adminControllers/staticPageController");
const staticPageLayoutController = require("../../controllers/adminControllers/staticPageLayoutController");

const router = express.Router();

router.use(protectAdmin);

/** App settings (singleton document) */
router.get("/app-config", appConfigController.getAppConfig);
router.post(
  "/app-config",
  appConfigController.uploadAppConfigFiles,
  appConfigController.createAppConfig
);
router.patch(
  "/app-config",
  appConfigController.uploadAppConfigFiles,
  appConfigController.updateAppConfig
);

/** CMS static pages */
router.post("/pages", staticPageController.createPage);
router.get("/pages", staticPageController.getAllPages);
router.get("/pages/slug/:slug", staticPageController.getPageBySlug);
router.get("/pages/:id", staticPageController.getPageById);
router.patch("/pages/:id", staticPageController.updatePage);
router.delete("/pages/:id", staticPageController.deletePage);

/** Static page header/footer layout per app */
router.get("/static-page-layouts", staticPageLayoutController.listLayouts);
router.get("/static-page-layout/:app", staticPageLayoutController.getLayout);
router.patch("/static-page-layout/:app", staticPageLayoutController.updateLayout);

module.exports = router;

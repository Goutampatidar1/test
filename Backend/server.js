require("dotenv").config({ override: true });

const express = require("express");
const cors = require("cors");

const config = require("./config");
const connectDatabase = require("./config/db");
const routes = require("./routes");
const publicStaticPageController = require("./controllers/publicControllers/publicStaticPageController");
const { notFound } = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors());

const jsonParser = express.json();
app.use((req, res, next) => {
  jsonParser(req, res, (err) => {
    if (err?.type === "entity.parse.failed" && /Unexpected end of JSON/i.test(err.message)) {
      req.body = {};
      return next();
    }
    if (err) return next(err);
    next();
  });
});

app.use(express.urlencoded({ extended: true }));

const uploadsDir = require("./utils/uploadsRoot");
app.use("/uploads", express.static(uploadsDir));
// Same files via /api so Apache ProxyPass /api (which already works) can serve images
// when /uploads on port 443 is missing or returns 502.
app.use("/api/uploads", express.static(uploadsDir));

/** In-app WebView URLs for CMS static pages — /view/:app/:slug */
app.get("/view/:app/:slug", publicStaticPageController.renderPageView);

/** Play Store legal pages (no CMS required) */
const legalPageController = require("./controllers/publicControllers/legalPageController");
app.get("/privacy-policy", legalPageController.renderPrivacyPolicy);
app.get("/vendor/privacy-policy", legalPageController.renderVendorPrivacyPolicy);
app.get("/delivery/privacy-policy", legalPageController.renderDeliveryPrivacyPolicy);
app.get("/driver/privacy-policy", legalPageController.renderDeliveryPrivacyPolicy);
app.get("/delete-account", legalPageController.renderDeleteAccount);
app.get("/vendor/delete-account", legalPageController.renderVendorDeleteAccount);
app.get("/delivery/delete-account", legalPageController.renderDeliveryDeleteAccount);
app.get("/driver/delete-account", legalPageController.renderDeliveryDeleteAccount);

/** Deploy/build probe — confirms which folder the live Node process loaded. */
const API_BUILD = "https-5017-restored-2026-10-17";
let listenInfo = null;
app.get("/api/__build", (req, res) => {
  res.json({
    ok: true,
    apiBuild: API_BUILD,
    cwd: process.cwd(),
    filename: __filename,
    dirname: __dirname,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    listen: listenInfo,
  });
});

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await connectDatabase();

    // HTTP + HTTPS on :5017 (matched cPanel cert/key). Apache/health use HTTP; Flutter uses HTTPS.
    const { listenHttpAndMaybeHttps } = require("./utils/sslListen");
    await listenHttpAndMaybeHttps(app, {
      port: config.port,
      onListening: (info) => {
        listenInfo = info;
        console.log(
          `Server listening [${API_BUILD}] mode=${info.mode}` +
            (info.http ? ` http=${info.http}` : "") +
            (info.https ? ` https=${info.https}` : "") +
            ` cwd=${process.cwd()}`
        );
        require("./utils/scheduler").startScheduler();
      },
    });
  } catch (err) {
    console.error("Error starting server:", err.message);
    process.exit(1);
  }
}

start();

module.exports = app;

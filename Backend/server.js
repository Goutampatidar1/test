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

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await connectDatabase();

    app.listen(config.port, "0.0.0.0", () => {
      console.log(`Server running on port ${config.port}`);
    });
  } catch (err) {
    console.error("Error starting server:", err.message);
    process.exit(1);
  }
}

start();

module.exports = app;

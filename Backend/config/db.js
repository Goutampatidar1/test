const mongoose = require("mongoose");
const config = require("./index");

const connectDatabase = async () => {
  if (!config.mongodbUri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to your .env (see .env.example)."
    );
  }

  try {
    await mongoose.connect(config.mongodbUri);
    const { ensureUserEmailSparseIndex } = require("../utils/ensureUserEmailIndex");
    const { ensureVendorEmailSparseIndex } = require("../utils/ensureVendorEmailIndex");
    const { ensureVenueVendorEmailSparseIndex } = require("../utils/ensureVenueVendorEmailIndex");
    const { ensureAdminProductsApproved } = require("../utils/ensureAdminProductsApproved");
    const { ensureStaticPagesHaveApp } = require("../utils/staticPage");
    const { ensureStaticPageSlugIndex } = require("../utils/ensureStaticPageSlugIndex");
    const { ensurePromotionPromoCodeIndex } = require("../utils/ensurePromotionPromoCodeIndex");
    const Page = require("../models/bussiness/page");
    await ensureUserEmailSparseIndex();
    await ensureVendorEmailSparseIndex();
    await ensureVenueVendorEmailSparseIndex();
    await ensureAdminProductsApproved();
    await ensureStaticPagesHaveApp(Page);
    await ensureStaticPageSlugIndex(Page);
    await ensurePromotionPromoCodeIndex();
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    throw err;
  }
};

module.exports = connectDatabase;

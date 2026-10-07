const Wishlist = require("../models/other/wishlist");
const VenueWishlist = require("../models/other/venueWishlist");
const Cart = require("../models/other/cart");
const VenueCart = require("../models/other/venueCart");
const Product = require("../models/other/product");
const Venue = require("../models/other/venue");
const { getFeatureSettings } = require("./appFeatureSettings");
const { deliverAppNotification } = require("./appNotify");
const { getActiveVenueDiscount } = require("./venueDiscount");

const HOUR_MS = 60 * 60 * 1000;
const MAX_AUDIENCE = 1000;

function productPercentOff(product) {
  const value = Number(product?.discountValue) || 0;
  if (value <= 0) return 0;
  if (product.discountType === "flat") {
    const price = Number(product.price) || 0;
    return price > 0 ? Math.round((value / price) * 100) : 0;
  }
  return Math.round(value);
}

function uniqueIds(ids) {
  return [...new Set(ids.map(String))].slice(0, MAX_AUDIENCE);
}

async function productAudience(productId) {
  const [wishlists, carts] = await Promise.all([
    Wishlist.find({ products: productId }).select("user").limit(MAX_AUDIENCE).lean(),
    Cart.find({ "items.product": productId }).select("user").limit(MAX_AUDIENCE).lean(),
  ]);
  return uniqueIds([...wishlists, ...carts].map((row) => row.user));
}

async function venueAudience(venueId) {
  const [wishlists, carts] = await Promise.all([
    VenueWishlist.find({ venues: venueId }).select("user").limit(MAX_AUDIENCE).lean(),
    VenueCart.find({ "items.venue": venueId }).select("user").limit(MAX_AUDIENCE).lean(),
  ]);
  return uniqueIds([...wishlists, ...carts].map((row) => row.user));
}

async function cooldownPassed(doc, settings) {
  if (!doc?.lastDiscountNotifiedAt) return true;
  const elapsed = Date.now() - new Date(doc.lastDiscountNotifiedAt).getTime();
  return elapsed >= settings.discountAlertCooldownHours * HOUR_MS;
}

async function sendToUsers(userIds, { title, message, metadata }) {
  let sent = 0;
  for (const userId of userIds) {
    try {
      await deliverAppNotification({
        recipientType: "user",
        recipientId: userId,
        type: "discount_alert",
        title,
        message,
        metadata,
      });
      sent += 1;
    } catch (error) {
      console.error("[discount-alert]", error?.message || error);
    }
  }
  return sent;
}

/** Tell users who wishlisted / carted this product that it just got cheaper. */
async function alertProductDiscount(productId, { force = false } = {}) {
  const product = await Product.findById(productId)
    .select("name price discountType discountValue status adminApproved lastDiscountNotifiedAt")
    .lean();
  if (!product || product.status !== "active" || !product.adminApproved) return 0;

  const settings = await getFeatureSettings();
  const percent = productPercentOff(product);
  if (!force && percent < settings.discountAlertMinPercent) return 0;
  if (!force && !(await cooldownPassed(product, settings))) return 0;

  const audience = await productAudience(product._id);
  if (!audience.length) return 0;

  await Product.updateOne({ _id: product._id }, { $set: { lastDiscountNotifiedAt: new Date() } });
  return sendToUsers(audience, {
    title: `${percent}% off on ${product.name}`,
    message: `${product.name} now has a discount. Grab it before it ends!`,
    metadata: {
      event: "discount_alert",
      kind: "product",
      productId: String(product._id),
      percentOff: percent,
      linkPath: `/products/${product._id}`,
    },
  });
}

/** Tell users who saved this venue that the vendor just offered a discount. */
async function alertVenueDiscount(venueId, { force = false } = {}) {
  const venue = await Venue.findById(venueId).lean();
  if (!venue || venue.status !== "active" || !venue.adminApproved) return 0;

  const discount = getActiveVenueDiscount(venue);
  if (!discount) return 0;

  const settings = await getFeatureSettings();
  if (!force && discount.percentOff < settings.discountAlertMinPercent) return 0;
  if (!force && !(await cooldownPassed(venue, settings))) return 0;

  const audience = await venueAudience(venue._id);
  if (!audience.length) return 0;

  await Venue.updateOne({ _id: venue._id }, { $set: { lastDiscountNotifiedAt: new Date() } });
  const endsText = discount.endsAt
    ? ` Offer ends ${new Date(discount.endsAt).toLocaleDateString("en-IN")}.`
    : "";
  return sendToUsers(audience, {
    title: `${discount.label} at ${venue.name}`,
    message: `${venue.name} is now ${discount.label}.${endsText}`,
    metadata: {
      event: "discount_alert",
      kind: "venue",
      venueId: String(venue._id),
      percentOff: discount.percentOff,
      linkPath: `/venues/${venue._id}`,
    },
  });
}

function queueDiscountAlert(task) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((error) => console.error("[discount-alert]", error?.message || error));
  });
}

module.exports = {
  alertProductDiscount,
  alertVenueDiscount,
  queueDiscountAlert,
  productPercentOff,
};

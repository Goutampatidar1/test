const { AppConfig, Page } = require("../models");
const Faq = require("../models/other/faq");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const {
  mergePaymentMethods,
  toPublicEcomFlow,
  FALLBACK_SHIPPING_CHARGE,
} = require("./appCommerceSettings");
const { toPublicVendorDocuments } = require("./vendorDocumentSettings");
const { formatInrAmount } = require("./publicProductList");
const {
  normalizeStaticPageApp,
  buildStaticPageAppFilter,
  buildStaticPageApiUrl,
  buildStaticPageViewUrl,
} = require("./staticPage");

const PAYMENT_METHOD_LABELS = {
  cod: "Cash On Delivery",
  online: "Online Payment",
  wallet: "Wallet",
};

const MOBILE_APP_KEYS = ["user", "vendor", "venue_vendor", "delivery"];

function normalizeMobileApp(value) {
  const staticApp = normalizeStaticPageApp(value);
  if (staticApp) return staticApp;

  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (key === "delivery" || key === "deliveryboy" || key === "delivery_boy") {
    return "delivery";
  }
  return null;
}

function resolveLogoPath(config, app) {
  if (app === "user") {
    return config?.user_logo || config?.admin_logo || "";
  }
  return config?.admin_logo || config?.user_logo || "";
}

function resolveShippingCharge(config) {
  const value = Number(config?.shipping_charge);
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }
  return FALLBACK_SHIPPING_CHARGE;
}

async function listStaticPagesForApp(app, baseUrl) {
  const normalizedApp = normalizeMobileApp(app) || "user";
  const appFilter = buildStaticPageAppFilter(normalizedApp);
  if (!appFilter) return [];

  const pages = await Page.find({ status: "active", ...appFilter })
    .select("title slug")
    .sort({ title: 1 })
    .lean();

  return pages.map((page) => ({
    title: page.title,
    slug: page.slug,
    apiUrl: buildStaticPageApiUrl(baseUrl, normalizedApp, page.slug),
    viewUrl: buildStaticPageViewUrl(baseUrl, normalizedApp, page.slug),
  }));
}

async function listActiveFaqs() {
  const faqs = await Faq.find({ status: "active" })
    .select("question answer")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return faqs.map((row) => ({
    _id: row._id,
    question: row.question,
    answer: row.answer,
  }));
}

function isOnlinePaymentActive(config) {
  return mergePaymentMethods(config?.payment_methods).some(
    (row) => row.type === "online" && row.isActive,
  );
}

function resolveRazorpayPublicSettings(config) {
  if (!isOnlinePaymentActive(config)) {
    return { isActive: false, keyId: "" };
  }

  const gateways = Array.isArray(config?.payment_gateways) ? config.payment_gateways : [];
  const razorpay = gateways.find((row) => row?.provider === "razorpay");
  if (!razorpay) {
    return { isActive: false, keyId: "" };
  }

  const keyId = String(razorpay.credentials?.key_id || "").trim();
  return {
    isActive: !!keyId,
    keyId,
  };
}

async function buildMobileAppSettings(app, baseUrl) {
  const normalizedApp = normalizeMobileApp(app) || "user";
  const config = await AppConfig.findOne().lean();
  if (!config) return null;

  const shippingCharge = resolveShippingCharge(config);

  const paymentMethods = mergePaymentMethods(config.payment_methods).map((row) => ({
    type: row.type,
    label: PAYMENT_METHOD_LABELS[row.type] || row.type,
    isActive: row.isActive,
  }));

  const onlinePaymentActive = isOnlinePaymentActive(config);

  const paymentGateways = Array.isArray(config.payment_gateways)
    ? config.payment_gateways.map(({ provider, isActive, credentials }) => {
        const gatewayActive = provider === "razorpay" ? onlinePaymentActive : !!isActive;
        const row = {
          provider,
          isActive: gatewayActive,
        };
        if (provider === "razorpay" && gatewayActive) {
          row.keyId = String(credentials?.key_id || "").trim();
        }
        return row;
      })
    : [];

  const razorpay = resolveRazorpayPublicSettings(config);

  const settings = {
    app: normalizedApp,
    appName: config.app_name,
    appDetail: config.app_detail ?? "",
    appDetails: config.app_details ?? "",
    appFooterText: config.app_footer_text ?? "",
    logo: toAbsoluteUploadUrl(resolveLogoPath(config, normalizedApp), baseUrl),
    favicon: toAbsoluteUploadUrl(config.favicon ?? "", baseUrl),
    contact: {
      email: config.app_email,
      mobile: config.app_mobile,
      address: config.address ?? "",
      latitude: config.latitude ?? "",
      longitude: config.longitude ?? "",
    },
    social: {
      facebook: config.facebook ?? "",
      twitter: config.twitter ?? "",
      instagram: config.instagram ?? "",
      linkedin: config.linkedin ?? "",
    },
    shippingCharge,
    shippingChargeLabel: formatInrAmount(shippingCharge),
    paymentMethods,
    paymentGateways,
    razorpay,
    ecomFlow: toPublicEcomFlow(config),
    staticPages: await listStaticPagesForApp(normalizedApp, baseUrl),
    faqs: await listActiveFaqs(),
    updatedAt: config.updatedAt,
  };

  if (normalizedApp === "vendor" || normalizedApp === "venue_vendor") {
    settings.documents = toPublicVendorDocuments(config.documents);
  }

  return settings;
}

function resolveAppFromRequest(req) {
  const mount = String(req.baseUrl || "").toLowerCase();

  if (mount.includes("venue-vendor")) return "venue_vendor";
  if (mount.endsWith("/vendor")) return "vendor";
  if (mount.includes("/delivery")) return "delivery";
  if (mount.includes("/user")) return "user";

  return normalizeMobileApp(req.query.app) || "user";
}

module.exports = {
  MOBILE_APP_KEYS,
  PAYMENT_METHOD_LABELS,
  normalizeMobileApp,
  resolveRazorpayPublicSettings,
  buildMobileAppSettings,
  resolveAppFromRequest,
};

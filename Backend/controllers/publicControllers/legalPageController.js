const path = require("path");
const fs = require("fs");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getStaticPageBranding } = require("../../utils/staticPage");

const LEGAL_DIR = path.join(__dirname, "../../public/legal");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadTemplate(fileName) {
  const filePath = path.join(LEGAL_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new AppError("Page template not found", 500);
  }
  return fs.readFileSync(filePath, "utf8");
}

function renderTemplate(html, vars) {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ""));
  }
  return out;
}

function legalPageUrls(baseUrl) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return {
    userPrivacyUrl: `${base}/api/public/privacy-policy`,
    vendorPrivacyUrl: `${base}/api/public/vendor/privacy-policy`,
    deliveryPrivacyUrl: `${base}/api/public/delivery/privacy-policy`,
    userDeleteUrl: `${base}/api/public/delete-account`,
    vendorDeleteUrl: `${base}/api/public/vendor/delete-account`,
    deliveryDeleteUrl: `${base}/api/public/delivery/delete-account`,
    userDeleteApiUrl: `${base}/api/public/account/delete`,
    vendorDeleteApiUrl: `${base}/api/public/vendor/account/delete`,
    deliveryDeleteApiUrl: `${base}/api/public/delivery/account/delete`,
  };
}

const PRIVACY_COPY = {
  user: {
    appRole: "User",
    appRoleLower: "user",
    leadText: "How we collect, use, and protect your information when you use the customer app.",
    collectIntro: "When you use the customer app, we may collect:",
    collectItems: [
      "Name, mobile number, email, and profile photo",
      "Delivery / shipping addresses",
      "Order and booking history",
      "Device and app usage information needed for notifications",
    ],
    useItems: [
      "To create and manage your customer account",
      "To process orders, bookings, and payments",
      "To send OTPs, order updates, and support messages",
      "To improve app performance and prevent fraud",
    ],
    shareText:
      "We may share necessary information with vendors, delivery partners, and payment providers only to complete your transactions. We do not sell your personal data.",
  },
  vendor: {
    appRole: "Vendor",
    appRoleLower: "vendor",
    leadText: "How we collect, use, and protect your information when you use the vendor / seller app.",
    collectIntro: "When you use the vendor app, we may collect:",
    collectItems: [
      "Business / shop name, owner name, mobile number, and email",
      "KYC documents (for example Aadhaar / PAN) and shop media",
      "Product listings, orders, wallet, and payout details",
      "Device and app usage information needed for notifications",
    ],
    useItems: [
      "To create and manage your vendor account",
      "To list products, receive orders, and process payouts",
      "To send OTPs, order alerts, and support messages",
      "To verify identity, improve performance, and prevent fraud",
    ],
    shareText:
      "We may share necessary order and delivery details with customers, delivery partners, and payment providers to fulfill sales. We do not sell your personal or business data.",
  },
  delivery: {
    appRole: "Delivery Partner",
    appRoleLower: "delivery partner",
    leadText: "How we collect, use, and protect your information when you use the driver / delivery partner app.",
    collectIntro: "When you use the delivery partner app, we may collect:",
    collectItems: [
      "Name, mobile number, email, and profile photo",
      "Driving license and vehicle-related documents",
      "Delivery assignment, location (while on duty), and earnings history",
      "Device and app usage information needed for notifications",
    ],
    useItems: [
      "To create and manage your delivery partner account",
      "To assign deliveries and track completion",
      "To send OTPs, job alerts, and support messages",
      "To verify identity, improve performance, and prevent fraud",
    ],
    shareText:
      "We may share necessary delivery details with customers and vendors to complete orders. We do not sell your personal data.",
  },
};

function listItemsHtml(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n        ");
}

async function renderPrivacyPage(req, res, roleKey) {
  const copy = PRIVACY_COPY[roleKey] || PRIVACY_COPY.user;
  const baseUrl = getPublicBaseUrl(req);
  const branding = await getStaticPageBranding(roleKey === "user" ? "user" : roleKey === "vendor" ? "vendor" : "delivery", baseUrl);
  const urls = legalPageUrls(baseUrl);
  const deleteUrl =
    roleKey === "vendor" ? urls.vendorDeleteUrl : roleKey === "delivery" ? urls.deliveryDeleteUrl : urls.userDeleteUrl;

  const contactBits = [];
  if (branding.email) contactBits.push(` at ${branding.email}`);
  if (branding.mobile) contactBits.push(` or ${branding.mobile}`);

  const html = renderTemplate(loadTemplate("privacy-policy.html"), {
    APP_NAME: escapeHtml(branding.appName || "OHO E-BAZAR"),
    APP_ROLE: escapeHtml(copy.appRole),
    APP_ROLE_LOWER: escapeHtml(copy.appRoleLower),
    YEAR: String(new Date().getFullYear()),
    LEAD_TEXT: escapeHtml(copy.leadText),
    COLLECT_INTRO: escapeHtml(copy.collectIntro),
    COLLECT_ITEMS: listItemsHtml(copy.collectItems),
    USE_ITEMS: listItemsHtml(copy.useItems),
    SHARE_TEXT: escapeHtml(copy.shareText),
    SUPPORT_CONTACT: escapeHtml(contactBits.join("") || " through the app"),
    DELETE_ACCOUNT_URL: deleteUrl,
    BASE_URL: escapeHtml(baseUrl),
  });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

async function renderDeletePage(req, res, { accountType, deleteApiUrl, privacyPolicyUrl }) {
  const baseUrl = getPublicBaseUrl(req);
  const branding = await getStaticPageBranding("user", baseUrl);
  const html = renderTemplate(loadTemplate("delete-account.html"), {
    APP_NAME: escapeHtml(branding.appName || "OHO E-BAZAR"),
    YEAR: String(new Date().getFullYear()),
    SUPPORT_EMAIL: escapeHtml(branding.email || ""),
    ACCOUNT_TYPE: escapeHtml(accountType),
    API_DELETE_URL_JSON: JSON.stringify(deleteApiUrl),
    PRIVACY_POLICY_URL: privacyPolicyUrl,
    BASE_URL: escapeHtml(baseUrl),
  });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

exports.renderPrivacyPolicy = asyncHandler(async (req, res) => {
  await renderPrivacyPage(req, res, "user");
});

exports.renderVendorPrivacyPolicy = asyncHandler(async (req, res) => {
  await renderPrivacyPage(req, res, "vendor");
});

exports.renderDeliveryPrivacyPolicy = asyncHandler(async (req, res) => {
  await renderPrivacyPage(req, res, "delivery");
});

exports.renderDeleteAccount = asyncHandler(async (req, res) => {
  const urls = legalPageUrls(getPublicBaseUrl(req));
  await renderDeletePage(req, res, {
    accountType: "user",
    deleteApiUrl: urls.userDeleteApiUrl,
    privacyPolicyUrl: urls.userPrivacyUrl,
  });
});

exports.renderVendorDeleteAccount = asyncHandler(async (req, res) => {
  const urls = legalPageUrls(getPublicBaseUrl(req));
  await renderDeletePage(req, res, {
    accountType: "vendor",
    deleteApiUrl: urls.vendorDeleteApiUrl,
    privacyPolicyUrl: urls.vendorPrivacyUrl,
  });
});

exports.renderDeliveryDeleteAccount = asyncHandler(async (req, res) => {
  const urls = legalPageUrls(getPublicBaseUrl(req));
  await renderDeletePage(req, res, {
    accountType: "delivery partner",
    deleteApiUrl: urls.deliveryDeleteApiUrl,
    privacyPolicyUrl: urls.deliveryPrivacyUrl,
  });
});

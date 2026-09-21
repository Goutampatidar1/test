const { AppConfig } = require("../../models");
const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { toPublicEcomFlow, resolveEcomAvailability, mergePaymentMethods } = require("../../utils/appCommerceSettings");
const { toPublicVendorDocuments } = require("../../utils/vendorDocumentSettings");
const { resolveRazorpayPublicSettings } = require("../../utils/mobileAppSettings");

/**
 * Shape returned to clients without auth — suitable for storefront / login branding.
 * Omits payment gateway credentials. Logo URLs are public branding assets.
 */
function toPublicAppConfig(doc) {
  if (!doc) return null;

  const payment_gateways = Array.isArray(doc.payment_gateways)
    ? doc.payment_gateways.map(({ provider, isActive, credentials }) => {
        const row = { provider, isActive: !!isActive };
        if (provider === "razorpay" && isActive) {
          row.keyId = String(credentials?.key_id || "").trim();
        }
        return row;
      })
    : [];

  return {
    app_name: doc.app_name,
    app_email: doc.app_email,
    app_mobile: doc.app_mobile,
    app_detail: doc.app_detail ?? "",
    admin_logo: doc.admin_logo ?? "",
    user_logo: doc.user_logo ?? "",
    favicon: doc.favicon ?? "",
    address: doc.address ?? "",
    latitude: doc.latitude ?? "",
    longitude: doc.longitude ?? "",
    facebook: doc.facebook ?? "",
    twitter: doc.twitter ?? "",
    instagram: doc.instagram ?? "",
    linkedin: doc.linkedin ?? "",
    app_details: doc.app_details ?? "",
    app_footer_text: doc.app_footer_text ?? "",
    payment_methods: mergePaymentMethods(doc.payment_methods),
    payment_gateways,
    razorpay: resolveRazorpayPublicSettings(doc),
    documents: toPublicVendorDocuments(doc.documents),
    shipping_charge: Number(doc.shipping_charge) || 0,
    ecom_flow: toPublicEcomFlow(doc),
    updatedAt: doc.updatedAt,
  };
}

exports.getEcomAvailability = asyncHandler(async (req, res) => {
  const config = await AppConfig.findOne().select("ecom_flow").lean();
  const result = await resolveEcomAvailability(
    {
      cityId: req.query.cityId ?? req.query.city ?? null,
      cityName: req.query.cityName ?? null,
      pincode: req.query.pincode ?? req.query.pinCode ?? null,
      subDistrictId:
        req.query.subDistrictId ??
        req.query.subDistrict ??
        req.query.sub_district ??
        null,
      subDistrictName: req.query.subDistrictName ?? req.query.sub_district_name ?? null,
    },
    config
  );

  sendSuccess(res, result.available ? "E-commerce available" : "E-commerce unavailable", {
    available: result.available,
    reason: result.reason,
    ecom_flow: result.ecom_flow,
  });
});

function defaultPublicAppConfig() {
  return {
    app_name: "Oho Ebazar",
    app_email: "support@ohoebazar.com",
    app_mobile: "9876543200",
    app_detail: "Service & Shop marketplace for local vendors.",
    admin_logo: "",
    user_logo: "",
    favicon: "",
    address: "Bengaluru, Karnataka, India",
    latitude: "",
    longitude: "",
    facebook: "",
    twitter: "",
    instagram: "",
    linkedin: "",
    app_details: "Oho Ebazar connects customers with service providers and local shops.",
    app_footer_text: "© Oho Ebazar. All rights reserved.",
    payment_methods: [
      { type: "cod", isActive: true },
      { type: "online", isActive: true },
      { type: "wallet", isActive: true },
    ],
    payment_gateways: [],
    razorpay: { isActive: false, keyId: "" },
    documents: [
      { type: "Aadhar Card", isActive: true },
      { type: "Pan Card", isActive: true },
      { type: "Bank Details", isActive: true },
    ],
    shipping_charge: 40,
    ecom_flow: {
      enabled: true,
      scope: "all",
      rule: "block",
      cities: [],
      pincodes: [],
      subDistricts: [],
    },
    updatedAt: null,
  };
}

exports.getPublicAppConfig = asyncHandler(async (req, res) => {
  const config = await AppConfig.findOne().lean();
  const shaped = toPublicAppConfig(config) || defaultPublicAppConfig();
  sendSuccess(res, "Public app configuration", shaped);
});

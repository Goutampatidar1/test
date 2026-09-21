const { AppConfig } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { normalizeEcomFlow } = require("../../utils/appCommerceSettings");
const createUploader = require("../../utils/fileUploader");

const upload = createUploader("appconfig");

const parseJSON = (value, fallback) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
};

function parseVendorApprovalRequired(raw) {
  if (raw === undefined || raw === null || raw === "") return true;
  return raw === true || raw === "true" || raw === "1" || raw === 1;
}

exports.uploadAppConfigFiles = upload.fields([
  { name: "admin_logo", maxCount: 1 },
  { name: "user_logo", maxCount: 1 },
  { name: "favicon", maxCount: 1 },
]);

exports.getAppConfig = asyncHandler(async (req, res) => {
  const config = await AppConfig.findOne().lean();
  res.json({
    message: "App configuration fetched",
    data: config || null,
  });
});

exports.createAppConfig = asyncHandler(async (req, res) => {
  const existing = await AppConfig.findOne();
  if (existing) {
    throw new AppError("App configuration already exists. Use PATCH /api/admin/misc/app-config to update.", 409);
  }

  const {
    app_name,
    app_email,
    app_mobile,
    app_detail,
    address,
    latitude,
    longitude,
    facebook,
    twitter,
    instagram,
    linkedin,
    app_details,
    app_footer_text,
    payment_methods,
    payment_gateways,
    documents,
    commissions,
    shipping_charge,
    vendor_approval_required,
    vendor_product_approval_required,
  } = req.body;

  if (!app_name || !app_email || !app_mobile) {
    throw new AppError("app_name, app_email, and app_mobile are required", 400);
  }

  const fileUrl = (field) =>
    req.files?.[field]?.[0] ? `/uploads/appconfig/${req.files[field][0].filename}` : "";

  const parsedShippingCharge = Number(shipping_charge ?? 40);
  if (!Number.isFinite(parsedShippingCharge) || parsedShippingCharge < 0) {
    throw new AppError("shipping_charge must be a non-negative number", 400);
  }

  const approvalRequired = parseVendorApprovalRequired(
    vendor_approval_required ?? vendor_product_approval_required
  );

  const doc = await AppConfig.create({
    app_name,
    app_email,
    app_mobile,
    app_detail: app_detail ?? "",
    address: address ?? "",
    latitude: latitude ?? "",
    longitude: longitude ?? "",
    facebook: facebook ?? "",
    twitter: twitter ?? "",
    instagram: instagram ?? "",
    linkedin: linkedin ?? "",
    app_details: app_details ?? "",
    app_footer_text: app_footer_text ?? "",
    payment_methods: parseJSON(payment_methods, undefined),
    payment_gateways: parseJSON(payment_gateways, undefined),
    documents: parseJSON(documents, undefined),
    commissions: parseJSON(commissions, undefined),
    shipping_charge: parsedShippingCharge,
    ecom_flow: normalizeEcomFlow(parseJSON(req.body.ecom_flow, undefined)),
    vendor_approval_required: approvalRequired,
    vendor_product_approval_required: approvalRequired,
    admin_logo: fileUrl("admin_logo"),
    user_logo: fileUrl("user_logo"),
    favicon: fileUrl("favicon"),
  });

  res.status(201).json({
    message: "App configuration created",
    data: doc,
  });
});

exports.updateAppConfig = asyncHandler(async (req, res) => {
  const config = await AppConfig.findOne();
  if (!config) {
    throw new AppError("App configuration not found. Use POST /api/admin/misc/app-config to create.", 404);
  }

  const scalarFields = [
    "app_name",
    "app_email",
    "app_mobile",
    "app_detail",
    "address",
    "latitude",
    "longitude",
    "facebook",
    "twitter",
    "instagram",
    "linkedin",
    "app_details",
    "app_footer_text",
  ];

  for (const field of scalarFields) {
    if (req.body[field] !== undefined) {
      config[field] = req.body[field];
    }
  }

  if (req.body.payment_methods !== undefined) {
    config.payment_methods = parseJSON(req.body.payment_methods, config.payment_methods);
  }
  if (req.body.payment_gateways !== undefined) {
    config.payment_gateways = parseJSON(req.body.payment_gateways, config.payment_gateways);
  }
  if (req.body.documents !== undefined) {
    config.documents = parseJSON(req.body.documents, config.documents);
  }
  if (req.body.commissions !== undefined) {
    config.commissions = parseJSON(req.body.commissions, config.commissions);
  }
  if (req.body.shipping_charge !== undefined) {
    const charge = Number(req.body.shipping_charge);
    if (!Number.isFinite(charge) || charge < 0) {
      throw new AppError("shipping_charge must be a non-negative number", 400);
    }
    config.shipping_charge = charge;
  }

  if (
    req.body.vendor_approval_required !== undefined ||
    req.body.vendor_product_approval_required !== undefined
  ) {
    const approvalRequired = parseVendorApprovalRequired(
      req.body.vendor_approval_required ?? req.body.vendor_product_approval_required
    );
    config.vendor_approval_required = approvalRequired;
    config.vendor_product_approval_required = approvalRequired;
  }

  if (req.body.ecom_flow !== undefined) {
    const nextFlow = normalizeEcomFlow(parseJSON(req.body.ecom_flow, config.ecom_flow));
    if (nextFlow.scope === "city" && nextFlow.rule === "allow" && nextFlow.cities.length === 0) {
      throw new AppError("Select at least one city when showing e-commerce only in selected cities", 400);
    }
    if (nextFlow.scope === "pincode" && nextFlow.rule === "allow" && nextFlow.pincodes.length === 0) {
      throw new AppError("Add at least one pincode when showing e-commerce only in selected pincodes", 400);
    }
    if (
      nextFlow.scope === "sub_district" &&
      nextFlow.rule === "allow" &&
      nextFlow.subDistricts.length === 0 &&
      nextFlow.cities.length === 0
    ) {
      throw new AppError(
        "Select at least one sub-district or city when showing e-commerce only in selected areas",
        400
      );
    }
    config.ecom_flow = nextFlow;
  }

  const assignUploaded = (field) => {
    const file = req.files?.[field]?.[0];
    if (!file) return;
    deleteUploadFileByPublicUrl(config[field]);
    config[field] = `/uploads/appconfig/${file.filename}`;
  };

  assignUploaded("admin_logo");
  assignUploaded("user_logo");
  assignUploaded("favicon");

  await config.save();

  res.json({
    message: "App configuration updated",
    data: config,
  });
});

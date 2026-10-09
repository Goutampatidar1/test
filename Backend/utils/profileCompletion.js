const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const Venue = require("../models/other/venue");
const Product = require("../models/other/product");
const { getFeatureSettings } = require("./appFeatureSettings");
const { toAbsoluteUploadUrl } = require("./mediaUrl");

/** Default art for each profile module. Admin can override via feature_settings.profileModules. */
const MODULE_ART = {
  personal: { icon: "user", color: "#6366f1" },
  business: { icon: "store", color: "#0ea5e9" },
  shopMedia: { icon: "image", color: "#ec4899" },
  bank: { icon: "bank", color: "#10b981" },
  documents: { icon: "file-check", color: "#f59e0b" },
  services: { icon: "calendar", color: "#8b5cf6" },
  products: { icon: "package", color: "#ef4444" },
};

function filled(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return String(value ?? "").trim() !== "";
}

function pick(...values) {
  return values.find((value) => filled(value)) ?? "";
}

/** One shape for both vendor documents so the checklist is variant-agnostic. */
function mergeAccounts(ecom, service) {
  const e = ecom || {};
  const s = service || {};
  return {
    name: pick(s.name, e.name),
    phone: pick(s.phone, e.phone),
    email: pick(s.email, e.email),
    profileImage: pick(s.profileImage, e.profileImage),
    businessName: pick(s.businessName, e.businessName),
    businessPhone: pick(s.businessPhone, e.businessPhone),
    businessEmail: pick(s.businessEmail),
    businessAddress: pick(s.businessAddress, e.businessAddress),
    businessDescription: pick(s.businessDescription, e.shopDescription),
    panNumber: pick(s.panNumber, e.panCardNumber),
    gstNumber: pick(s.gstNumber, e.gstin),
    bankName: pick(s.bankName, e.bankName),
    branchName: pick(s.branchName, e.branchName),
    accountType: pick(s.accountType, e.accountType),
    accountNumber: pick(s.accountNumber, e.accountNo),
    ifscCode: pick(s.ifscCode, e.ifsc),
    category: pick(e.category),
    shopLogo: pick(e.shopLogo),
    shopImages: Array.isArray(e.shopImages) ? e.shopImages : [],
    aadhaarFront: pick(s.aadhaarCardFront, s.aadhaarCard, e.aadhaarCardFront),
    aadhaarBack: pick(s.aadhaarCardBack, e.aadhaarCardBack),
    panCard: pick(s.panCard, e.panCardFront),
  };
}

function field(key, label, done, required = true) {
  return { key, label, done: Boolean(done), required };
}

function buildModules(user, variant, { venueCount, productCount }) {
  const isEcom = variant === "ecom" || variant === "both";
  const isService = variant === "service" || variant === "both";

  const modules = [
    {
      id: "personal",
      label: "Personal Details",
      href: "/vendor/profile?tab=personal",
      fields: [
        field("name", "Full name", filled(user.name)),
        field("phone", "Mobile number", filled(user.phone)),
        field("email", "Email address", filled(user.email), false),
        field("profileImage", "Profile photo", filled(user.profileImage), false),
      ],
    },
    {
      id: "business",
      label: variant === "ecom" ? "Shop Details" : "Business Details",
      href: "/vendor/profile?tab=business",
      fields: [
        field("businessName", "Business name", filled(user.businessName)),
        field("businessPhone", "Business mobile", filled(user.businessPhone)),
        field("businessAddress", "Address", filled(user.businessAddress)),
        ...(isEcom ? [field("category", "Shop category", filled(user.category))] : []),
        field("businessEmail", "Business email", filled(user.businessEmail), false),
        field("businessDescription", "Description", filled(user.businessDescription), false),
        field("panNumber", "PAN number", filled(user.panNumber), false),
        field("gstNumber", "GST number", filled(user.gstNumber), false),
      ],
    },
    {
      id: "bank",
      label: "Bank Details",
      href: "/vendor/profile?tab=bank",
      fields: [
        field("bankName", "Bank name", filled(user.bankName)),
        field("branchName", "Branch name", filled(user.branchName)),
        field("accountType", "Account type", filled(user.accountType)),
        field("accountNumber", "Account number", filled(user.accountNumber)),
        field("ifscCode", "IFSC code", filled(user.ifscCode)),
      ],
    },
    {
      id: "documents",
      label: "Documents",
      href: "/vendor/profile?tab=documents",
      fields: [
        field("aadhaarFront", "Aadhaar front", filled(user.aadhaarFront)),
        field("aadhaarBack", "Aadhaar back", filled(user.aadhaarBack)),
        field("panCard", "PAN card", filled(user.panCard), false),
      ],
    },
  ];

  if (isService) {
    modules.push({
      id: "services",
      label: "Services",
      href: "/vendor/venues/new",
      fields: [field("venue", "Add at least one service", venueCount > 0)],
    });
  }
  if (isEcom) {
    modules.push(
      {
        id: "shopMedia",
        label: "Shop Images",
        href: "/vendor/dashboard#shop-images",
        fields: [
          field("shopLogo", "Shop logo", filled(user.shopLogo), false),
          field("shopImages", "Shop photos", filled(user.shopImages)),
        ],
      },
      {
        id: "products",
        label: "Products",
        href: "/vendor/products/new",
        fields: [field("product", "Add at least one product", productCount > 0)],
      }
    );
  }
  return modules;
}

function finalizeModules(modules, artOverrides, baseUrl) {
  const computed = modules.map((mod) => {
    const required = mod.fields.filter((f) => f.required !== false);
    const optional = mod.fields.filter((f) => f.required === false);
    const tracked = required.length ? required : mod.fields;
    const doneCount = tracked.filter((f) => f.done).length;
    const total = tracked.length;
    const remaining = required.filter((f) => !f.done);
    const art = { ...(MODULE_ART[mod.id] || { icon: "star", color: "#64748b" }), ...(artOverrides?.[mod.id] || {}) };

    return {
      ...mod,
      icon: art.icon,
      color: art.color,
      image: art.image ? toAbsoluteUploadUrl(art.image, baseUrl) : "",
      doneCount,
      total,
      remaining,
      optionalRemaining: optional.filter((f) => !f.done),
      percent: total ? Math.round((doneCount / total) * 100) : 0,
      complete: remaining.length === 0,
    };
  });

  const allRequired = modules.flatMap((mod) => mod.fields.filter((f) => f.required !== false));
  const tracked = allRequired.length ? allRequired : modules.flatMap((mod) => mod.fields);
  const doneCount = tracked.filter((f) => f.done).length;
  const total = tracked.length;
  const remainingModules = computed.filter((mod) => !mod.complete);

  return {
    percent: total ? Math.round((doneCount / total) * 100) : 0,
    doneCount,
    total,
    complete: remainingModules.length === 0,
    modules: computed,
    remainingModules,
  };
}

function buildBenefits(percent, benefits, baseUrl) {
  const tiers = benefits.map((tier) => ({
    ...tier,
    image: tier.image ? toAbsoluteUploadUrl(tier.image, baseUrl) : "",
    unlocked: percent >= tier.minPercent,
  }));
  const next = tiers.find((tier) => !tier.unlocked) || null;
  return {
    tiers,
    unlockedCount: tiers.filter((tier) => tier.unlocked).length,
    nextBenefit: next ? { ...next, percentToGo: Math.max(0, next.minPercent - percent) } : null,
    headline: next
      ? `Complete ${Math.max(0, next.minPercent - percent)}% more to unlock "${next.title}"`
      : "You have unlocked every profile benefit",
  };
}

function resolveVariant(ecom, service, hint) {
  if (hint === "ecom" || hint === "service" || hint === "both") return hint;
  if (ecom && service) return "both";
  return ecom ? "ecom" : "service";
}

/**
 * Compute completion, module art and benefit tiers.
 * Pass whichever accounts exist; `variant` forces the checklist shape.
 */
async function computeProfileCompletion({ ecom = null, service = null, variant = null, baseUrl = "" }) {
  const settings = await getFeatureSettings();
  const resolved = resolveVariant(ecom, service, variant);

  const [venueCount, productCount] = await Promise.all([
    service ? Venue.countDocuments({ role: "VenueVendor", addedById: service._id, status: "active" }) : 0,
    ecom ? Product.countDocuments({ role: "Vendor", addedById: ecom._id, status: { $ne: "deleted" } }) : 0,
  ]);

  const merged = mergeAccounts(ecom, service);
  const completion = finalizeModules(
    buildModules(merged, resolved, { venueCount, productCount }),
    settings.profileModules,
    baseUrl
  );

  return {
    variant: resolved,
    ...completion,
    nextStep: completion.remainingModules[0]
      ? {
          moduleId: completion.remainingModules[0].id,
          label: completion.remainingModules[0].remaining[0]?.label || completion.remainingModules[0].label,
          href: completion.remainingModules[0].href,
        }
      : null,
    benefits: buildBenefits(completion.percent, settings.profileBenefits, baseUrl),
  };
}

/** Persist the score on the vendor and denormalise it so listings can rank by it. */
async function persistProfileScore({ ecom, service, percent }) {
  const ops = [];
  if (ecom) {
    ops.push(
      Vendor.updateOne({ _id: ecom._id }, { $set: { profileScore: percent } }),
      Product.updateMany({ role: "Vendor", addedById: ecom._id }, { $set: { vendorProfileScore: percent } })
    );
  }
  if (service) {
    ops.push(
      VenueVendor.updateOne({ _id: service._id }, { $set: { profileScore: percent } }),
      Venue.updateMany({ role: "VenueVendor", addedById: service._id }, { $set: { vendorProfileScore: percent } })
    );
  }
  await Promise.all(ops);
}

/**
 * Recompute + store the score; hand out the complimentary Show Number trial on first 100%.
 * `ownerType` is "ecom" | "venue". For "both" vendors the counterpart account is looked up by phone.
 */
async function refreshProfileScore(ownerType, ownerId) {
  const Model = ownerType === "venue" ? VenueVendor : Vendor;
  const account = await Model.findById(ownerId).lean();
  if (!account) return null;

  let ecom = ownerType === "ecom" ? account : null;
  let service = ownerType === "venue" ? account : null;
  const panelType = account.vendorPanelType;
  if (panelType === "both") {
    if (!ecom) ecom = await Vendor.findOne({ phone: account.phone }).lean();
    if (!service) service = await VenueVendor.findOne({ phone: account.phone }).lean();
  }

  const result = await computeProfileCompletion({
    ecom,
    service,
    variant: panelType === "both" ? "both" : ownerType === "venue" ? "service" : "ecom",
  });
  await persistProfileScore({ ecom, service, percent: result.percent });

  if (result.complete) {
    const settings = await getFeatureSettings();
    if (settings.phoneTrialDaysOnFullProfile > 0) {
      const { grantPhoneTrial } = require("./phonePlan");
      if (ecom) await grantPhoneTrial("ecom", ecom._id, settings.phoneTrialDaysOnFullProfile, { reason: "profile complete" });
      if (service) await grantPhoneTrial("venue", service._id, settings.phoneTrialDaysOnFullProfile, { reason: "profile complete" });
    }
  }
  return result;
}

function queueRefreshProfileScore(ownerType, ownerId) {
  setImmediate(() => {
    refreshProfileScore(ownerType, ownerId).catch((error) => {
      console.error("[profile-score]", error?.message || error);
    });
  });
}

module.exports = {
  computeProfileCompletion,
  refreshProfileScore,
  queueRefreshProfileScore,
  MODULE_ART,
};

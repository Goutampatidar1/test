import { normalizeEcomProfileUser } from "../api/vendorEcom.js";

function filled(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return String(value ?? "").trim() !== "";
}

function aadhaarFront(user) {
  return user?.aadhaarCardFront || user?.aadhaarCard || "";
}

function pickFilled(primary, fallback) {
  return filled(primary) ? primary : fallback;
}

function mergeUsersForCompletion(serviceUser, ecomUser) {
  const service = serviceUser || {};
  const ecom = ecomUser || {};
  return {
    name: pickFilled(service.name, ecom.name),
    phone: pickFilled(service.phone, ecom.phone),
    email: pickFilled(service.email, ecom.email),
    profileImage: pickFilled(service.profileImage, ecom.profileImage),
    businessName: pickFilled(service.businessName, ecom.businessName),
    businessPhone: pickFilled(service.businessPhone, ecom.businessPhone),
    businessEmail: pickFilled(service.businessEmail, ecom.businessEmail),
    businessAddress: pickFilled(service.businessAddress, ecom.businessAddress),
    businessDescription: pickFilled(service.businessDescription, ecom.businessDescription || ecom.shopDescription),
    panNumber: pickFilled(service.panNumber, ecom.panNumber || ecom.panCardNumber),
    gstNumber: pickFilled(service.gstNumber, ecom.gstNumber || ecom.gstin),
    bankName: pickFilled(service.bankName, ecom.bankName),
    branchName: pickFilled(service.branchName, ecom.branchName),
    accountType: pickFilled(service.accountType, ecom.accountType),
    accountNumber: pickFilled(service.accountNumber, ecom.accountNumber || ecom.accountNo),
    ifscCode: pickFilled(service.ifscCode, ecom.ifscCode || ecom.ifsc),
    category: pickFilled(service.category, ecom.category),
    shopLogo: pickFilled(service.shopLogo, ecom.shopLogo),
    shopImages: filled(service.shopImages) ? service.shopImages : ecom.shopImages,
    aadhaarCardFront: pickFilled(aadhaarFront(service), aadhaarFront(ecom)),
    aadhaarCardBack: pickFilled(service.aadhaarCardBack, ecom.aadhaarCardBack),
    panCard: pickFilled(service.panCard, ecom.panCard || ecom.panCardFront),
  };
}

function finalizeModules(modules) {
  const computed = modules.map((mod) => {
    const requiredFields = mod.fields.filter((field) => field.required !== false);
    const optionalFields = mod.fields.filter((field) => field.required === false);
    const trackFields = requiredFields.length ? requiredFields : mod.fields;
    const doneCount = trackFields.filter((field) => field.done).length;
    const total = trackFields.length;
    const remaining = requiredFields.filter((field) => !field.done);
    const optionalRemaining = optionalFields.filter((field) => !field.done);
    const percent = total ? Math.round((doneCount / total) * 100) : 0;

    return {
      ...mod,
      doneCount,
      total,
      remaining,
      optionalRemaining,
      percent,
      complete: remaining.length === 0,
    };
  });

  const requiredFields = modules.flatMap((mod) =>
    mod.fields.filter((field) => field.required !== false),
  );
  const trackedFields = requiredFields.length
    ? requiredFields
    : modules.flatMap((mod) => mod.fields);
  const doneCount = trackedFields.filter((field) => field.done).length;
  const total = trackedFields.length;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;
  const remainingModules = computed.filter((mod) => !mod.complete);

  return {
    percent,
    doneCount,
    total,
    complete: remainingModules.length === 0,
    modules: computed,
    remainingModules,
  };
}

export function getVenueVendorProfileCompletion(user, { venueCount = 0 } = {}) {
  const modules = [
    {
      id: "personal",
      label: "Personal Details",
      href: "/vendor/profile?tab=personal",
      fields: [
        { key: "name", label: "Full name", done: filled(user?.name), required: true },
        { key: "phone", label: "Mobile number", done: filled(user?.phone), required: true },
        { key: "email", label: "Email address", done: filled(user?.email), required: false },
        { key: "profileImage", label: "Profile photo", done: filled(user?.profileImage), required: false },
      ],
    },
    {
      id: "business",
      label: "Business Details",
      href: "/vendor/profile?tab=business",
      fields: [
        { key: "businessName", label: "Business name", done: filled(user?.businessName), required: true },
        { key: "businessPhone", label: "Business mobile", done: filled(user?.businessPhone), required: true },
        { key: "businessAddress", label: "Address", done: filled(user?.businessAddress), required: true },
        { key: "businessEmail", label: "Business email", done: filled(user?.businessEmail), required: false },
        { key: "businessDescription", label: "Description", done: filled(user?.businessDescription), required: false },
        { key: "panNumber", label: "PAN number", done: filled(user?.panNumber), required: false },
        { key: "gstNumber", label: "GST number", done: filled(user?.gstNumber), required: false },
      ],
    },
    {
      id: "bank",
      label: "Bank Details",
      href: "/vendor/profile?tab=bank",
      fields: [
        { key: "bankName", label: "Bank name", done: filled(user?.bankName), required: true },
        { key: "branchName", label: "Branch name", done: filled(user?.branchName), required: true },
        { key: "accountType", label: "Account type", done: filled(user?.accountType), required: true },
        { key: "accountNumber", label: "Account number", done: filled(user?.accountNumber), required: true },
        { key: "ifscCode", label: "IFSC code", done: filled(user?.ifscCode), required: true },
      ],
    },
    {
      id: "documents",
      label: "Documents",
      href: "/vendor/profile?tab=documents",
      fields: [
        { key: "aadhaarFront", label: "Aadhaar front", done: filled(aadhaarFront(user)), required: true },
        { key: "aadhaarBack", label: "Aadhaar back", done: filled(user?.aadhaarCardBack), required: true },
        { key: "panCard", label: "PAN card", done: filled(user?.panCard), required: false },
      ],
    },
    {
      id: "venues",
      label: "Services",
      href: "/vendor/venues/new",
      fields: [
        {
          key: "venue",
          label: "Add at least one service",
          done: Number(venueCount) > 0,
          required: true,
        },
      ],
    },
  ];

  return finalizeModules(modules);
}

export function getEcomVendorProfileCompletion(user, { productCount = 0, serviceUser = null } = {}) {
  const ecomUser = normalizeEcomProfileUser(user);
  const merged = serviceUser ? mergeUsersForCompletion(serviceUser, ecomUser) : ecomUser;
  const categoryValue = merged.category?._id || merged.category;

  const modules = [
    {
      id: "personal",
      label: "Personal Details",
      href: "/vendor/profile?tab=personal",
      fields: [
        { key: "name", label: "Full name", done: filled(merged.name), required: true },
        { key: "phone", label: "Mobile number", done: filled(merged.phone), required: true },
        { key: "email", label: "Email address", done: filled(merged.email), required: false },
        { key: "profileImage", label: "Profile photo", done: filled(merged.profileImage), required: false },
      ],
    },
    {
      id: "business",
      label: "Shop Details",
      href: "/vendor/profile?tab=business",
      fields: [
        { key: "businessName", label: "Shop name", done: filled(merged.businessName), required: true },
        { key: "businessPhone", label: "Shop mobile", done: filled(merged.businessPhone), required: true },
        { key: "businessAddress", label: "Address", done: filled(merged.businessAddress), required: true },
        { key: "category", label: "Shop category", done: filled(categoryValue), required: true },
        { key: "businessEmail", label: "Shop email", done: filled(merged.businessEmail), required: false },
        { key: "panNumber", label: "PAN number", done: filled(merged.panNumber), required: false },
        { key: "gstNumber", label: "GST number", done: filled(merged.gstNumber), required: false },
      ],
    },
    {
      id: "shopMedia",
      label: "Shop Images",
      href: "/vendor/dashboard#shop-images",
      fields: [
        { key: "shopLogo", label: "Shop logo", done: filled(merged.shopLogo), required: false },
        {
          key: "shopImages",
          label: "Shop photos",
          done: Array.isArray(merged.shopImages) && merged.shopImages.length > 0,
          required: true,
        },
      ],
    },
    {
      id: "bank",
      label: "Bank Details",
      href: "/vendor/profile?tab=bank",
      fields: [
        { key: "bankName", label: "Bank name", done: filled(merged.bankName), required: true },
        { key: "branchName", label: "Branch name", done: filled(merged.branchName), required: true },
        { key: "accountType", label: "Account type", done: filled(merged.accountType), required: true },
        { key: "accountNumber", label: "Account number", done: filled(merged.accountNumber), required: true },
        { key: "ifscCode", label: "IFSC code", done: filled(merged.ifscCode), required: true },
      ],
    },
    {
      id: "documents",
      label: "Documents",
      href: "/vendor/profile?tab=documents",
      fields: [
        { key: "aadhaarFront", label: "Aadhaar front", done: filled(merged.aadhaarCardFront), required: true },
        { key: "aadhaarBack", label: "Aadhaar back", done: filled(merged.aadhaarCardBack), required: true },
        { key: "panCard", label: "PAN card", done: filled(merged.panCard), required: false },
      ],
    },
    {
      id: "products",
      label: "Products",
      href: "/vendor/products/new",
      fields: [
        {
          key: "product",
          label: "Add at least one product",
          done: Number(productCount) > 0,
          required: true,
        },
      ],
    },
  ];

  return finalizeModules(modules);
}

/** Unified profile completion for vendors with both service and shop accounts. */
export function getCombinedVendorProfileCompletion(
  serviceUser,
  ecomUser,
  { venueCount = 0, productCount = 0 } = {},
) {
  const user = mergeUsersForCompletion(serviceUser, ecomUser);
  const categoryValue = user.category?._id || user.category;

  const modules = [
    {
      id: "personal",
      label: "Personal Details",
      href: "/vendor/profile?tab=personal",
      fields: [
        { key: "name", label: "Full name", done: filled(user.name), required: true },
        { key: "phone", label: "Mobile number", done: filled(user.phone), required: true },
        { key: "email", label: "Email address", done: filled(user.email), required: false },
        { key: "profileImage", label: "Profile photo", done: filled(user.profileImage), required: false },
      ],
    },
    {
      id: "business",
      label: "Business Details",
      href: "/vendor/profile?tab=business",
      fields: [
        { key: "businessName", label: "Business name", done: filled(user.businessName), required: true },
        { key: "businessPhone", label: "Business mobile", done: filled(user.businessPhone), required: true },
        { key: "businessAddress", label: "Address", done: filled(user.businessAddress), required: true },
        { key: "category", label: "Shop category", done: filled(categoryValue), required: true },
        { key: "businessEmail", label: "Business email", done: filled(user.businessEmail), required: false },
        { key: "businessDescription", label: "Description", done: filled(user.businessDescription), required: false },
        { key: "panNumber", label: "PAN number", done: filled(user.panNumber), required: false },
        { key: "gstNumber", label: "GST number", done: filled(user.gstNumber), required: false },
      ],
    },
    {
      id: "bank",
      label: "Bank Details",
      href: "/vendor/profile?tab=bank",
      fields: [
        { key: "bankName", label: "Bank name", done: filled(user.bankName), required: true },
        { key: "branchName", label: "Branch name", done: filled(user.branchName), required: true },
        { key: "accountType", label: "Account type", done: filled(user.accountType), required: true },
        { key: "accountNumber", label: "Account number", done: filled(user.accountNumber), required: true },
        { key: "ifscCode", label: "IFSC code", done: filled(user.ifscCode), required: true },
      ],
    },
    {
      id: "documents",
      label: "Documents",
      href: "/vendor/profile?tab=documents",
      fields: [
        { key: "aadhaarFront", label: "Aadhaar front", done: filled(user.aadhaarCardFront), required: true },
        { key: "aadhaarBack", label: "Aadhaar back", done: filled(user.aadhaarCardBack), required: true },
        { key: "panCard", label: "PAN card", done: filled(user.panCard), required: false },
      ],
    },
    {
      id: "services",
      label: "Services",
      href: "/vendor/venues/new",
      fields: [
        {
          key: "venue",
          label: "Add at least one service",
          done: Number(venueCount) > 0,
          required: true,
        },
      ],
    },
    {
      id: "shopMedia",
      label: "Shop Images",
      href: "/vendor/dashboard#shop-images",
      fields: [
        { key: "shopLogo", label: "Shop logo", done: filled(user.shopLogo), required: false },
        {
          key: "shopImages",
          label: "Shop photos",
          done: Array.isArray(user.shopImages) && user.shopImages.length > 0,
          required: true,
        },
      ],
    },
    {
      id: "products",
      label: "Products",
      href: "/vendor/products/new",
      fields: [
        {
          key: "product",
          label: "Add at least one product",
          done: Number(productCount) > 0,
          required: true,
        },
      ],
    },
  ];

  return finalizeModules(modules);
}

const { Vendor, VenueVendor } = require("../../models");
const { asyncHandler } = require("../../utils/asyncHandler");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { getPagination, searchFilter } = require("../../utils/listQuery");

const DIRECTORY_CAP = 2000;
const TYPE_TABS = new Set(["ecom", "service", "both"]);

function phoneKey(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function panelType(row, fallback) {
  const type = String(row?.vendorPanelType || "").toLowerCase();
  if (type === "ecom" || type === "service" || type === "both") return type;
  return fallback;
}

function matchFilter({ status, approvalStatus, search, searchFields }) {
  const filter = {};
  if (status) filter.status = status;
  if (approvalStatus) filter.approvalStatus = approvalStatus;
  const searchOr = searchFilter(search, searchFields);
  if (searchOr) Object.assign(filter, searchOr);
  return filter;
}

function mapRow(doc, source) {
  const profile = toPublicProfile(doc) || {};
  const id = String(profile._id);
  const type = panelType(profile, source);
  return {
    ...profile,
    _id: id,
    source,
    vendorPanelType: type,
    gstin: profile.gstin || profile.gstNumber || "",
    panNumber: profile.panNumber || profile.panCardNumber || "",
    linkedVendorId: source === "ecom" ? id : null,
    linkedVenueVendorId: source === "service" ? id : null,
    viewPath: source === "service" ? `/admin/venue-vendors/${id}` : `/admin/vendors/${id}`,
    editPath: source === "service" ? `/admin/venue-vendors/${id}/edit` : `/admin/vendors/${id}/edit`,
  };
}

function mergeDirectory(ecomDocs, serviceDocs) {
  const ecomRows = ecomDocs.map((doc) => mapRow(doc, "ecom"));
  const serviceRows = serviceDocs.map((doc) => mapRow(doc, "service"));
  const serviceByPhone = new Map();
  for (const row of serviceRows) {
    const key = phoneKey(row.phone);
    if (key && !serviceByPhone.has(key)) serviceByPhone.set(key, row);
  }

  const usedServiceIds = new Set();
  const merged = [];

  for (const ecom of ecomRows) {
    const key = phoneKey(ecom.phone);
    const twin = key ? serviceByPhone.get(key) : null;
    const isBoth = ecom.vendorPanelType === "both" || twin?.vendorPanelType === "both";
    if (isBoth && twin) {
      usedServiceIds.add(String(twin._id));
      merged.push({
        ...ecom,
        vendorPanelType: "both",
        gstin: ecom.gstin || twin.gstin,
        panNumber: ecom.panNumber || twin.panNumber,
        linkedVenueVendorId: twin._id,
        linkedVendorId: ecom._id,
      });
      continue;
    }
    merged.push({
      ...ecom,
      vendorPanelType: ecom.vendorPanelType === "both" ? "both" : "ecom",
    });
  }

  for (const service of serviceRows) {
    if (usedServiceIds.has(String(service._id))) continue;
    merged.push({
      ...service,
      vendorPanelType: service.vendorPanelType === "both" ? "both" : "service",
    });
  }

  merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return merged;
}

exports.listVendorDirectory = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const { status, approvalStatus, search } = req.query;
  const type = String(req.query.type || "").toLowerCase();

  const ecomFilter = matchFilter({
    status,
    approvalStatus,
    search,
    searchFields: ["name", "email", "phone", "businessName", "businessPhone", "gstin", "businessAddress"],
  });
  const serviceFilter = matchFilter({
    status,
    approvalStatus,
    search,
    searchFields: [
      "name",
      "email",
      "phone",
      "businessName",
      "businessPhone",
      "businessEmail",
      "businessAddress",
      "panNumber",
      "gstNumber",
    ],
  });

  const [ecomDocs, serviceDocs] = await Promise.all([
    Vendor.find(ecomFilter).select("-passwordHash").sort({ createdAt: -1 }).limit(DIRECTORY_CAP).lean(),
    VenueVendor.find(serviceFilter).select("-passwordHash").sort({ createdAt: -1 }).limit(DIRECTORY_CAP).lean(),
  ]);

  const all = mergeDirectory(ecomDocs, serviceDocs);
  const counts = {
    all: all.length,
    ecom: all.filter((row) => row.vendorPanelType === "ecom").length,
    service: all.filter((row) => row.vendorPanelType === "service").length,
    both: all.filter((row) => row.vendorPanelType === "both").length,
  };

  const filtered = TYPE_TABS.has(type) ? all.filter((row) => row.vendorPanelType === type) : all;
  const total = filtered.length;
  const pages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;

  res.json({
    vendors: filtered.slice(start, start + limit),
    pagination: { page, limit, total, pages },
    counts,
  });
});

async function countBothVendors() {
  const [ecomDocs, serviceDocs] = await Promise.all([
    Vendor.find().select("phone vendorPanelType").lean(),
    VenueVendor.find().select("phone vendorPanelType").lean(),
  ]);
  const all = mergeDirectory(ecomDocs, serviceDocs);
  return all.filter((row) => row.vendorPanelType === "both").length;
}

exports.countBothVendors = countBothVendors;
exports.mergeDirectory = mergeDirectory;

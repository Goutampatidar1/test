const AppError = require("./AppError");
const { AppConfig } = require("../models");

const REJECTION_REASON_MAX = 500;
const REJECTION_REASON_MIN = 3;

function normalizeRejectionReason(value) {
  return String(value ?? "").trim();
}

function applyVendorApprovalStatus(entity, { approvalStatus, rejectionReason }) {
  if (approvalStatus === undefined) {
    return;
  }

  const nextStatus = String(approvalStatus).trim().toLowerCase();

  if (nextStatus === "rejected") {
    const reason = normalizeRejectionReason(rejectionReason);
    if (!reason) {
      throw new AppError("Rejection reason is required when rejecting a vendor", 400);
    }
    if (reason.length < REJECTION_REASON_MIN) {
      throw new AppError(`Rejection reason must be at least ${REJECTION_REASON_MIN} characters`, 400);
    }
    if (reason.length > REJECTION_REASON_MAX) {
      throw new AppError(`Rejection reason must be at most ${REJECTION_REASON_MAX} characters`, 400);
    }
    entity.approvalStatus = "rejected";
    entity.rejectionReason = reason;
    entity.status = "inactive";
    return;
  }

  entity.approvalStatus = approvalStatus;
  if (nextStatus === "approved") {
    entity.rejectionReason = null;
    entity.status = "active";
  }
}

async function readVendorApprovalRequiredSetting() {
  const config = await AppConfig.findOne()
    .select("vendor_approval_required vendor_product_approval_required")
    .lean();
  if (config?.vendor_approval_required === false || config?.vendor_approval_required === true) {
    return config.vendor_approval_required;
  }
  return config?.vendor_product_approval_required !== false;
}

/**
 * Application settings: vendor self-service submissions.
 * approvalRequired true  → pending admin review
 * approvalRequired false → auto-approved / active
 */
async function resolveVendorApprovalRequired() {
  const approvalRequired = await readVendorApprovalRequiredSetting();
  return {
    approvalRequired,
    adminApproved: !approvalRequired,
    approvalStatus: approvalRequired ? "pending" : "approved",
    catalogStatus: approvalRequired ? "pending" : "active",
  };
}

/** @deprecated use resolveVendorApprovalRequired */
async function resolveVendorProductApproval() {
  const result = await resolveVendorApprovalRequired();
  return {
    approvalRequired: result.approvalRequired,
    adminApproved: result.adminApproved,
  };
}

module.exports = {
  applyVendorApprovalStatus,
  normalizeRejectionReason,
  resolveVendorApprovalRequired,
  resolveVendorProductApproval,
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
};

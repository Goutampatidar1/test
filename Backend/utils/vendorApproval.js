const AppError = require("./AppError");
const { AppConfig } = require("../models");
const { queueAppNotification } = require("./appNotify");

const REJECTION_REASON_MAX = 500;
const REJECTION_REASON_MIN = 3;

function normalizeRejectionReason(value) {
  return String(value ?? "").trim();
}

/**
 * Apply approval status to vendor and send notification
 * @param {Object} entity - Vendor or VenueVendor document
 * @param {Object} options - { approvalStatus, rejectionReason }
 * @param {Object} notifyOptions - { recipientType: 'vendor' | 'venueVendor' } for notification
 */
function applyVendorApprovalStatus(entity, { approvalStatus, rejectionReason }, notifyOptions = {}) {
  if (approvalStatus === undefined) {
    return;
  }

  const previousStatus = entity.approvalStatus;
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

    // Send rejection notification
    if (entity._id) {
      const recipientType = notifyOptions.recipientType || "vendor";
      queueAppNotification({
        recipientType,
        recipientId: entity._id,
        type: "account_rejected",
        title: "Account Rejected",
        message: `Your account registration has been rejected. Reason: ${reason}`,
        metadata: {
          event: "account_rejected",
          rejectionReason: reason,
        },
      });
    }
    return;
  }

  entity.approvalStatus = approvalStatus;
  if (nextStatus === "approved") {
    entity.rejectionReason = null;
    entity.status = "active";

    // Send approval notification only if status changed from non-approved to approved
    if (previousStatus !== "approved" && entity._id) {
      const recipientType = notifyOptions.recipientType || "vendor";
      queueAppNotification({
        recipientType,
        recipientId: entity._id,
        type: "account_approved",
        title: "Account Approved! 🎉",
        message: "Congratulations! Your account has been approved by the admin. You can now log in and start using the platform.",
        metadata: {
          event: "account_approved",
        },
      });
    }
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

/**
 * Approval for an item (service / product) created by an existing vendor account.
 * Services are always auto-approved without requiring admin approval.
 * This allows vendors to immediately publish their services after adding them.
 */
async function resolveItemApprovalForVendor(vendor) {
  // Always auto-approve services - no admin approval required
  return {
    approvalRequired: false,
    adminApproved: true,
    approvalStatus: "approved",
    catalogStatus: "active",
    trusted: true,
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
  resolveItemApprovalForVendor,
  resolveVendorProductApproval,
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
};

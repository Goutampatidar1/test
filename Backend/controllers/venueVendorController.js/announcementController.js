const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { listActiveVendorAnnouncements } = require("../../utils/vendorAnnouncement");

exports.listAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await listActiveVendorAnnouncements({ vendorKind: "venue" });
  return sendSuccess(res, "Announcements fetched", announcements);
});

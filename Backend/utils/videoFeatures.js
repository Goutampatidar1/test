const AppError = require("./AppError");
const { getFeatureSettings } = require("./appFeatureSettings");

/**
 * Video (reels) on/off switches.
 *  - User app: only the admin switch feature_settings.videoEnabledUser decides.
 *  - Vendor apps: admin feature_settings.videoEnabledVendor + personal videoEnabled on the Vendor / VenueVendor document
 */
async function isVideoEnabledForUser() {
  const features = await getFeatureSettings();
  return features.videoEnabledUser !== false;
}

async function describeVideoState(accountType, account) {
  const features = await getFeatureSettings();
  if (accountType === "user") {
    const adminEnabled = features.videoEnabledUser !== false;
    return {
      adminEnabled,
      enabled: adminEnabled,
      effective: adminEnabled,
      lockedByAdmin: !adminEnabled,
      managedByAdmin: true,
    };
  }
  const adminEnabled = features.videoEnabledVendor !== false;
  const personal = account?.videoEnabled !== false;
  return {
    adminEnabled,
    enabled: personal,
    effective: adminEnabled && personal,
    lockedByAdmin: !adminEnabled,
  };
}

/** Route middleware: block vendor uploads when the admin turned vendor videos off or the vendor opted out. */
function requireVendorVideoEnabled(req, res, next) {
  getFeatureSettings()
    .then((features) => {
      if (features.videoEnabledVendor === false) {
        throw new AppError("Video uploads are currently disabled", 403, "VIDEO_DISABLED");
      }
      if (req.user?.videoEnabled === false) {
        throw new AppError("Videos are switched off for your account. Turn them on in settings.", 403, "VIDEO_DISABLED");
      }
      next();
    })
    .catch(next);
}

/** GET / PATCH handlers for the personal video on/off switch of any account type. */
function makeVideoSettingsHandlers(getModel, accountType) {
  const { asyncHandler } = require("./asyncHandler");
  const { sendSuccess } = require("./apiResponse");

  const get = asyncHandler(async (req, res) => {
    const account = await getModel().findById(req.user._id).select("videoEnabled").lean();
    if (!account) throw new AppError("Account not found", 404);
    sendSuccess(res, "Video settings fetched", await describeVideoState(accountType, account));
  });

  const update = asyncHandler(async (req, res) => {
    if (accountType === "user") {
      sendSuccess(res, "Videos are managed by admin", await describeVideoState(accountType, null));
      return;
    }
    const raw = req.body?.videoEnabled ?? req.body?.enabled;
    const value =
      typeof raw === "boolean"
        ? raw
        : ["true", "1", "on", "yes"].includes(String(raw).toLowerCase())
          ? true
          : ["false", "0", "off", "no"].includes(String(raw).toLowerCase())
            ? false
            : null;
    if (value === null) throw new AppError("videoEnabled must be true or false", 400);
    const account = await getModel()
      .findByIdAndUpdate(req.user._id, { $set: { videoEnabled: value } }, { new: true })
      .select("videoEnabled")
      .lean();
    if (!account) throw new AppError("Account not found", 404);
    sendSuccess(res, value ? "Videos turned on" : "Videos turned off", await describeVideoState(accountType, account));
  });

  return { get, update };
}

module.exports = {
  isVideoEnabledForUser,
  describeVideoState,
  requireVendorVideoEnabled,
  makeVideoSettingsHandlers,
};

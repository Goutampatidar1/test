const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { getVenueDisplayPrice } = require("./venuePricing");
const {
  pathForField,
  assertVideoUpload,
  assertOptionalVideoUpload,
} = require("./productVideoFeed");

function venueVendorVenueFilter(venueVendorId) {
  return {
    role: "VenueVendor",
    addedById: venueVendorId,
  };
}

async function loadVenueVendorOwnedVenue(venueId, venueVendorId) {
  assertObjectId(venueId, "Invalid venue id");
  const Venue = require("../models/other/venue");
  const venue = await Venue.findOne({
    _id: venueId,
    ...venueVendorVenueFilter(venueVendorId),
  }).lean();

  if (!venue) throw new AppError("Service not found", 404);
  return venue;
}

function buildBookNowTarget(venue, baseUrl) {
  return {
    venueId: venue._id,
    venueName: venue.name,
    venueImage: toAbsoluteUploadUrl(venue.thumbnail, baseUrl),
  };
}

function toVenueVendorVideoFeedCard(doc, venue, baseUrl) {
  if (!venue) {
    return {
      _id: doc._id,
      type: "venue",
      video: toAbsoluteUploadUrl(doc.video, baseUrl),
      thumbnail: toAbsoluteUploadUrl(doc.thumbnail, baseUrl),
      title: doc.title || "",
      status: doc.status,
      venue: null,
      createdAt: doc.createdAt,
    };
  }

  return {
    _id: doc._id,
    type: "venue",
    video: toAbsoluteUploadUrl(doc.video, baseUrl),
    thumbnail: toAbsoluteUploadUrl(doc.thumbnail || venue.thumbnail, baseUrl),
    title: doc.title || venue.name,
    status: doc.status,
    venue: {
      _id: venue._id,
      name: venue.name,
      thumbnail: toAbsoluteUploadUrl(venue.thumbnail, baseUrl),
      dayPrice: getVenueDisplayPrice(venue).amount,
      city: venue.city || "",
      state: venue.state || "",
    },
    createdAt: doc.createdAt,
  };
}

function toPublicVenueVideoFeedItem(
  doc,
  venue,
  venueVendor,
  baseUrl,
  { venueCount = 0, likeCount = 0, isLiked = false } = {}
) {
  const cityState = [venueVendor?.businessAddress, venue?.city, venue?.state]
    .filter(Boolean)
    .join(", ");
  const location =
    [venue?.city, venue?.state].filter(Boolean).join(", ") ||
    venueVendor?.businessAddress ||
    "";

  const owner = {
    _id: venueVendor?._id ?? doc.venueVendor,
    name: venueVendor?.businessName || venueVendor?.name || "",
    profileImage: venueVendor?.profileImage
      ? toAbsoluteUploadUrl(venueVendor.profileImage, baseUrl)
      : "",
    location: location || cityState,
    venueCount: venueCount ?? 0,
  };

  if (!venue) {
    return {
      _id: doc._id,
      type: "venue",
      video: toAbsoluteUploadUrl(doc.video, baseUrl),
      thumbnail: toAbsoluteUploadUrl(doc.thumbnail, baseUrl),
      title: doc.title || "",
      likeCount: Number(likeCount) || 0,
      isLiked: Boolean(isLiked),
      vendor: owner,
      venueVendor: owner,
      product: null,
      venue: null,
      variantSku: "",
      shopNow: null,
      bookNow: null,
      createdAt: doc.createdAt,
    };
  }

  return {
    _id: doc._id,
    type: "venue",
    video: toAbsoluteUploadUrl(doc.video, baseUrl),
    thumbnail: toAbsoluteUploadUrl(doc.thumbnail || venue.thumbnail, baseUrl),
    title: doc.title || venue.name,
    likeCount: Number(likeCount) || 0,
    isLiked: Boolean(isLiked),
    vendor: owner,
    venueVendor: owner,
    product: null,
    venue: {
      _id: venue._id,
      name: venue.name,
      thumbnail: toAbsoluteUploadUrl(venue.thumbnail, baseUrl),
      dayPrice: getVenueDisplayPrice(venue).amount,
      city: venue.city || "",
      state: venue.state || "",
      address: venue.address || "",
    },
    variantSku: "",
    shopNow: null,
    bookNow: buildBookNowTarget(venue, baseUrl),
    createdAt: doc.createdAt,
  };
}

module.exports = {
  venueVendorVenueFilter,
  loadVenueVendorOwnedVenue,
  pathForField,
  assertVideoUpload,
  assertOptionalVideoUpload,
  buildBookNowTarget,
  toVenueVendorVideoFeedCard,
  toPublicVenueVideoFeedItem,
};

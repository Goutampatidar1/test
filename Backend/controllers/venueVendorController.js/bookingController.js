const { asyncHandler } = require("../../utils/asyncHandler");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { sendSuccess } = require("../../utils/apiResponse");
const AppError = require("../../utils/AppError");
const { sendInvoiceResponse } = require("../../utils/ecomInvoiceResponse");
const {
  listVenueVendorBookings,
  getVenueVendorBookingDetail,
  updateVenueVendorBookingStatus,
  getVenueVendorBookingInvoice,
  getVenueVendorDashboard,
} = require("../../utils/venueVendorBooking");

exports.listBookings = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
  const search = req.query.search ?? req.query.q ?? null;

  const result = await listVenueVendorBookings(req.auth.sub, {
    page,
    limit,
    status: status && status !== "all" ? status : null,
    search,
  });

  return res.status(200).json({
    status: result.bookings.length > 0,
    message: "Bookings fetched",
    bookings: result.bookings,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
    filters: {
      status: status || "all",
      search: search ? String(search).trim() : null,
    },
  });
});

function resolveBookingRef(req) {
  const ref = req.params.id ?? req.params.bookingId ?? req.body?.bookingId;
  if (!ref || !String(ref).trim()) {
    throw new AppError("Booking id is required", 400);
  }
  return String(ref).trim();
}

exports.getDashboard = asyncHandler(async (req, res) => {
  const recentLimit = Math.min(
    20,
    Math.max(1, parseInt(String(req.query.recentLimit || "5"), 10) || 5),
  );

  const dashboard = await getVenueVendorDashboard(req.auth.sub, { recentLimit });

  return sendSuccess(res, "Dashboard fetched", dashboard);
});

exports.getBookingById = asyncHandler(async (req, res) => {
  const bookingRef = resolveBookingRef(req);
  const baseUrl = getPublicBaseUrl(req);
  const booking = await getVenueVendorBookingDetail(req.auth.sub, bookingRef, baseUrl);

  return sendSuccess(res, "Booking details fetched", booking);
});

exports.updateBookingStatus = asyncHandler(async (req, res) => {
  const bookingRef = resolveBookingRef(req);
  const nextStatus = req.body?.status ?? req.body?.orderStatus;
  if (!nextStatus) {
    throw new AppError("status is required", 400);
  }

  await updateVenueVendorBookingStatus(req.auth.sub, bookingRef, nextStatus);

  const baseUrl = getPublicBaseUrl(req);
  const booking = await getVenueVendorBookingDetail(req.auth.sub, bookingRef, baseUrl);

  return sendSuccess(res, "Booking status updated", booking);
});

exports.getBookingInvoice = asyncHandler(async (req, res) => {
  const bookingRef = resolveBookingRef(req);
  const baseUrl = getPublicBaseUrl(req);
  const invoice = await getVenueVendorBookingInvoice(req.auth.sub, bookingRef, baseUrl);
  return sendInvoiceResponse(req, res, invoice, "Booking invoice fetched");
});

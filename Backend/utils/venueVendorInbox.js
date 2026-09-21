const AppNotification = require("../models/other/appNotification");
const VenueVendor = require("../models/entity/venueVendor");
const { sendFcmNotification } = require("./pushNotification");

function queueVenueVendorInbox(task) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error("[venue-vendor-inbox]", error?.message || error);
      });
  });
}

async function notifyVenueVendorBookingPlaced(venue, order) {
  if (!venue || !order?._id) return;
  if (String(venue.role || "") !== "VenueVendor") return;
  const recipientId = venue.addedById?._id || venue.addedById;
  if (!recipientId) return;

  const venueName = venue.name || "your venue";
  const orderNumber = order.orderNumber || "";
  const title = "New venue booking";
  const message = orderNumber
    ? `Booking ${orderNumber} was placed for ${venueName}.`
    : `A new booking was placed for ${venueName}.`;

  await AppNotification.create({
    recipientType: "venueVendor",
    recipient: recipientId,
    type: "venue_booking_placed",
    title,
    message,
    order: order._id,
    orderNumber,
    orderStatus: order.orderStatus || "pending",
    metadata: {
      event: "venue_booking_placed",
      venueId: String(venue._id),
      bookingId: String(order._id),
      linkPath: `/vendor/bookings/${order._id}`,
    },
  });

  const vendor = await VenueVendor.findById(recipientId).select("fcm_id").lean();
  const token = String(vendor?.fcm_id || "").trim();
  if (token) {
    await sendFcmNotification(token, {
      title,
      body: message,
      data: {
        type: "venue_booking_placed",
        bookingId: String(order._id),
        venueId: String(venue._id),
      },
    });
  }
}

function queueNotifyVenueVendorBookingPlaced(venue, order) {
  queueVenueVendorInbox(() => notifyVenueVendorBookingPlaced(venue, order));
}

module.exports = {
  notifyVenueVendorBookingPlaced,
  queueNotifyVenueVendorBookingPlaced,
};

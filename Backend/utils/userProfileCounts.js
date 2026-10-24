const Order = require("../models/other/order");
const VenueOrder = require("../models/other/venueOrder");
const VenueEnquiry = require("../models/other/venueEnquiry");
const { OPEN_STATUSES, expireStaleEnquiries } = require("./venueEnquiry");

/**
 * Profile tile badges for the user app (Order History / Booking History / My enquiries).
 *
 * Badge rules (product):
 * - orderHistory  → total ecom orders (history size)
 * - bookingHistory → total venue bookings (history size)
 * - myEnquiries   → unread *pending standard* enquiries (actionable Open Enquiry badge),
 *                   NOT all-time enquiry history. Use enquiries.total only if the tile
 *                   is meant as a history counter like the other two.
 */
async function getUserProfileCounts(userId) {
  await expireStaleEnquiries();

  const userFilter = { user: userId };
  const pendingStandard = { user: userId, status: "pending", source: "standard" };
  const pendingUnread = { ...pendingStandard, userUnread: { $ne: false } };
  const openEnquiries = { user: userId, status: { $in: OPEN_STATUSES } };

  const [
    ordersTotal,
    bookingsTotal,
    enquiriesTotal,
    enquiriesOpen,
    enquiriesPendingStandard,
    enquiriesPendingUnread,
  ] = await Promise.all([
    Order.countDocuments(userFilter),
    VenueOrder.countDocuments(userFilter),
    VenueEnquiry.countDocuments(userFilter),
    VenueEnquiry.countDocuments(openEnquiries),
    VenueEnquiry.countDocuments(pendingStandard),
    VenueEnquiry.countDocuments(pendingUnread),
  ]);

  return {
    orders: { total: ordersTotal },
    bookings: { total: bookingsTotal },
    enquiries: {
      total: enquiriesTotal,
      open: enquiriesOpen,
      pendingStandard: enquiriesPendingStandard,
      pendingUnread: enquiriesPendingUnread,
      /** @deprecated alias — same as pendingUnread (Open Enquiry badge) */
      unreadCount: enquiriesPendingUnread,
    },
    /** Ready-to-bind values for Profile tiles */
    badges: {
      orderHistory: ordersTotal,
      bookingHistory: bookingsTotal,
      myEnquiries: enquiriesPendingUnread,
    },
  };
}

module.exports = {
  getUserProfileCounts,
};

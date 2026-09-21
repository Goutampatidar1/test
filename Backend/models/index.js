const Admin = require("./entity/admin");
const AppConfig = require("./bussiness/appConfig");
const User = require("./entity/user");
const Vendor = require("./entity/vendor");
const VenueVendor = require("./entity/venueVendor");
const DeliveryBoy = require("./entity/deliveryboy");
const Page = require("./bussiness/page");
const Product = require("./other/product");
const ProductVideoFeed = require("./other/productVideoFeed");
const ProductVideoFeedLike = require("./other/productVideoFeedLike");
const VenueVideoFeed = require("./other/venueVideoFeed");
const VenueVideoFeedLike = require("./other/venueVideoFeedLike");
const ProductRating = require("./other/productRating");
const VenueRating = require("./other/venueRating");
const DeliveryBoyRating = require("./other/deliveryBoyRating");
const Venue = require("./other/venue");
const Amenity = require("./other/amenities");
const Recharge = require("./other/recharge");
const RechargeTransaction = require("./other/rechargeTransaction");
const Order = require("./other/order");
const Transaction = require("./other/transaction");
const Cart = require("./other/cart");
const ShippingAddress = require("./other/shippingAddress");
const Wishlist = require("./other/wishlist");
const VenueCart = require("./other/venueCart");
const VenueOrder = require("./other/venueOrder");
const VenueTransaction = require("./other/venueTransaction");
const VenueWishlist = require("./other/venueWishlist");
const WalletTransaction = require("./other/walletTransaction");
const DeliveryWalletTransaction = require("./other/deliveryWalletTransaction");
const DeliveryWithdrawalRequest = require("./other/deliveryWithdrawalRequest");
const DriverCodSettlement = require("./other/driverCodSettlement");
const VendorWalletTransaction = require("./other/vendorWalletTransaction");
const VendorWithdrawalRequest = require("./other/vendorWithdrawalRequest");
const DeliveryOrderOtp = require("./other/deliveryOrderOtp");

const StaticPageLayout = require("./bussiness/staticPageLayout");

module.exports = {
  Admin,
  AppConfig,
  User,
  Vendor,
  VenueVendor,
  DeliveryBoy,
  Page,
  Product,
  ProductVideoFeed,
  ProductVideoFeedLike,
  VenueVideoFeed,
  VenueVideoFeedLike,
  ProductRating,
  VenueRating,
  DeliveryBoyRating,
  Venue,
  Amenity,
  Recharge,
  RechargeTransaction,
  Order,
  Transaction,
  Cart,
  ShippingAddress,
  Wishlist,
  VenueCart,
  VenueOrder,
  VenueTransaction,
  VenueWishlist,
  WalletTransaction,
  DeliveryWalletTransaction,
  DeliveryWithdrawalRequest,
  DriverCodSettlement,
  VendorWalletTransaction,
  VendorWithdrawalRequest,
  DeliveryOrderOtp,
  StaticPageLayout,
};

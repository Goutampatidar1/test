/**
 * Database Cleanup Script
 * Removes all vendors, products, orders, and services (venues) data
 * 
 * Usage: node scripts/cleanupData.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

// Import all models that need to be cleaned
const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const Product = require("../models/other/product");
const Order = require("../models/other/order");
const Venue = require("../models/other/venue");
const VenueOrder = require("../models/other/venueOrder");
const VenueEnquiry = require("../models/other/venueEnquiry");
const VenueCart = require("../models/other/venueCart");
const VenueRating = require("../models/other/venueRating");
const VenueTransaction = require("../models/other/venueTransaction");
const VenueVideoFeed = require("../models/other/venueVideoFeed");
const VenueVideoFeedLike = require("../models/other/venueVideoFeedLike");
const VenueWishlist = require("../models/other/venueWishlist");
const ProductRating = require("../models/other/productRating");
const ProductVideoFeed = require("../models/other/productVideoFeed");
const ProductVideoFeedLike = require("../models/other/productVideoFeedLike");
const Cart = require("../models/other/cart");
const Wishlist = require("../models/other/wishlist");
const Transaction = require("../models/other/transaction");
const VendorWalletTransaction = require("../models/other/vendorWalletTransaction");
const VendorWithdrawalRequest = require("../models/other/vendorWithdrawalRequest");
const VendorPlanSubscription = require("../models/other/vendorPlanSubscription");
const DeliveryOrderOtp = require("../models/other/deliveryOrderOtp");
const HotDealRule = require("../models/other/hotDealRule");
const Promotion = require("../models/other/promotion");
const PromotionSubscription = require("../models/other/promotionSubscription");
const RecentView = require("../models/other/recentView");
const ShippingAddress = require("../models/other/shippingAddress");

async function cleanup() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/ohoebazar";
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB successfully!\n");

    console.log("=".repeat(50));
    console.log("  DATABASE CLEANUP - REMOVING ALL DATA");
    console.log("=".repeat(50));
    console.log("\nThis will delete:");
    console.log("  - All Vendors (E-commerce)");
    console.log("  - All Venue Vendors (Services)");
    console.log("  - All Products");
    console.log("  - All Orders (E-commerce & Venue)");
    console.log("  - All Venues (Services)");
    console.log("  - All related data (carts, ratings, transactions, etc.)");
    console.log("\n" + "=".repeat(50) + "\n");

    // Delete in order (child records first, then parent records)
    const deletions = [
      // Product related
      { model: ProductVideoFeedLike, name: "Product Video Feed Likes" },
      { model: ProductVideoFeed, name: "Product Video Feeds" },
      { model: ProductRating, name: "Product Ratings" },
      
      // Venue/Service related
      { model: VenueVideoFeedLike, name: "Venue Video Feed Likes" },
      { model: VenueVideoFeed, name: "Venue Video Feeds" },
      { model: VenueRating, name: "Venue Ratings" },
      { model: VenueWishlist, name: "Venue Wishlists" },
      { model: VenueCart, name: "Venue Carts" },
      { model: VenueTransaction, name: "Venue Transactions" },
      { model: VenueEnquiry, name: "Venue Enquiries" },
      { model: VenueOrder, name: "Venue Orders" },
      { model: Venue, name: "Venues (Services)" },
      
      // E-commerce Order related
      { model: DeliveryOrderOtp, name: "Delivery Order OTPs" },
      { model: Transaction, name: "Transactions" },
      { model: Order, name: "E-commerce Orders" },
      
      // Cart & Wishlist
      { model: Cart, name: "Carts" },
      { model: Wishlist, name: "Wishlists" },
      { model: RecentView, name: "Recent Views" },
      { model: ShippingAddress, name: "Shipping Addresses" },
      
      // Vendor related
      { model: VendorWalletTransaction, name: "Vendor Wallet Transactions" },
      { model: VendorWithdrawalRequest, name: "Vendor Withdrawal Requests" },
      { model: VendorPlanSubscription, name: "Vendor Plan Subscriptions" },
      { model: PromotionSubscription, name: "Promotion Subscriptions" },
      { model: Promotion, name: "Promotions" },
      { model: HotDealRule, name: "Hot Deal Rules" },
      
      // Main entities (delete last)
      { model: Product, name: "Products" },
      { model: VenueVendor, name: "Venue Vendors (Service Providers)" },
      { model: Vendor, name: "Vendors (E-commerce)" },
    ];

    let totalDeleted = 0;

    for (const { model, name } of deletions) {
      try {
        const countBefore = await model.countDocuments();
        if (countBefore > 0) {
          const result = await model.deleteMany({});
          console.log(`✓ Deleted ${result.deletedCount} ${name}`);
          totalDeleted += result.deletedCount;
        } else {
          console.log(`- ${name}: No records to delete`);
        }
      } catch (err) {
        console.error(`✗ Error deleting ${name}:`, err.message);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`  CLEANUP COMPLETE - ${totalDeleted} total records deleted`);
    console.log("=".repeat(50) + "\n");

  } catch (error) {
    console.error("Error during cleanup:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the cleanup
cleanup();

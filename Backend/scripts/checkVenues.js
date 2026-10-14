const mongoose = require("mongoose");
require("dotenv").config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DB_URL);
  
  // Load required models directly
  const Venue = require("../models/other/venue");
  const VenueVendor = require("../models/entity/venueVendor");
  const Category = require("../models/other/category");

  // Check all venues
  const venues = await Venue.find({})
    .select("name city status adminApproved role addedById thumbnail dayPrice hourlyPrice basePrice category")
    .lean();

  console.log("\n=== ALL VENUES (" + venues.length + ") ===");
  for (const v of venues) {
    const hasPrice = v.dayPrice > 0 || v.hourlyPrice > 0 || v.basePrice > 0;
    const cat = v.category ? await Category.findById(v.category).select("name status").lean() : null;
    console.log(
      "- " + v.name +
      " | City: " + v.city +
      " | Status: " + v.status +
      " | AdminApproved: " + v.adminApproved +
      " | Role: " + v.role +
      " | HasThumb: " + !!v.thumbnail +
      " | HasPrice: " + hasPrice +
      " | Category: " + (cat?.name || "NONE") + " (" + (cat?.status || "N/A") + ")"
    );
  }

  // Check venue vendors
  const vendors = await VenueVendor.find({})
    .select("name businessName city approvalStatus status isOpen")
    .lean();

  console.log("\n=== VENUE VENDORS (" + vendors.length + ") ===");
  vendors.forEach((v) => {
    console.log(
      "- " + (v.name || v.businessName) +
      " | City: " + v.city +
      " | Status: " + v.status +
      " | Approval: " + v.approvalStatus +
      " | isOpen: " + v.isOpen
    );
  });

  // Check what the public filter would match
  const { activePublicVenueListingFilterOpen, isVenueListable, getClosedVenueVendorIds } = require("../utils/publicVenueList");
  
  const closedIds = await getClosedVenueVendorIds();
  console.log("\n=== CLOSED VENDOR IDS (" + closedIds.length + ") ===");
  closedIds.forEach((id) => console.log("- " + id));
  
  const filter = await activePublicVenueListingFilterOpen();
  console.log("\n=== PUBLIC FILTER ===");
  console.log(JSON.stringify(filter, null, 2));

  const publicVenues = await Venue.find(filter).lean();
  console.log("\n=== VENUES MATCHING PUBLIC FILTER (" + publicVenues.length + ") ===");
  publicVenues.forEach((v) => {
    console.log("- " + v.name + " | City: " + v.city);
  });

  // Check which ones pass isVenueListable
  console.log("\n=== CHECKING isVenueListable FOR ALL VENUES ===");
  for (const v of venues) {
    const cat = v.category ? await Category.findById(v.category).lean() : null;
    const vWithCat = { ...v, category: cat };
    const listable = isVenueListable(vWithCat);
    const { getVenueDisplayPrice } = require("../utils/venuePricing");
    const price = getVenueDisplayPrice(v);
    if (!listable) {
      console.log("BLOCKED: " + v.name + " | status=" + v.status + " | adminApproved=" + v.adminApproved + " | thumb=" + !!v.thumbnail + " | cat=" + !!v.category + " | price=" + price.amount);
    } else {
      console.log("OK: " + v.name);
    }
  }

  await mongoose.disconnect();
}

check().catch((e) => {
  console.error(e);
  process.exit(1);
});

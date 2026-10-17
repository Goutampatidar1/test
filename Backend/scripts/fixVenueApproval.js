const mongoose = require("mongoose");
require("dotenv").config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DB_URL);
  
  const Venue = require("../models/other/venue");
  const VenueVendor = require("../models/entity/venueVendor");
  const SubDistrict = require("../models/other/subDistrict");
  
  // Fix all unapproved venues
  const approvalResult = await Venue.updateMany(
    { adminApproved: false },
    { $set: { adminApproved: true } }
  );
  console.log("Updated venues with adminApproved: false ->", approvalResult.modifiedCount);
  
  // Fix venues without city/state/address - copy from vendor
  const venuesWithoutLocation = await Venue.find({ 
    role: "VenueVendor",
    $or: [
      { city: "" }, { city: null }, { city: { $exists: false } },
      { state: "" }, { state: null }, { state: { $exists: false } },
      { address: "" }, { address: null }, { address: { $exists: false } }
    ]
  }).lean();
  
  console.log("\nVenues with missing location data:", venuesWithoutLocation.length);
  
  for (const venue of venuesWithoutLocation) {
    const vendor = await VenueVendor.findById(venue.addedById)
      .select("city state businessAddress subDistrict")
      .lean();
    
    if (!vendor) {
      console.log("- Skipping " + venue.name + " (vendor not found)");
      continue;
    }
    
    const updates = {};
    
    // Fix city
    if ((!venue.city || venue.city === "") && vendor.city) {
      updates.city = vendor.city;
    }
    
    // Fix state
    if ((!venue.state || venue.state === "") && vendor.state) {
      updates.state = vendor.state;
    }
    
    // Fix address
    if ((!venue.address || venue.address === "") && vendor.businessAddress) {
      updates.address = vendor.businessAddress;
    }
    
    // Fix subDistrict
    if (!venue.subDistrict && vendor.subDistrict) {
      const subDistrict = await SubDistrict.findOne({
        name: { $regex: new RegExp("^" + vendor.subDistrict.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
        status: "active",
      }).select("_id").lean();
      if (subDistrict) {
        updates.subDistrict = subDistrict._id;
      }
    }
    
    if (Object.keys(updates).length > 0) {
      await Venue.updateOne({ _id: venue._id }, { $set: updates });
      console.log("- Fixed " + venue.name + ": " + Object.keys(updates).join(", "));
    } else {
      console.log("- No updates needed for " + venue.name);
    }
  }
  
  // Verify
  const venues = await Venue.find({}).select("name adminApproved city state address").lean();
  console.log("\nAll venues after fix:");
  venues.forEach(v => {
    console.log("- " + v.name + " | approved: " + v.adminApproved + " | city: " + (v.city || "(empty)") + " | state: " + (v.state || "(empty)") + " | address: " + (v.address ? "yes" : "(empty)"));
  });
  
  await mongoose.disconnect();
}

fix().catch((e) => {
  console.error(e);
  process.exit(1);
});

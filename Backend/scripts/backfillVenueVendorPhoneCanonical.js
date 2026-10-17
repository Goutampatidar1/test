/**
 * One-off: ensure every VenueVendor has phoneCanonical matching normalized phone
 * so OTP login can find service-only accounts.
 *
 * Usage: node scripts/backfillVenueVendorPhoneCanonical.js
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const uri = (env.match(/^MONGODB_URI=(.+)$/m) || [])[1];
if (!uri) throw new Error("MONGODB_URI missing");

const VenueVendor = require("../models/entity/venueVendor");
const { normalizePhone } = require("../utils/phone");

(async () => {
  await mongoose.connect(uri.trim());
  const rows = await VenueVendor.find().select("+phoneCanonical phone").lean();
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const phoneNorm = normalizePhone(row.phone);
      if (row.phone === phoneNorm && row.phoneCanonical === phoneNorm) {
        skipped += 1;
        continue;
      }
      await VenueVendor.updateOne(
        { _id: row._id },
        { $set: { phone: phoneNorm, phoneCanonical: phoneNorm } }
      );
      updated += 1;
      console.log("updated", String(row._id), row.phone, "->", phoneNorm);
    } catch (err) {
      console.warn("skip", String(row._id), err.message);
    }
  }
  console.log({ total: rows.length, updated, skipped });
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

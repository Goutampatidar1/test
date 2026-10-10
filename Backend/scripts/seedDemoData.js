/**
 * Demo data for the new admin sections (safe to re-run; skips rows that already exist).
 *
 *   node scripts/seedDemoData.js                # add demo data
 *   node scripts/seedDemoData.js --remove       # delete everything this script created
 *   node scripts/seedDemoData.js --allow-remote # required when MONGODB_URI is not a local database
 *
 * Everything created is tagged so --remove can find it:
 *   users  -> email ends with @demo.ohoebazar.local
 *   products -> sku starts with DEMO-HD-
 *   hot deal rules / banners -> name/title starts with "Demo"
 *   enquiries -> enquiryNumber starts with DEMO-ENQ-
 *   venue discounts -> discountLabel "Demo offer"
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const mongoose = require("mongoose");
const config = require("../config");
const { AppConfig, User, Vendor, Product, Venue, VenueEnquiry, HotDealRule } = require("../models");
const Banner = require("../models/other/banner");
const VendorPlan = require("../models/other/vendorPlan");

const args = process.argv.slice(2);
const REMOVE = args.includes("--remove");
const ALLOW_REMOTE = args.includes("--allow-remote");

const DEMO_EMAIL_RE = /@demo\.ohoebazar\.local$/;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const daysFromNow = (n) => new Date(Date.now() + n * DAY);
const hoursFromNow = (n) => new Date(Date.now() + n * HOUR);
const ymd = (date) => date.toISOString().slice(0, 10);

async function removeDemo() {
  const demoUsers = await User.find({ email: DEMO_EMAIL_RE }).select("_id").lean();
  const results = await Promise.all([
    VenueEnquiry.deleteMany({ enquiryNumber: /^DEMO-ENQ-/ }),
    Product.deleteMany({ sku: /^DEMO-HD-/ }),
    HotDealRule.deleteMany({ name: /^Demo/ }),
    Banner.deleteMany({ title: /^Demo/ }),
    User.deleteMany({ _id: { $in: demoUsers.map((u) => u._id) } }),
    Venue.updateMany(
      { discountLabel: "Demo offer" },
      { $set: { discountValue: 0, discountLabel: "", discountStartsAt: null, discountEndsAt: null } }
    ),
  ]);
  const [enq, prod, rules, banners, users, venues] = results;
  console.log(
    `Removed: ${enq.deletedCount} enquiries, ${prod.deletedCount} products, ${rules.deletedCount} rules, ` +
      `${banners.deletedCount} banners, ${users.deletedCount} users; reset ${venues.modifiedCount} venue discounts.`
  );
  console.log("Show Number plans and app settings were left in place.");
}

async function ensureAppConfig() {
  const existing = await AppConfig.findOne().select("_id").lean();
  if (existing) return false;
  await AppConfig.create({
    app_name: "Oho Ebazar",
    app_email: "admin@ohoebazar.local",
    app_mobile: "9000000000",
  });
  return true;
}

async function ensureUsers() {
  const people = [
    { name: "Demo Riya Sharma", phone: "9000000101", email: "riya@demo.ohoebazar.local", city: "Indore" },
    { name: "Demo Arjun Patel", phone: "9000000102", email: "arjun@demo.ohoebazar.local", city: "Bhopal" },
    { name: "Demo Neha Verma", phone: "9000000103", email: "neha@demo.ohoebazar.local", city: "Indore" },
  ];
  const out = [];
  for (const p of people) {
    let user = await User.findOne({ email: p.email });
    if (!user) user = await User.create({ ...p, status: "active" });
    out.push(user);
  }
  return out;
}

async function ensureRules() {
  const rules = [
    {
      name: "Demo: Festive 20% off",
      badge: "Festive deal",
      description: "Vendor opt-ins with at least 20% off. Needs admin approval.",
      minDiscountPercent: 20,
      minStock: 1,
      requireOptIn: true,
      autoApprove: false,
      limit: 12,
      priority: 10,
      status: "active",
    },
    {
      name: "Demo: Mega savings (auto-approve)",
      badge: "Mega deal",
      description: "Opt-ins with 40%+ off go live without waiting for approval.",
      minDiscountPercent: 40,
      minStock: 1,
      requireOptIn: true,
      autoApprove: true,
      limit: 6,
      priority: 20,
      status: "active",
    },
    {
      name: "Demo: Evening flash (6 PM - 11 PM)",
      badge: "Flash deal",
      description: "Any discounted product, only in the evening window.",
      minDiscountPercent: 10,
      minPrice: 200,
      minStock: 1,
      requireOptIn: false,
      autoApprove: false,
      dailyStartHour: 18,
      dailyEndHour: 23,
      limit: 8,
      priority: 5,
      status: "active",
    },
    {
      name: "Demo: Summer clearance (ended)",
      badge: "Clearance",
      description: "Example of a finished campaign.",
      minDiscountPercent: 15,
      requireOptIn: true,
      startsAt: daysFromNow(-60),
      endsAt: daysFromNow(-30),
      limit: 12,
      priority: 1,
      status: "inactive",
    },
  ];
  let created = 0;
  for (const rule of rules) {
    if (await HotDealRule.exists({ name: rule.name })) continue;
    await HotDealRule.create(rule);
    created += 1;
  }
  return created;
}

async function ensureProducts(vendor, template) {
  if (!vendor || !template) {
    console.log("Skipping hot deal products: need at least one ecom vendor and one existing product.");
    return 0;
  }
  const now = Date.now();
  const products = [
    { sku: "DEMO-HD-001", name: "Demo Cotton Kurta", price: 1299, discountValue: 30, stock: 40, hotDeal: "approved", ago: 50 },
    { sku: "DEMO-HD-002", name: "Demo Wireless Earbuds", price: 2499, discountValue: 45, stock: 25, hotDeal: "approved", ago: 30 },
    { sku: "DEMO-HD-003", name: "Demo Steel Water Bottle", price: 599, discountValue: 25, stock: 60, hotDeal: "pending", ago: 6 },
    { sku: "DEMO-HD-004", name: "Demo Leather Wallet", price: 899, discountValue: 15, stock: 18, hotDeal: "pending", ago: 3 },
    {
      sku: "DEMO-HD-005",
      name: "Demo Ceramic Mug Set",
      price: 749,
      discountValue: 10,
      stock: 12,
      hotDeal: "rejected",
      reason: "Discount too small for Hot Deals. Please offer at least 20% off.",
      ago: 26,
    },
  ];
  let created = 0;
  for (const p of products) {
    if (await Product.exists({ sku: p.sku })) continue;
    const requestedAt = new Date(now - p.ago * HOUR);
    await Product.create({
      name: p.name,
      slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      sku: p.sku,
      description: `${p.name} - sample product created for testing Hot Deals.`,
      shortDescription: "Sample product for Hot Deals testing",
      category: template.category,
      subCategory: template.subCategory,
      price: p.price,
      stock: p.stock,
      discountType: "percentage",
      discountValue: p.discountValue,
      variantType: "single",
      thumbnail: template.thumbnail,
      images: template.thumbnail ? [template.thumbnail] : [],
      role: "Vendor",
      addedById: vendor._id,
      adminApproved: true,
      status: "active",
      vendorProfileScore: 80,
      hotDeal: {
        optIn: true,
        status: p.hotDeal,
        requestedAt,
        reviewedAt: p.hotDeal === "pending" ? null : new Date(requestedAt.getTime() + 2 * HOUR),
        rejectionReason: p.reason || "",
        rule: null,
      },
    });
    created += 1;
  }
  return created;
}

async function ensureEnquiries(users, venues) {
  if (!users.length || !venues.length) {
    console.log("Skipping enquiries: need at least one venue.");
    return 0;
  }
  const venueAt = (i) => venues[i % venues.length];
  const vendorOf = (venue) => (venue.role === "VenueVendor" ? venue.addedById : null);
  const now = Date.now();

  const rows = [
    {
      n: 1,
      status: "pending",
      user: 0,
      venue: 0,
      bookingDates: [ymd(daysFromNow(12))],
      guestCount: 150,
      eventType: "Wedding reception",
      message: "Looking for the hall with decoration and catering for around 150 guests.",
      preferredCallTime: "Evening, 6-8 PM",
      quote: { subtotal: 45000, discount: 0, total: 45000, note: "Full day booking" },
      responseDueAt: hoursFromNow(36),
      createdAgo: 12,
    },
    {
      n: 2,
      status: "pending",
      source: "quick",
      user: 1,
      venue: 1,
      bookingDates: [],
      guestCount: 40,
      eventType: "Birthday party",
      message: "Please call me back with prices for a small birthday party.",
      preferredCallTime: "Anytime",
      responseDueAt: hoursFromNow(20),
      createdAgo: 28,
    },
    {
      n: 3,
      status: "accepted",
      user: 2,
      venue: 2,
      bookingDates: [ymd(daysFromNow(20)), ymd(daysFromNow(21))],
      guestCount: 300,
      eventType: "Corporate event",
      message: "Two-day company annual meet.",
      quote: { subtotal: 90000, discount: 9000, total: 81000, note: "10% weekday discount" },
      vendorNote: "Available on both days. Projector and sound included.",
      acceptedAt: new Date(now - 2 * HOUR),
      holdExpiresAt: hoursFromNow(22),
      responseDueAt: new Date(now + 20 * HOUR),
      createdAgo: 30,
    },
    {
      n: 4,
      status: "converted",
      user: 0,
      venue: 3,
      bookingDates: [ymd(daysFromNow(7))],
      guestCount: 80,
      eventType: "Engagement",
      quote: { subtotal: 30000, discount: 0, total: 30000 },
      vendorNote: "Confirmed. See you there!",
      acceptedAt: new Date(now - 3 * DAY),
      convertedAt: new Date(now - 2 * DAY),
      responseDueAt: new Date(now - 3 * DAY),
      createdAgo: 96,
    },
    {
      n: 5,
      status: "rejected",
      user: 1,
      venue: 0,
      bookingDates: [ymd(daysFromNow(5))],
      guestCount: 500,
      eventType: "Conference",
      rejectionReason: "Hall capacity is 300 guests, so we cannot host 500.",
      responseDueAt: new Date(now - DAY),
      createdAgo: 50,
    },
    {
      n: 6,
      status: "cancelled",
      user: 2,
      venue: 1,
      bookingDates: [ymd(daysFromNow(15))],
      guestCount: 60,
      eventType: "Kitty party",
      cancellationReason: "Plans changed, event postponed.",
      responseDueAt: new Date(now - 10 * HOUR),
      createdAgo: 40,
    },
    {
      n: 7,
      status: "expired",
      user: 0,
      venue: 2,
      bookingDates: [ymd(daysFromNow(3))],
      guestCount: 120,
      eventType: "Anniversary",
      message: "Need the lawn for an evening function.",
      responseDueAt: new Date(now - 6 * HOUR),
      createdAgo: 54,
    },
  ];

  let created = 0;
  for (const row of rows) {
    const enquiryNumber = `DEMO-ENQ-${String(row.n).padStart(4, "0")}`;
    if (await VenueEnquiry.exists({ enquiryNumber })) continue;
    const user = users[row.user % users.length];
    const venue = venueAt(row.venue);
    const createdAt = new Date(now - row.createdAgo * HOUR);
    await VenueEnquiry.create({
      enquiryNumber,
      user: user._id,
      venue: venue._id,
      vendor: vendorOf(venue),
      source: row.source || "standard",
      status: row.status,
      bookingType: "full_day",
      bookingDates: row.bookingDates,
      guestCount: row.guestCount,
      eventType: row.eventType,
      message: row.message || "",
      contact: { name: user.name, phone: user.phone, email: user.email, countryCode: "+91" },
      preferredCallTime: row.preferredCallTime || "",
      quote: row.quote || {},
      vendorNote: row.vendorNote || "",
      rejectionReason: row.rejectionReason || "",
      cancellationReason: row.cancellationReason || "",
      responseDueAt: row.responseDueAt,
      respondedAt: row.acceptedAt || (row.status === "rejected" ? new Date(createdAt.getTime() + 3 * HOUR) : null),
      acceptedAt: row.acceptedAt || null,
      holdExpiresAt: row.holdExpiresAt || null,
      convertedAt: row.convertedAt || null,
      createdAt,
    });
    created += 1;
  }
  return created;
}

async function ensureBanners(image) {
  if (!image) {
    console.log("Skipping banners: no existing image to reuse.");
    return 0;
  }
  const banners = [
    {
      title: "Demo Festive Mega Sale",
      targetType: "user",
      subtitle: "Up to 50% off on fashion and electronics",
      description: "Top brands at the lowest prices of the season. Limited stock.",
      ctaText: "Shop now",
      badge: "Limited time",
      bgColor: "#B91C1C",
      textColor: "#FFFFFF",
      displayOrder: 1,
      showTimer: true,
      timerLabel: "Sale ends in",
      timerEndsAt: daysFromNow(3),
    },
    {
      title: "Demo New Arrivals",
      targetType: "user",
      subtitle: "Fresh picks from local shops near you",
      ctaText: "Explore",
      badge: "New",
      bgColor: "#1D4ED8",
      textColor: "#FFFFFF",
      displayOrder: 2,
    },
    {
      title: "Demo Book Venues Early",
      targetType: "user",
      subtitle: "Flat 10% off on weekday bookings",
      ctaText: "Find venues",
      bgColor: "#065F46",
      textColor: "#ECFDF5",
      displayOrder: 3,
      showTimer: true,
      timerLabel: "Offer ends in",
      timerEndsAt: hoursFromNow(30),
    },
    {
      title: "Demo Boost Your Shop",
      targetType: "ecom",
      subtitle: "Join Hot Deals and reach more customers",
      ctaText: "Opt in now",
      badge: "For vendors",
      bgColor: "#F59E0B",
      textColor: "#111827",
      displayOrder: 1,
    },
  ];
  let created = 0;
  for (const b of banners) {
    if (await Banner.exists({ title: b.title })) continue;
    await Banner.create({
      mode: "global",
      image,
      related: "none",
      status: "active",
      startDate: daysFromNow(-1),
      endDate: daysFromNow(30),
      ...b,
    });
    created += 1;
  }
  return created;
}

async function ensurePhonePlans() {
  const farEnd = daysFromNow(20 * 365);
  const tiers = [
    {
      name: "Show Number - Monthly",
      durationDays: 30,
      price: 199,
      sortOrder: 1,
      description: "Let customers call you directly for 30 days.",
      benefits: ["Phone number visible on your listings", "Direct calls from customers"],
    },
    {
      name: "Show Number - Quarterly",
      durationDays: 90,
      price: 499,
      sortOrder: 2,
      badge: "Popular",
      isRecommended: true,
      description: "3 months of direct customer calls at a lower monthly cost.",
      benefits: ["Phone number visible on your listings", "Direct calls from customers", "Save over 15% vs monthly"],
    },
    {
      name: "Show Number - Yearly",
      durationDays: 365,
      price: 1499,
      sortOrder: 3,
      badge: "Best value",
      description: "A full year of direct customer calls at the best price.",
      benefits: ["Phone number visible on your listings", "Direct calls from customers", "Save over 35% vs monthly"],
    },
  ];
  let created = 0;
  for (const tier of tiers) {
    if (await VendorPlan.exists({ planType: "show_phone", name: tier.name })) continue;
    await VendorPlan.create({
      ...tier,
      planType: "show_phone",
      vendorType: "both",
      startDate: new Date(),
      endDate: farEnd,
      status: "active",
    });
    created += 1;
  }
  return created;
}

async function ensureVenueDiscounts(venues) {
  let updated = 0;
  const offers = [
    { discountType: "percentage", discountValue: 15, startsAt: daysFromNow(-2), endsAt: daysFromNow(10) },
    { discountType: "flat", discountValue: 2000, startsAt: daysFromNow(5), endsAt: daysFromNow(20) },
  ];
  for (const [i, offer] of offers.entries()) {
    const venue = venues[i];
    if (!venue || Number(venue.discountValue) > 0) continue;
    await Venue.updateOne(
      { _id: venue._id },
      {
        $set: {
          discountType: offer.discountType,
          discountValue: offer.discountValue,
          discountLabel: "Demo offer",
          discountStartsAt: offer.startsAt,
          discountEndsAt: offer.endsAt,
        },
      }
    );
    updated += 1;
  }
  return updated;
}

async function seed() {
  const configCreated = await ensureAppConfig();
  const users = await ensureUsers();
  const vendor = await Vendor.findOne().sort({ createdAt: 1 }).lean();
  const template = await Product.findOne({ sku: { $not: /^DEMO-HD-/ }, thumbnail: { $ne: "" } })
    .select("category subCategory thumbnail")
    .lean();
  const venues = await Venue.find().sort({ createdAt: 1 }).limit(4).lean();
  const existingBanner = await Banner.findOne({ title: { $not: /^Demo/ } }).select("image").lean();
  const bannerImage = existingBanner?.image || template?.thumbnail || venues[0]?.thumbnail || "";

  const counts = {
    appConfig: configCreated ? "created" : "already existed",
    users: users.length,
    hotDealRules: await ensureRules(),
    hotDealProducts: await ensureProducts(vendor, template),
    enquiries: await ensureEnquiries(users, venues),
    banners: await ensureBanners(bannerImage),
    showNumberPlans: await ensurePhonePlans(),
    venueDiscounts: await ensureVenueDiscounts(venues),
  };
  console.log("Demo data ready (numbers are newly created rows):");
  console.table(counts);
}

async function main() {
  if (!config.mongodbUri) throw new Error("MONGODB_URI is not set in Backend/.env");
  await mongoose.connect(config.mongodbUri);
  const { host, name } = mongoose.connection;
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(host);
  console.log(`Connected to ${host} / ${name}`);
  if (!isLocal && !ALLOW_REMOTE) {
    throw new Error("Refusing to touch a non-local database. Re-run with --allow-remote if you really mean it.");
  }
  if (REMOVE) await removeDemo();
  else await seed();
}

main()
  .catch((err) => {
    console.error("seedDemoData failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

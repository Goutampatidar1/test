/**
 * Full database seed. Safe to run again: existing seed rows are updated, not duplicated.
 *
 *   npm run seed:all
 *
 * Step 1 runs scripts/seed.js (admin, categories, locations, vendors, services, promotion plans).
 * Step 2 fills every other admin screen: users, delivery, amenities, catalog, banners,
 * hot deals, enquiries, orders, payments, recharges, plans, FAQs, pages, and notifications.
 *
 * Logins (password 12345678):
 *   Admin          admin@gmail.com
 *   Shop vendors   shop@example.com and the other addresses printed by the base seed
 *   Customers      riya@ohoebazar.local, arjun@ohoebazar.local
 *   Drivers        ravi.driver@ohoebazar.local
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const { spawn } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");
const config = require("../config");
const { hashPassword } = require("../utils/password");
const {
  Admin,
  AppConfig,
  User,
  Vendor,
  VenueVendor,
  DeliveryBoy,
  Page,
  Product,
  Venue,
  Amenity,
  Recharge,
  RechargeTransaction,
  Order,
  Transaction,
  VenueOrder,
  VenueEnquiry,
  HotDealRule,
  VenueTransaction,
  DeliveryWithdrawalRequest,
  DriverCodSettlement,
  VendorWithdrawalRequest,
  ProductVideoFeed,
  VenueVideoFeed,
} = require("../models");
const Category = require("../models/other/category");
const SubCategory = require("../models/other/subCategory");
const ChildCategory = require("../models/other/childCategory");
const AttributeTitle = require("../models/other/attributeTitle");
const AttributeValue = require("../models/other/attributeValue");
const Banner = require("../models/other/banner");
const Faq = require("../models/other/faq");
const Promotion = require("../models/other/promotion");
const VendorPlan = require("../models/other/vendorPlan");
const Notification = require("../models/other/notification");
const AppNotification = require("../models/other/appNotification");

const IMG = "/uploads/venue-categories/other.svg";
const DOC = "/uploads/seed/placeholder-doc.png";
const VIDEO = "/uploads/seed/sample-reel.mp4";
const PASSWORD = "12345678";
const DAY = 24 * 60 * 60 * 1000;

const daysFromNow = (n) => new Date(Date.now() + n * DAY);
const ymd = (date) => date.toISOString().slice(0, 10);

function runBaseSeed() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "seed.js")], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Base seed exited with code ${code}`));
    });
  });
}

async function upsert(Model, filter, data) {
  const existing = await Model.findOne(filter);
  if (existing) {
    existing.set(data);
    await existing.save();
    return existing;
  }
  return Model.create({ ...filter, ...data });
}

async function categoryId(name, mode) {
  const row = await Category.findOne({ name, mode }).select("_id").lean();
  return row?._id || null;
}

async function subCategoryId(name, category) {
  if (!category) return null;
  const row = await SubCategory.findOne({ name, category }).select("_id").lean();
  return row?._id || null;
}

async function seedUsers(passwordHash) {
  const people = [
    { name: "Riya Sharma", email: "riya@ohoebazar.local", phone: "9811100001", city: "Bengaluru", gender: "female", walletBalance: 250, status: "active" },
    { name: "Arjun Patel", email: "arjun@ohoebazar.local", phone: "9811100002", city: "Mumbai", gender: "male", walletBalance: 0, status: "active" },
    { name: "Neha Verma", email: "neha@ohoebazar.local", phone: "9811100003", city: "Bengaluru", gender: "female", walletBalance: 80, status: "active" },
    { name: "Karan Joshi", email: "karan@ohoebazar.local", phone: "9811100004", city: "Mumbai", gender: "male", walletBalance: 0, status: "inactive" },
    { name: "Meera Iyer", email: "meera@ohoebazar.local", phone: "9811100005", city: "Bengaluru", gender: "female", walletBalance: 1200, status: "blocked" },
  ];
  const users = [];
  for (const person of people) {
    users.push(await upsert(User, { email: person.email }, { ...person, passwordHash }));
  }
  console.log(`Users: ${users.length}`);
  return users;
}

async function seedDelivery(passwordHash) {
  const drivers = [
    {
      name: "Ravi Kumar",
      email: "ravi.driver@ohoebazar.local",
      phone: "9822200001",
      city: "Bengaluru",
      address: "Indiranagar, Bengaluru",
      gender: "male",
      vehicleType: "Bike",
      vehicleRegistrationNumber: "KA 03 AB 1201",
      licenseNumber: "KA0120210001201",
      approvalStatus: "approved",
      status: "active",
      walletBalance: 640,
      codPendingBalance: 850,
      bankName: "HDFC Bank",
      branchName: "Indiranagar",
      accountNumber: "50100222000011",
      ifscCode: "HDFC0001201",
      bankAccountName: "Ravi Kumar",
    },
    {
      name: "Suresh Yadav",
      email: "suresh.driver@ohoebazar.local",
      phone: "9822200002",
      city: "Mumbai",
      address: "Andheri West, Mumbai",
      gender: "male",
      vehicleType: "Scooter",
      vehicleRegistrationNumber: "MH 02 CD 4455",
      licenseNumber: "MH0220220004455",
      approvalStatus: "pending",
      status: "inactive",
      walletBalance: 0,
      codPendingBalance: 0,
    },
    {
      name: "Pooja Nair",
      email: "pooja.driver@ohoebazar.local",
      phone: "9822200003",
      city: "Bengaluru",
      gender: "female",
      vehicleType: "Bike",
      approvalStatus: "rejected",
      status: "inactive",
      walletBalance: 0,
      codPendingBalance: 0,
    },
  ];
  const saved = [];
  for (const driver of drivers) {
    saved.push(
      await upsert(DeliveryBoy, { email: driver.email }, {
        ...driver,
        passwordHash,
        drivingLicenseFront: DOC,
        drivingLicenseBack: DOC,
        aadhaarCardFront: DOC,
        aadhaarCardBack: DOC,
      })
    );
  }
  console.log(`Delivery partners: ${saved.length}`);
  return saved;
}

async function seedPendingVendors(passwordHash) {
  const groceries = await categoryId("Groceries", "ecom");
  const catering = await categoryId("Catering", "venue");
  await upsert(Vendor, { email: "pending.shop@ohoebazar.local" }, {
    name: "Pending Shop Owner",
    phone: "9833300001",
    passwordHash,
    businessName: "New Corner Store",
    businessPhone: "9833300001",
    businessAddress: "44 MG Road, Bengaluru, Karnataka 560001",
    category: groceries,
    approvalStatus: "pending",
    status: "inactive",
    vendorPanelType: "ecom",
    shopLogo: IMG,
    aadhaarCardFront: DOC,
    aadhaarCardBack: DOC,
  });
  await upsert(Vendor, { email: "rejected.shop@ohoebazar.local" }, {
    name: "Rejected Shop Owner",
    phone: "9833300002",
    passwordHash,
    businessName: "Closed Counter",
    businessPhone: "9833300002",
    businessAddress: "2 Linking Road, Mumbai, Maharashtra 400050",
    category: groceries,
    approvalStatus: "rejected",
    rejectionReason: "Shop photos were unclear. Please upload a photo of the storefront.",
    status: "inactive",
    vendorPanelType: "ecom",
  });
  await upsert(VenueVendor, { email: "pending.service@ohoebazar.local" }, {
    name: "Pending Service Owner",
    phone: "9833300003",
    passwordHash,
    businessName: "New Stage Decor",
    businessPhone: "9833300003",
    businessAddress: "Koramangala, Bengaluru",
    category: catering,
    approvalStatus: "pending",
    status: "inactive",
    vendorPanelType: "service",
  });
  console.log("Pending and rejected vendors: 3");
}

async function seedAmenities(adminId) {
  const names = [
    ["Parking", "Covered and open parking for guests"],
    ["Wi-Fi", "Guest Wi-Fi throughout the venue"],
    ["Air Conditioning", "Central or split air conditioning"],
    ["Stage", "Raised stage for ceremonies and performances"],
    ["Sound System", "Microphones, speakers, and a mixer"],
    ["Power Backup", "Generator backup for the full event"],
  ];
  const amenities = [];
  for (const [name, description] of names) {
    amenities.push(
      await upsert(Amenity, { name, role: "Admin" }, {
        description,
        icon: IMG,
        addedById: adminId,
        status: "active",
      })
    );
  }
  const venues = await Venue.find({ role: "VenueVendor" }).limit(4);
  const ids = amenities.slice(0, 4).map((row) => row._id);
  for (const venue of venues) {
    venue.amenities = ids;
    venue.city = venue.city || "Bengaluru";
    venue.state = venue.state || "Karnataka";
    await venue.save();
  }
  console.log(`Amenities: ${amenities.length}`);
  return amenities;
}

async function seedCatalog(adminId) {
  const fashion = await categoryId("Fashion", "ecom");
  const mens = await subCategoryId("Men's Wear", fashion);
  const groceries = await categoryId("Groceries", "ecom");
  const produce = await subCategoryId("Fresh Produce", groceries);
  if (fashion && mens) {
    for (const name of ["T-Shirts", "Shirts"]) {
      await upsert(ChildCategory, { name, subCategory: mens }, {
        category: fashion,
        image: IMG,
        mode: "ecom",
        role: "Admin",
        addedById: adminId,
        status: "active",
      });
    }
    const size = await upsert(AttributeTitle, { title: "Size", subCategory: mens }, {
      category: fashion,
      status: "active",
    });
    for (const value of ["S", "M", "L", "XL"]) {
      await upsert(AttributeValue, { attributeTitle: size._id, value }, { status: "active" });
    }
    const color = await upsert(AttributeTitle, { title: "Color", subCategory: mens }, {
      category: fashion,
      status: "active",
    });
    for (const [value, colorCode] of [["Black", "#111111"], ["White", "#ffffff"], ["Navy", "#1e3a8a"]]) {
      await upsert(AttributeValue, { attributeTitle: color._id, value }, { colorCode, status: "active" });
    }
  }

  const vendors = await Vendor.find({ approvalStatus: "approved", status: "active" }).limit(5);
  const catalog = [
    { sku: "SEED-PRD-001", name: "Basmati Rice 5kg", categoryName: "Groceries", subName: "Fresh Produce", price: 499, stock: 80, discountValue: 10 },
    { sku: "SEED-PRD-002", name: "Women's Cotton Kurta", categoryName: "Fashion", subName: "Women's Wear", price: 1299, stock: 24, discountValue: 25 },
    { sku: "SEED-PRD-003", name: "USB-C Fast Charger", categoryName: "Electronics", subName: "Mobile Accessories", price: 799, stock: 60, discountValue: 15 },
    { sku: "SEED-PRD-004", name: "Non-stick Kadai", categoryName: "Home & Kitchen", subName: "Cookware", price: 1499, stock: 18, discountValue: 20 },
    { sku: "SEED-PRD-005", name: "Aloe Face Wash", categoryName: "Beauty & Personal Care", subName: "Skincare", price: 249, stock: 90, discountValue: 5 },
  ];
  for (let i = 0; i < catalog.length; i += 1) {
    const entry = catalog[i];
    const vendor = vendors[i % Math.max(vendors.length, 1)];
    const category = await categoryId(entry.categoryName, "ecom");
    const subCategory = await subCategoryId(entry.subName, category);
    if (!vendor || !category || !subCategory) continue;
    await upsert(Product, { sku: entry.sku }, {
      name: entry.name,
      slug: entry.sku.toLowerCase(),
      description: `${entry.name} seeded for the admin catalog.`,
      shortDescription: entry.name,
      category,
      subCategory,
      price: entry.price,
      stock: entry.stock,
      discountType: "percentage",
      discountValue: entry.discountValue,
      thumbnail: IMG,
      images: [IMG],
      role: "Vendor",
      addedById: vendor._id,
      adminApproved: true,
      status: "active",
      variantType: "single",
    });
  }

  const reviewVendor = vendors[0];
  if (reviewVendor && groceries && produce) {
    await upsert(Product, { sku: "SEED-PRD-PENDING" }, {
      name: "Pending Approval Honey 500g",
      slug: "seed-prd-pending",
      description: "Waiting for admin approval.",
      shortDescription: "Pending product",
      category: groceries,
      subCategory: produce,
      price: 350,
      stock: 12,
      thumbnail: IMG,
      images: [IMG],
      role: "Vendor",
      addedById: reviewVendor._id,
      adminApproved: false,
      status: "inactive",
      variantType: "single",
    });
  }
  console.log("Child categories, attributes, and extra products seeded");
}

async function seedHotDeals() {
  const festive = await upsert(HotDealRule, { name: "Festive 20% off" }, {
    badge: "Festive deal",
    description: "Vendor opt-ins with at least 20% off. Needs admin approval.",
    minDiscountPercent: 20,
    minStock: 1,
    requireOptIn: true,
    autoApprove: false,
    limit: 12,
    priority: 10,
    status: "active",
  });
  await upsert(HotDealRule, { name: "Mega savings" }, {
    badge: "Mega deal",
    description: "Opt-ins of 40% or more go live without waiting.",
    minDiscountPercent: 40,
    minStock: 1,
    requireOptIn: true,
    autoApprove: true,
    limit: 6,
    priority: 20,
    status: "active",
  });
  await upsert(HotDealRule, { name: "Evening flash" }, {
    badge: "Flash deal",
    description: "Discounted products shown from 6 PM to 11 PM.",
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
  });

  const vendor = await Vendor.findOne({ email: "shop@example.com" });
  const template = await Product.findOne({ sku: "FM-GROC-001" }).lean();
  if (!vendor || !template) {
    console.log("Hot deal products skipped: base shop or product is missing");
    return festive;
  }
  const deals = [
    { sku: "SEED-HD-001", name: "Seed Cotton Kurta", price: 1299, discountValue: 30, stock: 40, hotDeal: "approved" },
    { sku: "SEED-HD-002", name: "Seed Wireless Earbuds", price: 2499, discountValue: 45, stock: 25, hotDeal: "approved" },
    { sku: "SEED-HD-003", name: "Seed Steel Bottle", price: 599, discountValue: 25, stock: 60, hotDeal: "pending" },
    { sku: "SEED-HD-004", name: "Seed Leather Wallet", price: 899, discountValue: 15, stock: 18, hotDeal: "rejected", reason: "Offer at least 20% off to join Hot Deals." },
  ];
  for (const entry of deals) {
    await upsert(Product, { sku: entry.sku }, {
      name: entry.name,
      slug: entry.sku.toLowerCase(),
      description: `${entry.name} for the Hot Deals queue.`,
      shortDescription: "Hot deal sample",
      category: template.category,
      subCategory: template.subCategory,
      price: entry.price,
      stock: entry.stock,
      discountType: "percentage",
      discountValue: entry.discountValue,
      thumbnail: IMG,
      images: [IMG],
      role: "Vendor",
      addedById: vendor._id,
      adminApproved: true,
      status: "active",
      variantType: "single",
      hotDeal: {
        optIn: true,
        status: entry.hotDeal,
        requestedAt: daysFromNow(-2),
        reviewedAt: entry.hotDeal === "pending" ? null : daysFromNow(-1),
        rejectionReason: entry.reason || "",
        rule: festive._id,
      },
    });
  }
  console.log("Hot deal rules: 3, opted-in products: 4");
  return festive;
}

async function seedBanners() {
  const groceries = await categoryId("Groceries", "ecom");
  const rows = [
    { title: "Monsoon shop sale", targetType: "ecom", mode: "global", subtitle: "Up to 40% off", ctaText: "Shop now", displayOrder: 1 },
    { title: "Book wedding services", targetType: "venue", mode: "global", subtitle: "Catering, décor, and more", ctaText: "Explore", displayOrder: 2 },
    { title: "Welcome offer", targetType: "user", mode: "global", related: "category", category: groceries, subtitle: "New on Oho Ebazar", ctaText: "Browse", displayOrder: 3 },
    { title: "Bengaluru city deals", targetType: "ecom", mode: "city", cities: ["Bengaluru"], subtitle: "Local shops", ctaText: "See shops", displayOrder: 4 },
  ];
  for (const row of rows) {
    await upsert(Banner, { title: row.title }, {
      image: IMG,
      imageWidth: 1200,
      imageHeight: 480,
      status: "active",
      startDate: daysFromNow(-1),
      endDate: daysFromNow(30),
      related: "none",
      ...row,
    });
  }
  console.log(`Banners: ${rows.length}`);
}

async function seedContent() {
  const faqs = [
    ["How do I track an order?", "Open Orders in the app. Paid orders show the current status and the delivery partner once one is assigned."],
    ["How do service enquiries work?", "Send an enquiry with your date. The service vendor accepts or rejects it. After acceptance you have a limited time to pay the token and confirm."],
    ["When is cash on delivery collected?", "The delivery partner collects cash when the order is marked delivered. The amount stays in their COD balance until admin settles it."],
    ["How do vendors get paid?", "Vendors request a withdrawal from their wallet. Admin approves or rejects it under Payment Management."],
    ["How do I change my password?", "Admin users change the password from Admin Profile. Customers and vendors use the password option in their own app profile."],
  ];
  for (const [question, answer] of faqs) {
    await upsert(Faq, { question }, { answer, status: "active" });
  }

  const pages = [
    { app: "user", slug: "privacy-policy", title: "Privacy Policy", content: "<p>Oho Ebazar stores your name, phone, and order details to fulfil purchases and bookings. We do not sell this data.</p>" },
    { app: "user", slug: "terms-and-conditions", title: "Terms and Conditions", content: "<p>Orders and bookings are confirmed only after payment succeeds or cash is collected. Cancellations follow the status shown on the order.</p>" },
    { app: "vendor", slug: "vendor-terms", title: "Vendor Terms", content: "<p>Shop vendors must keep stock, prices, and bank details accurate. Listings go live after admin approval when that setting is on.</p>" },
    { app: "venue_vendor", slug: "service-vendor-policy", title: "Service Vendor Policy", content: "<p>Service vendors must reply to enquiries before the response window ends and honour accepted dates.</p>" },
    { app: "delivery", slug: "delivery-guidelines", title: "Delivery Guidelines", content: "<p>Collect the full cash amount on COD orders and hand it to admin when asked to settle your COD balance.</p>" },
  ];
  for (const page of pages) {
    await upsert(Page, { app: page.app, slug: page.slug }, page);
  }
  console.log(`FAQs: ${faqs.length}, static pages: ${pages.length}`);
}

async function seedPlansAndPromos() {
  const startDate = daysFromNow(-1);
  const endDate = daysFromNow(365);
  const plans = [
    { name: "Show Number Monthly", planType: "show_phone", vendorType: "both", price: 199, durationDays: 30, description: "Show your business phone to customers for 30 days.", benefits: ["Phone visible on your listing", "Renews as a 30-day plan"], badge: "Popular", isRecommended: true, sortOrder: 1 },
    { name: "Get Verified Badge", planType: "get_verified", vendorType: "both", price: 999, durationDays: 0, description: "Verified badge on your shop or service.", benefits: ["Verified badge", "Higher trust in search"], badge: "", isRecommended: false, sortOrder: 2 },
    { name: "Homepage Banner", planType: "banner", vendorType: "both", price: 1499, durationDays: 7, description: "Banner placement for 7 days from activation.", benefits: ["Homepage banner", "7 days from activation"], badge: "", isRecommended: false, sortOrder: 3 },
  ];
  for (const plan of plans) {
    await upsert(VendorPlan, { name: plan.name }, { ...plan, startDate, endDate, status: "active" });
  }

  const promos = [
    { promoCode: "WELCOME10", displayMessage: "10% off your first shop order", discountType: "percentage", discountValue: 10, minimumOrderAmount: 499, maximumDiscountAmount: 150, totalUsageLimit: 500 },
    { promoCode: "FLAT100", displayMessage: "Flat ₹100 off on orders above ₹799", discountType: "flat", discountValue: 100, minimumOrderAmount: 799, maximumDiscountAmount: 100, totalUsageLimit: 200 },
    { promoCode: "FESTIVE20", displayMessage: "20% off festive picks", discountType: "percentage", discountValue: 20, minimumOrderAmount: 999, maximumDiscountAmount: 400, totalUsageLimit: 100 },
  ];
  for (const promo of promos) {
    await upsert(Promotion, { promoCode: promo.promoCode }, {
      ...promo,
      image: IMG,
      startDate,
      endDate,
      status: "active",
      usedCount: 0,
    });
  }
  console.log(`Vendor plans: ${plans.length}, promo codes: ${promos.length}`);
}

async function seedCommerce(users, drivers, admin) {
  const buyer = users[0];
  const second = users[1];
  const product = await Product.findOne({ sku: "FM-GROC-001", adminApproved: true });
  const vendor = product
    ? await Vendor.findById(product.addedById)
    : await Vendor.findOne({ email: "shop@example.com" });
  const driver = drivers[0];
  if (!buyer || !product || !vendor) {
    console.log("Orders skipped: missing user, product, or vendor");
    return;
  }

  const address = {
    name: buyer.name,
    phone: buyer.phone,
    addressLine: "12 Indiranagar 100 Feet Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
  };

  const makeItem = (qty) => ({
    product: product._id,
    name: product.name,
    sku: product.sku,
    quantity: qty,
    unitPrice: product.price,
    discountValue: 0,
    taxValue: 0,
    totalPrice: product.price * qty,
    vendor: vendor._id,
  });

  const orders = [
    {
      orderNumber: "SEED-ORD-1001",
      user: buyer._id,
      items: [makeItem(2)],
      subTotal: product.price * 2,
      grandTotal: product.price * 2 + 40,
      shippingCharge: 40,
      paymentMethod: "cod",
      paymentStatus: "pending",
      orderStatus: "confirmed",
      deliveryBoy: driver?._id || null,
      deliveryBoyAssignedBy: driver ? "admin" : null,
      codSettlementStatus: "pending",
      notes: "Seeded cash on delivery order",
    },
    {
      orderNumber: "SEED-ORD-1002",
      user: second._id,
      items: [makeItem(1)],
      subTotal: product.price,
      grandTotal: product.price,
      shippingCharge: 0,
      paymentMethod: "online",
      paymentStatus: "paid",
      orderStatus: "delivered",
      notes: "Seeded paid order",
    },
    {
      orderNumber: "SEED-ORD-1003",
      user: buyer._id,
      items: [makeItem(1)],
      subTotal: product.price,
      grandTotal: product.price,
      shippingCharge: 0,
      paymentMethod: "online",
      paymentStatus: "refunded",
      orderStatus: "cancelled",
      cancellationReason: "Customer asked to cancel before dispatch.",
      cancelledAt: daysFromNow(-1),
      notes: "Seeded cancelled order",
    },
  ];

  const savedOrders = [];
  for (const entry of orders) {
    savedOrders.push(await upsert(Order, { orderNumber: entry.orderNumber }, { ...entry, addressSnapshot: address, placedAt: daysFromNow(-3) }));
  }

  await upsert(Transaction, { transactionId: "SEED-TXN-1002" }, {
    order: savedOrders[1]._id,
    user: second._id,
    gateway: "razorpay",
    gatewayOrderId: "order_SEED1002",
    gatewayPaymentId: "pay_SEED1002",
    paymentMethod: "online",
    type: "payment",
    status: "success",
    amount: savedOrders[1].grandTotal,
    currency: "INR",
    remarks: "Seed payment",
  });
  await upsert(Transaction, { transactionId: "SEED-TXN-1003" }, {
    order: savedOrders[2]._id,
    user: buyer._id,
    gateway: "razorpay",
    paymentMethod: "online",
    type: "refund",
    status: "refunded",
    amount: savedOrders[2].grandTotal,
    currency: "INR",
    remarks: "Seed refund",
  });

  if (driver && admin) {
    await upsert(DriverCodSettlement, { settlementNumber: "SEED-COD-0001" }, {
      deliveryBoy: driver._id,
      amount: 400,
      previousBalance: 1250,
      balanceAfter: 850,
      adminNote: "Partial COD settlement",
      processedBy: admin._id,
    });
    await upsert(DeliveryWithdrawalRequest, { requestNumber: "SEED-DWD-0001" }, {
      deliveryBoy: driver._id,
      amount: 500,
      status: "pending",
      bankAccountName: driver.bankAccountName || driver.name,
      accountNumber: driver.accountNumber || "50100222000011",
      bankName: driver.bankName || "HDFC Bank",
      branchName: driver.branchName || "Indiranagar",
      ifscCode: driver.ifscCode || "HDFC0001201",
    });
  }

  await upsert(VendorWithdrawalRequest, { requestNumber: "SEED-VWD-0001" }, {
    vendor: vendor._id,
    amount: 1500,
    status: "pending",
    bankAccountName: vendor.businessName || vendor.name,
    accountNumber: "998877665544",
    bankName: "State Bank of India",
    branchName: "MG Road",
    ifscCode: "SBIN0001234",
    accountType: "Current",
  });
  console.log("Shop orders: 3, payments: 2, withdrawals: 2, COD settlement: 1");
  return { buyer, second };
}

async function seedVenueFlow(buyer) {
  const venue = await Venue.findOne({ name: "Wedding Catering Package", adminApproved: true });
  const fallback = venue || (await Venue.findOne({ adminApproved: true, role: "VenueVendor" }));
  if (!buyer || !fallback) {
    console.log("Venue bookings skipped: missing user or service");
    return;
  }
  const vendorId = fallback.role === "VenueVendor" ? fallback.addedById : null;
  const unitPrice = fallback.basePrice || fallback.dayPrice || fallback.hourlyPrice || 80000;
  const tokenAmount = fallback.tokenAmount || Math.round(unitPrice * 0.2);
  const bookingDate = ymd(daysFromNow(14));

  const confirmed = await upsert(VenueOrder, { orderNumber: "SEED-VBK-2001" }, {
    user: buyer._id,
    items: [{
      venue: fallback._id,
      name: fallback.name,
      quantity: 1,
      unitPrice,
      totalPrice: unitPrice,
      bookingDate: daysFromNow(14),
      bookingType: "full_day",
      bookingSlot: bookingDate,
    }],
    subTotal: unitPrice,
    grandTotal: unitPrice,
    tokenAmount,
    remainingAmount: Math.max(unitPrice - tokenAmount, 0),
    amountPaid: tokenAmount,
    paymentMethod: "online",
    paymentStatus: "partially_paid",
    orderStatus: "confirmed",
    source: "direct",
    notes: "Seeded service booking",
    addressSnapshot: { city: "Bengaluru", state: "Karnataka" },
    placedAt: daysFromNow(-1),
  });
  await upsert(VenueTransaction, { transactionId: "SEED-VTXN-2001" }, {
    order: confirmed._id,
    user: buyer._id,
    gateway: "razorpay",
    gatewayPaymentId: "pay_SEEDVBK2001",
    paymentMethod: "online",
    paymentPhase: "token",
    type: "payment",
    status: "success",
    amount: tokenAmount,
    currency: "INR",
    remarks: "Token payment",
  });

  await upsert(VenueOrder, { orderNumber: "SEED-VBK-2002" }, {
    user: buyer._id,
    items: [{
      venue: fallback._id,
      name: fallback.name,
      quantity: 1,
      unitPrice,
      totalPrice: unitPrice,
      bookingDate: daysFromNow(21),
      bookingType: "full_day",
    }],
    subTotal: unitPrice,
    grandTotal: unitPrice,
    tokenAmount,
    remainingAmount: unitPrice,
    amountPaid: 0,
    paymentMethod: "online",
    paymentStatus: "pending",
    orderStatus: "pending",
    source: "direct",
    notes: "Seeded unpaid booking",
    placedAt: new Date(),
  });

  const enquiries = [
    { enquiryNumber: "SEED-ENQ-3001", status: "pending", eventType: "Wedding", message: "Need catering for 150 guests.", bookingDates: [ymd(daysFromNow(20))] },
    { enquiryNumber: "SEED-ENQ-3002", status: "accepted", eventType: "Reception", message: "Please hold the date.", bookingDates: [ymd(daysFromNow(28))], acceptedAt: new Date(), holdExpiresAt: daysFromNow(1) },
    { enquiryNumber: "SEED-ENQ-3003", status: "rejected", eventType: "Birthday", message: "Small family lunch.", bookingDates: [ymd(daysFromNow(10))], rejectionReason: "That date is already booked." },
  ];
  for (const entry of enquiries) {
    await upsert(VenueEnquiry, { enquiryNumber: entry.enquiryNumber }, {
      user: buyer._id,
      venue: fallback._id,
      vendor: vendorId,
      source: "standard",
      bookingType: "full_day",
      guestCount: 150,
      contact: { name: buyer.name, phone: buyer.phone, email: buyer.email, countryCode: "+91" },
      quote: { grandTotal: unitPrice, tokenAmount, currency: "INR", symbol: "₹" },
      responseDueAt: daysFromNow(2),
      ...entry,
    });
  }

  const owner = await VenueVendor.findById(vendorId);
  const pendingCategory = await categoryId("Tent", "venue");
  if (owner && pendingCategory) {
    await upsert(Venue, { name: "Pending Tent Setup", addedById: owner._id }, {
      description: "Waiting for admin approval.",
      shortDescription: "Tent and seating for outdoor events",
      category: pendingCategory,
      address: owner.businessAddress || "Bengaluru",
      city: "Bengaluru",
      state: "Karnataka",
      thumbnail: IMG,
      images: [IMG],
      priceType: "full",
      basePrice: 18000,
      tokenAmount: 4000,
      role: "VenueVendor",
      adminApproved: false,
      status: "inactive",
    });
  }
  console.log("Service bookings: 2, enquiries: 3");
  return fallback;
}

async function seedRecharges(users) {
  const buyer = users[0];
  if (!buyer) return;
  const rows = [
    { referenceId: "SEED-RCH-MOB-1", type: "mobile", contactNumber: "9811100001", amount: 299, provider: "Airtel", status: "success", details: { operator: "Airtel", circle: "Karnataka" } },
    { referenceId: "SEED-RCH-GAS-1", type: "gas", contactNumber: "10023456789", amount: 950, provider: "Indane", status: "success", details: { distributor: "Indane Bengaluru" } },
    { referenceId: "SEED-RCH-TAG-1", type: "fastag", contactNumber: "KA03AB1201", amount: 500, provider: "ICICI Fastag", status: "pending", details: { vehicleNumber: "KA03AB1201" } },
    { referenceId: "SEED-RCH-MOB-2", type: "mobile", contactNumber: "9811100002", amount: 149, provider: "Jio", status: "failed", details: { operator: "Jio" } },
  ];
  for (const row of rows) {
    const recharge = await upsert(Recharge, { referenceId: row.referenceId }, { user: buyer._id, ...row });
    await upsert(RechargeTransaction, { transactionId: `SEED-RTXN-${row.referenceId}` }, {
      recharge: recharge._id,
      user: buyer._id,
      rechargeType: row.type,
      referenceId: row.referenceId,
      gateway: "razorpay",
      type: "payment",
      status: row.status === "success" ? "success" : row.status === "failed" ? "failed" : "pending",
      paymentMethod: "upi",
      amount: row.amount,
    });
  }
  console.log(`Recharges: ${rows.length}`);
}

async function seedMedia(admin) {
  const product = await Product.findOne({ sku: "SEED-HD-002" });
  const vendor = product ? await Vendor.findById(product.addedById) : null;
  if (vendor && product) {
    await upsert(ProductVideoFeed, { title: "Earbuds reel" }, {
      vendor: vendor._id,
      product: product._id,
      video: VIDEO,
      thumbnail: IMG,
      status: "active",
    });
  }
  const venue = await Venue.findOne({ adminApproved: true, role: "VenueVendor" });
  if (venue?.addedById) {
    await upsert(VenueVideoFeed, { title: "Venue reel" }, {
      venueVendor: venue.addedById,
      venue: venue._id,
      video: VIDEO,
      thumbnail: IMG,
      status: "active",
    });
  }

  const broadcasts = [
    { audienceType: "users", kind: "notification", message: "Festive sale is live. Use code FESTIVE20 on shop orders above ₹999." },
    { audienceType: "vendors", kind: "announcement", vendorTargetTypes: ["ecom", "venue"], message: "Complete your profile to unlock the Show Number trial." },
    { audienceType: "deliveryPartners", kind: "notification", message: "Settle pending COD cash with admin before requesting a withdrawal." },
  ];
  for (const row of broadcasts) {
    await upsert(Notification, { message: row.message }, { ...row, image: "", status: "active", sentAt: new Date() });
  }

  if (admin) {
    const inbox = [
      { type: "vendor_registered", title: "New shop waiting for approval", message: "New Corner Store submitted a shop registration.", linkPath: "/admin/vendors" },
      { type: "enquiry_received", title: "New service enquiry", message: "Riya Sharma sent an enquiry for a wedding.", linkPath: "/admin/venue-enquiries" },
      { type: "hot_deal_pending_approval", title: "Hot deal waiting", message: "Seed Steel Bottle is waiting in the Hot Deals queue.", linkPath: "/admin/hot-deals/queue" },
    ];
    for (const row of inbox) {
      await upsert(AppNotification, { recipient: admin._id, title: row.title }, {
        recipientType: "admin",
        type: row.type,
        message: row.message,
        isRead: false,
        metadata: { linkPath: row.linkPath },
      });
    }
  }
  console.log("Reels, broadcasts, and inbox notifications seeded");
}

async function seedFeatureSettings() {
  const appConfig = await AppConfig.findOne();
  if (!appConfig) return;
  const current = appConfig.feature_settings;
  const empty = !current || typeof current !== "object" || !current.venueBookingMode;
  if (empty) {
    appConfig.feature_settings = {
      venueBookingMode: "enquiry",
      enquiryBookingWindowHours: 24,
      enquiryResponseHours: 48,
      enquiryHoldDatesEnabled: true,
      phonePlanRequired: true,
      phoneTrialDaysOnFullProfile: 7,
      videoEnabledUser: true,
      videoEnabledVendor: true,
      hotDealsEnabled: true,
      hotDealsLimit: 12,
      discountAlertMinPercent: 5,
      discountAlertCooldownHours: 24,
      autoApproveTrustedVendors: true,
    };
    await appConfig.save();
    console.log("App feature settings saved");
  } else {
    console.log("App feature settings already present");
  }
}

async function seedRest() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is not set in Backend/.env");
  }
  await mongoose.connect(config.mongodbUri);
  const passwordHash = await hashPassword(PASSWORD);
  const admin = await Admin.findOne({ email: "admin@gmail.com" });
  if (!admin) throw new Error("Admin was not created by the base seed");

  const users = await seedUsers(passwordHash);
  const drivers = await seedDelivery(passwordHash);
  await seedPendingVendors(passwordHash);
  await seedAmenities(admin._id);
  await seedCatalog(admin._id);
  await seedHotDeals();
  await seedBanners();
  await seedContent();
  await seedPlansAndPromos();
  await seedCommerce(users, drivers, admin);
  await seedVenueFlow(users[0]);
  await seedRecharges(users);
  await seedMedia(admin);
  await seedFeatureSettings();

  console.log("\nFull seed complete.");
  console.log("Admin:     admin@gmail.com / 12345678");
  console.log("Customer:  riya@ohoebazar.local / 12345678");
  console.log("Driver:    ravi.driver@ohoebazar.local / 12345678");
  console.log("Shop:      shop@example.com / 12345678");
}

async function main() {
  console.log("Running base seed (categories, vendors, services, locations)...\n");
  await runBaseSeed();
  console.log("\nFilling the remaining admin data...\n");
  await seedRest();
}

main()
  .catch((err) => {
    console.error("Full seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

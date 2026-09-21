require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const config = require("../config");
const { Admin, AppConfig, Vendor, VenueVendor, Venue } = require("../models");
const Category = require("../models/other/category");
const SubCategory = require("../models/other/subCategory");
const State = require("../models/other/state");
const City = require("../models/other/city");
const SubDistrict = require("../models/other/subDistrict");
const PromotionPlan = require("../models/other/promotionPlan");
const PromotionSubscription = require("../models/other/promotionSubscription");
const Product = require("../models/other/product");
const { hashPassword } = require("../utils/password");

const PLACEHOLDER_DOC = "/uploads/seed/placeholder-doc.png";
const PLACEHOLDER_SERVICE_IMAGE = "/uploads/seed/service-photo.png";
const PLACEHOLDER_BANNER = "/uploads/venue-categories/other.svg";

const LOCATION_SEEDS = [
  {
    state: "Karnataka",
    code: "KA",
    cities: [
      {
        name: "Bengaluru",
        subDistricts: ["Indiranagar", "Koramangala", "MG Road"],
      },
    ],
  },
  {
    state: "Maharashtra",
    code: "MH",
    cities: [
      {
        name: "Mumbai",
        subDistricts: ["Andheri", "Bandra", "Colaba"],
      },
    ],
  },
];

const PROMOTION_PLAN_SEEDS = [
  {
    name: "Shop Banner Boost",
    planType: "banner",
    vendorType: "ecom",
    durationOptions: [
      { type: "daily", durationDays: 1, price: 0 },
      { type: "weekly", durationDays: 7, price: 499 },
      { type: "monthly", durationDays: 30, price: 1499 },
    ],
  },
  {
    name: "Verified Shop Badge",
    planType: "get_verified",
    vendorType: "ecom",
    durationOptions: [{ type: "monthly", durationDays: 30, price: 999 }],
  },
  {
    name: "Product Presence First",
    planType: "product_presence_first",
    vendorType: "ecom",
    presenceTopLimit: 50,
    durationOptions: [{ type: "weekly", durationDays: 7, price: 799 }],
  },
  {
    name: "Service Banner Spotlight",
    planType: "banner",
    vendorType: "venue",
    durationOptions: [
      { type: "daily", durationDays: 1, price: 0 },
      { type: "weekly", durationDays: 7, price: 699 },
      { type: "monthly", durationDays: 30, price: 1999 },
    ],
  },
];

const DEFAULT_VENDOR_PASSWORD = "12345678";

/** 5 e-commerce shop vendors (Vendor collection, vendorPanelType: ecom). */
const ECOM_VENDOR_SEEDS = [
  {
    name: "Amit Verma",
    email: "shop@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543213",
    businessName: "Fresh Mart Online",
    businessPhone: "9876543213",
    businessAddress: "12 Commercial Street, Bengaluru, Karnataka 560001",
    categoryName: "Groceries",
    approvalStatus: "approved",
    status: "active",
  },
  {
    name: "Neha Kapoor",
    email: "stylehub@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543214",
    businessName: "Style Hub Fashion",
    businessPhone: "9876543214",
    businessAddress: "22 Brigade Road, Bengaluru, Karnataka 560025",
    categoryName: "Fashion",
    approvalStatus: "approved",
    status: "active",
  },
  {
    name: "Vikram Singh",
    email: "gadgetzone@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543215",
    businessName: "Gadget Zone",
    businessPhone: "9876543215",
    businessAddress: "8 Linking Road, Mumbai, Maharashtra 400050",
    categoryName: "Electronics",
    approvalStatus: "approved",
    status: "active",
  },
  {
    name: "Sana Khan",
    email: "homekitchen@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543216",
    businessName: "Home & Kitchen Mart",
    businessPhone: "9876543216",
    businessAddress: "55 Residency Road, Bengaluru, Karnataka 560025",
    categoryName: "Home & Kitchen",
    approvalStatus: "approved",
    status: "active",
  },
  {
    name: "Arjun Mehta",
    email: "beautybox@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543217",
    businessName: "Beauty Box Store",
    businessPhone: "9876543217",
    businessAddress: "19 Hill Road, Bandra, Mumbai, Maharashtra 400050",
    categoryName: "Beauty & Personal Care",
    approvalStatus: "approved",
    status: "active",
  },
];

const ECOM_PRODUCT_SEEDS = [
  {
    name: "Organic Bananas (1 dozen)",
    slug: "fresh-mart-organic-bananas",
    sku: "FM-GROC-001",
    categoryName: "Groceries",
    subCategoryName: "Fresh Produce",
    price: 89,
    stock: 120,
    shortDescription: "Farm-fresh organic bananas, perfect for smoothies and snacking.",
  },
  {
    name: "Masala Potato Chips 200g",
    slug: "fresh-mart-masala-chips",
    sku: "FM-GROC-002",
    categoryName: "Groceries",
    subCategoryName: "Snacks & Beverages",
    price: 45,
    stock: 200,
    shortDescription: "Crispy spiced potato chips in a resealable pack.",
  },
  {
    name: "Men's Cotton T-Shirt",
    slug: "fresh-mart-mens-cotton-tshirt",
    sku: "FM-FASH-001",
    categoryName: "Fashion",
    subCategoryName: "Men's Wear",
    price: 599,
    stock: 35,
    shortDescription: "Breathable cotton tee available in multiple sizes.",
  },
];

const ECOM_CATEGORY_SEEDS = [
  { name: "Groceries", subcategories: ["Fresh Produce", "Snacks & Beverages"] },
  { name: "Fashion", subcategories: ["Men's Wear", "Women's Wear"] },
  { name: "Electronics", subcategories: ["Mobile Accessories", "Home Appliances"] },
  { name: "Home & Kitchen", subcategories: ["Cookware", "Home Decor"] },
  { name: "Beauty & Personal Care", subcategories: ["Skincare", "Hair Care"] },
  { name: "Sports & Outdoors", subcategories: ["Fitness", "Outdoor Gear"] },
];

const VENUE_CATEGORY_SEEDS = [
  { name: "DJ", icon: "dj.svg" },
  { name: "Baggi", icon: "baggi.svg" },
  { name: "Bhangra Team", icon: "bhangra.svg" },
  { name: "Tent", icon: "tent.svg" },
  { name: "Light Decoration", icon: "light.svg" },
  { name: "Catering", icon: "catering.svg" },
  { name: "Other", icon: "other.svg" },
];

const CATEGORY_ICON_SOURCE_DIR = path.join(
  __dirname,
  "..",
  "..",
  "VenueVendorPanel",
  "public",
  "category-icons"
);
const CATEGORY_ICON_TARGET_DIR = path.join(__dirname, "..", "uploads", "venue-categories");

function ensureCategoryIconAssets() {
  fs.mkdirSync(CATEGORY_ICON_TARGET_DIR, { recursive: true });
  for (const entry of VENUE_CATEGORY_SEEDS) {
    const source = path.join(CATEGORY_ICON_SOURCE_DIR, entry.icon);
    const target = path.join(CATEGORY_ICON_TARGET_DIR, entry.icon);
    if (!fs.existsSync(source)) {
      console.warn(`Missing category icon source: ${source}`);
      continue;
    }
    fs.copyFileSync(source, target);
  }
}

function categoryImagePath(iconFile) {
  return `/uploads/venue-categories/${iconFile}`;
}

const ADMIN_SEED = {
  name: "Admin",
  email: "admin@gmail.com",
  password: "12345678",
  phone: "9876543200",
  status: "active",
};

const APP_CONFIG_SEED = {
  app_name: "Oho Ebazar",
  app_email: "support@ohoebazar.com",
  app_mobile: "9876543200",
  app_detail: "Service & Shop marketplace for local vendors.",
  app_details: "Oho Ebazar connects customers with service providers and local shops.",
  app_footer_text: "© Oho Ebazar. All rights reserved.",
  address: "Bengaluru, Karnataka, India",
  shipping_charge: 40,
  vendor_approval_required: true,
  vendor_product_approval_required: true,
};

/** 5 service / venue vendors (VenueVendor collection, vendorPanelType: service). */
const SERVICE_VENDOR_SEEDS = [
  {
    name: "Rahul Sharma",
    email: "royal@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543210",
    businessName: "Royal Events & Banquets",
    businessPhone: "9876543210",
    businessEmail: "contact@royalevents.com",
    businessAddress: "45 MG Road, Bangalore, Karnataka 560001",
    businessDescription: "Premium banquet halls and event management for weddings and corporate events.",
    panNumber: "ABCDE1234F",
    gstNumber: "29ABCDE1234F1Z5",
    bankName: "HDFC Bank",
    branchName: "MG Road",
    accountType: "Current",
    accountNumber: "50100123456789",
    ifscCode: "HDFC0001234",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Priya Patel",
    email: "dreamwedding@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543211",
    businessName: "Dream Wedding Planners",
    businessPhone: "9876543211",
    businessEmail: "hello@dreamwedding.com",
    businessAddress: "12 Station Road, Mumbai, Maharashtra 400001",
    businessDescription: "Full-service wedding planning, décor, and venue coordination.",
    panNumber: "FGHIJ5678K",
    gstNumber: "27FGHIJ5678K1Z8",
    bankName: "ICICI Bank",
    branchName: "Andheri West",
    accountType: "Savings",
    accountNumber: "60100234567890",
    ifscCode: "ICIC0002345",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Rohit Das",
    email: "elitecatering@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543212",
    businessName: "Elite Catering Services",
    businessPhone: "9876543212",
    businessEmail: "info@elitecatering.com",
    businessAddress: "78 Park Street, Kolkata, West Bengal 700016",
    businessDescription: "Multi-cuisine catering for parties, weddings, and corporate gatherings.",
    panNumber: "KLMNO9012P",
    gstNumber: "19KLMNO9012P1Z3",
    bankName: "State Bank of India",
    branchName: "Park Street",
    accountType: "Current",
    accountNumber: "70100345678901",
    ifscCode: "SBIN0003456",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Kavita Nair",
    email: "beatsdj@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543218",
    businessName: "Beats & Lights DJ",
    businessPhone: "9876543218",
    businessEmail: "book@beatsdj.com",
    businessAddress: "33 Church Street, Bengaluru, Karnataka 560001",
    businessDescription: "Professional DJ, sound, and lighting for weddings and parties.",
    panNumber: "PQRST3456U",
    gstNumber: "29PQRST3456U1Z2",
    bankName: "Axis Bank",
    branchName: "Church Street",
    accountType: "Current",
    accountNumber: "80100456789012",
    ifscCode: "UTIB0004567",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Manish Gupta",
    email: "tentcraft@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543219",
    businessName: "TentCraft Decorators",
    businessPhone: "9876543219",
    businessEmail: "orders@tentcraft.com",
    businessAddress: "90 FC Road, Pune, Maharashtra 411004",
    businessDescription: "Wedding tents, mandap setup, and outdoor décor packages.",
    panNumber: "VWXYZ7890A",
    gstNumber: "27VWXYZ7890A1Z6",
    bankName: "Kotak Mahindra Bank",
    branchName: "FC Road",
    accountType: "Savings",
    accountNumber: "90100567890123",
    ifscCode: "KKBK0005678",
    status: "active",
    approvalStatus: "approved",
  },
];

/**
 * 5 dual-mode vendors (vendorPanelType: both).
 * Creates matching Vendor + VenueVendor rows on the same phone (same as panel registration).
 */
const BOTH_VENDOR_SEEDS = [
  {
    name: "Ananya Reddy",
    email: "both.events.shop@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543220",
    shopName: "Celebration Store",
    serviceName: "Celebration Events Co.",
    businessPhone: "9876543220",
    businessEmail: "hello@celebration.example.com",
    businessAddress: "14 Cubbon Road, Bengaluru, Karnataka 560001",
    businessDescription: "Party supplies shop plus full event planning services.",
    categoryName: "Home & Kitchen",
    panNumber: "ANANY1234R",
    gstNumber: "29ANANY1234R1Z1",
    bankName: "HDFC Bank",
    branchName: "Cubbon Park",
    accountType: "Current",
    accountNumber: "51100678901234",
    ifscCode: "HDFC0006789",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Deepak Joshi",
    email: "both.wedding.mart@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543221",
    shopName: "Shaadi Essentials Mart",
    serviceName: "Shaadi Studio Services",
    businessPhone: "9876543221",
    businessEmail: "care@shaadistudio.example.com",
    businessAddress: "67 SV Road, Mumbai, Maharashtra 400058",
    businessDescription: "Wedding retail store with décor and catering coordination.",
    categoryName: "Fashion",
    panNumber: "DEEPA5678J",
    gstNumber: "27DEEPA5678J1Z4",
    bankName: "ICICI Bank",
    branchName: "Santacruz",
    accountType: "Current",
    accountNumber: "61100789012345",
    ifscCode: "ICIC0007890",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Meera Iyer",
    email: "both.soundshop@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543222",
    shopName: "Pulse Audio Gear",
    serviceName: "Pulse Live DJ",
    businessPhone: "9876543222",
    businessEmail: "book@pulse.example.com",
    businessAddress: "5 Richmond Circle, Bengaluru, Karnataka 560025",
    businessDescription: "Audio equipment shop and live DJ booking services.",
    categoryName: "Electronics",
    panNumber: "MEERA9012I",
    gstNumber: "29MEERA9012I1Z7",
    bankName: "Axis Bank",
    branchName: "Richmond Road",
    accountType: "Savings",
    accountNumber: "71100890123456",
    ifscCode: "UTIB0008901",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Farhan Ali",
    email: "both.feastmart@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543223",
    shopName: "Feast & Pantry",
    serviceName: "Feast Catering Kitchen",
    businessPhone: "9876543223",
    businessEmail: "orders@feast.example.com",
    businessAddress: "28 Park Street, Kolkata, West Bengal 700016",
    businessDescription: "Grocery and pantry shop with on-demand catering.",
    categoryName: "Groceries",
    panNumber: "FARHA3456A",
    gstNumber: "19FARHA3456A1Z0",
    bankName: "State Bank of India",
    branchName: "Park Street",
    accountType: "Current",
    accountNumber: "81100901234567",
    ifscCode: "SBIN0009012",
    status: "active",
    approvalStatus: "approved",
  },
  {
    name: "Ishita Bose",
    email: "both.glowhouse@example.com",
    password: DEFAULT_VENDOR_PASSWORD,
    phone: "9876543224",
    shopName: "Glow House Beauty",
    serviceName: "Glow Décor Lights",
    businessPhone: "9876543224",
    businessEmail: "hello@glowhouse.example.com",
    businessAddress: "41 Baner Road, Pune, Maharashtra 411045",
    businessDescription: "Beauty products store plus event lighting decoration.",
    categoryName: "Beauty & Personal Care",
    panNumber: "ISHIT7890B",
    gstNumber: "27ISHIT7890B1Z3",
    bankName: "Kotak Mahindra Bank",
    branchName: "Baner",
    accountType: "Savings",
    accountNumber: "91100012345678",
    ifscCode: "KKBK0000123",
    status: "active",
    approvalStatus: "approved",
  },
];

const DUMMY_SERVICE_SEEDS = [
  {
    vendorPhone: "9876543210",
    categoryName: "DJ",
    name: "DJ Booking Service",
    shortDescription: "DJ + Sound + Light",
    priceType: "full",
    price: 15000,
    tokenAmount: 3000,
  },
  {
    vendorPhone: "9876543210",
    categoryName: "Tent",
    name: "Premium Tent Setup",
    shortDescription: "Large wedding tent with flooring and seating",
    priceType: "day",
    price: 25000,
    tokenAmount: 5000,
  },
  {
    vendorPhone: "9876543210",
    categoryName: "Baggi",
    name: "Royal Baggi Service",
    shortDescription: "Decorated horse carriage for baraat",
    priceType: "day",
    price: 18000,
    tokenAmount: 4000,
  },
  {
    vendorPhone: "9876543211",
    categoryName: "Bhangra Team",
    name: "Bhangra Team Performance",
    shortDescription: "8-member live bhangra team for weddings",
    priceType: "hourly",
    price: 5000,
    tokenAmount: 1500,
  },
  {
    vendorPhone: "9876543211",
    categoryName: "Light Decoration",
    name: "Light Decoration Package",
    shortDescription: "Stage lighting, fairy lights, and entrance décor",
    priceType: "full",
    price: 12000,
    tokenAmount: 3000,
  },
  {
    vendorPhone: "9876543212",
    categoryName: "Catering",
    name: "Wedding Catering Package",
    shortDescription: "Multi-cuisine buffet for up to 200 guests",
    priceType: "full",
    price: 80000,
    tokenAmount: 10000,
  },
  {
    vendorPhone: "9876543212",
    categoryName: "Catering",
    name: "Corporate Lunch Catering",
    shortDescription: "Box meals and live counters for office events",
    priceType: "day",
    price: 35000,
    tokenAmount: 7000,
  },
];

function applyPriceFields(priceType, price) {
  const amount = Number(price) || 0;
  if (priceType === "hourly") {
    return { priceType: "hourly", basePrice: 0, dayPrice: 0, hourlyPrice: amount };
  }
  if (priceType === "day") {
    return { priceType: "day", basePrice: amount, dayPrice: amount, hourlyPrice: 0 };
  }
  return { priceType: "full", basePrice: amount, dayPrice: 0, hourlyPrice: 0 };
}

async function seedAppConfig() {
  const existing = await AppConfig.findOne();
  if (existing) {
    Object.assign(existing, APP_CONFIG_SEED);
    await existing.save();
    console.log(`Updated app config: ${APP_CONFIG_SEED.app_name}`);
    return existing;
  }

  const configDoc = await AppConfig.create({ ...APP_CONFIG_SEED });
  console.log(`Created app config: ${APP_CONFIG_SEED.app_name}`);
  return configDoc;
}

async function seedAdmin() {
  const email = ADMIN_SEED.email.toLowerCase();
  const hashed = await hashPassword(ADMIN_SEED.password);
  const existing = await Admin.findOne({ email });

  if (existing) {
    existing.name = ADMIN_SEED.name;
    existing.password = hashed;
    existing.phone = ADMIN_SEED.phone;
    existing.status = ADMIN_SEED.status;
    await existing.save();
    console.log(`Updated admin: ${email}`);
    return existing;
  }

  const admin = await Admin.create({
    name: ADMIN_SEED.name,
    email,
    password: hashed,
    phone: ADMIN_SEED.phone,
    status: ADMIN_SEED.status,
  });
  console.log(`Created admin: ${email}`);
  return admin;
}

async function seedVenueCategories(adminId) {
  ensureCategoryIconAssets();
  const categoryByName = new Map();

  for (const entry of VENUE_CATEGORY_SEEDS) {
    const { name, icon } = entry;
    const image = categoryImagePath(icon);
    let category = await Category.findOne({ name, mode: "venue" });
    if (category) {
      category.status = "active";
      category.image = image;
      await category.save();
      console.log(`Updated service category: ${name}`);
    } else {
      category = await Category.create({
        name,
        image,
        mode: "venue",
        role: "Admin",
        addedById: adminId,
        status: "active",
      });
      console.log(`Created service category: ${name}`);
    }
    categoryByName.set(name, category._id);
  }

  return categoryByName;
}

async function seedEcomCategories(adminId) {
  ensureCategoryIconAssets();
  const defaultImage = categoryImagePath("other.svg");
  const categoryByName = new Map();

  for (const entry of ECOM_CATEGORY_SEEDS) {
    const { name, subcategories = [] } = entry;
    let category = await Category.findOne({ name, mode: "ecom" });
    if (category) {
      category.status = "active";
      category.image = defaultImage;
      await category.save();
      console.log(`Updated e-commerce category: ${name}`);
    } else {
      category = await Category.create({
        name,
        image: defaultImage,
        mode: "ecom",
        role: "Admin",
        addedById: adminId,
        status: "active",
      });
      console.log(`Created e-commerce category: ${name}`);
    }

    categoryByName.set(name, category._id);

    for (const subName of subcategories) {
      let sub = await SubCategory.findOne({ name: subName, category: category._id, mode: "ecom" });
      if (sub) {
        sub.status = "active";
        sub.image = defaultImage;
        await sub.save();
        console.log(`  Updated subcategory: ${subName}`);
      } else {
        await SubCategory.create({
          name: subName,
          category: category._id,
          image: defaultImage,
          mode: "ecom",
          role: "Admin",
          addedById: adminId,
          status: "active",
        });
        console.log(`  Created subcategory: ${subName}`);
      }
    }
  }

  return categoryByName;
}

async function seedServiceVendor(entry, vendorPanelType = "service") {
  const email = entry.email.toLowerCase();
  const passwordHash = await hashPassword(entry.password);
  const existing = await VenueVendor.findOne({
    $or: [{ email }, { phone: entry.phone }, { phoneCanonical: entry.phone }],
  });

  const payload = {
    name: entry.name,
    email,
    passwordHash,
    phone: entry.phone,
    businessName: entry.businessName,
    businessPhone: entry.businessPhone,
    businessEmail: entry.businessEmail,
    businessAddress: entry.businessAddress,
    businessDescription: entry.businessDescription,
    panNumber: entry.panNumber,
    gstNumber: entry.gstNumber,
    bankName: entry.bankName,
    branchName: entry.branchName,
    accountType: entry.accountType,
    accountNumber: entry.accountNumber,
    ifscCode: entry.ifscCode,
    aadhaarCardFront: PLACEHOLDER_DOC,
    aadhaarCardBack: PLACEHOLDER_DOC,
    panCard: PLACEHOLDER_DOC,
    status: entry.status,
    approvalStatus: entry.approvalStatus,
    isOpen: true,
    vendorPanelType,
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    console.log(`Updated service vendor: ${entry.businessName} (${email}) [${vendorPanelType}]`);
    return existing;
  }

  const created = await VenueVendor.create(payload);
  console.log(`Created service vendor: ${entry.businessName} (${email}) [${vendorPanelType}]`);
  return created;
}

async function seedLocations() {
  const locationByKey = new Map();

  for (const stateSeed of LOCATION_SEEDS) {
    let state = await State.findOne({ name: stateSeed.state });
    if (state) {
      state.code = stateSeed.code;
      state.status = "active";
      await state.save();
    } else {
      state = await State.create({
        name: stateSeed.state,
        code: stateSeed.code,
        status: "active",
      });
    }
    console.log(`Seeded state: ${stateSeed.state}`);

    for (const citySeed of stateSeed.cities) {
      let city = await City.findOne({ name: citySeed.name, state: state._id });
      if (city) {
        city.status = "active";
        await city.save();
      } else {
        city = await City.create({
          name: citySeed.name,
          state: state._id,
          status: "active",
        });
      }
      console.log(`  Seeded city: ${citySeed.name}`);

      for (const subName of citySeed.subDistricts) {
        let sub = await SubDistrict.findOne({ name: subName, city: city._id });
        if (sub) {
          sub.status = "active";
          await sub.save();
        } else {
          sub = await SubDistrict.create({
            name: subName,
            city: city._id,
            status: "active",
          });
        }
        locationByKey.set(`${citySeed.name}:${subName}`, {
          cityId: city._id,
          subDistrictId: sub._id,
          cityName: citySeed.name,
          subDistrictName: subName,
        });
      }
    }
  }

  return locationByKey;
}

async function seedPromotionPlans() {
  const planByKey = new Map();

  for (const entry of PROMOTION_PLAN_SEEDS) {
    let plan = await PromotionPlan.findOne({
      name: entry.name,
      vendorType: entry.vendorType,
      planType: entry.planType,
    });
    const payload = {
      name: entry.name,
      planType: entry.planType,
      vendorType: entry.vendorType,
      durationOptions: entry.durationOptions,
      presenceTopLimit: entry.presenceTopLimit ?? null,
      status: "active",
    };
    if (plan) {
      Object.assign(plan, payload);
      await plan.save();
      console.log(`Updated promotion plan: ${entry.name} (${entry.vendorType})`);
    } else {
      plan = await PromotionPlan.create(payload);
      console.log(`Created promotion plan: ${entry.name} (${entry.vendorType})`);
    }
    planByKey.set(`${entry.vendorType}:${entry.planType}`, plan);
  }

  return planByKey;
}

async function seedEcomProducts(ecomVendor, categoryByName) {
  if (!ecomVendor) return new Map();

  const productBySku = new Map();

  for (const entry of ECOM_PRODUCT_SEEDS) {
    const categoryId = categoryByName.get(entry.categoryName);
    if (!categoryId) {
      console.warn(`Skipped product "${entry.name}" — category not found`);
      continue;
    }

    const subCategory = await SubCategory.findOne({
      name: entry.subCategoryName,
      category: categoryId,
      mode: "ecom",
    }).select("_id");
    if (!subCategory) {
      console.warn(`Skipped product "${entry.name}" — subcategory not found`);
      continue;
    }

    const payload = {
      name: entry.name,
      slug: entry.slug,
      sku: entry.sku,
      shortDescription: entry.shortDescription,
      description: entry.shortDescription,
      category: categoryId,
      subCategory: subCategory._id,
      price: entry.price,
      stock: entry.stock,
      thumbnail: PLACEHOLDER_SERVICE_IMAGE,
      images: [PLACEHOLDER_SERVICE_IMAGE],
      role: "Vendor",
      addedById: ecomVendor._id,
      adminApproved: true,
      status: "active",
    };

    const existing = await Product.findOne({ sku: entry.sku });
    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      console.log(`Updated e-commerce product: ${entry.name}`);
      productBySku.set(entry.sku, existing);
    } else {
      const created = await Product.create(payload);
      console.log(`Created e-commerce product: ${entry.name}`);
      productBySku.set(entry.sku, created);
    }
  }

  return productBySku;
}

async function seedEcomVendor(entry, categoryByName, vendorPanelType = "ecom") {
  const email = entry.email.toLowerCase();
  const passwordHash = await hashPassword(entry.password);
  const categoryId = categoryByName.get(entry.categoryName || "Groceries");
  const existing = await Vendor.findOne({
    $or: [{ email }, { phone: entry.phone }],
  });

  const payload = {
    name: entry.name,
    email,
    passwordHash,
    phone: entry.phone,
    businessName: entry.businessName,
    businessPhone: entry.businessPhone,
    businessAddress: entry.businessAddress,
    ...(categoryId ? { category: categoryId } : {}),
    shopImages: [PLACEHOLDER_BANNER],
    shopLogo: PLACEHOLDER_BANNER,
    shopBanner: PLACEHOLDER_BANNER,
    aadhaarCardFront: PLACEHOLDER_DOC,
    aadhaarCardBack: PLACEHOLDER_DOC,
    panCardFront: PLACEHOLDER_DOC,
    approvalStatus: entry.approvalStatus,
    status: entry.status,
    isOpen: true,
    vendorPanelType,
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    console.log(`Updated e-commerce vendor: ${entry.businessName} (${email}) [${vendorPanelType}]`);
    return existing;
  }

  const created = await Vendor.create(payload);
  console.log(`Created e-commerce vendor: ${entry.businessName} (${email}) [${vendorPanelType}]`);
  return created;
}

async function seedEcomVendors(categoryByName) {
  const vendors = [];
  for (const entry of ECOM_VENDOR_SEEDS) {
    vendors.push(await seedEcomVendor(entry, categoryByName, "ecom"));
  }
  return vendors;
}

async function seedBothVendors(ecomCategoryByName) {
  const results = [];
  for (const entry of BOTH_VENDOR_SEEDS) {
    const shopEntry = {
      name: entry.name,
      email: entry.email,
      password: entry.password,
      phone: entry.phone,
      businessName: entry.shopName,
      businessPhone: entry.businessPhone,
      businessAddress: entry.businessAddress,
      categoryName: entry.categoryName,
      approvalStatus: entry.approvalStatus,
      status: entry.status,
    };
    const serviceEntry = {
      name: entry.name,
      email: entry.email,
      password: entry.password,
      phone: entry.phone,
      businessName: entry.serviceName,
      businessPhone: entry.businessPhone,
      businessEmail: entry.businessEmail,
      businessAddress: entry.businessAddress,
      businessDescription: entry.businessDescription,
      panNumber: entry.panNumber,
      gstNumber: entry.gstNumber,
      bankName: entry.bankName,
      branchName: entry.branchName,
      accountType: entry.accountType,
      accountNumber: entry.accountNumber,
      ifscCode: entry.ifscCode,
      status: entry.status,
      approvalStatus: entry.approvalStatus,
    };

    const vendor = await seedEcomVendor(shopEntry, ecomCategoryByName, "both");
    const venueVendor = await seedServiceVendor(serviceEntry, "both");
    results.push({ vendor, venueVendor });
  }
  return results;
}

async function upsertPromotionSubscription({ paymentId, payload }) {
  const existing = await PromotionSubscription.findOne({ paymentId });
  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    console.log(`Updated dummy promotion request: ${paymentId}`);
    return existing;
  }
  const created = await PromotionSubscription.create({ ...payload, paymentId });
  console.log(`Created dummy promotion request: ${paymentId}`);
  return created;
}

function promoDates(durationDays, offsetDays = 0) {
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() + offsetDays);
  startDate.setUTCHours(0, 0, 0, 0);
  const expiryDate = new Date(startDate);
  expiryDate.setUTCDate(expiryDate.getUTCDate() + durationDays);
  return { startDate, expiryDate };
}

async function seedDummyPromotions({ ecomVendor, venueVendor, planByKey, locationByKey, productBySku }) {
  const bengaluru = locationByKey.get("Bengaluru:Indiranagar");
  const koramangala = locationByKey.get("Bengaluru:Koramangala");
  const mumbai = locationByKey.get("Mumbai:Andheri");
  if (!bengaluru) return;

  const ecomPlan = planByKey.get("ecom:banner");
  const venuePlan = planByKey.get("venue:banner");
  const linkedProduct = productBySku?.get("FM-GROC-001") || null;

  if (ecomVendor && ecomPlan) {
    const activeDates = promoDates(7);
    await upsertPromotionSubscription({
      paymentId: "SEED-ECOM-PROMO-1",
      payload: {
        ownerType: "ecom",
        vendor: ecomVendor._id,
        venueVendor: null,
        plan: ecomPlan._id,
        planName: ecomPlan.name,
        planType: ecomPlan.planType,
        durationType: "weekly",
        durationDays: 7,
        amount: 499,
        ...activeDates,
        cityId: bengaluru.cityId,
        subDistrictId: bengaluru.subDistrictId,
        cityName: bengaluru.cityName,
        subDistrictName: bengaluru.subDistrictName,
        bannerImage: PLACEHOLDER_BANNER,
        targetType: linkedProduct ? "product" : "shop",
        targetProductId: linkedProduct?._id || null,
        paymentStatus: "paid",
        approvalStatus: "approved",
        status: "active",
        purchaseDate: new Date(),
      },
    });

    const pendingDates = promoDates(1, 2);
    await upsertPromotionSubscription({
      paymentId: "SEED-ECOM-PROMO-2",
      payload: {
        ownerType: "ecom",
        vendor: ecomVendor._id,
        venueVendor: null,
        plan: ecomPlan._id,
        planName: ecomPlan.name,
        planType: ecomPlan.planType,
        durationType: "daily",
        durationDays: 1,
        amount: 0,
        ...pendingDates,
        cityId: (mumbai || bengaluru).cityId,
        subDistrictId: (mumbai || bengaluru).subDistrictId,
        cityName: (mumbai || bengaluru).cityName,
        subDistrictName: (mumbai || bengaluru).subDistrictName,
        bannerImage: PLACEHOLDER_BANNER,
        targetType: "shop",
        paymentStatus: "free",
        approvalStatus: "pending",
        status: "pending_review",
        purchaseDate: new Date(),
      },
    });

    const rejectedDates = promoDates(7, -14);
    await upsertPromotionSubscription({
      paymentId: "SEED-ECOM-PROMO-3",
      payload: {
        ownerType: "ecom",
        vendor: ecomVendor._id,
        venueVendor: null,
        plan: ecomPlan._id,
        planName: ecomPlan.name,
        planType: ecomPlan.planType,
        durationType: "weekly",
        durationDays: 7,
        amount: 499,
        ...rejectedDates,
        cityId: (koramangala || bengaluru).cityId,
        subDistrictId: (koramangala || bengaluru).subDistrictId,
        cityName: (koramangala || bengaluru).cityName,
        subDistrictName: (koramangala || bengaluru).subDistrictName,
        bannerImage: PLACEHOLDER_BANNER,
        targetType: "shop",
        paymentStatus: "paid",
        approvalStatus: "rejected",
        status: "rejected",
        rejectionReason: "Banner image quality too low for homepage display.",
        purchaseDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  if (venueVendor && venuePlan) {
    const pendingDates = promoDates(7, 1);
    await upsertPromotionSubscription({
      paymentId: "SEED-VENUE-PROMO-1",
      payload: {
        ownerType: "venue",
        vendor: null,
        venueVendor: venueVendor._id,
        plan: venuePlan._id,
        planName: venuePlan.name,
        planType: venuePlan.planType,
        durationType: "weekly",
        durationDays: 7,
        amount: 699,
        ...pendingDates,
        cityId: bengaluru.cityId,
        subDistrictId: bengaluru.subDistrictId,
        cityName: bengaluru.cityName,
        subDistrictName: bengaluru.subDistrictName,
        bannerImage: PLACEHOLDER_BANNER,
        targetType: "venue",
        paymentStatus: "paid",
        approvalStatus: "pending",
        status: "pending_review",
        purchaseDate: new Date(),
      },
    });

    const activeDates = promoDates(7);
    await upsertPromotionSubscription({
      paymentId: "SEED-VENUE-PROMO-2",
      payload: {
        ownerType: "venue",
        vendor: null,
        venueVendor: venueVendor._id,
        plan: venuePlan._id,
        planName: venuePlan.name,
        planType: venuePlan.planType,
        durationType: "weekly",
        durationDays: 7,
        amount: 699,
        ...activeDates,
        cityId: (koramangala || bengaluru).cityId,
        subDistrictId: (koramangala || bengaluru).subDistrictId,
        cityName: (koramangala || bengaluru).cityName,
        subDistrictName: (koramangala || bengaluru).subDistrictName,
        bannerImage: PLACEHOLDER_BANNER,
        targetType: "venue",
        paymentStatus: "paid",
        approvalStatus: "approved",
        status: "active",
        purchaseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
  }
}

async function seedDummyServices(categoryByName, vendorsByPhone) {
  for (const entry of DUMMY_SERVICE_SEEDS) {
    const categoryId = categoryByName.get(entry.categoryName);
    const vendor = vendorsByPhone.get(entry.vendorPhone);
    if (!categoryId || !vendor) {
      console.warn(`Skipped dummy service "${entry.name}" — missing category or vendor`);
      continue;
    }

    const priceFields = applyPriceFields(entry.priceType, entry.price);
    const existing = await Venue.findOne({
      name: entry.name,
      addedById: vendor._id,
      role: "VenueVendor",
    });

    const payload = {
      name: entry.name,
      description: entry.shortDescription,
      shortDescription: entry.shortDescription,
      category: categoryId,
      address: vendor.businessAddress || "",
      city: "",
      state: "",
      thumbnail: PLACEHOLDER_SERVICE_IMAGE,
      images: [PLACEHOLDER_SERVICE_IMAGE],
      amenities: [],
      ...priceFields,
      tokenAmount: entry.tokenAmount,
      tokenAmountPercentage: undefined,
      role: "VenueVendor",
      addedById: vendor._id,
      adminApproved: true,
      status: "active",
    };

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      console.log(`Updated dummy service: ${entry.name}`);
      continue;
    }

    await Venue.create(payload);
    console.log(`Created dummy service: ${entry.name}`);
  }
}

async function main() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is not set in Backend/.env");
  }

  await mongoose.connect(config.mongodbUri);
  console.log("Connected to MongoDB");

  const admin = await seedAdmin();
  await seedAppConfig();
  const categoryByName = await seedVenueCategories(admin._id);
  const ecomCategoryByName = await seedEcomCategories(admin._id);
  const locationByKey = await seedLocations();
  const planByKey = await seedPromotionPlans();
  const ecomVendors = await seedEcomVendors(ecomCategoryByName);
  const ecomVendor = ecomVendors[0] || null;
  const productBySku = await seedEcomProducts(ecomVendor, ecomCategoryByName);
  const vendorsByPhone = new Map();
  for (const vendor of SERVICE_VENDOR_SEEDS) {
    const saved = await seedServiceVendor(vendor, "service");
    if (saved?.phone) vendorsByPhone.set(saved.phone, saved);
  }
  await seedBothVendors(ecomCategoryByName);
  await seedDummyServices(categoryByName, vendorsByPhone);
  await seedDummyPromotions({
    ecomVendor,
    venueVendor: vendorsByPhone.get("9876543210"),
    planByKey,
    locationByKey,
    productBySku,
  });

  console.log("\nSeed complete.");
  console.log("\nService categories (Admin → Categories → Service):");
  for (const entry of VENUE_CATEGORY_SEEDS) {
    console.log(`  - ${entry.name}`);
  }
  console.log("\nE-commerce categories (vendor registration / shop setup):");
  for (const entry of ECOM_CATEGORY_SEEDS) {
    console.log(`  - ${entry.name}`);
  }
  console.log("\nDummy services (Admin → Service Management → Services):");
  for (const service of DUMMY_SERVICE_SEEDS) {
    console.log(`  - ${service.name} (${service.categoryName})`);
  }
  console.log("\nAdmin login:");
  console.log(`  Email:    ${ADMIN_SEED.email}`);
  console.log(`  Password: ${ADMIN_SEED.password}`);
  console.log("\nPromotion plans seeded:");
  for (const entry of PROMOTION_PLAN_SEEDS) {
    console.log(`  - ${entry.name} (${entry.vendorType})`);
  }
  console.log(`\nE-commerce vendors (${ECOM_VENDOR_SEEDS.length}) — VenueVendorPanel Shop mode:`);
  for (const vendor of ECOM_VENDOR_SEEDS) {
    console.log(`  ${vendor.businessName} [${vendor.categoryName}]`);
    console.log(`    Email:    ${vendor.email}`);
    console.log(`    Phone:    ${vendor.phone}`);
    console.log(`    Password: ${vendor.password}`);
  }
  console.log(`\nService vendors (${SERVICE_VENDOR_SEEDS.length}) — VenueVendorPanel Service mode:`);
  for (const vendor of SERVICE_VENDOR_SEEDS) {
    console.log(`  ${vendor.businessName}`);
    console.log(`    Email:    ${vendor.email}`);
    console.log(`    Phone:    ${vendor.phone}`);
    console.log(`    Password: ${vendor.password}`);
  }
  console.log(`\nBoth-mode vendors (${BOTH_VENDOR_SEEDS.length}) — Shop + Service on same phone:`);
  for (const vendor of BOTH_VENDOR_SEEDS) {
    console.log(`  ${vendor.shopName} / ${vendor.serviceName}`);
    console.log(`    Email:    ${vendor.email}`);
    console.log(`    Phone:    ${vendor.phone}`);
    console.log(`    Password: ${vendor.password}`);
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

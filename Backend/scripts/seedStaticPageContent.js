/**
 * Upsert CMS static-page HTML for User / Vendor / Service Vendor / Delivery apps.
 *
 * Usage (from Backend/):
 *   node scripts/seedStaticPageContent.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Page = require("../models/bussiness/page");

const YEAR = new Date().getFullYear();

function section(title, bodyHtml) {
  return `<h2>${title}</h2>${bodyHtml}`;
}

function p(...paras) {
  return paras.map((t) => `<p>${t}</p>`).join("");
}

function ul(items) {
  return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

function privacyContent({ audience, collect, use, share }) {
  return [
    p(
      `This Privacy Policy explains how Oho E Bazar (“we”, “us”, “our”) collects, uses, and protects information when you use the ${audience}.`
    ),
    p(`Last updated: ${YEAR}.`),
    section("Information we collect", p(collect) + ul(use.collectItems)),
    section("How we use your information", ul(use.useItems)),
    section("Sharing of information", p(share)),
    section(
      "Data security",
      p(
        "We use reasonable technical and organisational measures to protect your data. No method of transmission or storage is completely secure, so please keep your login credentials private."
      )
    ),
    section(
      "Your choices",
      p(
        "You may update profile details in the app, request account deletion from the in-app / public delete-account flow, or contact support for help with your data."
      )
    ),
    section(
      "Contact",
      p("For privacy questions, contact Oho E Bazar support through the app or the contact details shown in App Settings.")
    ),
  ].join("");
}

function termsContent({ audience, bullets }) {
  return [
    p(
      `These Terms and Conditions govern your use of the Oho E Bazar ${audience}. By creating an account or continuing to use the app, you agree to these terms.`
    ),
    p(`Last updated: ${YEAR}.`),
    section("Eligibility", p("You must provide accurate registration details and keep them up to date. You are responsible for activity under your account.")),
    section("Platform use", ul(bullets)),
    section(
      "Payments",
      p(
        "Where payment is required, orders or bookings are confirmed only after successful online payment or accepted cash-on-delivery / token rules shown in the app. Fees, taxes, and refunds follow the status and policy shown for that transaction."
      )
    ),
    section(
      "Prohibited conduct",
      ul([
        "Misusing the platform, attempting fraud, or uploading illegal or harmful content",
        "Harassing customers, vendors, delivery partners, or support staff",
        "Circumventing security, ratings, or approval systems",
      ])
    ),
    section(
      "Limitation of liability",
      p(
        "Oho E Bazar provides a marketplace / booking platform. We are not liable for delays, product quality, venue readiness, or delivery issues beyond our reasonable control, except where required by applicable law."
      )
    ),
    section(
      "Changes",
      p("We may update these terms from time to time. Continued use of the app after changes means you accept the updated terms.")
    ),
    section("Contact", p("Questions about these terms can be sent to Oho E Bazar support through the app.")),
  ].join("");
}

function refundContent() {
  return [
    p("This Refund Policy explains when refunds may apply for Oho E Bazar customer purchases and venue bookings."),
    p(`Last updated: ${YEAR}.`),
    section(
      "Shop / product orders",
      ul([
        "If an order is cancelled before dispatch as per the status shown in the app, paid amounts may be refunded to the original payment method or wallet as configured.",
        "For cash-on-delivery, no online payment refund applies; unpaid COD orders that are cancelled simply do not charge you.",
        "Damaged, missing, or wrong items should be reported promptly through support with order details and photos where relevant.",
      ])
    ),
    section(
      "Venue / service bookings",
      ul([
        "Enquiry acceptance does not guarantee a booking until the required token / payment is completed within the booking window.",
        "Refund eligibility after payment depends on cancellation timing, vendor policy, and admin review.",
        "If a booking cannot be fulfilled by the venue for a valid reason, support may arrange a refund or alternative as applicable.",
      ])
    ),
    section(
      "Processing time",
      p(
        "Approved refunds are processed according to payment-gateway and bank timelines. Wallet credits, where used, may appear sooner than bank refunds."
      )
    ),
    section("Contact", p("For refund help, open the order or booking in the app and contact Oho E Bazar support.")),
  ].join("");
}

function aboutContent({ audience }) {
  return [
    p(
      "Oho E Bazar is a local marketplace and services platform that helps customers discover shops and venues, place orders, send booking enquiries, and get deliveries through partner apps."
    ),
    section(
      `About this ${audience}`,
      p(
        `This page is shown inside the ${audience}. Use it to learn who we are and how the platform works for your role.`
      )
    ),
    section(
      "What we offer",
      ul([
        "Shop products from nearby vendors",
        "Venue and service enquiries with clear accept / book flows",
        "Delivery partner assignments for eligible orders",
        "In-app support, notifications, and account controls",
      ])
    ),
    section(
      "Our commitment",
      p(
        "We aim to keep listings, payments, and support transparent for customers, shop vendors, service vendors, and delivery partners."
      )
    ),
    section("Contact", p("Reach Oho E Bazar support through the app or the contact details published in App Settings.")),
  ].join("");
}

const PAGES = [
  // —— User App ——
  {
    app: "user",
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: privacyContent({
      audience: "customer (user) app",
      collect: "When you use the customer app, we may collect:",
      use: {
        collectItems: [
          "Name, mobile number, email, and profile photo",
          "Delivery and shipping addresses",
          "Order and booking history",
          "Device and app usage information needed for notifications and security",
        ],
        useItems: [
          "To create and manage your customer account",
          "To process orders, bookings, and payments",
          "To send OTPs, order updates, and support messages",
          "To improve app performance and prevent fraud",
        ],
      },
      share:
        "We may share necessary information with vendors, delivery partners, and payment providers only to complete your transactions. We do not sell your personal data.",
    }),
  },
  {
    app: "user",
    slug: "terms-and-conditions",
    title: "Terms and Conditions",
    content: termsContent({
      audience: "customer (user) app",
      bullets: [
        "Browse products and venues, place orders, and send booking enquiries in good faith",
        "Provide accurate delivery and contact details for fulfilment",
        "Follow cancellation and payment statuses shown on each order or booking",
        "Use ratings and reviews honestly",
      ],
    }),
  },
  {
    app: "user",
    slug: "refund-policy",
    title: "Refund Policy",
    content: refundContent(),
  },
  {
    app: "user",
    slug: "about-us",
    title: "About Us",
    content: aboutContent({ audience: "User App" }),
  },

  // —— Vendor App ——
  {
    app: "vendor",
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: privacyContent({
      audience: "vendor / seller app",
      collect: "When you use the vendor app, we may collect:",
      use: {
        collectItems: [
          "Business / shop name, owner name, mobile number, and email",
          "KYC documents (for example Aadhaar / PAN) and shop media",
          "Product listings, orders, wallet, and payout details",
          "Device and app usage information needed for notifications and security",
        ],
        useItems: [
          "To create and manage your vendor account",
          "To list products, receive orders, and process payouts",
          "To send OTPs, order alerts, and support messages",
          "To verify identity, improve performance, and prevent fraud",
        ],
      },
      share:
        "We may share necessary order and delivery details with customers, delivery partners, and payment providers to fulfil sales. We do not sell your personal or business data.",
    }),
  },
  {
    app: "vendor",
    slug: "terms-and-conditions",
    title: "Terms and Conditions",
    content: termsContent({
      audience: "vendor / seller app",
      bullets: [
        "Keep stock, prices, product details, and bank / payout information accurate",
        "Fulfil confirmed orders within the timelines shown in the app",
        "Comply with listing approval rules when admin approval is required",
        "Do not list prohibited, counterfeit, or misleading products",
      ],
    }),
  },
  {
    app: "vendor",
    slug: "about-us",
    title: "About Us",
    content: aboutContent({ audience: "Vendor App" }),
  },
  {
    app: "vendor",
    slug: "vendor-terms",
    title: "Vendor Terms",
    content: [
      section(
        "Vendor responsibilities",
        p(
          "Shop vendors on Oho E Bazar must keep stock, prices, and bank details accurate. Listings go live after admin approval when that setting is enabled."
        )
      ),
      section(
        "Orders",
        ul([
          "Fulfil confirmed orders on time",
          "Update order status honestly",
          "Handle returns as per platform policy",
        ])
      ),
      section(
        "Payouts",
        p("Withdrawals are requested from your wallet and approved by admin under Payment Management.")
      ),
    ].join(""),
  },

  // —— Service Vendor (venue) App ——
  {
    app: "venue_vendor",
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: privacyContent({
      audience: "service / venue vendor app",
      collect: "When you use the service vendor app, we may collect:",
      use: {
        collectItems: [
          "Business / venue name, owner details, mobile number, and email",
          "Venue media, amenities, pricing, and availability information",
          "Enquiry, booking, and payout-related details",
          "Device and app usage information needed for notifications and security",
        ],
        useItems: [
          "To create and manage your service vendor account",
          "To show your venue, receive enquiries, and process bookings",
          "To send OTPs, enquiry alerts, and support messages",
          "To verify identity, improve performance, and prevent fraud",
        ],
      },
      share:
        "We may share necessary booking and contact details with customers and payment providers to complete enquiries and bookings. We do not sell your personal or business data.",
    }),
  },
  {
    app: "venue_vendor",
    slug: "terms-and-conditions",
    title: "Terms and Conditions",
    content: termsContent({
      audience: "service / venue vendor app",
      bullets: [
        "Reply to enquiries before the response window ends",
        "Honour accepted dates and hold windows once an enquiry is accepted",
        "Keep venue details, pricing, and availability accurate",
        "Do not accept bookings you cannot fulfil",
      ],
    }),
  },
  {
    app: "venue_vendor",
    slug: "service-vendor-policy",
    title: "Service Vendor Policy",
    content: [
      section(
        "Enquiry response",
        p("Service vendors must reply to enquiries before the response window ends and honour accepted dates.")
      ),
      section(
        "Bookings",
        ul([
          "Keep venue availability accurate",
          "Accept only bookings you can fulfil",
          "Communicate changes to customers promptly",
        ])
      ),
      section(
        "Quality",
        p("Misrepresentation of amenities, pricing, or capacity may lead to listing suspension.")
      ),
    ].join(""),
  },

  // —— Delivery Partner App ——
  {
    app: "delivery",
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: privacyContent({
      audience: "delivery partner / driver app",
      collect: "When you use the delivery partner app, we may collect:",
      use: {
        collectItems: [
          "Name, mobile number, email, and profile photo",
          "Driving licence and vehicle-related documents",
          "Delivery assignment, on-duty location, and earnings history",
          "Device and app usage information needed for notifications and security",
        ],
        useItems: [
          "To create and manage your delivery partner account",
          "To assign deliveries and track completion",
          "To send OTPs, job alerts, and support messages",
          "To verify identity, improve performance, and prevent fraud",
        ],
      },
      share:
        "We may share necessary delivery details with customers and vendors to complete orders. We do not sell your personal data.",
    }),
  },
  {
    app: "delivery",
    slug: "terms-and-conditions",
    title: "Terms and Conditions",
    content: termsContent({
      audience: "delivery partner / driver app",
      bullets: [
        "Accept and complete assigned deliveries professionally and on time",
        "Collect the full cash amount on COD orders and settle COD balance when asked by admin",
        "Keep vehicle and document details valid and up to date",
        "Do not misuse customer contact or location information",
      ],
    }),
  },
  {
    app: "delivery",
    slug: "delivery-guidelines",
    title: "Delivery Guidelines",
    content: [
      p("Follow these guidelines whenever you handle Oho E Bazar deliveries."),
      section(
        "Before pickup",
        ul([
          "Confirm the order details and pickup location in the app",
          "Carry a charged phone and any required ID",
        ])
      ),
      section(
        "During delivery",
        ul([
          "Handle packages carefully and keep them secure",
          "Update status in the app at each required step",
          "For COD, collect the exact amount shown and record it correctly",
        ])
      ),
      section(
        "After delivery",
        ul([
          "Mark the order delivered only after successful handover",
          "Report issues (customer unavailable, wrong address, damaged package) through the app promptly",
        ])
      ),
    ].join(""),
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  await mongoose.connect(uri);
  let upserted = 0;
  for (const page of PAGES) {
    await Page.findOneAndUpdate(
      { app: page.app, slug: page.slug },
      {
        $set: {
          title: page.title,
          content: page.content,
          status: "active",
          app: page.app,
          slug: page.slug,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted += 1;
    console.log(`OK  ${page.app}/${page.slug}`);
  }
  console.log(`Upserted ${upserted} static pages.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

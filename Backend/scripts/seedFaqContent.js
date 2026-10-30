/**
 * Upsert active FAQ rows for Oho E Bazar.
 *
 * Usage (from Backend/):
 *   node scripts/seedFaqContent.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Faq = require("../models/other/faq");

const FAQS = [
  {
    question: "How do I track my order?",
    answer:
      "Open Orders in the user app. You can see payment status, order status, and the delivery partner once one is assigned. Open any order for full tracking and invoice options.",
  },
  {
    question: "What payment methods are supported?",
    answer:
      "You can pay online (Razorpay), by cash on delivery where available, or with wallet balance when that option is enabled for your account.",
  },
  {
    question: "When is cash on delivery collected?",
    answer:
      "The delivery partner collects cash when the order is marked delivered. The amount stays in their COD balance until admin settles it.",
  },
  {
    question: "How do refunds work?",
    answer:
      "Refund eligibility depends on order or booking status and the Refund Policy. Approved online refunds go to the original payment method or wallet as configured. COD cancellations before delivery usually do not create an online refund.",
  },
  {
    question: "How do service / venue enquiries work?",
    answer:
      "Send an enquiry with your preferred date. The service vendor accepts or rejects it. After acceptance you have a limited time to pay the token and confirm the booking.",
  },
  {
    question: "How do I cancel an order or booking?",
    answer:
      "Open the order or enquiry in the app and use Cancel while it is still allowed. Some statuses (for example shipped or delivered) cannot be cancelled by the customer.",
  },
  {
    question: "How do shop vendors get paid?",
    answer:
      "Vendor earnings go to the vendor wallet after eligible orders are completed. Vendors request a withdrawal from their wallet; admin approves or rejects it under Payment Management.",
  },
  {
    question: "Why was my product or venue listing not visible?",
    answer:
      "Listings may need admin approval, an active account status, or complete profile / document details. Check your vendor app for pending approval or rejected reasons.",
  },
  {
    question: "How do banner promotions work?",
    answer:
      "Vendors can buy a banner plan for a city and date range, upload a 339×128 px banner, and submit for admin approval. After approval the banner goes live on the start date (India time).",
  },
  {
    question: "What should delivery partners do on COD orders?",
    answer:
      "Collect the exact cash amount shown in the app when delivering, update status correctly, and settle COD balance with admin when asked.",
  },
  {
    question: "How do I update my profile or password?",
    answer:
      "Customers, vendors, and delivery partners can update profile details from their app profile. Use the password or OTP options shown in the app for account security.",
  },
  {
    question: "Who do I contact for support?",
    answer:
      "Use the support email and mobile number shown in App Settings / the in-app help contacts. Include your order number (for example ORD-852240) when asking about an order.",
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  await mongoose.connect(uri);
  let upserted = 0;
  for (const row of FAQS) {
    await Faq.findOneAndUpdate(
      { question: row.question },
      { $set: { question: row.question, answer: row.answer, status: "active" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted += 1;
    console.log(`OK  ${row.question}`);
  }

  // Remove obvious placeholder FAQ if present
  const removed = await Faq.deleteMany({
    question: { $in: ["hello", "Hello", "test", "Test"] },
  });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} placeholder FAQ(s).`);
  }

  console.log(`Upserted ${upserted} FAQs.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

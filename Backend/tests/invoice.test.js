const test = require("node:test");
const assert = require("node:assert/strict");

const { buildInvoicePayload } = require("../utils/ecomOrder");
const { buildVenueInvoicePayload } = require("../utils/venueBookingInvoice");

test("e-commerce invoice item totals exclude tax and show the complete breakdown", () => {
  const invoice = buildInvoicePayload(
    {
      _id: "ecom-1",
      orderNumber: "ECOM-1",
      orderStatus: "pending",
      paymentStatus: "pending",
      paymentMethod: "online",
      placedAt: new Date("2026-01-01T00:00:00Z"),
      items: [
        {
          name: "Product",
          sku: "SKU-1",
          quantity: 2,
          unitPrice: 100,
          taxValue: 10,
          totalPrice: 220,
        },
      ],
      subTotal: 200,
      discountTotal: 50,
      taxTotal: 20,
      shippingCharge: 15,
      grandTotal: 235,
      addressSnapshot: {},
    },
    { name: "Customer" },
    ""
  );

  assert.equal(invoice.items[0].totalPrice, 200);
  assert.equal(invoice.summary.subTotal, 200);
  assert.equal(invoice.summary.discountAlreadyIncluded, true);
  assert.equal(invoice.summary.taxTotal, 20);
  assert.match(invoice.invoiceHtml, /Discount saved \(already reflected in item prices\)/);
  assert.match(invoice.invoiceHtml, /Tax:/);
  assert.match(invoice.invoiceHtml, /Shipping:/);
});

test("service invoice separates discount, tax, deposit due, and payments received", () => {
  const invoice = buildVenueInvoicePayload(
    {
      _id: "venue-1",
      orderNumber: "BOOK-1",
      orderStatus: "pending",
      paymentStatus: "pending",
      paymentMethod: "online",
      placedAt: new Date("2026-01-01T00:00:00Z"),
      items: [
        {
          name: "Venue",
          quantity: 1,
          unitPrice: 1000,
          totalPrice: 1000,
          bookingType: "full_day",
          bookingDate: null,
        },
      ],
      subTotal: 1000,
      discountTotal: 100,
      taxTotal: 18,
      grandTotal: 918,
      tokenAmountPercentage: 20,
      tokenAmount: 184,
      amountPaid: 0,
      remainingAmount: 734,
      addressSnapshot: {},
    },
    { name: "Customer" },
    null,
    ""
  );

  assert.equal(invoice.summary.discountTotal, 100);
  assert.equal(invoice.summary.taxTotal, 18);
  assert.equal(invoice.summary.totalAmount, 918);
  assert.match(invoice.invoiceHtml, /Discount:/);
  assert.match(invoice.invoiceHtml, /Tax:/);
  assert.match(invoice.invoiceHtml, /Booking deposit due \(20%\)/);
  assert.match(invoice.invoiceHtml, /Remaining:/);
  assert.doesNotMatch(invoice.invoiceHtml, /Token paid/);
});

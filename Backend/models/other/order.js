const mongoose = require("mongoose");

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded"];
const PAYMENT_METHODS = ["cod", "online", "wallet"];

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      default: "",
      trim: true,
    },
    variantSku: {
      type: String,
      default: "",
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
      index: true,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "Order must include at least one item",
      },
    },
    subTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    shippingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "cod",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
      index: true,
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    addressSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    placedAt: {
      type: Date,
      default: Date.now,
    },
    invoicePdf: {
      type: String,
      default: "",
      trim: true,
    },
    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    codCollectedAt: {
      type: Date,
      default: null,
      index: true,
    },
    codCollectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      default: null,
      index: true,
    },
    codSettledAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    codSettlementStatus: {
      type: String,
      enum: ["pending", "partial", "settled"],
      default: null,
      index: true,
    },
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      default: null,
      index: true,
    },
    deliveryBoyAssignedBy: {
      type: String,
      enum: ["admin", "auto"],
      default: null,
      index: true,
    },
    driverDelivery: {
      status: {
        type: String,
        enum: ["pending", "accepted", "processing", "out_for_delivery", "delivered", "rejected"],
        default: null,
        index: true,
      },
      acceptedAt: { type: Date, default: null },
      rejectedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: "", trim: true },
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DeliveryBoy",
        default: null,
      },
      outForDeliveryAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
    },
    vendorFulfillments: {
      type: [
        new mongoose.Schema(
          {
            vendor: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Vendor",
              required: true,
              index: true,
            },
            status: {
              type: String,
              enum: [
                "pending",
                "confirmed",
                "processing",
                "shipped",
                "delivered",
                "cancelled",
              ],
              default: "pending",
            },
            deliveryBoy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "DeliveryBoy",
              default: null,
            },
            acceptedAt: { type: Date, default: null },
            rejectedAt: { type: Date, default: null },
            cancellationReason: { type: String, default: "", trim: true },
            shippedAt: { type: Date, default: null },
            deliveredAt: { type: Date, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Order", orderSchema);

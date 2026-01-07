const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    professionalWebsite: { type: String, trim: true },
    additionalDetails: { type: String, trim: true }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true, min: 0 },
    commissionAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    delivery: { type: deliverySchema, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

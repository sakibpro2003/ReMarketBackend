const mongoose = require("mongoose");

const attributeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    condition: {
      type: String,
      enum: ["new", "like_new", "good", "fair"],
      required: true
    },
    price: { type: Number, required: true, min: 0 },
    negotiable: { type: Boolean, default: false },
    quantity: { type: Number, default: 1, min: 1 },
    location: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    attributes: { type: [attributeSchema], default: [] },
    images: { type: [imageSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "sold"],
      default: "draft"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);

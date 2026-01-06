const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);

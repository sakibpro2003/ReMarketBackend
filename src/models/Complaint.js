const mongoose = require("mongoose");

const adminReplySchema = new mongoose.Schema(
  {
    message: { type: String, trim: true },
    repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    repliedAt: { type: Date }
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    imageUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: ["open", "replied", "closed"],
      default: "open"
    },
    adminReply: adminReplySchema
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);

const mongoose = require("mongoose");

const commissionHistorySchema = new mongoose.Schema(
  {
    rate: { type: Number, required: true, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CommissionHistory", commissionHistorySchema);

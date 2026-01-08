const mongoose = require("mongoose");

const homeCategoryImageSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true, unique: true },
    imageUrl: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("HomeCategoryImage", homeCategoryImageSchema);

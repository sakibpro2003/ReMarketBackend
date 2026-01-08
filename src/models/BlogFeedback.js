const mongoose = require("mongoose");

const blogFeedbackSchema = new mongoose.Schema(
  {
    blog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Blog",
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    helpful: { type: Boolean, required: true }
  },
  { timestamps: true }
);

blogFeedbackSchema.index({ blog: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("BlogFeedback", blogFeedbackSchema);

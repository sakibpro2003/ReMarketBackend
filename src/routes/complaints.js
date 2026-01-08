const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const requireActiveUser = require("../middleware/requireActiveUser");
const Complaint = require("../models/Complaint");
const Product = require("../models/Product");

const router = express.Router();

const complaintSchema = z
  .object({
    subject: z.string().trim().min(3, "Subject is required"),
    message: z.string().trim().min(10, "Message is required"),
    productId: z.string().trim().optional(),
    imageUrl: z.string().trim().url().optional()
  })
  .strict();

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

router.post("/", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const parsed = complaintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    let productId = null;
    if (parsed.data.productId) {
      if (!mongoose.Types.ObjectId.isValid(parsed.data.productId)) {
        return res.status(400).json({ error: "Invalid product id" });
      }
      const product = await Product.findById(parsed.data.productId).select("_id");
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      productId = product._id;
    }

    const complaint = await Complaint.create({
      user: req.userId,
      product: productId,
      subject: parsed.data.subject,
      message: parsed.data.message,
      imageUrl: parsed.data.imageUrl || "",
      status: "open"
    });

    return res.status(201).json({
      complaint: {
        id: complaint._id.toString(),
        subject: complaint.subject,
        message: complaint.message,
        imageUrl: complaint.imageUrl,
        status: complaint.status,
        createdAt: complaint.createdAt
      }
    });
  } catch (error) {
    console.error("Create complaint failed", error);
    return res.status(500).json({ error: "Failed to create complaint" });
  }
});

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const complaints = await Complaint.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate("product", "title")
      .lean();

    return res.json({
      complaints: complaints.map((complaint) => ({
        id: complaint._id.toString(),
        subject: complaint.subject,
        message: complaint.message,
        imageUrl: complaint.imageUrl,
        status: complaint.status,
        createdAt: complaint.createdAt,
        adminReply: complaint.adminReply
          ? {
              message: complaint.adminReply.message,
              repliedAt: complaint.adminReply.repliedAt
            }
          : null,
        product: complaint.product
          ? {
              id: complaint.product._id.toString(),
              title: complaint.product.title
            }
          : null
      }))
    });
  } catch (error) {
    console.error("Load complaints failed", error);
    return res.status(500).json({ error: "Failed to load complaints" });
  }
});

module.exports = router;

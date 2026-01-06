const express = require("express");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const Product = require("../models/Product");
const Notification = require("../models/Notification");

const router = express.Router();

const productSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().min(1, "Category is required"),
  condition: z.enum(["new", "like_new", "good", "fair"], {
    required_error: "Condition is required"
  }),
  price: z.number().nonnegative(),
  negotiable: z.boolean().optional(),
  quantity: z.number().int().positive(),
  location: z.string().trim().min(1, "Location is required"),
  description: z.string().trim().min(1, "Description is required"),
  tags: z.array(z.string().trim()).optional(),
  attributes: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        value: z.string().trim().min(1)
      })
    )
    .optional(),
  images: z
    .array(
      z.object({
        url: z.string().trim().url("Image URL must be valid")
      })
    )
    .optional(),
  status: z.enum(["draft", "pending"]).optional()
});

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const payload = parsed.data;
    const product = await Product.create({
      ...payload,
      seller: req.userId,
      status: payload.status || "draft"
    });

    if (product.status === "pending") {
      await Notification.create({
        type: "listing_submitted",
        message: `New listing submitted: ${product.title}`,
        product: product._id,
        seller: req.userId
      });
    }

    return res.status(201).json({ product });
  } catch (error) {
    console.error("Create product failed", error);
    return res.status(500).json({ error: "Failed to create product" });
  }
});

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ products });
  } catch (error) {
    console.error("Load user products failed", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
});

module.exports = router;

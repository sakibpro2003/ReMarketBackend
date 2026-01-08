const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const requireActiveUser = require("../middleware/requireActiveUser");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Review = require("../models/Review");

const router = express.Router();

const reviewCreateSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(1000)
  })
  .strict();

const reviewUpdateSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().min(1).max(1000).optional()
  })
  .strict();

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

const ensureValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const userHasPurchased = async (userId, productId) =>
  Boolean(
    await Order.findOne({ buyer: userId, product: productId }).select("_id")
  );

router.get("/product/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    const [summary] = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: "$product",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 }
        }
      }
    ]);

    const reviews = await Review.find({ product: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("user", "firstName lastName avatarUrl")
      .lean();

    return res.json({
      summary: {
        avgRating: summary?.avgRating || 0,
        count: summary?.count || 0
      },
      reviews: reviews.map((review) => ({
        id: review._id.toString(),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        user: review.user
          ? {
              id: review.user._id.toString(),
              name: `${review.user.firstName} ${review.user.lastName}`.trim(),
              avatarUrl: review.user.avatarUrl || ""
            }
          : null
      }))
    });
  } catch (error) {
    console.error("Load reviews failed", error);
    return res.status(500).json({ error: "Failed to load reviews" });
  }
});

router.get("/product/:id/me", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    const purchased = await userHasPurchased(req.userId, id);
    if (!purchased) {
      return res.json({ canReview: false, review: null });
    }

    const review = await Review.findOne({
      product: id,
      user: req.userId
    }).lean();

    return res.json({
      canReview: true,
      review: review
        ? {
            id: review._id.toString(),
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
            updatedAt: review.updatedAt
          }
        : null
    });
  } catch (error) {
    console.error("Load user review failed", error);
    return res.status(500).json({ error: "Failed to load review" });
  }
});

router.post(
  "/product/:id",
  requireAuth,
  requireActiveUser,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ensureValidId(id)) {
        return res.status(400).json({ error: "Invalid product id" });
      }

      const parsed = reviewCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: firstZodError(parsed.error) });
      }

      const product = await Product.findById(id).select("_id status");
      if (!product || !["approved", "sold"].includes(product.status)) {
        return res.status(404).json({ error: "Product not found" });
      }

      const purchased = await userHasPurchased(req.userId, id);
      if (!purchased) {
        return res.status(403).json({ error: "Purchase required to review" });
      }

      const existing = await Review.findOne({
        product: id,
        user: req.userId
      }).select("_id");
      if (existing) {
        return res.status(409).json({ error: "Review already exists" });
      }

      const created = await Review.create({
        product: id,
        user: req.userId,
        rating: parsed.data.rating,
        comment: parsed.data.comment
      });

      return res.status(201).json({
        review: {
          id: created._id.toString(),
          rating: created.rating,
          comment: created.comment,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt
        }
      });
    } catch (error) {
      console.error("Create review failed", error);
      return res.status(500).json({ error: "Failed to create review" });
    }
  }
);

router.patch("/:id", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid review id" });
    }

    const parsed = reviewUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }
    if (!Object.keys(parsed.data).length) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const review = await Review.findOne({
      _id: id,
      user: req.userId
    });
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (parsed.data.rating !== undefined) {
      review.rating = parsed.data.rating;
    }
    if (parsed.data.comment !== undefined) {
      review.comment = parsed.data.comment;
    }
    await review.save();

    return res.json({
      review: {
        id: review._id.toString(),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt
      }
    });
  } catch (error) {
    console.error("Update review failed", error);
    return res.status(500).json({ error: "Failed to update review" });
  }
});

router.delete("/:id", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid review id" });
    }

    const review = await Review.findOneAndDelete({
      _id: id,
      user: req.userId
    });
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Delete review failed", error);
    return res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;

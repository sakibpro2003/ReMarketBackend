const express = require("express");
const mongoose = require("mongoose");
const requireAuth = require("../middleware/requireAuth");
const requireActiveUser = require("../middleware/requireActiveUser");
const Product = require("../models/Product");
const WishlistItem = require("../models/WishlistItem");

const router = express.Router();

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

router.get("/", requireAuth, async (req, res) => {
  try {
    const items = await WishlistItem.find({ user: req.userId })
      .populate({ path: "product", match: { status: "approved" } })
      .sort({ createdAt: -1 })
      .lean();

    const filtered = items.filter((item) => item.product);
    return res.json({ items: filtered, count: filtered.length });
  } catch (error) {
    console.error("Load wishlist failed", error);
    return res.status(500).json({ error: "Failed to load wishlist" });
  }
});

router.post("/:productId", requireAuth, requireActiveUser, async (req, res) => {
  const { productId } = req.params;

  if (!isValidObjectId(productId)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  try {
    const product = await Product.findOne({
      _id: productId,
      status: "approved"
    }).lean();

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existing = await WishlistItem.findOne({
      user: req.userId,
      product: productId
    }).populate("product");

    if (existing) {
      return res.json({ item: existing, added: false });
    }

    const item = await WishlistItem.create({
      user: req.userId,
      product: productId
    });
    await item.populate("product");

    return res.status(201).json({ item, added: true });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await WishlistItem.findOne({
        user: req.userId,
        product: productId
      }).populate("product");
      if (existing) {
        return res.json({ item: existing, added: false });
      }
    }
    console.error("Add wishlist failed", error);
    return res.status(500).json({ error: "Failed to update wishlist" });
  }
});

router.delete(
  "/:productId",
  requireAuth,
  requireActiveUser,
  async (req, res) => {
    const { productId } = req.params;

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    try {
      const removed = await WishlistItem.findOneAndDelete({
        user: req.userId,
        product: productId
      });

      if (!removed) {
        return res.status(404).json({ error: "Wishlist item not found" });
      }

      return res.json({ removed: true });
    } catch (error) {
      console.error("Remove wishlist failed", error);
      return res.status(500).json({ error: "Failed to update wishlist" });
    }
  }
);

module.exports = router;

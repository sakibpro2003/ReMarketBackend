const express = require("express");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");
const HomeCategoryImage = require("../models/HomeCategoryImage");

const router = express.Router();

const updateSchema = z
  .object({
    category: z.string().trim().min(1),
    imageUrl: z.string().trim().url("Image URL must be valid")
  })
  .strict();

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const items = await HomeCategoryImage.find({})
      .sort({ category: 1 })
      .lean();
    return res.json({
      items: items.map((item) => ({
        id: item._id.toString(),
        category: item.category,
        imageUrl: item.imageUrl,
        updatedAt: item.updatedAt
      }))
    });
  } catch (error) {
    console.error("Load home images failed", error);
    return res.status(500).json({ error: "Failed to load home images" });
  }
});

router.patch("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const updated = await HomeCategoryImage.findOneAndUpdate(
      { category: parsed.data.category },
      { $set: { imageUrl: parsed.data.imageUrl } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      item: {
        id: updated._id.toString(),
        category: updated.category,
        imageUrl: updated.imageUrl,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error) {
    console.error("Update home image failed", error);
    return res.status(500).json({ error: "Failed to update home image" });
  }
});

module.exports = router;

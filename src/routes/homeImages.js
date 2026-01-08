const express = require("express");
const HomeCategoryImage = require("../models/HomeCategoryImage");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const items = await HomeCategoryImage.find({})
      .sort({ category: 1 })
      .lean();
    return res.json({
      items: items.map((item) => ({
        category: item.category,
        imageUrl: item.imageUrl
      }))
    });
  } catch (error) {
    console.error("Load public home images failed", error);
    return res.status(500).json({ error: "Failed to load home images" });
  }
});

module.exports = router;

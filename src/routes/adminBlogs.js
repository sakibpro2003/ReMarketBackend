const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");
const Blog = require("../models/Blog");

const router = express.Router();

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 6, 1),
      50
    );
    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    const total = await Blog.countDocuments(filter);
    const blogs = await Blog.find(filter)
      .populate("author", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      blogs,
      total,
      page,
      pageSize: limit
    });
  } catch (error) {
    console.error("Load admin blogs failed", error);
    return res.status(500).json({ error: "Failed to load blogs" });
  }
});

router.patch("/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    )
      .populate("author", "firstName lastName email")
      .lean();

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    return res.json({ blog });
  } catch (error) {
    console.error("Approve blog failed", error);
    return res.status(500).json({ error: "Failed to approve blog" });
  }
});

router.patch("/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    )
      .populate("author", "firstName lastName email")
      .lean();

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    return res.json({ blog });
  } catch (error) {
    console.error("Reject blog failed", error);
    return res.status(500).json({ error: "Failed to reject blog" });
  }
});

module.exports = router;

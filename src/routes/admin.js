const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");
const Notification = require("../models/Notification");
const Product = require("../models/Product");

const router = express.Router();

router.get("/notifications", requireAuth, requireAdmin, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ isRead: false });
    const notifications = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("seller", "firstName lastName");

    return res.json({
      unreadCount,
      notifications: notifications.map((item) => ({
        id: item._id.toString(),
        message: item.message,
        isRead: item.isRead,
        createdAt: item.createdAt,
        sellerName: item.seller
          ? `${item.seller.firstName} ${item.seller.lastName}`
          : "Unknown"
      }))
    });
  } catch (error) {
    console.error("Load notifications failed", error);
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.get("/listings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    const products = await Product.find(filter)
      .populate("seller", "firstName lastName email phone")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ products });
  } catch (error) {
    console.error("Load admin listings failed", error);
    return res.status(500).json({ error: "Failed to load listings" });
  }
});

router.get("/listings/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("seller", "firstName lastName email phone")
      .lean();

    if (!product) {
      return res.status(404).json({ error: "Listing not found" });
    }

    return res.json({ product });
  } catch (error) {
    console.error("Load listing details failed", error);
    return res.status(500).json({ error: "Failed to load listing" });
  }
});

router.patch("/listings/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    ).lean();

    if (!product) {
      return res.status(404).json({ error: "Listing not found" });
    }

    return res.json({ product });
  } catch (error) {
    console.error("Approve listing failed", error);
    return res.status(500).json({ error: "Failed to approve listing" });
  }
});

router.patch("/listings/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    ).lean();

    if (!product) {
      return res.status(404).json({ error: "Listing not found" });
    }

    return res.json({ product });
  } catch (error) {
    console.error("Reject listing failed", error);
    return res.status(500).json({ error: "Failed to reject listing" });
  }
});

module.exports = router;

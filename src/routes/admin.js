const express = require("express");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");
const Notification = require("../models/Notification");
const Product = require("../models/Product");
const User = require("../models/User");

const router = express.Router();

const listingUpdateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    condition: z.enum(["new", "like_new", "good", "fair"]).optional(),
    price: z.number().nonnegative().optional(),
    negotiable: z.boolean().optional(),
    quantity: z.number().int().positive().optional(),
    location: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
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
    status: z.enum(["draft", "pending", "approved", "rejected", "sold"]).optional()
  })
  .strict();

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

const freezeSchema = z
  .object({
    days: z.number().int().min(1).max(365)
  })
  .strict();

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

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ users });
  } catch (error) {
    console.error("Load users failed", error);
    return res.status(500).json({ error: "Failed to load users" });
  }
});

router.patch("/users/:id/promote", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "User is already an admin" });
    }

    user.role = "admin";
    await user.save();

    return res.json({ user });
  } catch (error) {
    console.error("Promote user failed", error);
    return res.status(500).json({ error: "Failed to promote user" });
  }
});

router.patch("/users/:id/block", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "Admin users cannot be blocked" });
    }

    if (!user.blocked) {
      user.blocked = true;
      await user.save();
    }

    return res.json({ user });
  } catch (error) {
    console.error("Block user failed", error);
    return res.status(500).json({ error: "Failed to block user" });
  }
});

router.patch("/users/:id/freeze", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = freezeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "Admin users cannot be frozen" });
    }

    const freezeUntil = new Date();
    freezeUntil.setDate(freezeUntil.getDate() + parsed.data.days);
    user.frozenUntil = freezeUntil;
    await user.save();

    return res.json({ user });
  } catch (error) {
    console.error("Freeze user failed", error);
    return res.status(500).json({ error: "Failed to freeze user" });
  }
});

router.patch("/users/:id/unfreeze", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "Admin users cannot be frozen" });
    }

    user.frozenUntil = null;
    await user.save();

    return res.json({ user });
  } catch (error) {
    console.error("Unfreeze user failed", error);
    return res.status(500).json({ error: "Failed to unfreeze user" });
  }
});

router.patch("/users/:id/unblock", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "Admin users cannot be blocked" });
    }

    if (user.blocked) {
      user.blocked = false;
      await user.save();
    }

    return res.json({ user });
  } catch (error) {
    console.error("Unblock user failed", error);
    return res.status(500).json({ error: "Failed to unblock user" });
  }
});

router.get("/listings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 8, 1),
      50
    );
    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate("seller", "firstName lastName email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      products,
      total,
      page,
      pageSize: limit
    });
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

router.patch("/listings/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = listingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const updates = parsed.data;
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate("seller", "firstName lastName email phone")
      .lean();

    if (!product) {
      return res.status(404).json({ error: "Listing not found" });
    }

    return res.json({ product });
  } catch (error) {
    console.error("Update listing failed", error);
    return res.status(500).json({ error: "Failed to update listing" });
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

router.delete("/listings/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ error: "Listing not found" });
    }
    await Notification.deleteMany({ product: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete listing failed", error);
    return res.status(500).json({ error: "Failed to delete listing" });
  }
});

module.exports = router;

const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const Notification = require("../models/Notification");
const Order = require("../models/Order");
const User = require("../models/User");

const router = express.Router();

const profileSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").optional(),
    lastName: z.string().trim().min(1, "Last name is required").optional(),
    gender: z.string().trim().min(1, "Gender is required").optional(),
    address: z.string().trim().min(1, "Address is required").optional(),
    avatarUrl: z
      .string()
      .trim()
      .url("Profile image must be a valid URL")
      .optional()
  })
  .strict();

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load user" });
  }
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    if ("email" in req.body || "phone" in req.body) {
      return res
        .status(400)
        .json({ error: "Email and phone cannot be updated." });
    }

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const updates = parsed.data;
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user });
  } catch (error) {
    console.error("Update user profile failed", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const filter = { seller: req.userId, type: "order_placed" };
    const unreadCount = await Notification.countDocuments({
      ...filter,
      isRead: false
    });
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return res.json({
      unreadCount,
      notifications: notifications.map((item) => ({
        id: item._id.toString(),
        message: item.message,
        isRead: item.isRead,
        createdAt: item.createdAt,
        productId: item.product ? item.product.toString() : null
      }))
    });
  } catch (error) {
    console.error("Load seller notifications failed", error);
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.get("/transactions", requireAuth, async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.userId);
    const summaryData = await Order.aggregate([
      { $match: { seller: sellerId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: { $sum: "$price" },
          totalCommission: { $sum: "$commissionAmount" },
          totalGross: { $sum: "$totalAmount" }
        }
      }
    ]);

    const summary = summaryData[0] || {
      totalOrders: 0,
      totalSales: 0,
      totalCommission: 0,
      totalGross: 0
    };

    const transactions = await Order.find({ seller: req.userId })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate("product", "title")
      .lean();

    return res.json({
      summary,
      transactions: transactions.map((order) => ({
        id: order._id.toString(),
        productTitle: order.product?.title || "Unknown item",
        buyerName: order.delivery?.name || "Buyer",
        price: order.price,
        commissionAmount: order.commissionAmount,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt
      }))
    });
  } catch (error) {
    console.error("Load seller transactions failed", error);
    return res.status(500).json({ error: "Failed to load transactions" });
  }
});

module.exports = router;

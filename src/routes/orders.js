const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const requireActiveUser = require("../middleware/requireActiveUser");
const { getCommissionRate } = require("../config/commission");
const Notification = require("../models/Notification");
const Order = require("../models/Order");
const Product = require("../models/Product");

const router = express.Router();

const emptyToUndefined = (value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const toNumber = (value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  if (typeof value === "string" || typeof value === "number") {
    return Number(value);
  }
  return value;
};

const orderSchema = z
  .object({
    productId: z.string().trim().min(1, "Product is required"),
    quantity: z.preprocess(
      toNumber,
      z.number().int().min(1, "Quantity must be at least 1")
    ),
    delivery: z.object({
      name: z.string().trim().min(1, "Name is required"),
      email: z.string().trim().email("Email must be valid"),
      phone: z.string().trim().min(1, "Phone is required"),
      address: z.string().trim().min(1, "Address is required"),
      city: z.preprocess(
        emptyToUndefined,
        z.string().trim().min(1, "City is required").optional()
      ),
      postalCode: z.preprocess(
        emptyToUndefined,
        z.string().trim().min(1, "Postal code is required").optional()
      ),
      professionalWebsite: z.preprocess(
        emptyToUndefined,
        z.string().trim().url("Professional website must be a valid URL").optional()
      ),
      additionalDetails: z.preprocess(
        emptyToUndefined,
        z.string().trim().max(500).optional()
      )
    })
  })
  .strict();

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

router.post("/", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const { productId, delivery, quantity } = parsed.data;
    const product = await Product.findById(productId).lean();
    if (!product || product.status !== "approved" || product.quantity < 1) {
      return res.status(404).json({ error: "Product is not available" });
    }

    if (product.seller?.toString() === req.userId) {
      return res.status(400).json({ error: "You cannot buy your own listing" });
    }

    if (quantity > product.quantity) {
      return res.status(400).json({
        error: `Only ${product.quantity} unit${product.quantity === 1 ? "" : "s"} available`
      });
    }

    const updated = await Product.findOneAndUpdate(
      { _id: productId, status: "approved", quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(409).json({ error: "Product is no longer available" });
    }

    let finalProduct = updated;
    if (updated.quantity <= 0) {
      finalProduct = await Product.findByIdAndUpdate(
        productId,
        { status: "sold" },
        { new: true }
      ).lean();
    }

    const commissionRate = getCommissionRate();
    const subtotal = Number((updated.price * quantity).toFixed(2));
    const commissionAmount = Number((subtotal * commissionRate).toFixed(2));
    const totalAmount = Number((subtotal + commissionAmount).toFixed(2));

    try {
      const order = await Order.create({
        product: updated._id,
        buyer: req.userId,
        seller: updated.seller,
        quantity,
        price: subtotal,
        commissionRate,
        commissionAmount,
        totalAmount,
        delivery
      });

      try {
        await Notification.create({
          type: "order_placed",
          message: `New order (${quantity}) for "${updated.title}" from ${delivery.name}. Review delivery details and contact the buyer to arrange handoff.`,
          product: updated._id,
          seller: updated.seller
        });
      } catch (error) {
        console.error("Create order notification failed", error);
      }

      return res.status(201).json({
        order,
        product: finalProduct || updated,
        commissionRate
      });
    } catch (error) {
      await Product.findByIdAndUpdate(productId, {
        $inc: { quantity },
        status: "approved"
      });
      throw error;
    }
  } catch (error) {
    console.error("Create order failed", error);
    return res.status(500).json({ error: "Failed to place order" });
  }
});

router.get("/history", requireAuth, async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 8, 1),
      50
    );
    const buyerId = new mongoose.Types.ObjectId(req.userId);

    const summaryData = await Order.aggregate([
      { $match: { buyer: buyerId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalItems: { $sum: "$quantity" },
          totalSpent: { $sum: "$totalAmount" }
        }
      }
    ]);

    const summary = summaryData[0] || {
      totalOrders: 0,
      totalItems: 0,
      totalSpent: 0
    };

    const total = await Order.countDocuments({ buyer: req.userId });
    const orders = await Order.find({ buyer: req.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("product", "title price images status")
      .populate("seller", "firstName lastName email phone")
      .lean();

    return res.json({
      summary,
      total,
      page,
      pageSize: limit,
      orders: orders.map((order) => ({
        id: order._id.toString(),
        quantity: order.quantity,
        price: order.price,
        commissionAmount: order.commissionAmount,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        product: order.product
          ? {
              id: order.product._id.toString(),
              title: order.product.title,
              price: order.product.price,
              images: order.product.images || []
            }
          : null,
        seller: order.seller
          ? {
              id: order.seller._id.toString(),
              name: `${order.seller.firstName || ""} ${order.seller.lastName || ""}`.trim(),
              email: order.seller.email,
              phone: order.seller.phone
            }
          : null,
        delivery: {
          name: order.delivery?.name,
          address: order.delivery?.address,
          city: order.delivery?.city
        }
      }))
    });
  } catch (error) {
    console.error("Load buyer order history failed", error);
    return res.status(500).json({ error: "Failed to load order history" });
  }
});

router.get("/sales-history", requireAuth, async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 8, 1),
      50
    );
    const sellerId = new mongoose.Types.ObjectId(req.userId);

    const summaryData = await Order.aggregate([
      { $match: { seller: sellerId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalItems: { $sum: "$quantity" },
          totalSales: { $sum: "$price" },
          totalCommission: { $sum: "$commissionAmount" },
          totalGross: { $sum: "$totalAmount" }
        }
      }
    ]);

    const summary = summaryData[0] || {
      totalOrders: 0,
      totalItems: 0,
      totalSales: 0,
      totalCommission: 0,
      totalGross: 0
    };

    const total = await Order.countDocuments({ seller: req.userId });
    const orders = await Order.find({ seller: req.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("product", "title price images status")
      .lean();

    return res.json({
      summary,
      total,
      page,
      pageSize: limit,
      orders: orders.map((order) => ({
        id: order._id.toString(),
        quantity: order.quantity,
        price: order.price,
        commissionAmount: order.commissionAmount,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        product: order.product
          ? {
              id: order.product._id.toString(),
              title: order.product.title,
              price: order.product.price,
              images: order.product.images || []
            }
          : null,
        buyer: {
          name: order.delivery?.name,
          email: order.delivery?.email,
          phone: order.delivery?.phone
        },
        delivery: {
          address: order.delivery?.address,
          city: order.delivery?.city
        }
      }))
    });
  } catch (error) {
    console.error("Load seller sales history failed", error);
    return res.status(500).json({ error: "Failed to load sales history" });
  }
});

module.exports = router;

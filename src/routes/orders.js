const express = require("express");
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
      city: z.string().trim().min(1, "City is required"),
      postalCode: z.string().trim().min(1, "Postal code is required"),
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

module.exports = router;

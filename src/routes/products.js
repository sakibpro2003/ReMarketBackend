const express = require("express");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const requireActiveUser = require("../middleware/requireActiveUser");
const { getCommissionRate } = require("../config/commission");
const Product = require("../models/Product");
const Notification = require("../models/Notification");

const router = express.Router();

const productSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().min(1, "Category is required"),
  condition: z.enum(["new", "like_new", "good", "fair"], {
    required_error: "Condition is required"
  }),
  price: z.number().nonnegative(),
  negotiable: z.boolean().optional(),
  quantity: z.number().int().positive(),
  location: z.string().trim().min(1, "Location is required"),
  description: z.string().trim().min(1, "Description is required"),
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
  status: z.enum(["draft", "pending"]).optional()
});

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

router.post("/", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const payload = parsed.data;
    const product = await Product.create({
      ...payload,
      seller: req.userId,
      status: payload.status || "draft"
    });

    if (product.status === "pending") {
      await Notification.create({
        type: "listing_submitted",
        message: `New listing submitted: ${product.title}`,
        product: product._id,
        seller: req.userId
      });
    }

    return res.status(201).json({ product });
  } catch (error) {
    console.error("Create product failed", error);
    return res.status(500).json({ error: "Failed to create product" });
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      search,
      category,
      condition,
      minPrice,
      maxPrice,
      sort,
      page,
      limit
    } = req.query;

    const query = { status: "approved", quantity: { $gt: 0 } };
    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number.parseInt(limit, 10) || 9, 1),
      50
    );

    if (category && category !== "all") {
      query.category = category;
    }

    if (condition && condition !== "all") {
      query.condition = condition;
    }

    const priceFilter = {};
    if (minPrice !== undefined && minPrice !== "") {
      const min = Number(minPrice);
      if (!Number.isNaN(min)) {
        priceFilter.$gte = min;
      }
    }
    if (maxPrice !== undefined && maxPrice !== "") {
      const max = Number(maxPrice);
      if (!Number.isNaN(max)) {
        priceFilter.$lte = max;
      }
    }
    if (Object.keys(priceFilter).length) {
      query.price = priceFilter;
    }

    if (search && search.trim().length) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      query.$or = [
        { title: regex },
        { description: regex },
        { category: regex },
        { tags: regex },
        { "attributes.key": regex },
        { "attributes.value": regex }
      ];
    }

    let sortBy = { createdAt: -1 };
    if (sort === "price_asc") {
      sortBy = { price: 1 };
    } else if (sort === "price_desc") {
      sortBy = { price: -1 };
    } else if (sort === "oldest") {
      sortBy = { createdAt: 1 };
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sortBy)
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean();
    return res.json({
      products,
      count: products.length,
      total,
      page: currentPage,
      pageSize
    });
  } catch (error) {
    console.error("Load products failed", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
});

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ products });
  } catch (error) {
    console.error("Load user products failed", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      status: "approved",
      quantity: { $gt: 0 }
    })
      .populate("seller", "firstName lastName email phone")
      .lean();

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const commissionRate = getCommissionRate();
    return res.json({ product, commissionRate });
  } catch (error) {
    console.error("Load product failed", error);
    return res.status(500).json({ error: "Failed to load product" });
  }
});

module.exports = router;

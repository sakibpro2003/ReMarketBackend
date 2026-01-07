const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");

const router = express.Router();

const signToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

const sanitizeUser = (user) => ({
  id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  gender: user.gender,
  address: user.address,
  avatarUrl: user.avatarUrl,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const registerSchema = z.object({
  firstName: z.string({ required_error: "First name is required" }).trim().min(1, "First name is required"),
  lastName: z.string({ required_error: "Last name is required" }).trim().min(1, "Last name is required"),
  email: z.string({ required_error: "Email is required" }).trim().email("Invalid email address"),
  phone: z.string({ required_error: "Phone is required" }).trim().min(1, "Phone is required"),
  gender: z.enum(["male", "female", "other"], {
    required_error: "Gender is required",
    invalid_type_error: "Gender is required"
  }),
  address: z.string({ required_error: "Address is required" }).trim().min(1, "Address is required"),
  password: z.string({ required_error: "Password is required" }).min(6, "Password must be at least 6 characters")
});

const loginSchema = z.object({
  email: z.string({ required_error: "Email is required" }).trim().email("Invalid email address"),
  password: z.string({ required_error: "Password is required" }).min(1, "Password is required")
});

const firstZodError = (error) => {
  const issue = error.errors?.[0];
  if (!issue) {
    return "Invalid request data";
  }
  if (issue.code === "invalid_enum_value" && issue.path?.[0] === "gender") {
    return "Gender must be male, female, or other";
  }
  return issue.message;
};

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const { firstName, lastName, email, phone, gender, address, password } =
      parsed.data;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      gender,
      address,
      passwordHash
    });

    const token = signToken(user);
    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error("Register failed", error);
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Email already registered" });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ error: "Invalid registration data" });
    }
    return res.status(500).json({ error: "Failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const { email, password } = parsed.data;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.blocked) {
      return res
        .status(403)
        .json({ error: "Your account is blocked. Contact support." });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error("Login failed", error);
    return res.status(500).json({ error: "Failed to log in" });
  }
});

module.exports = router;

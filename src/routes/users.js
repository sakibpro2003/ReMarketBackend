const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const User = require("../models/User");

const router = express.Router();

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

module.exports = router;

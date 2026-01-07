const jwt = require("jsonwebtoken");
const User = require("../models/User");

const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.sub).select(
      "role blocked frozenUntil"
    );
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    if (user.blocked) {
      return res.status(403).json({ error: "Your account is blocked." });
    }
    req.userId = user._id.toString();
    req.userRole = user.role;
    req.userFrozenUntil = user.frozenUntil;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid auth token" });
  }
};

module.exports = requireAuth;

const requireAdmin = (req, res, next) => {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
};

module.exports = requireAdmin;

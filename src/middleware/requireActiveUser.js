const requireActiveUser = (req, res, next) => {
  const frozenUntil = req.userFrozenUntil ? new Date(req.userFrozenUntil) : null;

  if (frozenUntil && !Number.isNaN(frozenUntil.getTime())) {
    if (frozenUntil > new Date()) {
      const formatted = frozenUntil.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      return res
        .status(403)
        .json({ error: `Your account is frozen until ${formatted}.` });
    }
  }

  return next();
};

module.exports = requireActiveUser;

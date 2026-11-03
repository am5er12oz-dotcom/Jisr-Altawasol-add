// بيتحقق من الـ token اللي جاي من المتصفح (Authorization: Bearer ...)
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: "غير مصرّح" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "غير مصرّح" });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "غير مصرّح" });
  }
};

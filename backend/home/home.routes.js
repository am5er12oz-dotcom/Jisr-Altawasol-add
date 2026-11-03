// الباك إند الخاص بالصفحة الرئيسية
const router = require("express").Router();
const requireAuth = require("../middleware/auth");
const { publicUser } = require("../shared/auth-helpers");

// بيانات المستخدم الحالي (بتتأكد إن الـ token لسه صالح)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;

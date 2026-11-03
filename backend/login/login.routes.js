// الباك إند الخاص بصفحة تسجيل الدخول
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { gClient, publicUser, sign } = require("../shared/auth-helpers");

// الدخول بحساب جوجل (للحسابات المسجَّلة مسبقًا فقط)
router.post("/google/login", async (req, res) => {
  try {
    const ticket = await gClient.verifyIdToken({
      idToken: req.body.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p.email || !p.email_verified)
      return res.status(403).json({ message: "بريد جوجل الإلكتروني غير مؤكَّد" });

    const user = await User.findOne({ email: p.email.toLowerCase() });
    if (!user)
      return res
        .status(404)
        .json({ message: "لا يوجد حساب بهذا البريد الإلكتروني. يرجى إنشاء حساب أولًا." });
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    console.error("google login error:", err.message);
    res.status(401).json({ message: "تعذّر التحقق من حساب جوجل" });
  }
});

// الدخول بالبريد الإلكتروني وكلمة المرور
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || "").toLowerCase() });
    if (!user || !user.password || !(await bcrypt.compare(password || "", user.password)))
      return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    console.error("login error:", err.message);
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
});

module.exports = router;

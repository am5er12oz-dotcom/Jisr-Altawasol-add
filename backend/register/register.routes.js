// الباك إند الخاص بصفحة إنشاء الحساب
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { gClient, publicUser, sign } = require("../shared/auth-helpers");

// إنشاء حساب جديد بجوجل (مرة واحدة لكل بريد إلكتروني)
router.post("/google/register", async (req, res) => {
  try {
    const { credential, name, gender, userType, password } = req.body;
    if (!credential) return res.status(400).json({ message: "بيانات جوجل غير مكتملة" });

    const ticket = await gClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p.email || !p.email_verified)
      return res.status(400).json({ message: "بريد جوجل الإلكتروني غير مؤكَّد" });

    const email = p.email.toLowerCase();
    if (await User.findOne({ email }))
      return res.status(409).json({
        message: "هذا الحساب مسجَّل مسبقًا. يرجى تسجيل الدخول بدلًا من إنشاء حساب جديد.",
        exists: true,
      });

    if (!["male", "female"].includes(gender) || !["deaf", "hearing"].includes(userType))
      return res.status(400).json({ message: "يرجى اختيار الجنس ونوع المستخدم" });
    if (!password || password.length < 6)
      return res.status(400).json({ message: "يجب ألا تقل كلمة المرور عن 6 أحرف" });

    const user = await User.create({
      name: (name && name.trim()) || p.name || email.split("@")[0],
      email,
      googleId: p.sub,
      password: await bcrypt.hash(password, 10),
      gender,
      userType,
    });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    console.error("google register error:", err.message);
    res.status(401).json({ message: "تعذّر التحقق من حساب جوجل" });
  }
});

module.exports = router;

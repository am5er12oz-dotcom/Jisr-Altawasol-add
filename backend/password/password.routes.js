const router = require("express").Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function hash(c) {
  return crypto.createHash("sha256").update(String(c)).digest("hex");
}

// 1) طلب الكود
router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const user = await User.findOne({ email: email });

    if (user) {
      const code = crypto.randomInt(100000, 1000000).toString();

      // updateOne بدل save عشان ما يعملش فحص لباقي الحقول (زي gender)
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            resetCode: hash(code),
            resetExpires: new Date(Date.now() + 10 * 60 * 1000),
            resetAttempts: 0,
          },
        }
      );

      await transporter.sendMail({
        from: '"جسر التواصل" <' + process.env.GMAIL_USER + '>',
        to: email,
        subject: "رمز استعادة كلمة المرور",
        text: "رمزك هو: " + code + "\nصالح لمدة 10 دقائق.",
      });
    }

    res.json({ message: "لو البريد مسجّل، هيوصلك رمز على الإيميل." });
  } catch (err) {
    console.error("forgot error:", err.message);
    res.status(500).json({ message: "تعذّر إرسال الرمز، حاولي بعد قليل." });
  }
});

// 2) إدخال الكود وكلمة المرور الجديدة
router.post("/reset-password", async (req, res) => {
  try {
    const code = req.body.code;
    const password = req.body.password;
    const email = String(req.body.email || "").toLowerCase().trim();

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ message: "يجب ألا تقل كلمة المرور عن 6 أحرف" });
    }

    const user = await User.findOne({ email: email });

    let invalid = false;
    if (!user) invalid = true;
    else if (!user.resetCode) invalid = true;
    else if (!user.resetExpires) invalid = true;
    else if (user.resetExpires < Date.now()) invalid = true;
    else if (user.resetAttempts >= 5) invalid = true;

    if (invalid) {
      return res.status(400).json({ message: "الرمز غير صحيح أو منتهي" });
    }

    if (user.resetCode !== hash(code)) {
      await User.updateOne({ _id: user._id }, { $inc: { resetAttempts: 1 } });
      return res.status(400).json({ message: "الرمز غير صحيح أو منتهي" });
    }

    const newHash = await bcrypt.hash(password, 10);
    await User.updateOne(
      { _id: user._id },
      {
        $set: { password: newHash, resetAttempts: 0 },
        $unset: { resetCode: "", resetExpires: "" },
      }
    );

    res.json({ message: "تم تغيير كلمة المرور، سجّلي دخولك." });
  } catch (err) {
    console.error("reset error:", err.message);
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
});

module.exports = router; 
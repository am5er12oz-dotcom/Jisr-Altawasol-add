// تعرف الصفحة معرّف عميل جوجل (Client ID) من هنا — بتستخدمه صفحتا التسجيل والدخول
const router = require("express").Router();

router.get("/config", (req, res) =>
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID })
);

module.exports = router;

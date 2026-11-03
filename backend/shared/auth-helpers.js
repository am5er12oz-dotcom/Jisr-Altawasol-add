// أدوات مشتركة بين صفحات التسجيل والدخول
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const gClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// بيانات المستخدم اللي بتروح للمتصفح
const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  gender: u.gender,
  userType: u.userType,
});

const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

module.exports = { gClient, publicUser, sign };

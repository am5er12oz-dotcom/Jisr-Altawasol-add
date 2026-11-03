const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const express = require("express");
const mongoose = require("mongoose");
const { startCleanupJob } = require("./chat/cleanup");

const app = express();

const FRONT = path.join(__dirname, "..", "frontend");

app.use(express.json({ limit: "5mb" })); // الصور والصوت بتتبعت كـ base64

// السماح للموقع باستخدام الكاميرا والميكروفون (لتسجيل الإشارات والكلام)
app.use((req, res, next) => {
  res.set("Permissions-Policy", "camera=(self), microphone=(self)");
  next();
});

// ===== الـ API =====
app.use("/api/auth", require("./shared/config.routes"));
app.use("/api/auth", require("./register/register.routes"));
app.use("/api/auth", require("./login/login.routes"));
app.use("/api/auth", require("./password/password.routes")); // نسيت كلمة المرور
app.use("/api/home", require("./home/home.routes"));
app.use("/api/chat", require("./chat/chat.routes"));
app.use("/api/signs", require("./signs/signs.routes")); // إشارات لغة الإشارة (من مونجو)

// ===== الصفحات =====
const page = (file) => (req, res) => res.sendFile(path.join(FRONT, file));

app.get(["/", "/index.html"], page("home/index.html"));
app.get("/register.html", page("register/register.html"));
app.get("/login.html", page("login/login.html"));
app.get("/forgot.html", page("forgot/forgot.html"));
// ===== صفحات الشات =====
app.get("/chats.html", page("chat/chats.html"));     // قائمة المحادثات
app.get("/chat.html", page("chat/chat.html"));       // شاشة المحادثة
app.get("/contact.html", page("chat/contact.html")); // معلومات جهة الاتصال
app.get("/deaf-chat.html", page("chat/deaf-chat.html")); // شات الأصم (أفاتار + إشارة)

app.use(express.static(FRONT));

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGO_URI)
  .then((conn) => {
    console.log("MongoDB connected ✅");
    console.log("Host:", conn.connection.host);
    console.log("Database:", conn.connection.name);
    startCleanupJob(); // تنظيف الرسايل القديمة تلقائيًا
    app.listen(PORT, () =>
      console.log("Server running on http://localhost:" + PORT)
    );
  })
  .catch((err) => console.error("MongoDB error ❌:", err.message));
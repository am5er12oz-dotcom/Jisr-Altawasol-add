// نقل بيانات الجهاز القديمة (hayah.*) للأسماء الجديدة مرة واحدة
try {
  Object.keys(localStorage).forEach(function (k) {
    if (k.indexOf("hayah.") === 0) {
      var nk = "jisr." + k.slice(6);
      if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  });
} catch (e) {}

// ============ إعدادات الصفحة ============
// لإيقاف ميزة اجعلها false وستختفي من الشاشة.
const CONFIG = {
  APP_NAME: "جسر التواصل", // اسم التطبيق

  FEATURES: {
    text: true,    // رسائل نصية
    images: true,  // إرسال صور
    voice: true,   // زر الميكروفون (تحويل الكلام إلى نص)
    links: true,   // إرسال لينكات
  },

  SPEECH_LANG: "ar-EG", // لغة تحويل الكلام إلى نص (مثال: "ar-SA" للسعودية، "en-US" للإنجليزية)

  // مسارات الصفحات (متوافقة مع backend/server.js)
  PAGES: {
    main: "/index.html",      // الصفحة الرئيسية لجسر التواصل
    home: "/chats.html",      // قائمة المحادثات
    chat: "/chat.html",       // شاشة المحادثة
    contact: "/contact.html", // معلومات جهة الاتصال
    login: "/login.html",
  },
};

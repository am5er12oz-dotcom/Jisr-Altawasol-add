// موديل الإشارات: بيقرأ من الكوليكشن اللي إنتِ عاملاها في مونجو.
// strict:false = مش بيفرض شكل معين للحقول (عشان يقرأ بياناتك زي ما هي).
//
// إعدادات اختيارية في ملف .env:
//   SIGNS_COLLECTION  = اسم الكوليكشن (الافتراضي: signs)
//   SIGNS_MONGO_URI   = لو الإشارات في قاعدة بيانات تانية غير بتاعة المستخدمين
const mongoose = require("mongoose");

const COLLECTION = process.env.SIGNS_COLLECTION || "signs";
const schema = new mongoose.Schema({}, { strict: false, collection: COLLECTION });

let conn = mongoose;
if (process.env.SIGNS_MONGO_URI) {
  conn = mongoose.createConnection(process.env.SIGNS_MONGO_URI);
}

module.exports = conn.models.Sign || conn.model("Sign", schema);

const mongoose = require("mongoose");

// رسالة بين مستخدمين اثنين (زي واتساب)
const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "image", "voice"], default: "text" },
    text: { type: String, default: "", maxlength: 2000 },
    // الصورة/الصوت بتتخزن هنا كـ data URL
    dataUrl: { type: String, default: "" },
    duration: { type: Number, default: 0 },
    read: { type: Boolean, default: false },
    // وقت ما الطرف التاني قرأها (عشان المرسل يشوف ✓✓)
    readAt: { type: Date },
    // الصورة اتمسحت من القاعدة لتوفير المساحة (الرسالة نفسها فاضلة في الشات)
    expired: { type: Boolean, default: false },
    // آخر مرة اتغيّرت حالة الصورة (اتمسحت أو اترفعت تاني) — بيستخدمها المتصفح عشان يتحدّث
    mediaUpdatedAt: { type: Date },
    // لما المرسل يعيد رفع الصورة، بنحسبها كأنها جديدة في ترتيب المسح
    restoredAt: { type: Date },
    // حجم الرسالة بالبايت — بنستخدمه في التنظيف التلقائي
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

messageSchema.index({ from: 1, to: 1, _id: 1 });
messageSchema.index({ to: 1, from: 1, read: 1 });
messageSchema.index({ mediaUpdatedAt: 1 });

module.exports = mongoose.model("Message", messageSchema);

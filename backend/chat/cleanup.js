// تنظيف تلقائي للصور بس — النصوص مبتتمسحش أبدًا.
//
// لما حجم الصور في محادثة بين شخصين يعدّي الحد (CHAT_MAX_MB، الافتراضي 50)،
// بنمسح بيانات أقدم الصور من القاعدة لحد ما الحجم ينزل لـ 80% من الحد.
// الرسالة نفسها بتفضل ظاهرة في الشات كـ "الصورة لم تعد متاحة"،
// والمرسل يقدر يعيد رفعها فترجع تتخزن في القاعدة تاني.
//
// حد أمان إضافي لكل القاعدة (CHAT_GLOBAL_MAX_MB، الافتراضي 400) عشان
// مجموع المحادثات كلها ما يملّاش القاعدة.
const Message = require("../models/Message");

const MB = 1024 * 1024;
const MAX_CONV = (Number(process.env.CHAT_MAX_MB) || 50) * MB;
const MAX_GLOBAL = (Number(process.env.CHAT_GLOBAL_MAX_MB) || 400) * MB;
const TARGET = 0.8;

// بيمسح أقدم الصور (المطابقة للـ filter) لحد ما المجموع ينزل تحت الهدف
async function expireOldest(filter, limitBytes, protectId) {
  const imgs = await Message.find(
    { ...filter, type: "image", expired: { $ne: true } },
    { size: 1, createdAt: 1, restoredAt: 1 }
  ).lean();

  let total = imgs.reduce((n, m) => n + (m.size || 0), 0);
  if (total <= limitBytes) return 0;

  const when = (m) => new Date(m.restoredAt || m.createdAt).getTime();
  imgs.sort((a, b) => when(a) - when(b));

  const target = limitBytes * TARGET;
  const ids = [];
  for (const m of imgs) {
    if (total <= target) break;
    if (protectId && String(m._id) === String(protectId)) continue;
    ids.push(m._id);
    total -= m.size || 0;
  }
  if (!ids.length) return 0;

  await Message.updateMany(
    { _id: { $in: ids } },
    { $set: { dataUrl: "", expired: true, size: 100, mediaUpdatedAt: new Date() } }
  );
  return ids.length;
}

// بعد كل رسالة/إعادة رفع: افحص المحادثة دي (protectId = الصورة اللي لسه مرفوعة)
async function cleanupConversation(a, b, protectId) {
  try {
    const n = await expireOldest({ $or: [{ from: a, to: b }, { from: b, to: a }] }, MAX_CONV, protectId);
    if (n) console.log("Chat cleanup: expired " + n + " old images in one conversation");
  } catch (err) {
    console.error("cleanup error:", err.message);
  }
}

let running = false;
async function cleanupGlobal() {
  if (running) return;
  running = true;
  try {
    const n = await expireOldest({}, MAX_GLOBAL);
    if (n) console.log("Chat cleanup: expired " + n + " old images (global limit)");
  } catch (err) {
    console.error("cleanup error:", err.message);
  } finally {
    running = false;
  }
}

// يشتغل مرة وقت تشغيل السيرفر وبعدين كل 10 دقايق
function startCleanupJob() {
  cleanupGlobal();
  setInterval(cleanupGlobal, 10 * 60 * 1000);
}

module.exports = { cleanupConversation, cleanupGlobal, startCleanupJob };

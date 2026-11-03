// الباك إند الخاص بالشات (زي واتساب: كل الرسايل محفوظة في MongoDB)
const router = require("express").Router();
const mongoose = require("mongoose");
const requireAuth = require("../middleware/auth");
const User = require("../models/User");
const Message = require("../models/Message");
const { cleanupConversation } = require("./cleanup");

router.use(requireAuth);

const isId = (v) => mongoose.isValidObjectId(v);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAX_DATAURL = 3 * 1024 * 1024; // 3MB للصورة/الصوت الواحد

const personOut = (u) => ({ id: String(u._id), name: u.name, userType: u.userType });

// شكل الرسالة اللي بتروح للمتصفح (من وجهة نظري: me / them)
function msgOut(m, myId) {
  const mine = String(m.from) === String(myId);
  return {
    id: String(m._id),
    chatId: String(mine ? m.to : m.from),
    sender: mine ? "me" : "them",
    type: m.type,
    text: m.text,
    dataUrl: m.dataUrl,
    expired: !!m.expired,
    duration: m.duration,
    time: new Date(m.createdAt).getTime(),
    read: mine ? m.read : true,
  };
}

// 1) البحث عن مستخدمين (بالاسم أو بالإيميل)
router.get("/users", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ users: [] });
    const rx = new RegExp(escapeRegex(q), "i");
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ name: rx }, { email: q.toLowerCase() }],
    })
      .select("name userType")
      .limit(10)
      .lean();
    res.json({ users: users.map(personOut) });
  } catch (err) {
    console.error("chat users error:", err.message);
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
});

// 2) بيانات شخص واحد
router.get("/users/:id", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "غير موجود" });
    const u = await User.findById(req.params.id).select("name userType").lean();
    if (!u) return res.status(404).json({ message: "غير موجود" });
    res.json({ user: personOut(u) });
  } catch (err) {
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
});

// 3) قائمة المحادثات (آخر رسالة + عدد غير المقروء)
router.get("/conversations", async (req, res) => {
  try {
    const me = req.user._id;
    const rows = await Message.aggregate([
      { $match: { $or: [{ from: me }, { to: me }] } },
      { $project: { dataUrl: 0 } }, // مش محتاجين الصور هنا
      { $sort: { _id: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$from", me] }, "$to", "$from"] },
          last: { $first: "$$ROOT" },
          unread: { $sum: { $cond: [{ $and: [{ $eq: ["$to", me] }, { $eq: ["$read", false] }] }, 1, 0] } },
        },
      },
      { $sort: { "last._id": -1 } },
      { $limit: 100 },
    ]);

    const users = await User.find({ _id: { $in: rows.map((r) => r._id) } })
      .select("name userType")
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const chats = rows
      .filter((r) => byId.has(String(r._id)))
      .map((r) => {
        const p = personOut(byId.get(String(r._id)));
        const last = msgOut(r.last, me);
        last.dataUrl = ""; // مش محتاجين الصورة في القائمة
        return { ...p, last, unread: r.unread };
      });
    res.json({ chats });
  } catch (err) {
    console.error("conversations error:", err.message);
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
});

// 4) رسايل محادثة مع شخص (after = آخر id وصلني، عشان أجيب الجديد بس)
router.get("/messages/:userId", async (req, res) => {
  try {
    const other = req.params.userId;
    if (!isId(other)) return res.status(400).json({ message: "معرّف غير صحيح" });
    const me = req.user._id;

    const filter = {
      $or: [
        { from: me, to: other },
        { from: other, to: me },
      ],
    };
    const after = req.query.after;
    const since = Number(req.query.since);
    let msgs;
    if (after && isId(after)) {
      // الجديد + أي صورة اتمسحت أو اترفعت تاني من وقت آخر تحديث
      const changed = [{ _id: { $gt: after } }];
      if (since > 0) {
        changed.push({ mediaUpdatedAt: { $gt: new Date(since) } });
        changed.push({ from: me, readAt: { $gt: new Date(since - 5000) } }); // رسايلي اللي اتقرأت
      }
      msgs = await Message.find({ $and: [filter, { $or: changed }] })
        .sort({ _id: 1 })
        .limit(200)
        .lean();
    } else {
      msgs = (await Message.find(filter).sort({ _id: -1 }).limit(200).lean()).reverse();
    }

    // أي رسالة وصلتني من الشخص ده بقت مقروءة
    await Message.updateMany({ from: other, to: me, read: false }, { $set: { read: true, readAt: new Date() } });

    res.json({ messages: msgs.map((m) => msgOut(m, me)), serverTime: Date.now() });
  } catch (err) {
    console.error("messages error:", err.message);
    res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
});

// 5) إرسال رسالة
router.post("/messages/:userId", async (req, res) => {
  try {
    const other = req.params.userId;
    if (!isId(other)) return res.status(400).json({ message: "معرّف غير صحيح" });
    if (String(other) === String(req.user._id))
      return res.status(400).json({ message: "لا يمكن مراسلة نفسك" });
    if (!(await User.exists({ _id: other })))
      return res.status(404).json({ message: "المستخدم غير موجود" });

    const type = ["text", "image"].includes(req.body.type) ? req.body.type : "text";
    const text = String(req.body.text || "").trim().slice(0, 2000);
    const dataUrl = type === "text" ? "" : String(req.body.dataUrl || "");
    const duration = 0;

    if (type === "text" && !text) return res.status(400).json({ message: "الرسالة فارغة" });
    if (type !== "text") {
      const okPrefix = "data:image/";
      if (!dataUrl.startsWith(okPrefix)) return res.status(400).json({ message: "ملف غير صالح" });
      if (dataUrl.length > MAX_DATAURL) return res.status(413).json({ message: "الملف كبير جدًا" });
    }

    const msg = await Message.create({
      from: req.user._id,
      to: other,
      type,
      text,
      dataUrl,
      duration,
      size: Buffer.byteLength(text) + dataUrl.length + 100,
    });

    if (type === "image") cleanupConversation(req.user._id, other, msg._id); // لو حجم الصور عدّى الحد يمسح الأقدم (في الخلفية)
    res.status(201).json({ message: msgOut(msg.toObject(), req.user._id) });
  } catch (err) {
    console.error("send error:", err.message);
    res.status(500).json({ message: "تعذّر إرسال الرسالة" });
  }
});

// 6) إعادة رفع صورة اتمسحت (المرسل بس)
router.put("/messages/:id/image", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "غير موجود" });
    const msg = await Message.findById(req.params.id);
    if (!msg || msg.type !== "image") return res.status(404).json({ message: "غير موجود" });
    if (String(msg.from) !== String(req.user._id))
      return res.status(403).json({ message: "المرسل فقط يقدر يعيد رفع الصورة" });
    if (!msg.expired) return res.json({ message: msgOut(msg.toObject(), req.user._id) });

    const dataUrl = String(req.body.dataUrl || "");
    if (!dataUrl.startsWith("data:image/")) return res.status(400).json({ message: "ملف غير صالح" });
    if (dataUrl.length > MAX_DATAURL) return res.status(413).json({ message: "الملف كبير جدًا" });

    msg.dataUrl = dataUrl;
    msg.expired = false;
    msg.size = Buffer.byteLength(msg.text || "") + dataUrl.length + 100;
    msg.restoredAt = new Date();
    msg.mediaUpdatedAt = new Date();
    await msg.save();

    cleanupConversation(msg.from, msg.to, msg._id);
    res.json({ message: msgOut(msg.toObject(), req.user._id) });
  } catch (err) {
    console.error("reupload error:", err.message);
    res.status(500).json({ message: "تعذّرت إعادة الرفع" });
  }
});

module.exports = router;

// ============================================================
//  ChatStore: بيكلّم السيرفر (MongoDB) — كل الرسايل محفوظة هناك
//  زي واتساب: لما تسجّلي دخول من أي جهاز بتلاقي محادثاتك.
//
//  شكل الرسالة:
//  { id, chatId (id الشخص التاني), sender: "me" | "them",
//    type: "text" | "image",
//    text, dataUrl, duration, time (ms), read }
//
//  الاسم/الصورة اللي بتغيّريهم لجهة اتصال بيتحفظوا على جهازك بس
//  (زي أسماء جهات الاتصال في الموبايل).
// ============================================================
const ChatStore = (() => {
  const ME = "me";
  const OTHER = "them";
  const KEY_LOCAL = "jisr.contacts";

  const token = () => {
    try { return localStorage.getItem("token"); } catch (e) { return null; }
  };

  // ---------- طلبات السيرفر ----------
  async function api(path, options) {
    const opts = options || {};
    const res = await fetch("/api/chat" + path, {
      method: opts.method || "GET",
      headers: {
        Authorization: "Bearer " + token(),
        "Content-Type": "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch (e) {}
      location.replace("/login.html");
      throw new Error("unauthorized");
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error(data.message || "request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- بيانات محلية (اسم/صورة جهة الاتصال) ----------
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY_LOCAL)) || {}; } catch (e) { return {}; }
  }
  function withLocal(person) {
    const l = readLocal()[person.id] || {};
    return { ...person, name: l.name || person.name, avatar: l.avatar || "" };
  }

  // ---------- كاش في الذاكرة ----------
  let chatsCache = [];            // قائمة المحادثات
  const peopleCache = {};         // id -> {id, name, userType}
  const msgsCache = {};           // chatId -> [messages]

  function notify() {
    window.dispatchEvent(new Event("chatstore:change"));
  }

  // ----- قائمة المحادثات -----
  async function refreshChats() {
    const d = await api("/conversations");
    chatsCache = d.chats || [];
    chatsCache.forEach((c) => (peopleCache[c.id] = { id: c.id, name: c.name, userType: c.userType }));
    notify();
  }

  function getChats() {
    return chatsCache
      .map((c) => ({ ...withLocal(c), last: c.last, unread: c.unread }))
      .sort((a, b) => (b.last ? b.last.time : 0) - (a.last ? a.last.time : 0));
  }

  // ----- شخص واحد -----
  async function loadChat(id) {
    if (!peopleCache[id]) {
      try {
        const d = await api("/users/" + encodeURIComponent(id));
        peopleCache[id] = d.user;
      } catch (e) {
        return null;
      }
    }
    return withLocal(peopleCache[id]);
  }

  function getChat(id) {
    return peopleCache[id] ? withLocal(peopleCache[id]) : null;
  }

  // ----- البحث عن مستخدمين -----
  async function searchUsers(q) {
    const d = await api("/users?q=" + encodeURIComponent(q));
    d.users.forEach((u) => (peopleCache[u.id] = u));
    return d.users;
  }

  // ----- الرسايل -----
  function getMessages(chatId) {
    return (msgsCache[chatId] || []).slice().sort((a, b) => a.time - b.time);
  }

  function merge(chatId, incoming) {
    const list = (msgsCache[chatId] = msgsCache[chatId] || []);
    let changed = false;
    incoming.forEach((m) => {
      const i = list.findIndex((x) => x.id === m.id);
      if (i < 0) {
        list.push(m);
        changed = true;
      } else if (list[i].expired !== m.expired || list[i].dataUrl !== m.dataUrl || list[i].read !== m.read) {
        list[i] = m; // الصورة اتمسحت أو اترفعت تاني
        changed = true;
      }
    });
    return changed;
  }

  // بتجيب الجديد بس + أي صورة اتغيّرت حالتها (أول مرة بتجيب آخر 200 رسالة)
  const syncTime = {}; // chatId -> وقت السيرفر وقت آخر تحديث
  async function syncMessages(chatId) {
    const list = msgsCache[chatId] || [];
    const lastId = list.length
      ? list.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[list.length - 1].id
      : "";
    let q = "";
    if (lastId) q = "?after=" + lastId + (syncTime[chatId] ? "&since=" + syncTime[chatId] : "");
    const d = await api("/messages/" + encodeURIComponent(chatId) + q);
    if (d.serverTime) syncTime[chatId] = d.serverTime;
    if (merge(chatId, d.messages) || !lastId) notify();
  }

  // بترسل رسالة للسيرفر وترجّع الرسالة المحفوظة (أو ترمي خطأ)
  async function addMessage(chatId, msg) {
    const d = await api("/messages/" + encodeURIComponent(chatId), {
      method: "POST",
      body: {
        type: msg.type || "text",
        text: msg.text || "",
        dataUrl: msg.dataUrl || "",
        duration: msg.duration || 0,
      },
    });
    merge(chatId, [d.message]);
    notify();
    return d.message;
  }

  // المرسل بيعيد رفع صورة اتمسحت من القاعدة (نفس الرسالة بترجع فيها الصورة)
  async function reuploadImage(chatId, messageId, dataUrl) {
    const d = await api("/messages/" + encodeURIComponent(messageId) + "/image", {
      method: "PUT",
      body: { dataUrl },
    });
    merge(chatId, [d.message]);
    notify();
    return d.message;
  }

  // السيرفر بيعلّم الرسايل كمقروءة لما نفتح المحادثة
  function markRead() {}

  // ----- تعديل اسم/صورة جهة الاتصال (على جهازك بس) -----
  function updateChat(chatId, changes) {
    const all = readLocal();
    const cur = all[chatId] || {};
    if ("name" in changes) cur.name = changes.name;
    if ("avatar" in changes) cur.avatar = changes.avatar;
    all[chatId] = cur;
    localStorage.setItem(KEY_LOCAL, JSON.stringify(all));
    notify();
    return getChat(chatId);
  }

  // بتقسم النص لأجزاء عادية وروابط: [{text}, {text, url}]
  function splitLinks(text) {
    const re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts = [];
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      let url = m[0];
      let trail = "";
      const t = url.match(/[.,;:!?)،؟]+$/);
      if (t) {
        trail = t[0];
        url = url.slice(0, -trail.length);
      }
      if (m.index > last) parts.push({ text: text.slice(last, m.index) });
      parts.push({ text: url, url: /^www\./i.test(url) ? "https://" + url : url });
      if (trail) parts.push({ text: trail });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
  }

  // بتتنادى لما يحصل أي تغيير
  function onChange(cb) {
    window.addEventListener("chatstore:change", cb);
  }

  // تحديث دوري (كل كام ثانية) طول ما الصفحة مفتوحة
  function poll(fn, ms) {
    let busy = false;
    async function tick() {
      if (busy || document.hidden) return;
      busy = true;
      try { await fn(); } catch (e) {} finally { busy = false; }
    }
    setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
  }

  return {
    ME, OTHER,
    getChats, getChat, loadChat, refreshChats, searchUsers,
    getMessages, syncMessages, addMessage, reuploadImage, markRead,
    updateChat, splitLinks, onChange, poll,
  };
})();

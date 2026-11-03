// ================== شاشة الشات (نص + صور + صوت + روابط) ==================
(async function () {
  const params = new URLSearchParams(location.search);
  const chatId = params.get("id");
  let chat = chatId ? await ChatStore.loadChat(chatId) : null;

  if (!chat) {
    location.replace(CONFIG.PAGES.home);
    return;
  }

  // ---------- عناصر ----------
  const $ = (id) => document.getElementById(id);
  const messagesEl = $("messages");
  const textInput = $("textInput");
  const sendBtn = $("sendBtn");
  const micBtn = $("micBtn");
  const attachBtn = $("attachBtn");
  const imageInput = $("imageInput");
  const normalBar = $("normalBar");
  const lightbox = $("lightbox");
  const lightboxImg = $("lightboxImg");

  $("backBtn").href = CONFIG.PAGES.home;
  $("headerMain").href = `${CONFIG.PAGES.contact}?id=${encodeURIComponent(chatId)}`;

  // الهيدر (الاسم والصورة) بيتحدث لما ترجعي من صفحة معلومات الاتصال
  function renderHeader() {
    const fresh = ChatStore.getChat(chatId);
    if (!fresh) return;
    chat = fresh;
    $("headerName").textContent = chat.name;
    document.title = chat.name;
    const av = $("headerAvatar");
    av.innerHTML = "";
    const box = document.createElement("div");
    box.className = "avatar";
    if (chat.avatar) {
      const img = document.createElement("img");
      img.src = chat.avatar;
      img.alt = "";
      box.appendChild(img);
    } else {
      box.textContent = chat.name.charAt(0).toUpperCase();
    }
    av.appendChild(box);
  }
  renderHeader();
  window.addEventListener("pageshow", renderHeader);

  // ---------- تشغيل/إخفاء الميزات من config.js ----------
  if (!CONFIG.FEATURES.images) attachBtn.hidden = true;
  if (!CONFIG.FEATURES.voice) micBtn.hidden = true;
  if (!CONFIG.FEATURES.text) textInput.hidden = true;

  // ---------- مساعدات ----------
  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtDay(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "اليوم";
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "أمس";
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
  }

  // بيبعت الرسالة للسيرفر. لو فشل بيطلّع تنبيه.
  async function safeSend(msg) {
    try {
      return await ChatStore.addMessage(chatId, msg);
    } catch (e) {
      alert(e && e.message && e.status ? e.message : "تعذّر إرسال الرسالة. تأكد/ي من الاتصال بالإنترنت.");
      return null;
    }
  }

  // ---------- عرض الرسايل ----------
  const rendered = new Map(); // id -> { node, key }
  let lastDay = "";

  function buildMessage(m) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (m.sender === ChatStore.ME ? "mine" : "theirs");

    if (m.type === "image" && m.expired) {
      // الصورة اتمسحت من السيرفر لتوفير المساحة — الرسالة فاضلة وتقدر تتعاد
      const box = document.createElement("div");
      box.className = "photo-expired";
      const label = document.createElement("div");
      label.textContent = "🖼️ الصورة لم تعد متاحة";
      box.appendChild(label);
      const hint = document.createElement("div");
      hint.className = "hint";
      if (m.sender === ChatStore.ME) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "reup-btn";
        btn.textContent = "إعادة رفع الصورة";
        btn.addEventListener("click", () => {
          reuploadTarget = m.id;
          reuploadInput.click();
        });
        box.appendChild(btn);
      } else {
        hint.textContent = "اطلب/ي من المرسل إعادة رفعها";
        box.appendChild(hint);
      }
      wrap.appendChild(box);
    } else if (m.type === "image") {
      const img = document.createElement("img");
      img.className = "photo";
      img.src = m.dataUrl;
      img.alt = "صورة";
      img.addEventListener("click", () => {
        lightboxImg.src = m.dataUrl;
        lightbox.hidden = false;
      });
      wrap.appendChild(img);
      if (m.text) {
        const cap = document.createElement("div");
        cap.dir = "auto";
        cap.textContent = m.text;
        wrap.appendChild(cap);
      }
    } else {
      const t = document.createElement("div");
      t.dir = "auto";
      // الروابط بتتحول لروابط قابلة للضغط
      ChatStore.splitLinks(m.text).forEach((part) => {
        if (part.url) {
          const a = document.createElement("a");
          a.className = "link";
          a.href = part.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = part.text;
          t.appendChild(a);
        } else {
          t.appendChild(document.createTextNode(part.text));
        }
      });
      wrap.appendChild(t);
    }

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = fmtClock(m.time);
    if (m.sender === ChatStore.ME) {
      const tick = document.createElement("span");
      tick.className = "tick" + (m.read ? " read" : "");
      tick.textContent = m.read ? "✓✓" : "✓";
      tick.title = m.read ? "تمت القراءة" : "تم الإرسال";
      time.appendChild(tick);
    }
    wrap.appendChild(time);
    return wrap;
  }

  function render() {
    const msgs = ChatStore.getMessages(chatId);
    let added = false;

    msgs.forEach((m) => {
      const key = m.type + ":" + (m.expired ? 1 : 0);
      const prev = rendered.get(m.id);
      if (prev) {
        if (m.sender === ChatStore.ME && prev.read !== m.read) { // اتقرأت: نحدّث العلامة
          const t = prev.node.querySelector(".tick");
          if (t) { t.className = "tick" + (m.read ? " read" : ""); t.textContent = m.read ? "✓✓" : "✓"; t.title = m.read ? "تمت القراءة" : "تم الإرسال"; }
          prev.read = m.read;
        }
        // الصورة اتمسحت أو اترفعت تاني: نبدّل الفقاعة بس
        if (prev.key !== key) {
          const node = buildMessage(m);
          prev.node.replaceWith(node);
          rendered.set(m.id, { node, key, read: m.read });
        }
        return;
      }
      added = true;

      const day = new Date(m.time).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        const sep = document.createElement("div");
        sep.className = "day-sep";
        sep.textContent = fmtDay(m.time);
        messagesEl.appendChild(sep);
      }
      const node = buildMessage(m);
      messagesEl.appendChild(node);
      rendered.set(m.id, { node, key, read: m.read });
    });

    if (added) messagesEl.scrollTop = messagesEl.scrollHeight;
    ChatStore.markRead(chatId);
  }

  // ---------- إرسال نص ----------
  function updateButtons() {
    const hasText = textInput.value.trim().length > 0;
    sendBtn.hidden = !hasText;
    micBtn.hidden = (hasText && !dictation) || !CONFIG.FEATURES.voice;
  }

  function sendText() {
    if (dictation) { dictation.cancel(); dictation = null; setListening(false); }
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = "";
    updateButtons();
    safeSend({ type: "text", text });
  }

  textInput.addEventListener("input", updateButtons);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendText();
  });
  sendBtn.addEventListener("click", sendText);

  // ---------- إرسال صورة ----------
  attachBtn.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    imageInput.value = "";
    if (!file) return;
    try {
      const dataUrl = await Media.compressImage(file);
      safeSend({ type: "image", dataUrl });
    } catch (e) {
      alert("تعذّرت قراءة هذه الصورة.");
    }
  });

  // ---------- إعادة رفع صورة اتمسحت (للمرسل) ----------
  let reuploadTarget = null;
  const reuploadInput = document.createElement("input");
  reuploadInput.type = "file";
  reuploadInput.accept = "image/*";
  reuploadInput.hidden = true;
  document.body.appendChild(reuploadInput);
  reuploadInput.addEventListener("change", async () => {
    const file = reuploadInput.files[0];
    reuploadInput.value = "";
    const id = reuploadTarget;
    reuploadTarget = null;
    if (!file || !id) return;
    try {
      const dataUrl = await Media.compressImage(file);
      await ChatStore.reuploadImage(chatId, id, dataUrl);
    } catch (e) {
      alert(e && e.status ? e.message : "تعذّرت إعادة رفع الصورة.");
    }
  });

  lightbox.addEventListener("click", () => {
    lightbox.hidden = true;
    lightboxImg.src = "";
  });

  // ---------- الميكروفون: بيحوّل كلامك لنص في خانة الكتابة (من غير ما يبعت صوت) ----------
  let dictation = null;
  let baseText = "";

  function setListening(on) {
    micBtn.classList.toggle("listening", on);
    updateButtons();
  }

  micBtn.addEventListener("click", () => {
    if (dictation) { dictation.stop(); return; }
    baseText = textInput.value.trim() ? textInput.value.trim() + " " : "";
    dictation = Media.startDictation({
      lang: CONFIG.SPEECH_LANG,
      onText: (finalText, interim) => {
        textInput.value = (baseText + finalText + interim).trim();
        updateButtons();
      },
      onEnd: () => {
        dictation = null;
        setListening(false);
      },
    });
    if (dictation) setListening(true);
  });

  // ---------- تشغيل ----------
  ChatStore.onChange(() => {
    renderHeader();
    render();
  });
  updateButtons();
  render();
  try { await ChatStore.syncMessages(chatId); } catch (e) {}
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // بنسأل السيرفر كل ثانيتين عن رسايل جديدة
  ChatStore.poll(() => ChatStore.syncMessages(chatId), 2000);
})();

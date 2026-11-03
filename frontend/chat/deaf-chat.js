// ================== صفحة محادثة الأصم (أفاتار + تسجيل إشارة) ==================
(async function () {
  const params = new URLSearchParams(location.search);
  const chatId = params.get("id");
  let chat = chatId ? await ChatStore.loadChat(chatId) : null;
  if (!chat) { location.replace(CONFIG.PAGES.home); return; }

  const $ = (id) => document.getElementById(id);
  const stage = $("stage"), messagesEl = $("messages"), caption = $("stageCaption");
  const wordStrip = $("wordStrip"), replayBtn = $("replayBtn");

  $("backBtn").href = CONFIG.PAGES.home;
  $("headerMain").href = `${CONFIG.PAGES.contact}?id=${encodeURIComponent(chatId)}`;

  // ---------- الهيدر ----------
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
      img.src = chat.avatar; img.alt = "";
      box.appendChild(img);
    } else box.textContent = chat.name.charAt(0).toUpperCase();
    av.appendChild(box);
  }
  renderHeader();
  window.addEventListener("pageshow", renderHeader);

  // ---------- الأفاتار + قاعدة الإشارات ----------
  Avatar.mount($("avatarBox"));
  const dbReady = SignDB.load().then(() => SignDB.loadAll());
  dbReady.catch(() => setCaption("الإشارات غير متاحة حالياً"));

  function setCaption(t) { caption.textContent = t; caption.hidden = !t; }

  // ---------- تكبير / تصغير الأفاتار ----------
  const ZK = "jisr.avatarZoom", ZS = SIGN_CONFIG.AVATAR.ZOOM_STEP;
  let zoom = SIGN_CONFIG.AVATAR.ZOOM_DEFAULT;
  try { const z = parseFloat(localStorage.getItem(ZK)); if (!isNaN(z)) zoom = z; } catch (e) {}
  function setZoom(z) {
    zoom = Math.max(0, Math.min(1, Math.round(z * 100) / 100));
    Avatar.setZoom(zoom);
    try { localStorage.setItem(ZK, String(zoom)); } catch (e) {}
    $("zoomIn").disabled = zoom >= 1;
    $("zoomOut").disabled = zoom <= 0;
  }
  $("zoomIn").addEventListener("click", () => setZoom(zoom + ZS));
  $("zoomOut").addEventListener("click", () => setZoom(zoom - ZS));
  $("avatarBox").addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1)); }, { passive: false });
  setZoom(zoom);

  // ---------- السرعة ----------
  let speed = SIGN_CONFIG.DEFAULT_SPEED;
  try { speed = parseFloat(localStorage.getItem("jisr.signSpeed")) || speed; } catch (e) {}
  const speedEl = $("speed");
  function renderSpeed() {
    speedEl.innerHTML = "";
    SIGN_CONFIG.SPEEDS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = s + "×";
      b.setAttribute("aria-pressed", String(s === speed));
      b.addEventListener("click", () => {
        speed = s;
        try { localStorage.setItem("jisr.signSpeed", String(s)); } catch (e) {}
        renderSpeed();
        if (Avatar.isPlaying() && lastMsg) playMessage(lastMsg.m, lastMsg.node, true);
      });
      speedEl.appendChild(b);
    });
  }
  renderSpeed();

  // ---------- حالة "الأفاتار عمل الرسالة" (محفوظة على الجهاز) ----------
  const SIGNED_KEY = "jisr.signed." + chatId;
  let signedIds = new Set();
  try { signedIds = new Set(JSON.parse(localStorage.getItem(SIGNED_KEY)) || []); } catch (e) {}
  function markSigned(id) {
    signedIds.add(id);
    try { localStorage.setItem(SIGNED_KEY, JSON.stringify([...signedIds].slice(-300))); } catch (e) {}
  }

  // ---------- عرض الرسايل ----------
  const rendered = new Map(); // id -> node
  let lastDay = "", lastMsg = null;

  const fmtClock = (ts) => new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  function fmtDay(ts) {
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString()) return "اليوم";
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "أمس";
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
  }

  function applySignedClass(node, m) {
    if (m.sender === ChatStore.ME || m.type !== "text") return;
    const done = signedIds.has(m.id);
    node.classList.toggle("signed", done);
    node.classList.toggle("unsigned", !done);
    const st = node.querySelector(".state");
    if (st) st.textContent = done ? "✓ الأفاتار أشار لها — اضغط/ي للإعادة" : "🤟 اضغط/ي ليشرحها الأفاتار";
  }

  function buildMessage(m) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (m.sender === ChatStore.ME ? "mine" : "theirs");
    if (m.type === "image" && !m.expired) {
      const img = document.createElement("img");
      img.className = "photo"; img.src = m.dataUrl; img.alt = "صورة";
      wrap.appendChild(img);
    } else if (m.type === "image") {
      wrap.textContent = "🖼️ الصورة لم تعد متاحة";
    } else {
      const t = document.createElement("div");
      t.dir = "auto";
      ChatStore.splitLinks(m.text).forEach((part) => {
        if (part.url) {
          const a = document.createElement("a");
          a.className = "link"; a.href = part.url; a.target = "_blank"; a.rel = "noopener noreferrer";
          a.textContent = part.text;
          a.addEventListener("click", (e) => e.stopPropagation());
          t.appendChild(a);
        } else t.appendChild(document.createTextNode(part.text));
      });
      wrap.appendChild(t);
    }
    if (m.sender !== ChatStore.ME && m.type === "text") {
      const st = document.createElement("span");
      st.className = "state";
      wrap.appendChild(st);
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "button");
      const go = () => playMessage(m, wrap);
      wrap.addEventListener("click", go);
      wrap.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    }
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = fmtClock(m.time);
    if (m.sender === ChatStore.ME) {
      const tick = document.createElement("span");
      tick.className = "tick" + (m.read ? " read" : "");
      tick.textContent = m.read ? "✓✓" : "✓";
      time.appendChild(tick);
    }
    wrap.appendChild(time);
    applySignedClass(wrap, m);
    return wrap;
  }

  function render() {
    let added = false;
    ChatStore.getMessages(chatId).forEach((m) => {
      if (rendered.has(m.id)) {
        const old = rendered.get(m.id);
        if (m.sender === ChatStore.ME && old.getAttribute("data-read") !== String(!!m.read)) {
          const t = old.querySelector(".tick");
          if (t) { t.className = "tick" + (m.read ? " read" : ""); t.textContent = m.read ? "✓✓" : "✓"; }
          old.setAttribute("data-read", String(!!m.read));
        }
        return;
      }
      added = true;
      const day = new Date(m.time).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        const sep = document.createElement("div");
        sep.className = "day-sep"; sep.textContent = fmtDay(m.time);
        messagesEl.appendChild(sep);
      }
      const node = buildMessage(m);
      node.setAttribute("data-read", String(!!m.read));
      messagesEl.appendChild(node);
      rendered.set(m.id, node);
    });
    if (added) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------- الأفاتار يعمل رسالة ----------
  let currentNode = null;
  function stopPlayback() {
    Avatar.stop();
    if (currentNode) currentNode.classList.remove("playing");
    currentNode = null;
  }

  function showWords(plan) {
    wordStrip.innerHTML = "";
    plan.forEach((p, i) => {
      const c = document.createElement("span");
      c.className = "word-chip" + (p.kind === "unknown" ? " unknown" : "");
      c.id = "wc" + i;
      c.textContent = p.kind === "sign" ? p.sign.word : p.said;
      wordStrip.appendChild(c);
    });
    wordStrip.hidden = !plan.length;
  }

  async function playMessage(m, node, isReplay) {
    if (mode === "rec" || mode === "review") return;
    stopPlayback();
    currentNode = node;
    node.classList.add("playing");
    if (!isReplay) { markSigned(m.id); applySignedClass(node, m); }
    lastMsg = { m, node };
    setCaption("جارٍ التجهيز…");

    let plan;
    try {
      await dbReady;
      plan = SignDB.planFromText(m.text);
      await SignDB.prepare(plan);
    } catch (e) {
      setCaption("الإشارات غير متاحة حالياً");
      node.classList.remove("playing");
      return;
    }
    showWords(plan);
    const playable = [];
    plan.forEach((p, i) => { if (p.kind === "sign") playable.push({ clip: p.sign.clip, idx: i }); });
    replayBtn.disabled = false;

    if (!playable.length) {
      setCaption("لا توجد هذه الإشارة");
      node.classList.remove("playing");
      return;
    }
    const missing = plan.filter((p) => p.kind === "unknown").length;
    setCaption(missing ? "بعض الكلمات غير متاحة" : "");
    Avatar.play(playable.map((p) => p.clip), {
      speed,
      onWord: (i) => {
        wordStrip.querySelectorAll(".active").forEach((c) => c.classList.remove("active"));
        const c = $("wc" + playable[i].idx);
        if (c) c.classList.add("active");
      },
      onDone: () => {
        wordStrip.querySelectorAll(".active").forEach((c) => c.classList.remove("active"));
        node.classList.remove("playing");
      },
    });
  }

  replayBtn.addEventListener("click", () => { if (lastMsg) playMessage(lastMsg.m, lastMsg.node, true); });

  // ---------- وضع شريط الكتابة ----------
  let mode = "idle";
  const panels = { idle: $("pIdle"), type: $("pType"), rec: $("pRec"), review: $("pReview") };
  function setMode(m) {
    mode = m;
    Object.keys(panels).forEach((k) => (panels[k].hidden = k !== m));
    stage.classList.toggle("recording", m === "rec");
  }
  function showCam(on) {
    $("camBox").hidden = !on;
    $("avatarBox").hidden = on;
    if (!on) Avatar.reset();
  }

  async function safeSend(msg) {
    try { return await ChatStore.addMessage(chatId, msg); }
    catch (e) {
      alert(e && e.message && e.status ? e.message : "تعذّر إرسال الرسالة. تأكد/ي من الاتصال بالإنترنت.");
      return null;
    }
  }

  // ----- كتابة -----
  const textInput = $("textInput");
  $("modeType").addEventListener("click", () => { setMode("type"); textInput.focus(); });
  $("typeClose").addEventListener("click", () => setMode("idle"));
  async function sendTyped() {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = "";
    await safeSend({ type: "text", text });
  }
  $("sendBtn").addEventListener("click", sendTyped);
  textInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendTyped(); });

  // ----- تسجيل إشارة -----
  function onStatus(s) {
    const st = $("camStatus"), fill = $("camBarFill");
    st.classList.toggle("signing", s.state === "signing");
    if (s.state === "signing") { st.textContent = "🤟 بنتابع إشارتك…"; fill.style.width = "0"; }
    else if (s.state === "paused") {
      st.textContent = "هيتوقف التسجيل لو فضلت إيدك بره الكاميرا…";
      fill.style.width = (100 - (s.idleLeft / SIGN_CONFIG.AUTO_STOP_MS) * 100) + "%";
    } else { st.textContent = "ارفع/ي إيدك أمام الكاميرا وابدأ/ي الإشارة"; fill.style.width = "0"; }
  }

  async function startRecording() {
    if (mode !== "idle") return;
    stopPlayback();
    wordStrip.hidden = true;
    setMode("rec");
    showCam(true);
    $("camStatus").textContent = "جارٍ تجهيز الكاميرا…";
    $("camStatus").classList.remove("signing");

    // الكاميرا بتفتح فورًا، ومبتستناش قاعدة الإشارات (فولدر json) — الإشارات بتتحمّل جنبها
    dbReady.catch(() => {});

    let result;
    try {
      result = await SignRecognizer.start({
        video: $("camVideo"), overlay: $("camOverlay"), onStatus,
        onWords: (w) => { $("recText").textContent = `تم التقاط ${w.length} إشارة`; },
        beforeMatch: () => dbReady, // نستنى الإشارات بس وقت المطابقة
      });
    } catch (e) {
      const n = e && e.name;
      let msg;
      if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") msg = "اسمح/ي للموقع باستخدام الكاميرا من إعدادات المتصفح، وأعيدي المحاولة.";
      else if (n === "InsecureContext") msg = "الكاميرا لا تعمل إلا من رابط آمن: افتحي الموقع من https أو من localhost (مش من ملف مباشر أو من داخل واتساب).";
      else if (n === "NotFoundError" || n === "DevicesNotFoundError") msg = "مفيش كاميرا متاحة على الجهاز ده.";
      else if (n === "NotReadableError" || n === "TrackStartError") msg = "الكاميرا مستخدمة في برنامج تاني. اقفليه وجرّبي تاني.";
      else if (n === "MediapipeError") msg = "تعذّر تحميل مكتبة التعرف على اليد. تأكد/ي من الإنترنت وجرّب/ي تاني.";
      else msg = "تعذّر تشغيل الكاميرا.";
      alert(msg);
      return exitRecording();
    }
    $("recText").textContent = "جارٍ التسجيل…";
    showCam(false);
    if (result.cancelled) return setMode("idle");
    if (!SignDB.readyCount()) {
      setCaption("لا توجد هذه الإشارة");
      return setMode("idle");
    }
    const words = result.words.filter((w) => w.ranked && w.ranked.length);
    if (!words.length || words.every((w) => w.ranked[0].level === "unknown")) { setCaption("لم يتم التعرف على هذه الإشارة"); return setMode("idle"); }
    openReview(words);
  }
  function exitRecording() { SignRecognizer.cancel(); showCam(false); setMode("idle"); }

  $("modeSign").addEventListener("click", startRecording);
  $("recStop").addEventListener("click", () => SignRecognizer.stop());
  $("recCancel").addEventListener("click", () => SignRecognizer.cancel());

  // ----- مراجعة المعنى قبل الإرسال -----
  let reviewWords = [], manual = false;
  const reviewText = $("reviewText");

  function assembled() {
    return reviewWords.filter((w) => w.pick >= 0).map((w) => w.ranked[w.pick].sign.word).join(" ");
  }
  function renderChips() {
    const box = $("reviewChips");
    box.innerHTML = "";
    reviewWords.forEach((w) => {
      const r = w.ranked[Math.max(0, w.pick)];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rchip " + r.level + (w.pick < 0 ? " removed" : "");
      const icon = r.level === "sure" ? "✓" : r.level === "approx" ? "≈" : "؟";
      b.innerHTML = `<span></span><small>${icon} ${Math.round(r.conf * 100)}%</small>`;
      b.firstChild.textContent = r.sign.word;
      b.addEventListener("click", () => {
        w.pick = ((w.pick + 2) % (w.ranked.length + 1)) - 1; // -1 (محذوف) → 0 → 1 → 2 → -1
        manual = false;
        renderChips();
      });
      box.appendChild(b);
    });
    if (!manual) reviewText.value = assembled();
  }
  function openReview(words) {
    reviewWords = words.map((w) => ({ ranked: w.ranked, pick: w.ranked[0].level === "unknown" ? -1 : 0 }));
    manual = false;
    setMode("review");
    renderChips();
    $("reviewHint").textContent = "اضغط/ي على أي كلمة لتغييرها أو حذفها، أو عدّل/ي النص مباشرة";
  }
  reviewText.addEventListener("input", () => { manual = true; });
  $("reviewSend").addEventListener("click", async () => {
    const text = reviewText.value.trim();
    if (!text) { $("reviewHint").textContent = "مفيش نص للإرسال — اختار/ي كلمة أو اكتب/ي المعنى"; return; }
    const sent = await safeSend({ type: "text", text });
    if (sent) setMode("idle");
  });
  $("reviewRetry").addEventListener("click", () => { setMode("idle"); startRecording(); });
  $("reviewCancel").addEventListener("click", () => setMode("idle"));

  // ---------- تشغيل ----------
  ChatStore.onChange(() => { renderHeader(); render(); });
  setMode("idle");
  render();
  try { await ChatStore.syncMessages(chatId); } catch (e) {}
  messagesEl.scrollTop = messagesEl.scrollHeight;
  ChatStore.poll(() => ChatStore.syncMessages(chatId), 2000);
  SignRecognizer.preload(); // نجهّز ميديا بايب في الخلفية
})();

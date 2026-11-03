// ================== الصفحة الرئيسية (قائمة المحادثات) ==================
(function () {
  const listEl = document.getElementById("chatList");
  const emptyEl = document.getElementById("emptyMsg");
  const searchEl = document.getElementById("searchInput");
  const filtersEl = document.getElementById("filters");

  
  let filter = "all";
  let term = "";

  const COLORS = ["#3BA5C6", "#168AAD", "#FFA63D", "#5B8DEF", "#2BA38A", "#F0627A", "#8B7CF6"];

  function colorFor(id) {
    let n = 0;
    for (const ch of String(id)) n += ch.charCodeAt(0);
    return COLORS[n % COLORS.length];
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function avatarHtml(chat) {
    if (chat.avatar) {
      return `<div class="avatar"><img src="${esc(chat.avatar)}" alt="${esc(chat.name)}"></div>`;
    }
    const letter = esc(chat.name.charAt(0).toUpperCase());
    return `<div class="avatar" style="background:${colorFor(chat.id)}">${letter}</div>`;
  }

  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    }
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "أمس";
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" });
  }

  function preview(chat) {
    const m = chat.last;
    if (!m) return "ابدأ المحادثة";
    const prefix = m.sender === ChatStore.ME ? (m.read ? "✓✓ " : "✓ ") : "";
    if (m.type === "image") return prefix + "📷 صورة";
    return prefix + m.text;
  }

  function render() {
    const chats = ChatStore.getChats().filter((c) => {
      if (filter === "unread" && c.unread === 0) return false;
      if (term) {
        const q = term.toLowerCase();
        return c.name.toLowerCase().includes(q) || preview(c).toLowerCase().includes(q);
      }
      return true;
    });

    listEl.innerHTML = "";
    emptyEl.textContent =
      !term && filter === "all"
        ? "لا توجد محادثات بعد. اضغط/ي + للبحث عن شخص وابدأ/ي المحادثة"
        : "لا توجد محادثات مطابقة";
    emptyEl.hidden = chats.length > 0;

    chats.forEach((chat) => {
      const li = document.createElement("li");
      li.className = "chat-item" + (chat.unread ? " has-unread" : "");
      li.innerHTML = `
        ${avatarHtml(chat)}
        <div class="chat-info">
          <div class="chat-row">
            <span class="chat-name" dir="auto">${esc(chat.name)}</span>
            <span class="chat-time ${chat.unread ? "unread" : ""}">${esc(fmtTime(chat.last && chat.last.time))}</span>
          </div>
          <div class="chat-row">
            <span class="chat-last" dir="auto">${esc(preview(chat))}</span>
            ${chat.unread ? `<span class="badge">${chat.unread}</span>` : ""}
          </div>
        </div>`;
      li.addEventListener("click", () => {
        window.location.href = `${CONFIG.PAGES.chat}?id=${encodeURIComponent(chat.id)}`;
      });
      listEl.appendChild(li);
    });
  }

  searchEl.addEventListener("input", (e) => {
    term = e.target.value.trim();
    render();
  });

  filtersEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    filtersEl.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    filter = chip.dataset.filter;
    render();
  });

  // ---------- محادثة جديدة: بحث عن مستخدم مسجّل ----------
  const sheet = document.getElementById("newSheet");
  const userSearch = document.getElementById("userSearch");
  const userResults = document.getElementById("userResults");
  const userEmpty = document.getElementById("userEmpty");
  let searchTimer = null;
  let searchSeq = 0;

  function openSheet(on) {
    sheet.hidden = !on;
    if (on) {
      userSearch.value = "";
      userResults.innerHTML = "";
      userEmpty.textContent = "اكتب/ي حرفين على الأقل للبحث عن شخص مسجّل في جسر التواصل";
      userEmpty.hidden = false;
      userSearch.focus();
    }
  }

  function renderUsers(users) {
    userResults.innerHTML = "";
    userEmpty.hidden = users.length > 0;
    if (!users.length) userEmpty.textContent = "لا يوجد أحد بهذا الاسم أو الإيميل";
    users.forEach((u) => {
      const li = document.createElement("li");
      li.className = "chat-item";
      li.innerHTML = `
        ${avatarHtml({ id: u.id, name: u.name })}
        <div class="chat-info">
          <div class="chat-row"><span class="chat-name" dir="auto">${esc(u.name)}</span></div>
          <div class="chat-row"><span class="chat-last">${u.userType === "deaf" ? "🤟 مستخدم لغة الإشارة" : "🗣️ متحدث"}</span></div>
        </div>`;
      li.addEventListener("click", () => {
        window.location.href = `${CONFIG.PAGES.chat}?id=${encodeURIComponent(u.id)}`;
      });
      userResults.appendChild(li);
    });
  }

  userSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = userSearch.value.trim();
    if (q.length < 2) {
      userResults.innerHTML = "";
      userEmpty.textContent = "اكتب/ي حرفين على الأقل للبحث عن شخص مسجّل في جسر التواصل";
      userEmpty.hidden = false;
      return;
    }
    searchTimer = setTimeout(async () => {
      const seq = ++searchSeq;
      try {
        const users = await ChatStore.searchUsers(q);
        if (seq === searchSeq) renderUsers(users);
      } catch (e) {
        userEmpty.textContent = "تعذّر البحث، حاول/ي مرة أخرى";
        userEmpty.hidden = false;
      }
    }, 300);
  });

  document.getElementById("newChatBtn").addEventListener("click", () => openSheet(true));
  document.getElementById("closeSheet").addEventListener("click", () => openSheet(false));
  sheet.addEventListener("click", (e) => { if (e.target === sheet) openSheet(false); });

  // ---------- تشغيل ----------
  ChatStore.onChange(render);
  window.addEventListener("pageshow", () => { render(); ChatStore.refreshChats().catch(() => {}); });
  render();
  ChatStore.refreshChats().catch(() => {});
  ChatStore.poll(() => ChatStore.refreshChats(), 3000);
})();


// ===== أيقونة الحساب =====
(function () {
  var u = {};
  try { u = JSON.parse(localStorage.getItem("user") || "{}") || {}; } catch (e) {}
  var name = u.name || "حسابي";
  function fill(el) {
    el.innerHTML = "";
    if (u.avatar) { var im = document.createElement("img"); im.src = u.avatar; im.alt = ""; el.appendChild(im); }
    else el.textContent = name.trim().charAt(0).toUpperCase();
  }
  var btn = document.getElementById("meBtn"), ov = document.getElementById("meOverlay");
  if (!btn || !ov) return;
  fill(btn); fill(document.getElementById("meAvatar"));
  document.getElementById("meName").textContent = name;
  document.getElementById("meName2").textContent = name;
  document.getElementById("meEmail").textContent = u.email || "—";
  document.getElementById("meType").textContent = u.userType === "deaf" ? "🤟 أصم / مستخدم لغة الإشارة" : "🗣️ شخص ناطق";
  function close() { ov.hidden = true; }
  btn.addEventListener("click", function () { ov.hidden = false; });
  document.getElementById("meClose").addEventListener("click", close);
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
})();

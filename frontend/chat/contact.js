// ================== صفحة معلومات الاتصال + الوسائط ==================
(async function () {
  const params = new URLSearchParams(location.search);
  const chatId = params.get("id");

  if (!chatId || !(await ChatStore.loadChat(chatId))) {
    location.href = CONFIG.PAGES.home;
    return;
  }

  const $ = (id) => document.getElementById(id);
  const chatHref = `${CONFIG.PAGES.chat}?id=${encodeURIComponent(chatId)}`;
  $("backBtn").href = chatHref;
  $("openChat").href = chatHref;

  // تشغيل/إخفاء الميزات من config.js
  if (!CONFIG.FEATURES.images) $("sendImageBtn").hidden = true;
  if (!CONFIG.FEATURES.links) $("linkForm").hidden = true;

  // بيبعت للسيرفر. لو فشل بيطلّع تنبيه ويرجّع null.
  async function safeSend(msg) {
    try {
      return await ChatStore.addMessage(chatId, msg);
    } catch (e) {
      alert(e && e.message && e.status ? e.message : "تعذّر الإرسال. تأكد/ي من الاتصال بالإنترنت.");
      return null;
    }
  }

  function fmtWhen(ts) {
    const d = new Date(ts);
    return (
      d.toLocaleDateString("ar-EG", { day: "numeric", month: "long" }) +
      " - " +
      d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
    );
  }

  // ---------- الصورة والاسم ----------
  function renderProfile() {
    const chat = ChatStore.getChat(chatId);
    if (!chat) return;
    $("nameText").textContent = chat.name;
    document.title = chat.name;

    const big = $("bigAvatar");
    big.innerHTML = "";
    if (chat.avatar) {
      const img = document.createElement("img");
      img.src = chat.avatar;
      img.alt = chat.name;
      big.appendChild(img);
    } else {
      big.textContent = chat.name.charAt(0).toUpperCase();
    }
  }

  $("changePhotoBtn").addEventListener("click", () => $("photoInput").click());
  $("photoInput").addEventListener("change", async () => {
    const input = $("photoInput");
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    try {
      const dataUrl = await Media.compressImage(file, 320, 0.85);
      ChatStore.updateChat(chatId, { avatar: dataUrl });
      renderProfile();
    } catch (e) {
      alert("تعذّر حفظ هذه الصورة. جرّب/ي صورة أخرى.");
    }
  });

  function showNameEdit(on) {
    $("nameView").hidden = on;
    $("nameForm").hidden = !on;
    if (on) {
      $("nameInput").value = ChatStore.getChat(chatId).name;
      $("nameInput").focus();
      $("nameInput").select();
    }
  }

  $("editNameBtn").addEventListener("click", () => showNameEdit(true));
  $("cancelNameBtn").addEventListener("click", () => showNameEdit(false));
  $("nameForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("nameInput").value.trim();
    if (!name) {
      alert("اكتب/ي الاسم أولًا.");
      return;
    }
    try {
      ChatStore.updateChat(chatId, { name });
    } catch (err) {
      alert("تعذّر حفظ الاسم.");
      return;
    }
    showNameEdit(false);
    renderProfile();
  });

  // ---------- الوسائط ----------
  const lightbox = $("lightbox");
  const lightboxImg = $("lightboxImg");
  lightbox.addEventListener("click", () => {
    lightbox.hidden = true;
    lightboxImg.src = "";
  });

  // التابات
  $("mediaTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    document.querySelectorAll("#mediaTabs .tab").forEach((t) => t.classList.toggle("active", t === tab));
    ["images", "links"].forEach((name) => {
      $("panel-" + name).hidden = name !== tab.dataset.tab;
    });
  });

  // الروابط بتتجمع من الرسايل النصية (الأحدث الأول)
  function collectLinks(msgs) {
    const out = [];
    msgs.forEach((m) => {
      if (m.type !== "text") return;
      ChatStore.splitLinks(m.text || "").forEach((part, i) => {
        if (part.url) out.push({ key: m.id + ":" + i, url: part.url, label: part.text, time: m.time });
      });
    });
    return out.reverse();
  }

  let lastSig = "";
  function renderMedia() {
    const msgs = ChatStore.getMessages(chatId);
    const images = msgs.filter((m) => m.type === "image").reverse();
    const links = collectLinks(msgs);

    // مفيش داعي نعيد الرسم (وده بيقطع تشغيل الصوت) لو مفيش جديد
    const sig = [images.map((m) => m.id + (m.expired ? "x" : "")), links.map((l) => l.key)]
      .map((a) => a.join(","))
      .join("|");
    if (sig === lastSig) return;
    lastSig = sig;

    $("countImages").textContent = images.length;
    $("countLinks").textContent = links.length;
    $("emptyImages").hidden = images.length > 0;
    $("emptyLinks").hidden = links.length > 0;

    const grid = $("imagesGrid");
    grid.innerHTML = "";
    images.forEach((m) => {
      if (m.expired) {
        const ph = document.createElement("div");
        ph.className = "img-expired";
        ph.textContent = "🖼️";
        ph.title = "الصورة لم تعد متاحة";
        grid.appendChild(ph);
        return;
      }
      const img = document.createElement("img");
      img.src = m.dataUrl;
      img.alt = "صورة";
      img.loading = "lazy";
      img.addEventListener("click", () => {
        lightboxImg.src = m.dataUrl;
        lightbox.hidden = false;
      });
      grid.appendChild(img);
    });

    const linksList = $("linksList");
    linksList.innerHTML = "";
    links.forEach((l) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = l.label;
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = fmtWhen(l.time);
      li.append(a, when);
      linksList.appendChild(li);
    });
  }

  // ---------- إرسال صورة من الوسائط ----------
  $("sendImageBtn").addEventListener("click", () => $("mediaImageInput").click());
  $("mediaImageInput").addEventListener("change", async () => {
    const input = $("mediaImageInput");
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    try {
      const dataUrl = await Media.compressImage(file);
      safeSend({ type: "image", dataUrl });
    } catch (e) {
      alert("تعذّرت قراءة هذه الصورة.");
    }
  });

  // ---------- إرسال لينك ----------
  $("linkForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = Media.normalizeUrl($("linkInput").value);
    if (!url) {
      alert("الرابط غير صحيح. مثال: https://example.com");
      return;
    }
    if (await safeSend({ type: "text", text: url })) $("linkInput").value = "";
  });

  // ---------- تشغيل ----------
  ChatStore.onChange(() => {
    renderProfile();
    renderMedia();
  });
  renderProfile();
  renderMedia();
  try { await ChatStore.syncMessages(chatId); } catch (e) {}
  ChatStore.poll(() => ChatStore.syncMessages(chatId), 4000);
})();

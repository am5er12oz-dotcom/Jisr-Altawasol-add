// ============================================================
//  Media: أدوات مشتركة بين شاشة الشات وصفحة جهة الاتصال
//  (تصغير الصور، التحقق من اللينكات، تحويل الكلام إلى نص)
// ============================================================
const Media = (() => {
  function fmtDur(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // بنصغّر الصورة قبل التخزين عشان localStorage مساحته صغيرة
  function compressImage(file, maxSide = 900, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("bad image"));
      };
      img.src = url;
    });
  }

  // بترجّع اللينك المظبوط (http/https بس) أو null لو مش لينك
  function normalizeUrl(input) {
    const s = String(input == null ? "" : input).trim();
    if (!s || /\s/.test(s)) return null;
    let candidate = s;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = "https://" + candidate;
    try {
      const u = new URL(candidate);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (!u.hostname.includes(".")) return null;
      return u.href;
    } catch (e) {
      return null;
    }
  }

  // تحويل الكلام إلى نص (بدون تسجيل أو إرسال صوت).
  // onText(finalText, interimText) بتتنادى كل ما المتصفح يفهم كلام جديد.
  // بترجّع { stop(), cancel() } أو null لو المتصفح مش بيدعم الميزة.
  function startDictation(opts) {
    const { lang = "ar-EG", onText, onEnd } = opts || {};
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("هذا المتصفح لا يدعم تحويل الكلام إلى نص. جرّب/ي Chrome.");
      return null;
    }

    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;

    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      if (onText) onText(finalText, interim);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        alert("تعذّر الوصول إلى الميكروفون. اسمح/ي بالإذن وافتح/ي الموقع من رابط آمن (localhost أو https).");
      }
    };
    r.onend = () => { if (onEnd) onEnd(); };

    try {
      r.start();
    } catch (e) {
      return null;
    }
    return { stop: () => r.stop(), cancel: () => r.abort() };
  }

  return { fmtDur, blobToDataUrl, compressImage, normalizeUrl, startDictation };
})();

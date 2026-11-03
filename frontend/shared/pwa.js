// ===== تثبيت جسر التواصل كتطبيق على الموبايل (PWA) =====
(function () {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

  // لو التطبيق متثبّت ومفتوح كتطبيق، مفيش داعي لزر التثبيت
  var standalone =
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (standalone) return;
  try { if (sessionStorage.getItem("pwa-dismissed")) return; } catch (e) {}

  var deferred = null;
  var bar = null;

  function build(text, withInstall) {
    if (bar) bar.remove();
    bar = document.createElement("div");
    bar.setAttribute("dir", "rtl");
    bar.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));" +
      "z-index:9999;background:#22305F;color:#fff;border-radius:16px;padding:12px 14px;" +
      "display:flex;align-items:center;gap:10px;font:700 15px Cairo,system-ui,sans-serif;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:520px;margin:0 auto";
    var span = document.createElement("span");
    span.style.flex = "1";
    span.textContent = text;
    bar.appendChild(span);
    if (withInstall) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "تثبيت";
      b.style.cssText =
        "background:#FFC533;color:#22305F;border:0;border-radius:12px;padding:8px 16px;font:800 15px Cairo,system-ui,sans-serif";
      b.onclick = function () {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.finally(function () { deferred = null; bar.remove(); });
      };
      bar.appendChild(b);
    }
    var x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", "إغلاق");
    x.textContent = "✕";
    x.style.cssText = "background:transparent;color:#fff;border:0;font-size:18px;padding:4px 8px";
    x.onclick = function () {
      bar.remove();
      try { sessionStorage.setItem("pwa-dismissed", "1"); } catch (e) {}
    };
    bar.appendChild(x);
    document.body.appendChild(bar);
  }

  // أندرويد / كروم: المتصفح بيبعت الحدث ده لما التطبيق يبقى قابل للتثبيت
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    build("ثبّت/ي جسر التواصل كتطبيق على موبايلك", true);
  });
  window.addEventListener("appinstalled", function () { if (bar) bar.remove(); });

  // آيفون (سفاري): مفيش زر تثبيت تلقائي، فبنعرض الخطوات
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios) {
    window.addEventListener("load", function () {
      build("لتثبيت التطبيق: اضغط/ي زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»", false);
    });
  }
})();

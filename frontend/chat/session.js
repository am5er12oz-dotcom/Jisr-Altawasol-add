// ===== الجلسة (مشترك بين صفحات الشات) =====
(function () {
  // بدون تسجيل دخول: ارجع لصفحة الدخول
  var token = null;
  try { token = localStorage.getItem("token"); } catch (e) {}
  if (!token) { location.replace("/login.html"); return; }

  // لو انتهت الجلسة في السيرفر نرجع لصفحة الدخول
  fetch("/api/home/me", { headers: { Authorization: "Bearer " + token } })
    .then(function (r) {
      if (r.status === 401) {
        try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch (e) {}
        location.replace("/login.html");
      }
    })
    .catch(function () {});

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
})();

// الوضع الليلي/النهاري: نفس المفتاح في كل صفحات جسر التواصل
(function () {
  var t = "light";
  try { t = localStorage.getItem("jisr_theme") || "light"; } catch (e) {}
  document.documentElement.setAttribute("data-theme", t);
  window.JisrTheme = {
    toggle: function () {
      var n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", n);
      try { localStorage.setItem("jisr_theme", n); } catch (e) {}
      return n;
    },
    isDark: function () { return document.documentElement.getAttribute("data-theme") === "dark"; }
  };
})();

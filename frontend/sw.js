const CACHE = "jisr-v11";
const FILES = [
  "/login.html", "/register.html", "/index.html", "/chats.html", "/chat.html", "/deaf-chat.html", "/contact.html",
  "/shared/theme.js", "/shared/auth.css", "/icons/icon-192.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(FILES.map((f) => c.add(f).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // سيبي أي طلب لموقع تاني (زي سكربتات جوجل) يعدّي من غير تدخل
  if (url.origin !== location.origin) return;

  // متخزنش الـ API ولا الشات الفوري
  if (e.request.method !== "GET" || url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
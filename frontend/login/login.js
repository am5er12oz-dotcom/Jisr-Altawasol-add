const API = {
  login: "/api/auth/login"
};

const mottos = [
  "موقع يجمع الأصم والناطق في محادثة واحدة.",
  "صوتك مهم، بأي لغة تتحدث.",
  "كل إشارة تبني جسراً بين عالمين."
];
const root = document.documentElement;
const m = document.getElementById("motto"); let mi = 0; m.textContent = mottos[0];
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
setInterval(() => {
  mi = (mi + 1) % mottos.length;
  if (still) { m.textContent = mottos[mi]; return; }
  m.classList.add("fade");
  setTimeout(() => { m.textContent = mottos[mi]; m.classList.remove("fade"); }, 500);
}, 4500);

const form = document.getElementById("form"),
      btn = document.getElementById("btn"),
      msg = document.getElementById("msg"),
      pw = document.getElementById("password");

function show(t, c) { msg.textContent = t; msg.className = "msg " + c; }
function mark(id, bad) { document.getElementById(id).classList.toggle("invalid", bad); return bad; }
function saveAndGo(d) {
  localStorage.setItem("token", d.token);
  localStorage.setItem("user", JSON.stringify(d.user));
  location.href = "/index.html";
}

document.getElementById("toggle").onclick = () => {
  pw.type = pw.type === "password" ? "text" : "password";
};

async function post(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let d = {};
  try { d = await r.json(); } catch (e) {}
  return { ok: r.ok, d };
}

// ===== الدخول بالبريد وكلمة المرور =====
form.addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = pw.value;

  const bad = [
    mark("f-email", !/^\S+@\S+\.\S+$/.test(email)),
    mark("f-pw", !password)
  ];
  if (bad.some(Boolean)) { show("يرجى استكمال البيانات المطلوبة.", "err"); return; }

  btn.disabled = true; btn.textContent = "جارٍ الدخول..."; show("", "");
  try {
    const { ok, d } = await post(API.login, { email, password });
    if (!ok) { show(d.message || "البريد أو كلمة المرور غير صحيحة.", "err"); return; }
    show("تم تسجيل الدخول 🎉", "ok");
    setTimeout(() => saveAndGo(d), 500);
  } catch (err) {
    show("تعذّر الاتصال حاليًا، يرجى المحاولة بعد قليل.", "err");
  } finally {
    btn.disabled = false; btn.textContent = "تسجيل الدخول";
  }
});

["email", "password"].forEach(id =>
  document.getElementById(id).addEventListener("input", e =>
    e.target.closest(".field").classList.remove("invalid")));

if ("serviceWorker" in navigator) { navigator.serviceWorker.register("/sw.js"); }
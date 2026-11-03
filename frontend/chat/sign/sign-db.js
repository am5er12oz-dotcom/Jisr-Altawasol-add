// ============================================================
//  SignDB: قاعدة الإشارات
//   - بتحمّل الفهرس وملفات الجيسون
//   - نص عربي  -> سلسلة إشارات (للأفاتار)   : planFromText
//   - إحداثيات -> أقرب كلمات (للتسجيل)       : match
// ============================================================
const SignDB = (() => {
  const C = SIGN_CONFIG;
  let signs = [];
  let phraseMap = new Map(); // عبارة منظّفة -> إشارة
  let maxWords = 1;
  let indexPromise = null;

  // ---------- تنظيف النص العربي ----------
  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------- ★ سطر الربط رقم 2: شكل بيانات الإشارة ----------
  // لو شكل ملفات الجيسون عندك مختلف، عدّلي الدالتين دول بس.

  // عنصر واحد من الفهرس
  function normalizeIndexEntry(e) {
    return {
      id: String(e.id || e.word || e.meaning || e.name),
      word: e.word || e.meaning || e.name || "",
      aliases: e.aliases || e.synonyms || [],
      file: e.file || e.url || null,
      inline: e.frames ? e : null, // لو الإحداثيات جوّه الفهرس نفسه
    };
  }

  // ملف إشارة واحد -> { fps, frames:[{l:[21 نقطة]|null, r:[...]|null}] }
  function toPts(h) {
    if (!h) return null;
    if (typeof h[0] === "number" && h.length === 63) { // مصفوفة مسطّحة x,y,z,x,y,z...
      const out = [];
      for (let i = 0; i < 63; i += 3) out.push([h[i], h[i + 1], h[i + 2]]);
      return out;
    }
    if (h.length !== 21) return null;
    return h.map((p) => (Array.isArray(p) ? [p[0], p[1], p[2] || 0] : [p.x, p.y, p.z || 0]));
  }
  // فريم واحد -> { l, r }  (بيقبل عدة أشكال شائعة، منها شكل ميديا بايب الأصلي)
  function labelOf(x) {
    if (!x) return "";
    const o = Array.isArray(x) ? x[0] : x;
    return String((o && (o.categoryName || o.label || o.displayName || o.handedness)) || (typeof o === "string" ? o : "")).toLowerCase();
  }
  function frameHands(f) {
    if (f == null) return { l: null, r: null };
    if (Array.isArray(f)) {
      if (f.length === 21 || f.length === 63) return { l: null, r: toPts(f) };           // إيد واحدة
      if (f.length && f[0] && f[0].length === 21 || (f[0] && f[0].length === 63)) return { l: toPts(f[0]), r: toPts(f[1]) }; // [إيد، إيد]
      return { l: toPts(f[0]), r: toPts(f[1]) };
    }
    const h = f.hands || f;
    // شكل ميديا بايب: landmarks = [ إيد، إيد ] + handedness/handednesses
    const lms = h.landmarks || h.multiHandLandmarks || h.multi_hand_landmarks;
    if (Array.isArray(lms) && lms.length && Array.isArray(lms[0]) && (lms[0].length === 21 || lms[0].length === 63)) {
      const hs = h.handedness || h.handednesses || h.multiHandedness || h.multi_handedness || [];
      const out = { l: null, r: null };
      lms.forEach((lm, i) => {
        const lab = labelOf(hs[i]);
        let k = lab.indexOf("left") >= 0 ? "l" : lab.indexOf("right") >= 0 ? "r" : (i === 0 ? "l" : "r");
        if (out[k]) k = k === "l" ? "r" : "l";
        out[k] = toPts(lm);
      });
      return out;
    }
    return { l: toPts(h.l || h.left || h.Left || h.leftHand || h.left_hand), r: toPts(h.r || h.right || h.Right || h.rightHand || h.right_hand) };
  }
  function normalizeSign(raw) {
    const arr = Array.isArray(raw) ? raw : raw.frames || raw.landmarks || [];
    return { fps: raw.fps || C.DEFAULT_FPS, frames: arr.map(frameHands) };
  }

  // ---------- تحميل الفهرس ----------
  function load() {
    if (indexPromise) return indexPromise;
    indexPromise = (async () => {
      let raw, usedUrl = null;
      {
        // نجرّب الـ API الأول (بيقرأ فولدر json)، ولو فشل أو فاضي نجرّب الفهرس مباشرة
        for (const u of [C.SIGNS_INDEX_URL, C.SIGNS_FALLBACK_URL].filter(Boolean)) {
          try {
            const res = await fetch(u, { cache: "no-cache" });
            if (!res.ok) continue;
            const j = await res.json();
            const l = Array.isArray(j) ? j : j.signs || [];
            if (l.length || !raw) { raw = j; usedUrl = u; }
            if (l.length) break;
          } catch (e) { /* جرّب اللي بعده */ }
        }
        if (!raw) throw new Error("signs index not found");
      }
      const list = Array.isArray(raw) ? raw : raw.signs || [];
      const base = new URL(usedUrl || C.SIGNS_INDEX_URL, location.href);
      signs = list.map(normalizeIndexEntry).filter((s) => s.word);
      signs.forEach((s) => {
        s.url = s.file ? new URL(s.file, base).href : null;
        s.clip = null;
        s.seq = null;
        s.phrases = [s.word, ...s.aliases].map(norm).filter(Boolean);
      });
      phraseMap = new Map();
      maxWords = 1;
      signs.forEach((s) =>
        s.phrases.forEach((p) => {
          if (!phraseMap.has(p)) phraseMap.set(p, s);
          maxWords = Math.max(maxWords, p.split(" ").length);
        })
      );
      return signs;
    })().catch((e) => {
      indexPromise = null;
      throw e;
    });
    return indexPromise;
  }

  async function loadClip(s) {
    if (s.clip) return s.clip;
    if (s.failed) return null;
    try {
      let raw = s.inline;
      if (!raw) {
        const r = await fetch(s.url);
        if (!r.ok) throw new Error("missing " + s.url);
        raw = await r.json();
      }
      const clip = normalizeSign(raw);
      if (clip.frames.length < 2) throw new Error("empty clip");
      s.clip = clip;
      s.seq = buildSeq(resample(clip.frames, C.MATCH.RESAMPLE));
      return clip;
    } catch (e) {
      s.failed = true;
      if (C.DEBUG) console.warn("[SignDB] تعذّر تحميل", s.word, e.message);
      return null;
    }
  }

  async function loadAll() {
    await load();
    await Promise.all(signs.map(loadClip));
    return signs.filter((s) => s.clip).length;
  }

  // ---------- مطابقة نص عربي -> إشارات ----------
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

  // تصريفات بسيطة: الـ ، و ، بال ، لل
  function variants(t) {
    const v = [t];
    if (t.length > 4 && t.startsWith("ال")) v.push(t.slice(2));
    if (t.length > 3 && t.startsWith("و")) {
      v.push(t.slice(1));
      if (t.length > 5 && t.startsWith("وال")) v.push(t.slice(3));
    }
    if (t.length > 4 && (t.startsWith("بال") || t.startsWith("لل"))) v.push(t.slice(3));
    return v;
  }

  function fuzzy(str) {
    if (str.length < 3) return null;
    let best = null, bestSim = 0;
    phraseMap.forEach((s, p) => {
      if (Math.abs(p.length - str.length) > 3) return;
      const v = sim(str, p);
      if (v > bestSim) { bestSim = v; best = s; }
    });
    return bestSim >= 0.8 ? best : null;
  }

  // بترجّع: [{kind:"sign", sign, said, approx} | {kind:"unknown", said}]
  function planFromText(text) {
    const toks = norm(text).split(" ").filter(Boolean);
    const plan = [];
    let i = 0;
    while (i < toks.length) {
      let hit = null;
      for (let len = Math.min(maxWords, toks.length - i); len >= 1 && !hit; len--) {
        const chunk = toks.slice(i, i + len);
        const joined = chunk.join(" ");
        let s = phraseMap.get(joined), approx = false;
        if (!s && len === 1) {
          for (const v of variants(joined)) { s = phraseMap.get(v); if (s) break; }
        }
        if (!s && len <= 2) { s = fuzzy(joined); approx = !!s; }
        if (s) hit = { kind: "sign", sign: s, said: chunk.join(" "), approx, len };
      }
      if (hit) { plan.push(hit); i += hit.len; }
      else { plan.push({ kind: "unknown", said: toks[i] }); i++; }
    }
    return plan;
  }

  // بتحمّل ملفات الإشارات المطلوبة وتحوّل الفاشل لـ unknown
  async function prepare(plan) {
    await Promise.all(plan.map((p) => (p.kind === "sign" ? loadClip(p.sign) : null)));
    plan.forEach((p) => { if (p.kind === "sign" && !p.sign.clip) { p.kind = "unknown"; } });
    return plan;
  }

  // ---------- المطابقة: إحداثيات -> كلمة ----------
  function resample(frames, N) {
    const n = frames.length;
    if (n === N) return frames;
    const out = [];
    for (let i = 0; i < N; i++) out.push(frames[Math.round((i * (n - 1)) / (N - 1))]);
    return out;
  }

  function handScale(p) {
    return Math.max(0.02, Math.hypot(p[9][0] - p[0][0], p[9][1] - p[0][1]));
  }

  // كل فريم -> 130 رقم (٢ إيد × (٢١ نقطة×٣ + مكان الرسغ)) + وجود الإيد
  function buildSeq(frames) {
    const keys = ["l", "r"];
    const ref = { l: null, r: null }, scl = { l: [], r: [] };
    frames.forEach((f) => keys.forEach((k) => {
      if (!f[k]) return;
      if (!ref[k]) ref[k] = f[k][0];
      scl[k].push(handScale(f[k]));
    }));
    const S = {};
    keys.forEach((k) => {
      const a = scl[k].sort((x, y) => x - y);
      S[k] = a.length ? a[a.length >> 1] : 1;
    });
    const seq = { vec: [], pres: [] };
    frames.forEach((f) => {
      const v = new Float32Array(130), pr = [0, 0];
      keys.forEach((k, si) => {
        const p = f[k];
        if (!p) return;
        pr[si] = 1;
        const w = p[0], s = handScale(p), o = si * 65;
        for (let i = 0; i < 21; i++) {
          v[o + i * 3] = (p[i][0] - w[0]) / s;
          v[o + i * 3 + 1] = (p[i][1] - w[1]) / s;
          v[o + i * 3 + 2] = ((p[i][2] - w[2]) / s) * C.MATCH.Z_WEIGHT;
        }
        v[o + 63] = ((w[0] - ref[k][0]) / S[k]) * C.MATCH.TRAJ_WEIGHT;
        v[o + 64] = ((w[1] - ref[k][1]) / S[k]) * C.MATCH.TRAJ_WEIGHT;
      });
      seq.vec.push(v);
      seq.pres.push(pr);
    });
    return seq;
  }

  function frameDist(A, i, B, j) {
    let sum = 0, cnt = 0, pen = 0;
    for (let s = 0; s < 2; s++) {
      const pa = A.pres[i][s], pb = B.pres[j][s];
      if (pa !== pb) { pen += C.MATCH.MISMATCH; continue; }
      if (!pa) continue;
      const o = s * 65, va = A.vec[i], vb = B.vec[j];
      for (let k = 0; k < 65; k++) { const d = va[o + k] - vb[o + k]; sum += d * d; }
      cnt += 65;
    }
    return (cnt ? Math.sqrt(sum / cnt) : 0) + pen;
  }

  function dtw(A, B) {
    const n = A.vec.length, m = B.vec.length, band = C.MATCH.BAND, INF = 1e9;
    let prev = new Float32Array(m + 1).fill(INF), cur = new Float32Array(m + 1);
    prev[0] = 0;
    for (let i = 1; i <= n; i++) {
      cur.fill(INF);
      const lo = Math.max(1, i - band), hi = Math.min(m, i + band);
      for (let j = lo; j <= hi; j++) {
        cur[j] = frameDist(A, i - 1, B, j - 1) + Math.min(prev[j], cur[j - 1], prev[j - 1]);
      }
      const t = prev; prev = cur; cur = t;
    }
    return (2 * prev[m]) / (n + m);
  }

  function levelOf(conf) {
    return conf >= C.MATCH.SURE ? "sure" : conf >= C.MATCH.APPROX ? "approx" : "unknown";
  }

  // ★ سطر الربط رقم 3: frames (من الكاميرا) -> أقرب 3 كلمات من القاعدة
  function match(frames, k = 3) {
    const res = resample(frames, C.MATCH.RESAMPLE);
    const seq = buildSeq(res);
    // نسخة بإيد شمال/يمين متبدّلة: عشان ميبقاش فارق لو الكاميرا مقلوبة أو القاعدة متسجّلة بالعكس
    const swapped = buildSeq(res.map((f) => ({ l: f.r, r: f.l })));
    const out = [];
    signs.forEach((s) => {
      if (!s.seq) return;
      const dist = Math.min(dtw(seq, s.seq), dtw(swapped, s.seq));
      out.push({ sign: s, dist, conf: Math.exp(-dist / C.MATCH.TAU) });
    });
    out.sort((a, b) => a.dist - b.dist);
    const top = out.slice(0, k).map((r) => ({ ...r, level: levelOf(r.conf) }));
    // لو أول كلمتين قريبين جداً من بعض، مش "مؤكد"
    if (top.length > 1 && top[0].level === "sure" && top[0].conf - top[1].conf < 0.1) top[0].level = "approx";
    if (C.DEBUG) console.log("[SignDB.match]", top.map((r) => `${r.sign.word} d=${r.dist.toFixed(3)} c=${r.conf.toFixed(2)}`));
    return top;
  }

  return { load, loadAll, prepare, planFromText, match, norm, levelOf, count: () => signs.length, readyCount: () => signs.filter((s) => s.clip).length };
})();

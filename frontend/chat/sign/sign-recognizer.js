// ============================================================
//  SignRecognizer: الكاميرا + ميديا بايب + تقسيم الإشارات لكلمات
//  بيستخدم SignDB.match عشان يحوّل الإحداثيات لمعنى.
// ============================================================
const SignRecognizer = (() => {
  const C = SIGN_CONFIG;
  let landmarker = null, loading = null, stream = null;
  let finishFn = null, cancelled = false;

  // تحميل ميديا بايب (مرة واحدة)
  function init() {
    if (landmarker) return Promise.resolve(landmarker);
    if (loading) return loading;
    loading = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(C.MEDIAPIPE.BUNDLE);
      const fileset = await FilesetResolver.forVisionTasks(C.MEDIAPIPE.WASM);
      const make = (delegate) =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: C.MEDIAPIPE.MODEL, delegate },
          runningMode: "VIDEO",
          numHands: 2,
        });
      try { landmarker = await make("GPU"); } catch (e) { landmarker = await make("CPU"); }
      return landmarker;
    })().catch((e) => { loading = null; throw e; });
    return loading;
  }

  // نتيجة ميديا بايب -> { l:[21 نقطة]|null, r:[...]|null }
  function slotsFromResult(res) {
    const out = { l: null, r: null };
    const hs = res.handedness || res.handednesses || [];
    (res.landmarks || []).forEach((lm, i) => {
      const c = hs[i] && hs[i][0];
      const label = (c && (c.categoryName || c.displayName)) || "";
      let k = label === "Left" ? "l" : "r";
      if (out[k]) k = k === "l" ? "r" : "l";
      out[k] = lm.map((p) => [p.x, p.y, p.z]);
    });
    return out;
  }

  function wristMotion(a, b) {
    let m = 0;
    ["l", "r"].forEach((k) => { if (a[k] && b[k]) m += Math.hypot(a[k][0][0] - b[k][0][0], a[k][0][1] - b[k][0][1]); });
    return m;
  }

  // لو الإشارة طويلة قوي نقسمها عند أبطأ نقطة في النص
  function splitLong(seg) {
    if (seg.length <= C.MAX_SEG_FRAMES) return [seg];
    const lo = Math.floor(seg.length * 0.3), hi = Math.floor(seg.length * 0.7);
    let best = lo, bestM = Infinity;
    for (let i = lo; i < hi; i++) {
      const m = wristMotion(seg[i], seg[i - 1]);
      if (m < bestM) { bestM = m; best = i; }
    }
    return [...splitLong(seg.slice(0, best)), ...splitLong(seg.slice(best))];
  }

  function drawOverlay(ctx, cv, video, slots) {
    if (cv.width !== video.videoWidth) { cv.width = video.videoWidth; cv.height = video.videoHeight; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    ["l", "r"].forEach((k) => {
      const p = slots[k];
      if (!p) return;
      ctx.strokeStyle = k === "l" ? "#E83E7D" : "#12997A";
      ctx.lineWidth = 4; ctx.lineCap = "round";
      C.HAND_BONES.forEach(([a, b]) => {
        ctx.beginPath(); ctx.moveTo(p[a][0] * cv.width, p[a][1] * cv.height); ctx.lineTo(p[b][0] * cv.width, p[b][1] * cv.height); ctx.stroke();
      });
    });
  }

  // opts: { video, overlay, onStatus({state, idleLeft}), onWords(words) }
  // بترجّع Promise بـ { words, cancelled } لما التسجيل يخلص
  async function start(o) {
    // 1) نفتح الكاميرا الأول (عشان إذن الكاميرا يظهر فورًا ومتتعلّقش على تحميل ميديا بايب)
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error("insecure context");
      err.name = "InsecureContext";
      throw err;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    o.video.srcObject = stream;
    o.video.muted = true;
    o.video.setAttribute("playsinline", "");
    try { await o.video.play(); } catch (e) { /* بيشتغل لما أول فريم يوصل */ }

    // 2) بعدين نجهّز ميديا بايب (بيتحمّل من النت أول مرة)
    let lm;
    try { lm = await init(); }
    catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null; o.video.srcObject = null;
      const err = new Error("mediapipe failed");
      err.name = "MediapipeError";
      throw err;
    }

    return new Promise((resolve) => {
      const ctx = o.overlay.getContext("2d");
      const words = [];
      let seg = [], lastHand = 0, signed = false, running = true, lastVT = -1;
      const startedAt = performance.now();
      cancelled = false;

      // بنحفظ الإشارات الخام الأول، والمطابقة (إحداثيات -> معنى) بتتم لما التسجيل يخلص
      const rawParts = [];
      const closeSeg = () => {
        if (seg.length >= C.MIN_FRAMES) {
          splitLong(seg).forEach((part) => rawParts.push(part));
          if (o.onWords) o.onWords(rawParts);
        }
        seg = [];
      };

      const finish = () => {
        if (!running) return;
        running = false;
        if (!cancelled) closeSeg();
        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null;
        o.video.srcObject = null;
        finishFn = null;
        if (cancelled) return resolve({ words: [], cancelled: true });
        Promise.resolve(o.beforeMatch ? o.beforeMatch() : null)
          .catch(() => {})
          .then(() => {
            // ★ سطر الربط: إحداثيات الكاميرا -> المعنى من فولدر json
            rawParts.forEach((part) => words.push({ ranked: SignDB.match(part), frames: part.length }));
            resolve({ words, cancelled: false });
          });
      };
      finishFn = finish;

      const schedule = () => {
        if (!running) return;
        if (o.video.requestVideoFrameCallback) o.video.requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };

      function tick() {
        if (!running) return;
        const now = performance.now();
        if (o.video.readyState >= 2 && o.video.currentTime !== lastVT) {
          lastVT = o.video.currentTime;
          const slots = slotsFromResult(lm.detectForVideo(o.video, now));
          drawOverlay(ctx, o.overlay, o.video, slots);
          if (slots.l || slots.r) {
            seg.push(slots);
            lastHand = now;
            if (seg.length >= C.MIN_FRAMES) signed = true;
            if (o.onStatus) o.onStatus({ state: "signing" });
          } else {
            if (seg.length && now - lastHand > C.WORD_GAP_MS) closeSeg();
            if (o.onStatus) {
              o.onStatus(signed
                ? { state: "paused", idleLeft: Math.max(0, C.AUTO_STOP_MS - (now - lastHand)) }
                : { state: "waiting" });
            }
          }
        }
        if (signed && lastHand && now - lastHand > C.AUTO_STOP_MS) return finish();
        if (!signed && now - startedAt > C.MAX_IDLE_MS) return finish();
        schedule();
      }
      schedule();
    });
  }

  return {
    start,
    stop: () => { if (finishFn) finishFn(); },
    cancel: () => { cancelled = true; if (finishFn) finishFn(); },
    preload: () => init().catch(() => {}),
  };
})();

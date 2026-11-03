// ============================================================
//  Avatar: الأفاتار ثلاثي الأبعاد (Three.js) اللي بيعمل الإشارة
//   - بيحمّل /avatar/avatar.glb
//   - بيحرّك الدراع (IK) والإيد والصوابع من نقط ميديا بايب
//   - تكبير/تصغير: setZoom(0..1)   (0 = كامل ، 1 = النص الفوقاني)
//   - لو التحميل فشل بيرسم هيكل إيدين مؤقت بدل ما الصفحة تقف
// ============================================================
const Avatar = (() => {
  const C = SIGN_CONFIG, A = C.AVATAR;
  let box = null, canvas = null, ctx = null, W = 1, H = 1;
  let token = 0, raf = 0, playing = false;
  let target = null;            // آخر فريم مطلوب ({l, r})
  let rig = null;               // بيتعمل لما الموديل يتحمّل
  let T = null;                 // مكتبة three
  let renderer, scene, camera;
  let zoom = A.ZOOM_DEFAULT, zoomCur = A.ZOOM_DEFAULT;

  function mount(el) {
    box = el;
    canvas = document.createElement("canvas");
    canvas.className = "avatar-canvas";
    box.appendChild(canvas);
    ctx = canvas.getContext("2d");
    new ResizeObserver(resize).observe(box);
    resize();
    initThree().catch((e) => {
      console.warn("[Avatar] تعذّر تحميل الأفاتار ثلاثي الأبعاد:", e);
      const m = document.createElement("div");
      m.className = "avatar-msg";
      m.textContent = "تعذّر تحميل الأفاتار — بنعرض رسم مؤقت";
      box.appendChild(m);
    });
  }

  function resize() {
    if (!box) return;
    const r = box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (renderer) {
      renderer.setPixelRatio(Math.min(dpr, 2));
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
    if (!rig) drawPlaceholder(target);
  }

  // ---------- المكان اللي الأفاتار بيتحرّك منه ----------
  // frame = { l: [21 نقطة [x,y,z]] | null, r: [...] | null }
  function applyFrameToModel(frame) {
    target = frame;
    if (!rig) drawPlaceholder(frame);
  }

  // ======================= Three.js =======================
  async function initThree() {
    T = await import("three");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    renderer.domElement.className = "avatar-canvas";
    renderer.domElement.style.display = "none";
    box.appendChild(renderer.domElement);

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(30, W / H, 0.05, 20);
    scene.add(new T.HemisphereLight(0xffffff, 0x8a93a8, 1.35));
    const key = new T.DirectionalLight(0xffffff, 1.6);
    key.position.set(1.2, 2.5, 3);
    scene.add(key);

    const gltf = await new GLTFLoader().loadAsync(A.URL);
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    scene.add(model);
    model.updateMatrixWorld(true);
    rig = buildRig(model);

    canvas.style.display = "none";
    renderer.domElement.style.display = "block";
    box.querySelectorAll(".avatar-msg").forEach((n) => n.remove());
    loop();
  }

  const baseName = (n) => n.replace(/_\d+$/, "");

  function buildRig(model) {
    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[baseName(o.name)] = o; });
    const need = (n) => { if (!bones[n]) throw new Error("عظمة مفقودة في الأفاتار: " + n); return bones[n]; };

    const FINGERS = [["Thumb", 1], ["Index", 5], ["Middle", 9], ["Ring", 13], ["Pinky", 17]];
    const rest = new Map(), prev = new Map();
    const keep = (b) => { rest.set(b, b.quaternion.clone()); prev.set(b, b.quaternion.clone()); };
    const v = (x, y, z) => new T.Vector3(x, y, z);

    const sides = {};
    ["Left", "Right"].forEach((side) => {
      const sgn = side === "Left" ? 1 : -1;
      const arm = need(side + "Arm"), fore = need(side + "ForeArm"), hand = need(side + "Hand");
      [arm, fore, hand].forEach(keep);
      const fingers = FINGERS.map(([nm, start]) => {
        const chain = [1, 2, 3, 4].map((j) => need(`${side}Hand${nm}${j}`));
        chain.slice(0, 3).forEach(keep);
        return { chain, start };
      });
      const p = (b) => b.getWorldPosition(v(0, 0, 0));
      const S = p(arm), E = p(fore), Wr = p(hand);
      const idx = need(`${side}HandIndex1`), mid = need(`${side}HandMiddle1`), pin = need(`${side}HandPinky1`);
      const dirRest = mid.position.clone();
      const sideRest = pin.position.clone().sub(idx.position);
      sides[side] = {
        arm, fore, hand, fingers, S, L1: S.distanceTo(E), L2: E.distanceTo(Wr),
        pole: v(0.5 * sgn, -1, -0.35),
        restBasis: basis(dirRest, sideRest),
      };
    });

    // ضبط تلقائي: نقيس مكان الكتف والدقن في الأفاتار ونطابقهم مع الدقن والكتف في صورة الكاميرا
    let fit = null;
    if (A.AUTO_FIT && bones.Head) {
      const shoulderY = sides.Left.S.y;
      const chinY = bones.Head.getWorldPosition(v(0, 0, 0)).y - (A.CHIN_BELOW_HEAD || 0.04);
      const span = A.IMG_SHOULDER_Y - A.IMG_CHIN_Y;
      if (span > 0.02 && chinY > shoulderY) {
        const ky = (chinY - shoulderY) / span;
        fit = { oy: shoulderY, ay: A.IMG_SHOULDER_Y, ky, kx: ky * (A.SCALE[0] / A.SCALE[1]), ox: (sides.Left.S.x + sides.Right.S.x) / 2 };
      }
    }
    return { sides, rest, prev, fit };
  }

  function basis(a, b) {
    const e1 = a.clone().normalize();
    const e3 = new T.Vector3().crossVectors(a, b).normalize();
    const e2 = new T.Vector3().crossVectors(e3, e1);
    return new T.Matrix4().makeBasis(e1, e2, e3);
  }

  // نخلّي عظمة "bone" تشاور ناحية "dir" (في العالم) من غير ما نلفّها حوالين نفسها
  const _p0 = () => new T.Vector3();
  function aim(bone, child, dir) {
    const p0 = bone.getWorldPosition(_p0()), p1 = child.getWorldPosition(_p0());
    const cur = p1.sub(p0);
    if (cur.lengthSq() < 1e-12 || dir.lengthSq() < 1e-12) return;
    const q = new T.Quaternion().setFromUnitVectors(cur.normalize(), dir.clone().normalize());
    const wq = bone.getWorldQuaternion(new T.Quaternion()).premultiply(q);
    const pq = bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
    bone.quaternion.copy(pq.multiply(wq));
    bone.updateMatrixWorld(true);
  }

  const lmVec = (a, b) => new T.Vector3((b[0] - a[0]) * A.SCALE[0], -(b[1] - a[1]) * A.SCALE[1], -(b[2] - a[2]) * A.SCALE[2]);

  function solveSide(s, L) {
    // 1) مكان الرسغ المطلوب
    const F = rig && rig.fit;
    const wrist = F
      ? new T.Vector3(
          F.ox + (L[0][0] - A.ANCHOR[0]) * F.kx,
          F.oy - (L[0][1] - F.ay) * F.ky,
          A.ORIGIN[2] + A.FRONT_Z
        )
      : new T.Vector3(
          A.ORIGIN[0] + (L[0][0] - A.ANCHOR[0]) * A.SCALE[0],
          A.ORIGIN[1] - (L[0][1] - A.ANCHOR[1]) * A.SCALE[1],
          A.ORIGIN[2] + A.FRONT_Z
        );
    // 2) IK للدراع (كتف-كوع-رسغ)
    const dv = wrist.clone().sub(s.S);
    let d = dv.length();
    const maxD = (s.L1 + s.L2) * 0.995, minD = Math.abs(s.L1 - s.L2) + 0.03;
    d = Math.min(maxD, Math.max(minD, d));
    dv.setLength(d);
    const dir = dv.clone().normalize();
    const a = (s.L1 * s.L1 - s.L2 * s.L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, s.L1 * s.L1 - a * a));
    const pv = s.pole.clone().sub(dir.clone().multiplyScalar(s.pole.dot(dir))).normalize();
    const elbow = s.S.clone().add(dir.clone().multiplyScalar(a)).add(pv.multiplyScalar(h));
    aim(s.arm, s.fore, elbow.clone().sub(s.S));
    const reach = s.S.clone().add(dv);
    aim(s.fore, s.hand, reach.sub(s.fore.getWorldPosition(_p0())));

    // 3) اتجاه الكف
    const dirT = lmVec(L[0], L[9]), sideT = lmVec(L[5], L[17]);
    if (new T.Vector3().crossVectors(dirT, sideT).lengthSq() > 1e-10) {
      const R = basis(dirT, sideT).multiply(s.restBasis.clone().transpose());
      const q = new T.Quaternion().setFromRotationMatrix(R);
      const pq = s.hand.parent.getWorldQuaternion(new T.Quaternion()).invert();
      s.hand.quaternion.copy(pq.multiply(q));
      s.hand.updateMatrixWorld(true);
    }

    // 4) الصوابع
    s.fingers.forEach((f) => {
      for (let j = 1; j <= 3; j++) {
        const bone = f.chain[j - 1], child = f.chain[j];
        aim(bone, child, lmVec(L[f.start + j - 1], L[f.start + j]));
      }
    });
  }

  function updateRig() {
    const { sides, rest, prev } = rig;
    rest.forEach((q, b) => b.quaternion.copy(q));       // نرجع للوضع الأصلي
    sides.Left.arm.parent.updateMatrixWorld(true);
    const slotL = A.SLOT_L_TO === "Left" ? "Left" : "Right";
    const slotR = slotL === "Left" ? "Right" : "Left";
    if (target && target.l) solveSide(sides[slotL], target.l);
    if (target && target.r) solveSide(sides[slotR], target.r);
    // نعومة
    prev.forEach((pq, b) => {
      pq.slerp(b.quaternion, A.SMOOTH);
      b.quaternion.copy(pq);
    });
    sides.Left.arm.updateMatrixWorld(true);
    sides.Right.arm.updateMatrixWorld(true);
  }

  // ---------- الكاميرا والتكبير ----------
  function updateCamera() {
    zoomCur += (zoom - zoomCur) * 0.18;
    const Hv = 2.15 + (1.05 - 2.15) * zoomCur;    // الارتفاع اللي بيظهر بالمتر
    const cy = 0.95 + (1.36 - 0.95) * zoomCur;    // مركز الكادر
    const dist = Hv / 2 / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, cy, dist);
    camera.lookAt(0, cy, 0);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!rig || box.offsetWidth < 2 || box.offsetHeight < 2) return;
    updateRig();
    updateCamera();
    renderer.render(scene, camera);
  }

  function setZoom(z) { zoom = Math.max(0, Math.min(1, z)); }
  function getZoom() { return zoom; }

  // ======================= رسم مؤقت (لو الأفاتار مش متحمّل) =======================
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#22305F"; }
  function drawPlaceholder(frame) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const ink = css("--ink"), sun = css("--sun");
    ctx.fillStyle = css("--sky-soft");
    ctx.beginPath(); ctx.ellipse(W / 2, H * 1.02, W * 0.34, H * 0.4, 0, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = sun; ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, H * 0.24, Math.min(W, H) * 0.14, 0, 7); ctx.fill(); ctx.stroke();
    if (!frame) return;
    ["l", "r"].forEach((k) => {
      const p = frame[k];
      if (!p) return;
      ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineCap = "round";
      C.HAND_BONES.forEach(([a, b]) => {
        ctx.beginPath(); ctx.moveTo(p[a][0] * W, p[a][1] * H); ctx.lineTo(p[b][0] * W, p[b][1] * H); ctx.stroke();
      });
    });
  }

  function reset() { applyFrameToModel(null); }

  // ======================= التشغيل =======================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function lerpHand(a, b, f) {
    return a.map((p, i) => [p[0] + (b[i][0] - p[0]) * f, p[1] + (b[i][1] - p[1]) * f, p[2] + (b[i][2] - p[2]) * f]);
  }
  function frameAt(frames, pos) {
    const i = Math.floor(pos), f = pos - i, a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
    const out = {};
    ["l", "r"].forEach((k) => { out[k] = a[k] && b[k] ? lerpHand(a[k], b[k], f) : f < 0.5 ? a[k] : b[k]; });
    return out;
  }

  // clips: [{ frames, fps }]   opts: { speed, onWord(i), onDone() }
  async function play(clips, opts) {
    const o = opts || {}, speed = o.speed || 1, my = ++token;
    playing = true;
    for (let ci = 0; ci < clips.length; ci++) {
      if (my !== token) return;
      const clip = clips[ci], n = clip.frames.length, fps = clip.fps || C.DEFAULT_FPS;
      if (o.onWord) o.onWord(ci);
      const dur = Math.max(1, ((n - 1) / fps) * 1000 / speed);
      await new Promise((res) => {
        const t0 = performance.now();
        const step = (now) => {
          if (my !== token) return res();
          const t = Math.min(1, (now - t0) / dur);
          applyFrameToModel(frameAt(clip.frames, t * (n - 1)));
          if (t < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
      await sleep(250 / speed);
    }
    if (my === token) { playing = false; if (o.onDone) o.onDone(); }
  }

  function stop() { token++; playing = false; }

  return { mount, play, stop, reset, setZoom, getZoom, isPlaying: () => playing };
})();

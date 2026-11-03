// API الإشارات (قراءة فقط) — بتغذّي الأفاتار وتسجيل الإشارة
//   GET /api/signs         -> قائمة الكلمات (خفيفة، من غير الإحداثيات)
//   GET /api/signs/:id     -> إحداثيات إشارة واحدة
//   GET /api/signs/status  -> تشخيص: إيه الملفات اللي اتقرت وكام إشارة طلعت منها
//
// المصدر الوحيد: فولدر  frontend/json  (مفيش أي اتصال بقاعدة البيانات).
const fs = require("fs");
const path = require("path");
const router = require("express").Router();

const JSON_DIR = path.join(__dirname, "..", "..", "frontend", "json");

// أسماء الحقول المقبولة (ضيفي اسم حقلك هنا لو مختلف)
const WORD_KEYS = ["word", "meaning", "name", "label", "text", "arabic", "title", "sign", "gloss", "كلمة", "المعنى"];
const ALIAS_KEYS = ["aliases", "synonyms", "variants", "similar"];
const FRAME_KEYS = ["frames", "landmarks", "coordinates", "data", "sequence", "keypoints", "points", "frame_data", "إحداثيات"];

const pick = (d, keys) => {
  for (const k of keys) if (d[k] != null && d[k] !== "") return d[k];
  return undefined;
};

function asList(v) {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(/[,،|]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// أول حقل فيه مصفوفة طويلة (لو اسم الحقل مش من المعروفين)
function guessFrames(d) {
  const known = pick(d, FRAME_KEYS);
  if (Array.isArray(known)) return known;
  for (const k of Object.keys(d)) if (Array.isArray(d[k]) && d[k].length >= 2 && typeof d[k][0] === "object") return d[k];
  return null;
}
function guessWord(d) {
  const w = pick(d, WORD_KEYS);
  if (typeof w === "string" && w.trim()) return w.trim();
  return "";
}

function parseText(text) {
  text = text.replace(/^﻿/, "");
  try { return JSON.parse(text); } catch (e) {}
  const out = [];
  text.split(/\r?\n/).forEach((line) => {
    line = line.trim().replace(/,$/, "");
    if (!line) return;
    try { out.push(JSON.parse(line)); } catch (e) {}
  });
  return out.length ? out : null;
}

// فك ملف واحد لقائمة مستندات
function docsOf(raw) {
  if (Array.isArray(raw)) {
    const first = raw[0];
    const isDocList = first && typeof first === "object" && !Array.isArray(first) && (guessWord(first) || guessFrames(first));
    return isDocList ? raw : [{ frames: raw }];        // مصفوفة إشارات | مصفوفة فريمات لإشارة واحدة
  }
  if (raw && typeof raw === "object") {
    for (const k of ["signs", "items", "data", "docs", "results"]) {
      if (Array.isArray(raw[k]) && raw[k].length && typeof raw[k][0] === "object" && !Array.isArray(raw[k][0])) return raw[k];
    }
    return [raw];
  }
  return [];
}

let cache = { stamp: null, items: [], report: [] };

function loadFolder() {
  let files = [];
  try {
    files = fs.readdirSync(JSON_DIR).filter((f) => /\.(json|jsonl|ndjson)$/i.test(f) && f.toLowerCase() !== "index.json");
  } catch (e) { return { items: [], report: [{ file: "(الفولدر)", note: "فولدر frontend/json مش موجود" }] }; }

  const stamp = files.map((f) => {
    try { const s = fs.statSync(path.join(JSON_DIR, f)); return f + ":" + s.mtimeMs + ":" + s.size; } catch (e) { return f; }
  }).join("|");
  if (stamp === cache.stamp) return cache;

  const items = [], report = [];
  files.forEach((f) => {
    let raw;
    try { raw = parseText(fs.readFileSync(path.join(JSON_DIR, f), "utf8")); }
    catch (e) { report.push({ file: f, note: "تعذّرت قراءة الملف: " + e.message }); return; }
    if (!raw) { report.push({ file: f, note: "الملف مش JSON صالح" }); return; }
    const docs = docsOf(raw);
    let ok = 0;
    docs.forEach((d, i) => {
      if (!d || typeof d !== "object") return;
      const frames = guessFrames(d);
      if (!frames) return;
      const word = guessWord(d) || path.basename(f).replace(/\.[^.]+$/, "").trim();
      if (!word) return;
      items.push({ id: encodeURIComponent(f) + "~" + i, word, aliases: asList(pick(d, ALIAS_KEYS)), fps: d.fps || d.frameRate, frames });
      ok++;
    });
    report.push({ file: f, signs: ok, note: ok ? "تمام" : "ملقيتش إحداثيات (frames) في الملف — الحقول الموجودة: " + (docs[0] && typeof docs[0] === "object" ? Object.keys(docs[0]).slice(0, 12).join(", ") : "؟") });
  });
  cache = { stamp, items, report };
  return cache;
}

router.get("/", (req, res) => {
  res.set("Cache-Control", "no-cache");
  const { items } = loadFolder();
  res.json({ signs: items.map((s) => ({ id: s.id, word: s.word, aliases: s.aliases, file: "/api/signs/" + s.id })) });
});

router.get("/status", (req, res) => {
  res.set("Cache-Control", "no-cache");
  const { items, report } = loadFolder();
  res.json({ folder: "frontend/json", totalSigns: items.length, words: items.slice(0, 200).map((s) => s.word), files: report });
});

router.get("/:id", (req, res) => {
  res.set("Cache-Control", "no-cache");
  const s = loadFolder().items.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ message: "غير موجود" });
  res.json({ fps: s.fps, frames: s.frames });
});

module.exports = router;

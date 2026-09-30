"use strict";

// ---------- Storage ----------
// Shape: { goal, lang, ai: { key, model }, days: { "YYYY-MM-DD": { goal, items: [{id, name, kcal, meal, time}] } } }
const STORAGE_KEY = "calorie-tracker-v1";
const DEFAULT_GOAL = 2000;

function defaultLang() {
  const l = (navigator.language || "").toLowerCase();
  return l.startsWith("sk") || l.startsWith("cs") ? "sk" : "en";
}

function loadState() {
  let data = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) {
    console.warn("Could not read saved data", e);
  }
  if (!data || typeof data.goal !== "number" || !data.days) data = { goal: DEFAULT_GOAL, days: {} };
  if (!data.lang) data.lang = defaultLang();
  if (!data.ai) data.ai = { key: "", model: "claude-opus-5-5" };
  return data;
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast(t("saveFailed"));
  }
}

// ---------- Language ----------
function t(key, vars) {
  let s = (I18N[state.lang] && I18N[state.lang][key]) ?? I18N.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function applyLang() {
  document.documentElement.lang = state.lang;
  document.title = t("appTitle");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  document.querySelectorAll(".lang-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === state.lang));
  document.querySelectorAll("#hist-range option").forEach((o) => { o.textContent = t("days", { n: o.value }); });
  renderAIStatus();
}

document.querySelectorAll(".lang-btn").forEach((b) => b.addEventListener("click", () => {
  state.lang = b.dataset.lang;
  save();
  applyLang();
  renderDay();
  if ($("#view-history").classList.contains("active")) renderHistory();
}));

// ---------- Dates ----------
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
function todayKey() { return dateKey(new Date()); }
function prettyDate(key) {
  const today = todayKey();
  if (key === today) return t("today");
  if (key === addDays(today, -1)) return t("yesterday");
  return parseKey(key).toLocaleDateString(state.lang === "sk" ? "sk-SK" : "en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

let currentDate = todayKey();

// ---------- Day helpers ----------
function getDay(key) { return state.days[key]; }
function ensureDay(key) {
  if (!state.days[key]) state.days[key] = { goal: state.goal, items: [] };
  return state.days[key];
}
function dayGoal(key) {
  const d = getDay(key);
  return d ? d.goal : state.goal;
}
function dayTotal(key) {
  const d = getDay(key);
  return d ? d.items.reduce((s, i) => s + i.kcal, 0) : 0;
}

function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 17) return "snack";
  if (h < 22) return "dinner";
  return "snack";
}

// ---------- UI helpers ----------
const $ = (sel) => document.querySelector(sel);
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmt(n) { return Math.round(n).toLocaleString(state.lang === "sk" ? "sk-SK" : "en-GB"); }

let toastTimer;
function toast(msg, ms = 2500) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
function showView(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "history") renderHistory();
  if (name === "settings") {
    $("#goal-input").value = state.goal;
    $("#ai-key").value = state.ai.key;
    $("#ai-model").value = state.ai.model;
  }
  window.scrollTo(0, 0);
}

// ---------- Day view ----------
const MEALS = ["breakfast", "lunch", "dinner", "snack"];

function renderDay() {
  $("#date-input").value = currentDate;
  $("#next-day").disabled = currentDate >= todayKey();

  const goal = dayGoal(currentDate);
  const eaten = dayTotal(currentDate);
  const left = goal - eaten;

  $("#stat-goal").textContent = fmt(goal);
  $("#stat-eaten").textContent = fmt(eaten);
  $("#stat-left").textContent = fmt(left);
  $("#stat-left").classList.toggle("over", left < 0);

  // progress ring
  const circ = 2 * Math.PI * 52;
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const ring = $("#ring-fg");
  ring.style.strokeDasharray = circ;
  ring.style.strokeDashoffset = circ * (1 - pct);
  ring.classList.toggle("over", left < 0);
  $("#ring-main").textContent = fmt(Math.abs(left));
  $("#ring-sub").textContent = left < 0 ? t("kcalOver") : t("kcalLeft");

  // log
  const day = getDay(currentDate);
  const items = day ? day.items : [];
  const log = $("#log");
  if (!items.length) {
    log.innerHTML = `<p class="empty">${esc(t("nothingLogged"))}</p>`;
  } else {
    log.innerHTML = MEALS.map((meal) => {
      const list = items.filter((i) => i.meal === meal);
      if (!list.length) return "";
      const sub = list.reduce((s, i) => s + i.kcal, 0);
      return `<div class="meal">
        <div class="meal-head"><span>${esc(t(meal))}</span><span>${fmt(sub)} kcal</span></div>
        <ul>${list.map((i) => `
          <li>
            <span class="item-name">${esc(i.name)}</span>
            <span class="item-kcal">${fmt(i.kcal)}</span>
            <button class="del" data-id="${i.id}" aria-label="${esc(t("remove"))}">✕</button>
          </li>`).join("")}
        </ul>
      </div>`;
    }).join("");
  }

  renderRecommendations();
}

$("#log").addEventListener("click", (e) => {
  const btn = e.target.closest(".del");
  if (!btn) return;
  const day = getDay(currentDate);
  if (!day) return;
  day.items = day.items.filter((i) => i.id !== btn.dataset.id);
  if (!day.items.length) delete state.days[currentDate];
  save();
  renderDay();
});

function addItem(name, kcal, meal, { quiet = false } = {}) {
  const day = ensureDay(currentDate);
  day.items.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim(),
    kcal: Math.max(0, Math.round(kcal)),
    meal,
    time: new Date().toISOString(),
  });
  save();
  if (!quiet) {
    renderDay();
    toast(t("added", { name, kcal: fmt(kcal) }));
  }
}

// Date navigation
$("#date-input").max = todayKey();
$("#date-input").addEventListener("change", (e) => {
  if (e.target.value) { currentDate = e.target.value > todayKey() ? todayKey() : e.target.value; renderDay(); }
});
$("#prev-day").addEventListener("click", () => { currentDate = addDays(currentDate, -1); renderDay(); });
$("#next-day").addEventListener("click", () => {
  if (currentDate < todayKey()) { currentDate = addDays(currentDate, 1); renderDay(); }
});
$("#go-today").addEventListener("click", () => { currentDate = todayKey(); renderDay(); });

// ---------- Describe what you ate ----------
$("#d-meal").value = guessMeal();
$("#f-meal").value = guessMeal();

function renderAIStatus() {
  $("#ai-status").textContent = state.ai.key ? t("aiOn") : "";
}

// Foods you've typed yourself before, so they can be found again.
function customFoods() {
  const seen = new Map();
  Object.values(state.days).forEach((d) => d.items.forEach((i) => {
    const k = i.name.toLowerCase();
    if (!seen.has(k)) seen.set(k, { name: i.name, kcal: i.kcal });
  }));
  return [...seen.values()];
}

let reviewRows = [];

async function runDescribe() {
  const text = $("#describe").value.trim();
  if (!text) { $("#describe").focus(); return; }
  const btn = $("#describe-btn");
  btn.disabled = true;
  btn.textContent = t("working");
  try {
    const result = await estimateFoods(text, {
      customFoods: customFoods(),
      lang: state.lang,
      apiKey: state.ai.key,
      model: state.ai.model,
      onAIError: (e) => toast(t("aiFailed", { msg: e.message }), 5000),
    });
    if (!result.rows.length) { toast(t("nothingRecognized")); return; }
    if (result.rows.some((r) => r.offError)) toast(t("offFailed"), 4000);
    if (result.meal) $("#d-meal").value = result.meal;
    reviewRows = result.rows;
    renderReview();
  } catch (e) {
    console.error(e);
    toast(t("offFailed"), 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = t("describeBtn");
  }
}

$("#describe-btn").addEventListener("click", runDescribe);
$("#describe").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runDescribe();
});

const SOURCE_LABEL = { ai: "srcAI", db: "srcDB", off: "srcOFF", mine: "srcMine", none: "srcNone" };

function renderReview() {
  const box = $("#review");
  if (!reviewRows.length) { box.hidden = true; return; }
  box.hidden = false;
  $("#review-list").innerHTML = reviewRows.map((r, i) => `
    <div class="review-row ${r.kcal == null ? "missing" : ""}" data-i="${i}">
      <div class="review-main">
        <input class="r-name" value="${esc(r.name)}" aria-label="${esc(t("foodName"))}">
        <button class="del r-del" aria-label="${esc(t("remove"))}">✕</button>
      </div>
      <div class="review-nums">
        ${r.per100 != null ? `<label class="num"><input class="r-grams" type="number" min="0" step="1" value="${r.grams ?? ""}"> ${t("grams")}</label>` : ""}
        <label class="num"><input class="r-kcal" type="number" min="0" step="1" value="${r.kcal ?? ""}" placeholder="?"> kcal</label>
        <span class="src src-${r.source}">${esc(r.kcal == null ? t("notFound") : t(SOURCE_LABEL[r.source]))}</span>
      </div>
      ${r.options && r.options.length > 1 ? `
        <select class="r-opt" aria-label="${esc(t("otherMatches"))}">
          ${r.options.map((p, j) => `<option value="${j}">${esc(p.name)}: ${p.per100} kcal/100 g</option>`).join("")}
        </select>` : ""}
    </div>`).join("");
  updateReviewTotal();
}

function updateReviewTotal() {
  const total = reviewRows.reduce((s, r) => s + (r.kcal || 0), 0);
  $("#review-total").textContent = `${fmt(total)} kcal`;
}

$("#review-list").addEventListener("input", (e) => {
  const rowEl = e.target.closest(".review-row");
  if (!rowEl) return;
  const r = reviewRows[Number(rowEl.dataset.i)];
  if (e.target.classList.contains("r-name")) r.name = e.target.value;
  if (e.target.classList.contains("r-grams")) {
    r.grams = Number(e.target.value) || 0;
    r.kcal = Math.round((r.per100 * r.grams) / 100);
    rowEl.querySelector(".r-kcal").value = r.kcal;
    if (r.baseName) {
      r.name = `${r.baseName} (${r.grams} g)`;
      rowEl.querySelector(".r-name").value = r.name;
    }
  }
  if (e.target.classList.contains("r-kcal")) {
    r.kcal = e.target.value === "" ? null : Number(e.target.value);
    rowEl.classList.toggle("missing", r.kcal == null);
  }
  updateReviewTotal();
});

$("#review-list").addEventListener("change", (e) => {
  if (!e.target.classList.contains("r-opt")) return;
  const i = Number(e.target.closest(".review-row").dataset.i);
  const old = reviewRows[i];
  const p = old.options[Number(e.target.value)];
  const g = old.fixedGrams || p.defaultGrams * (old.count || 1);
  reviewRows[i] = { ...old, name: p.name, per100: p.per100, grams: Math.round(g), kcal: Math.round((p.per100 * g) / 100) };
  renderReview();
  $(`.review-row[data-i="${i}"] .r-opt`).value = e.target.value;
});

$("#review-list").addEventListener("click", (e) => {
  if (!e.target.closest(".r-del")) return;
  reviewRows.splice(Number(e.target.closest(".review-row").dataset.i), 1);
  renderReview();
});

$("#review-cancel").addEventListener("click", () => { reviewRows = []; renderReview(); });

$("#review-add").addEventListener("click", () => {
  const missing = reviewRows.findIndex((r) => r.kcal == null || !r.name.trim());
  if (missing >= 0) {
    const el = $(`.review-row[data-i="${missing}"] .r-kcal`);
    if (el) el.focus();
    return;
  }
  const meal = $("#d-meal").value;
  const total = reviewRows.reduce((s, r) => s + r.kcal, 0);
  reviewRows.forEach((r) => addItem(r.name, r.kcal, meal, { quiet: true }));
  toast(t("addedN", { n: reviewRows.length, kcal: fmt(total) }));
  reviewRows = [];
  $("#describe").value = "";
  renderReview();
  renderDay();
});

// ---------- Barcode scanning ----------
let scanStream = null;
let scanning = false;

$("#scan-btn").addEventListener("click", async () => {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices) {
    toast(t("scanUnsupported"), 5000);
    $("#describe").focus();
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = $("#scan-video");
    video.srcObject = scanStream;
    await video.play();
    $("#scan-modal").hidden = false;
    scanning = true;
    while (scanning) {
      const codes = await detector.detect(video).catch(() => []);
      if (codes.length) {
        stopScan();
        $("#describe").value = codes[0].rawValue;
        runDescribe();
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (e) {
    stopScan();
    toast(t("cameraFailed"));
  }
});

function stopScan() {
  scanning = false;
  if (scanStream) scanStream.getTracks().forEach((tr) => tr.stop());
  scanStream = null;
  $("#scan-modal").hidden = true;
}
$("#scan-close").addEventListener("click", stopScan);

// ---------- Manual add + search ----------
$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#f-name").value.trim();
  const kcal = parseFloat($("#f-kcal").value);
  if (!name || isNaN(kcal)) return;
  addItem(name, kcal, $("#f-meal").value);
  $("#f-name").value = "";
  $("#f-kcal").value = "";
  $("#food-search").value = "";
  hideResults();
});

function searchFoods(q) {
  q = norm(q);
  if (!q) return [];
  const lang = state.lang;
  const mine = customFoods().map((f) => ({ name: f.name, portion: t("yourEntry"), kcal: f.kcal, hay: norm(f.name) }));
  const builtIn = FOODS.map((f) => ({
    name: f.name[lang], portion: f.portion[lang], kcal: f.kcal,
    hay: norm(`${f.name.sk} ${f.name.en} ${f.aliases}`),
  }));
  const seen = new Set(builtIn.map((f) => norm(f.name)));
  return [...mine.filter((f) => !seen.has(norm(f.name))), ...builtIn]
    .filter((f) => f.hay.includes(q))
    .sort((a, b) => a.hay.indexOf(q) - b.hay.indexOf(q))
    .slice(0, 8);
}

let lastResults = [];
function hideResults() { $("#search-results").innerHTML = ""; }
$("#food-search").addEventListener("input", (e) => {
  lastResults = searchFoods(e.target.value);
  $("#search-results").innerHTML = lastResults.map((f, i) => `
    <li data-i="${i}">
      <span><strong>${esc(f.name)}</strong> <small>${esc(f.portion)}</small></span>
      <span class="kcal-pill">${fmt(f.kcal)} kcal</span>
    </li>`).join("");
});
$("#search-results").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const f = lastResults[Number(li.dataset.i)];
  $("#f-name").value = f.portion === t("yourEntry") ? f.name : `${f.name} (${f.portion})`;
  $("#f-kcal").value = f.kcal;
  $("#food-search").value = "";
  hideResults();
  $("#f-kcal").focus();
});

// ---------- Recommendations ----------
let recoSeed = 0;

function shuffled(arr, seed) {
  // deterministic shuffle so the list doesn't jump around on every render
  const a = arr.slice();
  let s = seed * 9301 + 49297;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function recommend(remaining, mealHint) {
  // Singles and pairs of recipes that fit into the remaining calories,
  // ranked by how well they fill the gap (with a small bonus for matching the time of day).
  const options = [];
  RECIPES.forEach((r) => options.push({ parts: [r], kcal: r.kcal }));
  if (remaining > 500) {
    for (let i = 0; i < RECIPES.length; i++) {
      for (let j = i + 1; j < RECIPES.length; j++) {
        const a = RECIPES[i], b = RECIPES[j];
        // pair a main dish with a snack-type item to keep suggestions sensible
        if (!a.meals.includes("snack") && !b.meals.includes("snack")) continue;
        options.push({ parts: [a, b], kcal: a.kcal + b.kcal });
      }
    }
  }
  const fitting = options.filter((o) => o.kcal <= remaining + 50);
  const scored = shuffled(fitting, recoSeed).map((o) => {
    let score = Math.abs(remaining - o.kcal) / Math.max(remaining, 1);
    if (o.parts.some((p) => p.meals.includes(mealHint))) score -= 0.15;
    if (o.parts.length > 1) score += 0.1; // prefer one simple dish
    return { ...o, score };
  });
  scored.sort((a, b) => a.score - b.score);

  // pick top results without repeating the same recipe
  const picked = [];
  const used = new Set();
  for (const o of scored) {
    if (o.parts.some((p) => used.has(p))) continue;
    picked.push(o);
    o.parts.forEach((p) => used.add(p));
    if (picked.length === 4) break;
  }
  return picked;
}

function renderRecommendations() {
  const lang = state.lang;
  const remaining = dayGoal(currentDate) - dayTotal(currentDate);
  const intro = $("#reco-intro");
  const list = $("#reco-list");
  const isToday = currentDate === todayKey();
  const mealHint = isToday ? guessMeal() : "snack";

  if (remaining < 80) {
    intro.textContent = remaining < 0 ? t("recoOver", { n: fmt(-remaining) }) : t("recoDone");
    list.innerHTML = "";
    $("#reco-shuffle").hidden = true;
    return;
  }
  $("#reco-shuffle").hidden = false;
  intro.textContent = t("recoLeft", { n: fmt(remaining) });

  const picks = recommend(remaining, mealHint);
  list.innerHTML = picks.map((o, idx) => `
    <div class="reco">
      <div class="reco-top">
        <div>
          <div class="reco-name">${o.parts.map((p) => esc(p[lang].name)).join(" <span class='plus'>+</span> ")}</div>
          <div class="reco-meta">⏱ ${o.parts.reduce((s, p) => s + p.mins, 0)} ${t("min")} · ${fmt(o.kcal)} kcal</div>
        </div>
        <button class="small-btn primary eat" data-idx="${idx}">${esc(t("ateThis"))}</button>
      </div>
      <details>
        <summary>${esc(t("howTo"))}</summary>
        ${o.parts.map((p) => `
          <div class="recipe">
            ${o.parts.length > 1 ? `<h4>${esc(p[lang].name)} <small>(${p.kcal} kcal)</small></h4>` : ""}
            <ul>${p[lang].ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
            <p>${esc(p[lang].steps)}</p>
          </div>`).join("")}
      </details>
    </div>`).join("");

  list.querySelectorAll(".eat").forEach((btn) => {
    btn.addEventListener("click", () => {
      const o = picks[Number(btn.dataset.idx)];
      o.parts.forEach((p) => addItem(p[lang].name, p.kcal, isToday ? guessMeal() : "snack"));
    });
  });
}

$("#reco-shuffle").addEventListener("click", () => { recoSeed++; renderRecommendations(); });

// ---------- History ----------
function renderHistory() {
  const range = Number($("#hist-range").value);
  const today = todayKey();
  const keys = [];
  for (let i = range - 1; i >= 0; i--) keys.push(addDays(today, -i));

  const maxVal = Math.max(...keys.map((k) => Math.max(dayTotal(k), dayGoal(k))), 1);
  const chart = $("#chart");
  chart.style.setProperty("--bars", keys.length);
  chart.innerHTML = keys.map((k) => {
    const total = dayTotal(k);
    const goal = dayGoal(k);
    const h = (total / maxVal) * 100;
    const g = (goal / maxVal) * 100;
    const d = parseKey(k);
    const cls = !total ? "none" : total > goal ? "over" : "ok";
    const showLabel = range <= 14 || d.getDate() === 1 || d.getDay() === 1;
    return `<button class="bar-col" data-key="${k}" title="${esc(prettyDate(k))}: ${fmt(total)} / ${fmt(goal)} kcal">
      <div class="bar-area">
        <div class="goal-line" style="bottom:${g}%"></div>
        <div class="bar ${cls}" style="height:${h}%"></div>
      </div>
      <div class="bar-label">${showLabel ? d.getDate() : ""}</div>
    </button>`;
  }).join("");

  const logged = keys.filter((k) => dayTotal(k) > 0);
  const avg = logged.length ? logged.reduce((s, k) => s + dayTotal(k), 0) / logged.length : 0;
  const onTarget = logged.filter((k) => dayTotal(k) <= dayGoal(k)).length;
  $("#hist-stats").innerHTML = `
    <div><span class="label">${esc(t("daysLogged"))}</span><span class="value">${logged.length}/${range}</span></div>
    <div><span class="label">${esc(t("average"))}</span><span class="value">${fmt(avg)} kcal</span></div>
    <div><span class="label">${esc(t("withinGoal"))}</span><span class="value">${onTarget}/${logged.length}</span></div>`;

  // full list of all days ever logged
  const all = Object.keys(state.days).filter((k) => state.days[k].items.length).sort().reverse();
  $("#hist-list").innerHTML = all.length ? `<ul class="hist-days">${all.map((k) => {
    const total = dayTotal(k), goal = dayGoal(k), diff = total - goal;
    return `<li data-key="${k}">
      <span>${esc(prettyDate(k))}</span>
      <span class="hist-num">${fmt(total)} / ${fmt(goal)}
        <span class="diff ${diff > 0 ? "over" : "ok"}">${diff > 0 ? "+" : ""}${fmt(diff)}</span>
      </span>
    </li>`;
  }).join("")}</ul>` : `<p class="empty">${esc(t("noDays"))}</p>`;
}

$("#hist-range").addEventListener("change", renderHistory);
function openDay(key) { currentDate = key; showView("today"); renderDay(); }
$("#chart").addEventListener("click", (e) => { const b = e.target.closest(".bar-col"); if (b) openDay(b.dataset.key); });
$("#hist-list").addEventListener("click", (e) => { const li = e.target.closest("li[data-key]"); if (li) openDay(li.dataset.key); });

// ---------- Settings ----------
$("#goal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const g = Math.round(Number($("#goal-input").value));
  if (!g || g < 800) return;
  state.goal = g;
  // update today's (and any future) stored goal, keep past days as they were
  Object.keys(state.days).forEach((k) => { if (k >= todayKey()) state.days[k].goal = g; });
  save();
  renderDay();
  toast(t("goalSet", { n: fmt(g) }));
});

$("#calc-form").addEventListener("submit", (e) => {
  e.preventDefault();
  // Mifflin–St Jeor equation
  const sex = $("#c-sex").value;
  const age = Number($("#c-age").value);
  const w = Number($("#c-weight").value);
  const h = Number($("#c-height").value);
  const bmr = 10 * w + 6.25 * h - 5 * age + (sex === "m" ? 5 : -161);
  const tdee = bmr * Number($("#c-act").value);
  const goal = Math.max(1200, Math.round((tdee + Number($("#c-aim").value)) / 10) * 10);
  const res = $("#calc-result");
  res.innerHTML = `${t("calcResult", { tdee: fmt(tdee), goal: fmt(goal) })}
    <button type="button" class="small-btn primary" id="use-goal">${esc(t("useGoal", { n: fmt(goal) }))}</button>`;
  $("#use-goal").addEventListener("click", () => {
    $("#goal-input").value = goal;
    $("#goal-form").requestSubmit();
  });
});

$("#ai-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.ai.key = $("#ai-key").value.trim();
  state.ai.model = $("#ai-model").value;
  save();
  renderAIStatus();
  toast(state.ai.key ? t("keySaved") : t("aiOff"));
});
$("#ai-remove").addEventListener("click", () => {
  state.ai.key = "";
  $("#ai-key").value = "";
  save();
  renderAIStatus();
  toast(t("keyRemoved"));
});

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#export-btn").addEventListener("click", () => {
  // The API key stays out of backups.
  const { ai, ...rest } = state;
  download(`calorie-tracker-backup-${todayKey()}.json`, JSON.stringify(rest, null, 2), "application/json");
});

$("#export-csv").addEventListener("click", () => {
  const rows = [["date", "eaten_kcal", "goal_kcal", "items"]];
  Object.keys(state.days).sort().forEach((k) => {
    const d = state.days[k];
    rows.push([k, dayTotal(k), d.goal, `"${d.items.map((i) => i.name.replace(/"/g, "'")).join("; ")}"`]);
  });
  download(`calorie-tracker-${todayKey()}.csv`, "﻿" + rows.map((r) => r.join(",")).join("\n"), "text/csv");
});

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data.goal !== "number" || typeof data.days !== "object") throw new Error("bad format");
    if (!confirm(t("importConfirm"))) return;
    state.goal = data.goal;
    Object.assign(state.days, data.days);
    save();
    renderDay();
    toast(t("imported"));
  } catch (err) {
    toast(t("badBackup"));
  } finally {
    e.target.value = "";
  }
});

// ---------- Start ----------
applyLang();
renderDay();

// If the app stays open past midnight, jump to the new day.
let lastToday = todayKey();
setInterval(() => {
  const now = todayKey();
  if (now !== lastToday) {
    if (currentDate === lastToday) currentDate = now;
    lastToday = now;
    $("#date-input").max = now;
    renderDay();
  }
}, 60 * 1000);

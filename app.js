"use strict";

// ---------- Storage ----------
// Shape: { goal: number, days: { "YYYY-MM-DD": { goal: number, items: [{id, name, kcal, meal, time}] } } }
const STORAGE_KEY = "calorie-tracker-v1";
const DEFAULT_GOAL = 2000;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.goal === "number" && data.days) return data;
    }
  } catch (e) {
    console.warn("Could not read saved data", e);
  }
  return { goal: DEFAULT_GOAL, days: {} };
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast("Could not save – browser storage is unavailable");
  }
}

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
  const t = todayKey();
  if (key === t) return "Today";
  if (key === addDays(t, -1)) return "Yesterday";
  return parseKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
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
function fmt(n) { return Math.round(n).toLocaleString(); }

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
function showView(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "history") renderHistory();
  if (name === "settings") $("#goal-input").value = state.goal;
  window.scrollTo(0, 0);
}

// ---------- Day view ----------
const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

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
  $("#ring-sub").textContent = left < 0 ? "kcal over" : "kcal left";

  // log
  const day = getDay(currentDate);
  const items = day ? day.items : [];
  const log = $("#log");
  if (!items.length) {
    log.innerHTML = `<p class="empty">Nothing logged for ${prettyDate(currentDate).toLowerCase()} yet.</p>`;
  } else {
    log.innerHTML = MEALS.map((meal) => {
      const list = items.filter((i) => i.meal === meal);
      if (!list.length) return "";
      const sub = list.reduce((s, i) => s + i.kcal, 0);
      return `<div class="meal">
        <div class="meal-head"><span>${MEAL_LABEL[meal]}</span><span>${fmt(sub)} kcal</span></div>
        <ul>${list.map((i) => `
          <li>
            <span class="item-name">${esc(i.name)}</span>
            <span class="item-kcal">${fmt(i.kcal)}</span>
            <button class="del" data-id="${i.id}" aria-label="Remove ${esc(i.name)}">✕</button>
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

function addItem(name, kcal, meal) {
  const day = ensureDay(currentDate);
  day.items.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim(),
    kcal: Math.max(0, Math.round(kcal)),
    meal,
    time: new Date().toISOString(),
  });
  save();
  renderDay();
  toast(`Added ${name} (${fmt(kcal)} kcal)`);
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

// Add form
$("#f-meal").value = guessMeal();
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

// Food search
function customFoods() {
  // Foods you've typed yourself before become searchable too.
  const seen = new Map();
  Object.values(state.days).forEach((d) => d.items.forEach((i) => {
    const k = i.name.toLowerCase();
    if (!seen.has(k)) seen.set(k, { name: i.name, portion: "your entry", kcal: i.kcal });
  }));
  FOODS.forEach((f) => seen.delete(f.name.toLowerCase()));
  return [...seen.values()];
}

function searchFoods(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const all = [...customFoods(), ...FOODS];
  return all
    .filter((f) => f.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
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
  $("#f-name").value = f.portion === "your entry" ? f.name : `${f.name} (${f.portion})`;
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
        const aSnack = a.meals.includes("snack"), bSnack = b.meals.includes("snack");
        if (!aSnack && !bSnack) continue;
        options.push({ parts: [a, b], kcal: a.kcal + b.kcal });
      }
    }
  }
  const fitting = options.filter((o) => o.kcal <= remaining + 50);
  const scored = shuffled(fitting, recoSeed).map((o) => {
    let score = Math.abs(remaining - o.kcal) / Math.max(remaining, 1);
    if (o.parts.some((p) => p.meals.includes(mealHint))) score -= 0.15;
    if (o.parts.length > 1) score += 0.1; // prefer one simple dish
    score += Math.random() * 0.0001;
    return { ...o, score };
  });
  scored.sort((a, b) => a.score - b.score);

  // pick top results without repeating the same recipe too often
  const picked = [];
  const used = new Set();
  for (const o of scored) {
    if (o.parts.some((p) => used.has(p.name))) continue;
    picked.push(o);
    o.parts.forEach((p) => used.add(p.name));
    if (picked.length === 4) break;
  }
  return picked;
}

function renderRecommendations() {
  const goal = dayGoal(currentDate);
  const remaining = goal - dayTotal(currentDate);
  const intro = $("#reco-intro");
  const list = $("#reco-list");
  const isToday = currentDate === todayKey();
  const mealHint = isToday ? guessMeal() : "snack";

  if (remaining < 80) {
    intro.textContent = remaining < 0
      ? `You're ${fmt(-remaining)} kcal over your goal for this day. No extra food needed – drink water and have a light day tomorrow.`
      : "You've hit your goal for this day. Nice work! 🎉";
    list.innerHTML = "";
    $("#reco-shuffle").hidden = true;
    return;
  }
  $("#reco-shuffle").hidden = false;
  intro.textContent = `You still have ${fmt(remaining)} kcal left. Here are some very easy things you can make:`;

  const picks = recommend(remaining, mealHint);
  list.innerHTML = picks.map((o, idx) => `
    <div class="reco">
      <div class="reco-top">
        <div>
          <div class="reco-name">${o.parts.map((p) => esc(p.name)).join(" <span class='plus'>+</span> ")}</div>
          <div class="reco-meta">⏱ ${o.parts.reduce((s, p) => s + p.mins, 0)} min · ${fmt(o.kcal)} kcal</div>
        </div>
        <button class="small-btn primary eat" data-idx="${idx}">I ate this</button>
      </div>
      <details>
        <summary>How to make it</summary>
        ${o.parts.map((p) => `
          <div class="recipe">
            ${o.parts.length > 1 ? `<h4>${esc(p.name)} <small>(${p.kcal} kcal)</small></h4>` : ""}
            <ul>${p.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
            <p>${esc(p.steps)}</p>
          </div>`).join("")}
      </details>
    </div>`).join("");

  list.querySelectorAll(".eat").forEach((btn) => {
    btn.addEventListener("click", () => {
      const o = picks[Number(btn.dataset.idx)];
      o.parts.forEach((p) => addItem(p.name, p.kcal, isToday ? guessMeal() : "snack"));
    });
  });
}

$("#reco-shuffle").addEventListener("click", () => { recoSeed++; renderRecommendations(); });

// ---------- History ----------
function renderHistory() {
  const range = Number($("#hist-range").value);
  const t = todayKey();
  const keys = [];
  for (let i = range - 1; i >= 0; i--) keys.push(addDays(t, -i));

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
    return `<button class="bar-col" data-key="${k}" title="${prettyDate(k)}: ${fmt(total)} / ${fmt(goal)} kcal">
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
    <div><span class="label">Days logged</span><span class="value">${logged.length}/${range}</span></div>
    <div><span class="label">Average</span><span class="value">${fmt(avg)} kcal</span></div>
    <div><span class="label">Within goal</span><span class="value">${onTarget}/${logged.length}</span></div>`;

  // full list of all days ever logged
  const all = Object.keys(state.days).filter((k) => state.days[k].items.length).sort().reverse();
  $("#hist-list").innerHTML = all.length ? `<ul class="hist-days">${all.map((k) => {
    const total = dayTotal(k), goal = dayGoal(k), diff = total - goal;
    return `<li data-key="${k}">
      <span>${prettyDate(k)}</span>
      <span class="hist-num">${fmt(total)} / ${fmt(goal)}
        <span class="diff ${diff > 0 ? "over" : "ok"}">${diff > 0 ? "+" : ""}${fmt(diff)}</span>
      </span>
    </li>`;
  }).join("")}</ul>` : `<p class="empty">No days logged yet. Start by adding food on the Day tab.</p>`;
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
  toast(`Daily goal set to ${fmt(g)} kcal`);
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
  res.innerHTML = `Estimated need: <strong>${fmt(tdee)} kcal/day</strong>. Suggested goal: <strong>${fmt(goal)} kcal/day</strong>.
    <button type="button" class="small-btn primary" id="use-goal">Use ${fmt(goal)}</button>`;
  $("#use-goal").addEventListener("click", () => {
    $("#goal-input").value = goal;
    $("#goal-form").requestSubmit();
  });
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
  download(`calorie-tracker-backup-${todayKey()}.json`, JSON.stringify(state, null, 2), "application/json");
});

$("#export-csv").addEventListener("click", () => {
  const rows = [["date", "eaten_kcal", "goal_kcal", "items"]];
  Object.keys(state.days).sort().forEach((k) => {
    const d = state.days[k];
    rows.push([k, dayTotal(k), d.goal, `"${d.items.map((i) => i.name.replace(/"/g, "'")).join("; ")}"`]);
  });
  download(`calorie-tracker-${todayKey()}.csv`, rows.map((r) => r.join(",")).join("\n"), "text/csv");
});

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data.goal !== "number" || typeof data.days !== "object") throw new Error("bad format");
    if (!confirm("Import this backup? Days in the backup will be merged into your current data (backup wins on the same day).")) return;
    state.goal = data.goal;
    Object.assign(state.days, data.days);
    save();
    renderDay();
    toast("Backup imported");
  } catch (err) {
    toast("That file doesn't look like a Calorie Tracker backup");
  } finally {
    e.target.value = "";
  }
});

// ---------- Start ----------
renderDay();

// If the app stays open past midnight, jump to the new day.
let lastToday = todayKey();
setInterval(() => {
  const t = todayKey();
  if (t !== lastToday) {
    if (currentDate === lastToday) currentDate = t;
    lastToday = t;
    $("#date-input").max = t;
    renderDay();
  }
}, 60 * 1000);

"use strict";
// Turns a free-text food description (Slovak or English) into items with calories,
// protein, carbs, fat and water.
// Order of sources: your earlier entries -> built-in food list -> Open Food Facts
// product database (branded products from Lidl, Billa, …). With a Claude API key
// the whole description is sent to Claude instead.

// Lowercase and strip diacritics so "rožky" matches "rozky".
function norm(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// ---------- Parsing ----------
// "and"-type separators always split; "with"-type ones only when the whole phrase isn't
// a known food ("káva s mliekom" stays one item, "rožok s maslom" becomes two).
const SEPARATORS = /\s*(?:,(?!\d)|;|\n|\+|\s(?:a|and|plus|aj|a aj|a tiez|a este)\s)\s*/i;
const WITH_SEPARATOR = /\s+(?:s|so|with)\s+/i;

const MEAL_WORDS = [
  ["breakfast", /\b(ranajk\w*|breakfast)\b/],
  ["lunch", /\b(obed\w*|lunch)\b/],
  ["dinner", /\b(vecer\w*|dinner|supper)\b/],
  ["snack", /\b(desiat\w*|olovrant\w*|snack\w*)\b/],
];

// Words that carry no food information. Normalized (no diacritics).
const FILLER = new Set(("i had ate have eaten eat some of the my today for as a an at in with s so " +
  "jedol jedla zjedol zjedla som sme mal mala dal dala si sa dnes trochu na ku k " +
  "z zo from lidl lidla lidli lidlu billa billy bille kaufland kauflandu tesco tesca coop jednota jednoty dm obchodu " +
  "ranajky ranajok obed obeda vecera veceru snack breakfast lunch dinner supper desiata desiatu olovrant " +
  // containers and portion words: the amount is handled separately
  "pohar pohare poharov poharik glass glasses salka salky salku cup cups hrncek hrnceky hrnceka mug " +
  "flasa flasu flase flasky flasa bottle bottles plechovka plechovku plechovky can cans kelimok kelimky " +
  "porcia porciu porcie portion portions tanier taniere plate plates miska misku bowl bowls " +
  "balenie balenia pack packs packet kusok kusky slice slices").split(" "));

const WORD_NUMBERS = {
  jeden: 1, jedna: 1, jedno: 1, jednu: 1, one: 1, a: 1, an: 1,
  dva: 2, dve: 2, two: 2, tri: 3, three: 3, styri: 4, four: 4, pat: 5, five: 5,
  pol: 0.5, polovica: 0.5, polovicu: 0.5, half: 0.5,
};

const UNIT_GRAMS = { kg: 1000, dkg: 10, g: 1, gr: 1, gram: 1, grams: 1, gramov: 1, gramy: 1, ml: 1, dl: 100, l: 1000, liter: 1000, litra: 1000, litre: 1000 };

function parseDescription(text) {
  const n = norm(text);
  let meal = null;
  for (const [m, re] of MEAL_WORDS) if (re.test(n)) { meal = m; break; }

  const parts = [];
  for (const chunk of String(text).split(SEPARATORS).map((p) => p.trim()).filter(Boolean)) {
    if (WITH_SEPARATOR.test(chunk)) {
      const words = norm(chunk).split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w) && !/^\d/.test(w) && !(w in WORD_NUMBERS));
      const m = matchLocal(words);
      if (!(m && m.all && m.cover === 1 && m.score > 0.95)) {
        parts.push(...chunk.split(WITH_SEPARATOR).map((p) => p.trim()).filter(Boolean));
        continue;
      }
    }
    parts.push(chunk);
  }

  const out = [];
  for (const raw of parts) {
    let s = norm(raw);
    let grams = null;
    let count = null;

    // "pol litra", "half a litre", "liter"
    const hm = s.match(/\b(pol|half(?: a)?)\s+(litra|liter|litre|l|kila|kg)\b/);
    if (hm) { grams = 500; s = s.replace(hm[0], " "); }
    else {
      const lm = s.match(/(?:^|\s)(?:jeden\s+|one\s+|a\s+)?(liter|litra|litre|kilo|kila)\b/);
      if (lm) { grams = 1000; s = s.replace(lm[0], " "); }
    }

    const gm = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|dkg|gramov|gramy|grams|gram|gr|g|ml|dl|litra|liter|litre|l)\b/);
    if (gm && grams == null) {
      grams = parseFloat(gm[1].replace(",", ".")) * UNIT_GRAMS[gm[2]];
      s = s.replace(gm[0], " ");
    }
    const cm = s.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:x|ks|kusy|kusov|kus|pcs|pieces|piece)?(?=\s|$)/);
    if (cm) {
      count = parseFloat(cm[1].replace(",", "."));
      s = s.replace(cm[0], " ");
    }

    const words = s.split(/[^a-z0-9%]+/).filter(Boolean);
    const kept = [];
    for (const w of words) {
      if (count == null && w in WORD_NUMBERS && kept.length === 0) { count = WORD_NUMBERS[w]; continue; }
      if (FILLER.has(w)) continue;
      kept.push(w);
    }
    if (!kept.length || kept.join("").length < 2) continue;

    // Display name: the original text minus amounts and store/meal phrases.
    let display = raw
      .replace(/\s*\b(?:z|zo|from)\s+(?:lidl\w*|bill\w*|kaufland\w*|tesc\w*|coop|jednot\w*|dm)\b/gi, "")
      .replace(/\s*\b(?:na|for)\s+(?:ra[nň]ajky|obed|ve[cč]eru|breakfast|lunch|dinner|desiatu|olovrant)\b/gi, "")
      .replace(/\d+(?:[.,]\d+)?\s*(?:kg|dkg|gramov|gramy|grams|gram|gr|g|ml|dl|litra|liter|litre|l)\b/i, "")
      .replace(/^\s*(?:\d+(?:[.,]\d+)?\s*(?:x|ks|kusy|kusov|kus|pcs)?|jeden|jedna|jedno|jednu|one|an?|dva|dve|two|tri|three|štyri|four|päť|five|pol|half)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!display) display = kept.join(" ");
    display = display.charAt(0).toUpperCase() + display.slice(1);

    out.push({ raw, display, query: kept.join(" "), tokens: kept, grams, count });
  }
  return { meal, parts: out };
}

// ---------- Local food list ----------
function stem(w) { return w.length >= 5 ? w.slice(0, w.length - 2) : w; }

// Nutrition values for `grams` of something with per-100 g values n100.
function scaleNutrition(n100, grams) {
  const k = grams / 100;
  return {
    kcal: Math.round(n100.kcal * k),
    p: Math.round(n100.p * k * 10) / 10,
    c: Math.round(n100.c * k * 10) / 10,
    f: Math.round(n100.f * k * 10) / 10,
  };
}
// Recalculate a review row after its grams changed.
function applyGrams(row) {
  if (!row.n100 || !(row.grams >= 0)) return row;
  Object.assign(row, scaleNutrition(row.n100, row.grams));
  if (row.isWater) row.water = Math.round(row.grams);
  return row;
}

const splitWords = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
const FOOD_INDEX = FOODS.map((f) => ({
  food: f,
  words: [...new Set(splitWords(`${f.name.en} ${f.name.sk} ${f.aliases}`))],
  names: [splitWords(f.name.en), splitWords(f.name.sk)],
}));

// 1 = same word, 0.85 = same stem (Slovak endings: "rožky" ~ "rožok"), 0 = no match.
function wordMatch(q, w) {
  if (q === w) return 1;
  if (q.length < 3 || w.length < 3) return 0;
  return w.startsWith(stem(q)) || q.startsWith(stem(w)) ? 0.85 : 0;
}

// Returns { food, score, all } where score is the weighted share of query words that
// matched and `all` says whether every word matched.
function matchLocal(tokens) {
  const useful = tokens.filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  if (!useful.length) return null;
  let best = null;
  for (const entry of FOOD_INDEX) {
    let sum = 0, hit = 0;
    for (const q of useful) {
      let m = 0;
      for (const w of entry.words) { m = Math.max(m, wordMatch(q, w)); if (m === 1) break; }
      if (m) { sum += m; hit++; }
    }
    if (!hit) continue;
    const score = sum / useful.length;
    // Tie-break: how much of the food's own name the description covers,
    // so "eggs" picks "Egg" rather than "Scrambled eggs".
    const cover = Math.max(...entry.names.map((ws) => ws.length ? ws.filter((w) => useful.some((q) => wordMatch(q, w))).length / ws.length : 0));
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && cover > best.cover)) {
      best = { food: entry.food, score, cover, all: hit === useful.length };
    }
  }
  return best && best.score >= 0.5 ? best : null;
}

// ---------- Open Food Facts ----------
const OFF_FIELDS = "code,product_name,product_name_sk,product_name_cs,product_name_en,brands,nutriments,serving_quantity,product_quantity,quantity";

async function fetchJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function offProduct(p) {
  const nut = p.nutriments || {};
  let per100 = nut["energy-kcal_100g"] != null ? Number(nut["energy-kcal_100g"])
    : nut.energy_100g != null ? Number(nut.energy_100g) / 4.184 // kJ -> kcal
    : NaN;
  if (!isFinite(per100)) return null;
  const name = p.product_name_sk || p.product_name_cs || p.product_name || p.product_name_en || "";
  if (!name) return null;
  const brand = (p.brands || "").split(",")[0].trim();
  const num = (v) => (isFinite(Number(v)) ? Number(v) : 0);
  const pack = Number(p.product_quantity) || null;
  const serving = Number(p.serving_quantity) || null;
  return {
    code: p.code,
    name: brand && !norm(name).includes(norm(brand)) ? `${name} (${brand})` : name,
    n100: { kcal: Math.round(per100), p: num(nut.proteins_100g), c: num(nut.carbohydrates_100g), f: num(nut.fat_100g) },
    // Snacks are usually eaten as a whole pack, so prefer the pack weight when it's small.
    defaultGrams: pack && pack <= 150 ? pack : serving || pack || 100,
  };
}

async function offSearch(query) {
  const base = "https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=15&sort_by=unique_scans_n";
  const q = `&search_terms=${encodeURIComponent(query)}&fields=${OFF_FIELDS}`;
  // Try products sold in Slovakia first, then everything.
  const sk = await fetchJSON(`${base}${q}&tagtype_0=countries&tag_contains_0=contains&tag_0=slovakia`).catch(() => null);
  let list = (sk && sk.products || []).map(offProduct).filter(Boolean);
  if (list.length < 3) {
    const all = await fetchJSON(`${base}${q}`);
    const seen = new Set(list.map((p) => p.code));
    list = list.concat((all.products || []).map(offProduct).filter((p) => p && !seen.has(p.code)));
  }
  return list.slice(0, 6);
}

async function offBarcode(code) {
  const data = await fetchJSON(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (data.status !== 1 || !data.product) return null;
  return offProduct({ ...data.product, code });
}

// ---------- Claude (optional) ----------
const AI_SCHEMA = {
  type: "object",
  properties: {
    meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack", "unknown"] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
          kcal: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          water_ml: { type: "number" },
        },
        required: ["name", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "water_ml"],
        additionalProperties: false,
      },
    },
  },
  required: ["meal", "items"],
  additionalProperties: false,
};

async function claudeEstimate(text, { apiKey, model, lang }) {
  const language = lang === "sk" ? "Slovak" : "English";
  const system = `You are a nutrition assistant inside a calorie tracking app used in Slovakia.
The user describes what they ate, in Slovak or English. They may mention products from Slovak stores (Lidl, Billa, Kaufland, Tesco, COOP Jednota) and Slovak/Czech brands (e.g. Tatranka, Horalky, Kofola, Rajo, Pilos, Milbona, Figaro, Mäspoma).
Split the description into individual foods and estimate for each the eaten amount in grams (or ml), calories, protein, carbohydrates and fat.
- Use the amounts given. If none is given, assume one typical portion, or one whole package for packaged snacks and drinks.
- For branded products use typical label values for that product.
- Name each item briefly in ${language}, keeping any brand the user mentioned, e.g. "Rožok", "Tatranka (Lidl)".
- water_ml is the amount of plain water, mineral water, unsweetened tea or black coffee in the item (0 for anything else).
- Set meal only if the user says which meal it was, otherwise "unknown".`;

  const body = {
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: text }],
    output_config: { format: { type: "json_schema", schema: AI_SCHEMA } },
  };
  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (model !== "claude-haiku-4-5") {
    body.output_config.effort = "low"; // a simple estimation task; keeps it fast and cheap
    // If a safety classifier declines, let the API retry on a fallback model automatically.
    body.fallbacks = "default";
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  if (data.stop_reason === "refusal") throw new Error("request declined");
  const block = (data.content || []).find((b) => b.type === "text");
  if (!block) throw new Error("empty response");
  const parsed = JSON.parse(block.text);
  return {
    meal: parsed.meal === "unknown" ? null : parsed.meal,
    rows: parsed.items.filter((i) => i.name).map((i) => {
      const g = i.grams > 0 ? i.grams : null;
      const row = {
        name: i.name,
        grams: g ? Math.round(g) : null,
        n100: g ? { kcal: (i.kcal / g) * 100, p: (i.protein_g / g) * 100, c: (i.carbs_g / g) * 100, f: (i.fat_g / g) * 100 } : null,
        kcal: Math.round(i.kcal), p: i.protein_g, c: i.carbs_g, f: i.fat_g,
        water: Math.round(i.water_ml || 0),
        isWater: i.water_ml > 0 && g > 0 && Math.abs(i.water_ml - g) < 1,
        source: "ai",
      };
      return row;
    }),
  };
}

// ---------- Main entry ----------
// customFoods: [{ name, kcal, p, c, f, water }] from the user's own earlier entries.
async function estimateFoods(text, { customFoods = [], lang = "en", apiKey = "", model = "", onAIError } = {}) {
  const trimmed = text.trim();

  // Just a barcode number
  if (/^\d{8,14}$/.test(trimmed)) {
    const p = await offBarcode(trimmed);
    return { meal: null, rows: [p ? productRow(p, null, 1) : emptyRow(trimmed, null)] };
  }

  if (apiKey) {
    try {
      const r = await claudeEstimate(trimmed, { apiKey, model, lang });
      if (r.rows.length) return r;
    } catch (e) {
      if (onAIError) onAIError(e);
    }
  }

  const { meal, parts } = parseDescription(trimmed);
  const custom = new Map(customFoods.map((f) => [norm(f.name), f]));

  const rows = await Promise.all(parts.map(async (part) => {
    const count = part.count || 1;

    // 1. Something you logged before with exactly this name
    const mine = custom.get(norm(part.display)) || custom.get(part.query);
    if (mine && !part.grams) {
      const k = (v) => Math.round((v || 0) * count * 10) / 10;
      return { name: count !== 1 ? `${count}× ${mine.name}` : mine.name, kcal: Math.round(mine.kcal * count), p: k(mine.p), c: k(mine.c), f: k(mine.f), water: Math.round((mine.water || 0) * count), grams: null, n100: null, source: "mine" };
    }

    // 2. Built-in food list (full match)
    const local = matchLocal(part.tokens);
    if (local && local.all) return localRow(local.food, part, lang);

    // 3. Product database
    try {
      const products = await offSearch(part.query);
      if (products.length) {
        const row = productRow(products[0], part.grams, count);
        row.options = products;
        row.count = count;
        row.fixedGrams = part.grams;
        return row;
      }
    } catch (e) {
      if (local) return localRow(local.food, part, lang);
      return { ...emptyRow(part.display, part.grams), offError: true };
    }

    // 4. Partial match in the food list
    if (local) return localRow(local.food, part, lang);
    return emptyRow(part.display, part.grams);
  }));

  return { meal, rows };
}

function emptyRow(name, grams) {
  return { name, kcal: null, p: 0, c: 0, f: 0, water: 0, grams, n100: null, source: "none" };
}

function localRow(food, part, lang) {
  const grams = part.grams || food.g * (part.count || 1);
  const name = part.grams ? `${food.name[lang]} (${Math.round(part.grams)} ${food.liquid ? "ml" : "g"})`
    : part.count && part.count !== 1 ? `${String(part.count).replace(".", lang === "sk" ? "," : ".")}× ${food.name[lang]}`
    : `${food.name[lang]} (${food.portion[lang]})`;
  return applyGrams({ name, baseName: food.name[lang], grams: Math.round(grams), n100: food.per100, isWater: food.water, water: 0, source: "db", unit: food.liquid ? "ml" : "g" });
}

function productRow(p, grams, count) {
  const g = grams || p.defaultGrams * (count || 1);
  return applyGrams({ name: p.name, grams: Math.round(g), n100: p.n100, water: 0, source: "off" });
}

# 🥗 Calorie Tracker / Počítadlo kalórií

A simple web app to log your food and track daily calories. It's available in **Slovak and English**: switch with the SK/EN button in the header.

## Features

- **Describe what you ate**, in Slovak or English, e.g. `2 rožky s maslom a Tatranka z Lidla` or `200g chicken with rice, apple`. The app splits the text into foods, understands amounts (`2`, `pol`, `200 g`, `10 dkg`, `0,5 l`) and meal words (`na raňajky`, `for lunch`), and counts the calories. You review the result, adjust grams or calories if needed, and add everything at once.
- **Store products (Lidl, Billa, Kaufland, Tesco…)**: anything not in the built-in list is looked up in the free [Open Food Facts](https://world.openfoodfacts.org) product database, with Slovak products first. You can pick a different product if the first match isn't right.
- **Barcode**: tap *Scan barcode* to use your camera (Chrome on Android), or type the barcode number from the package into the box.
- **Optional AI counting**: add a Claude API key in Settings. Claude then reads the whole description and estimates everything in it, even home-made meals. Without a key, everything above still works.
- **Daily progress ring**, a food log grouped by meal, and **easy food ideas** that fit the calories you have left, with simple recipes.
- **History**: every day is saved automatically. See a chart of the last 7/14/30/90 days, averages, and all logged days.
- **Goal calculator** (Mifflin–St Jeor), plus **backup**: export/import JSON, or export daily totals as CSV.

## Running it

It's plain HTML/CSS/JS with no install and no build step. Open `index.html` in a browser, or host it for free with GitHub Pages:

1. In the repo on GitHub, go to **Settings → Pages**.
2. Choose **Deploy from a branch**, then pick the branch and `/ (root)`.
3. Open the URL GitHub shows you. On your phone, use **Add to Home Screen** so it works like an app. Camera scanning needs the https address from GitHub Pages; it won't work from a local file.

## Where is my data?

Everything is saved in your browser's local storage on that device. Food descriptions are sent only to Open Food Facts (for product lookup) and, if you added a key, to the Claude API. Your API key stays in your browser and isn't included in backups. Each device has its own log, so use **Settings → Export / Import** to back up your data or move it to another device.

## Files

- `index.html`, `style.css`: page and styles
- `app.js`: app logic (log, history, recommendations, settings)
- `lookup.js`: turns a description into foods and calories (parser, food list matching, Open Food Facts, Claude)
- `foods.js`: built-in food list and easy recipes (Slovak + English)
- `i18n.js`: interface texts in both languages
